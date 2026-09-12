//! Native Service Management access for the app's bundled login launcher.
//!
//! Registration policy and legacy migration belong to the caller. This module
//! never writes a LaunchAgent, changes an approval setting, or opens Settings.
use block2::RcBlock;
use objc2::msg_send;
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::{
    NSError, NSOperatingSystemVersion, NSProcessInfo, NSString, NSThread, NSUserDefaults, NSURL,
};
use std::path::Path;
use std::sync::{mpsc, OnceLock};
use std::time::Duration;

const AGENT_PLIST: &str = "no.bliatun.filamentmanager.background.plist";
const REGISTRATION_RECORD_KEY: &str = "FilamentManagerBackgroundRegistrationRecord";
const UNREGISTER_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ServiceStatus {
    NotRegistered,
    Enabled,
    RequiresApproval,
    NotFound,
}

fn decode_status(value: isize) -> Result<ServiceStatus, String> {
    match value {
        0 => Ok(ServiceStatus::NotRegistered),
        1 => Ok(ServiceStatus::Enabled),
        2 => Ok(ServiceStatus::RequiresApproval),
        3 => Ok(ServiceStatus::NotFound),
        _ => Err("macOS returned an unrecognized launch-at-login status.".into()),
    }
}

fn service_class() -> Result<Option<&'static AnyClass>, String> {
    static CLASS: OnceLock<Result<Option<&'static AnyClass>, String>> = OnceLock::new();
    CLASS
        .get_or_init(|| {
            autoreleasepool(|_| {
                let minimum = NSOperatingSystemVersion {
                    majorVersion: 13,
                    minorVersion: 0,
                    patchVersion: 0,
                };
                if !NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(minimum) {
                    return Ok(None);
                }
                // SAFETY: This is the public system framework at its fixed system
                // path. Keeping it loaded for the process lifetime keeps every
                // class and retained service valid. Runtime loading avoids a hard
                // reference to SMAppService on macOS 11/12 (or the macOS 15-only
                // SMAppServiceErrorDomain symbol).
                let framework = unsafe {
                    libc::dlopen(
                        c"/System/Library/Frameworks/ServiceManagement.framework/ServiceManagement"
                            .as_ptr(),
                        libc::RTLD_LAZY | libc::RTLD_LOCAL,
                    )
                };
                if framework.is_null() {
                    return Err(
                        "macOS could not load its launch-at-login management framework.".into(),
                    );
                }
                AnyClass::get(c"SMAppService")
                    .map(Some)
                    .ok_or_else(|| "macOS launch-at-login management is unavailable.".into())
            })
        })
        .clone()
}

pub(crate) fn available() -> Result<bool, String> {
    service_class().map(|class| class.is_some())
}

fn required_class() -> Result<&'static AnyClass, String> {
    service_class()?
        .ok_or_else(|| "Modern launch-at-login management is unavailable on this Mac.".into())
}

fn service() -> Result<Retained<AnyObject>, String> {
    let class = required_class()?;
    let name = NSString::from_str(AGENT_PLIST);
    // SAFETY: The runtime class is SMAppService on macOS 13+. The documented
    // selector accepts NSString and returns an autoreleased SMAppService;
    // objc2 retains that result, and Option also handles an unexpected nil.
    let service: Option<Retained<AnyObject>> =
        unsafe { msg_send![class, agentServiceWithPlistName: &*name] };
    service.ok_or_else(|| "macOS could not find the app's login launcher.".into())
}

fn service_status(service: &AnyObject) -> Result<ServiceStatus, String> {
    // SAFETY: Every caller passes the retained SMAppService from service().
    // SMAppServiceStatus uses NSInteger, which is isize on supported macOS.
    let value: isize = unsafe { msg_send![service, status] };
    decode_status(value)
}

pub(crate) fn status() -> Result<ServiceStatus, String> {
    autoreleasepool(|_| {
        let service = service()?;
        service_status(&service)
    })
}

pub(crate) fn legacy_status(plist: &Path) -> Result<ServiceStatus, String> {
    if !plist.is_absolute() {
        return Err("The existing login registration must have an absolute path.".into());
    }
    let path = plist
        .to_str()
        .ok_or_else(|| "The existing login registration path is not valid UTF-8.".to_string())?;
    autoreleasepool(|_| {
        let class = required_class()?;
        let path = NSString::from_str(path);
        let url = NSURL::fileURLWithPath_isDirectory(&path, false);
        // SAFETY: This public macOS 13 selector accepts a file NSURL and
        // returns SMAppServiceStatus (NSInteger). The URL stays alive for the
        // complete call. This reads authorization; it does not register it.
        let value: isize = unsafe { msg_send![class, statusForLegacyURL: &*url] };
        decode_status(value)
    })
}

fn native_error(action: &str, error: &NSError) -> String {
    // Only the localized description is shown locally. Do not dump the error
    // userInfo dictionary, signing identities, or registration diagnostics.
    format!(
        "Could not {action} the login launcher: {}",
        error.localizedDescription()
    )
}

pub(crate) fn register() -> Result<ServiceStatus, String> {
    autoreleasepool(|_| {
        let service = service()?;
        // SAFETY: The documented selector returns BOOL with an NSError**
        // out-parameter. objc2 implements autoreleasing writeback and retains
        // the error before returning it as Result.
        let result: Result<(), Retained<NSError>> =
            unsafe { msg_send![&*service, registerAndReturnError: _] };
        let status = service_status(&service)?;
        match status {
            // A denied registration may still create a RequiresApproval
            // service. Returning that state prevents callers from treating it
            // as an absent registration and reviving a legacy login item.
            ServiceStatus::Enabled | ServiceStatus::RequiresApproval => Ok(status),
            _ => match result {
                Err(error) => Err(native_error("register", &error)),
                Ok(()) => Err("macOS did not complete the login launcher registration.".into()),
            },
        }
    })
}

/// Wait for removal to finish before the caller re-registers changed resources.
/// The app's main thread must remain free while Service Management responds.
pub(crate) fn unregister() -> Result<(), String> {
    if NSThread::isMainThread_class() {
        return Err("Login launcher removal must run outside the app's main thread.".into());
    }
    autoreleasepool(|_| {
        let service = service()?;
        if service_status(&service)? == ServiceStatus::NotRegistered {
            return Ok(());
        }
        let (sender, receiver) = mpsc::channel();
        let completion = RcBlock::new(move |error: *mut NSError| {
            let result = autoreleasepool(|_| {
                // SAFETY: Service Management passes a nullable NSError that
                // remains valid for this callback. Copy its description now;
                // no Objective-C pointer crosses the channel or escapes it.
                match unsafe { error.as_ref() } {
                    Some(error) => Err(native_error("unregister", error)),
                    None => Ok(()),
                }
            });
            // A late completion after timeout is harmless. The framework
            // retains its copied block and the channel owns all captured data.
            let _ = sender.send(result);
        });
        // SAFETY: This macOS 13 selector copies its completion block for the
        // asynchronous operation. The block has the documented void(NSError*)
        // ABI and owns its thread-safe channel sender. Unlike synchronous
        // unregister, completion means a running launcher has been reaped.
        let _: () = unsafe { msg_send![&*service, unregisterWithCompletionHandler: &*completion] };
        let result = receiver.recv_timeout(UNREGISTER_TIMEOUT).map_err(|_| {
            "macOS has not finished removing the login launcher. Try again shortly.".to_string()
        })?;
        let status = service_status(&service)?;
        if status == ServiceStatus::NotRegistered {
            return Ok(());
        }
        result?;
        Err("macOS has not completed the login launcher removal.".into())
    })
}

/// This app-scoped JSON record coordinates recovery, never macOS approval.
/// The coordinator owns its JSON schema and validation, including any pending
/// migration marker. This layer stores one string without changing approvals.
pub(crate) fn registration_record() -> Option<String> {
    autoreleasepool(|_| {
        let key = NSString::from_str(REGISTRATION_RECORD_KEY);
        NSUserDefaults::standardUserDefaults()
            .stringForKey(&key)
            .map(|value| value.to_string())
    })
}

pub(crate) fn store_registration_record(record: Option<&str>) -> Result<(), String> {
    autoreleasepool(|_| {
        let defaults = NSUserDefaults::standardUserDefaults();
        let key = NSString::from_str(REGISTRATION_RECORD_KEY);
        if let Some(record) = record {
            let value = NSString::from_str(record);
            // SAFETY: NSString is a property-list value accepted by this API.
            // Both references stay alive for the call; defaults copies them.
            unsafe { defaults.setObject_forKey(Some(&value), &key) };
        } else {
            defaults.removeObjectForKey(&key);
        }
        // Ordinary preferences do not need synchronize(). This single record
        // is instead a recovery boundary: pending intent must reach disk before
        // the caller changes a service registration. Apple's documented return
        // value distinguishes a completed save from a persistence failure.
        // On failure, callers must retry this write before any OS mutation;
        // the newly set value may already be visible in the process cache.
        if defaults.synchronize() {
            Ok(())
        } else {
            Err("Could not save the login launcher recovery record to disk.".into())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_management_status_matches_the_public_integer_abi() {
        assert_eq!(decode_status(0), Ok(ServiceStatus::NotRegistered));
        assert_eq!(decode_status(1), Ok(ServiceStatus::Enabled));
        assert_eq!(decode_status(2), Ok(ServiceStatus::RequiresApproval));
        assert_eq!(decode_status(3), Ok(ServiceStatus::NotFound));
    }

    #[test]
    fn unknown_service_management_status_never_becomes_enabled() {
        for value in [-1, 4, isize::MIN, isize::MAX] {
            assert!(decode_status(value).is_err());
        }
    }
}
