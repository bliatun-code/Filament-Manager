use super::{AdvertisementError, ValidatedAdvertisementConfig};
use std::ffi::c_void;
use std::ptr;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use windows_sys::Win32::Foundation::{GetLastError, DNS_REQUEST_PENDING, ERROR_SUCCESS};
use windows_sys::Win32::NetworkManagement::Dns::{
    DnsServiceConstructInstance, DnsServiceDeRegister, DnsServiceFreeInstance, DnsServiceRegister,
    DnsServiceRegisterCancel, DNS_QUERY_REQUEST_VERSION1, DNS_SERVICE_CANCEL, DNS_SERVICE_INSTANCE,
    DNS_SERVICE_REGISTER_REQUEST,
};

const COMPLETION_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DNS_NAME_UTF16_UNITS: usize = 255;

#[derive(Default)]
struct CompletionOutcome {
    generation: u64,
    status: u32,
    identity_matches: bool,
}

#[derive(Clone, Copy)]
struct CompletionResult {
    status: u32,
    identity_matches: bool,
}

struct CompletionState {
    outcome: Mutex<CompletionOutcome>,
    changed: Condvar,
    expected_identity: ValidatedAdvertisementConfig,
}

impl CompletionState {
    fn new(config: &ValidatedAdvertisementConfig) -> Self {
        Self {
            outcome: Mutex::new(CompletionOutcome::default()),
            changed: Condvar::new(),
            expected_identity: config.clone(),
        }
    }

    fn complete(&self, status: u32, identity_matches: bool) {
        if let Ok(mut outcome) = self.outcome.lock() {
            outcome.generation = outcome.generation.saturating_add(1);
            outcome.status = status;
            outcome.identity_matches = identity_matches;
            self.changed.notify_all();
        }
    }

    fn identity_matches(&self, instance_name: &str, hostname: &str) -> bool {
        self.expected_identity
            .windows_registration_identity_matches(instance_name, hostname)
    }

    fn wait_for_generation(&self, generation: u64) -> Result<CompletionResult, AdvertisementError> {
        let outcome = self
            .outcome
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        let (outcome, timeout) = self
            .changed
            .wait_timeout_while(outcome, COMPLETION_TIMEOUT, |outcome| {
                outcome.generation < generation
            })
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        if timeout.timed_out() && outcome.generation < generation {
            return Err(AdvertisementError::RegistrationTimedOut);
        }
        Ok(CompletionResult {
            status: outcome.status,
            identity_matches: outcome.identity_matches,
        })
    }
}

struct RegistrationInner {
    request: DNS_SERVICE_REGISTER_REQUEST,
    cancel: DNS_SERVICE_CANCEL,
    instance: *mut DNS_SERVICE_INSTANCE,
    completion: Arc<CompletionState>,
}

impl RegistrationInner {
    fn free_instance(&mut self) {
        if !self.instance.is_null() {
            unsafe { DnsServiceFreeInstance(self.instance) };
            self.instance = ptr::null_mut();
            self.request.pServiceInstance = ptr::null_mut();
        }
    }
}

// The request is immutable while registered. Windows invokes the callback on a system thread;
// callback mutation is confined to CompletionState's mutex.
unsafe impl Send for RegistrationInner {}

pub(super) struct Registration {
    inner: Option<Box<RegistrationInner>>,
}

impl Registration {
    pub(super) fn register(
        config: &ValidatedAdvertisementConfig,
    ) -> Result<Self, AdvertisementError> {
        let service_name = wide_string(config.service_instance_fqdn());
        let hostname = wide_string(config.fqdn());
        let address = config.windows_ip4_address_host_order();
        let instance = unsafe {
            DnsServiceConstructInstance(
                service_name.as_ptr(),
                hostname.as_ptr(),
                &address,
                ptr::null(),
                config.port(),
                0,
                0,
                0,
                ptr::null(),
                ptr::null(),
            )
        };
        if instance.is_null() {
            return Err(AdvertisementError::PlatformFailure(
                unsafe { GetLastError() }.into(),
            ));
        }

        let completion = Arc::new(CompletionState::new(config));
        let mut inner = Box::new(RegistrationInner {
            request: DNS_SERVICE_REGISTER_REQUEST {
                Version: DNS_QUERY_REQUEST_VERSION1,
                InterfaceIndex: config.interface_index(),
                pServiceInstance: instance,
                pRegisterCompletionCallback: Some(registration_callback),
                pQueryContext: Arc::as_ptr(&completion).cast_mut().cast::<c_void>(),
                hCredentials: ptr::null_mut(),
                unicastEnabled: 0,
            },
            cancel: DNS_SERVICE_CANCEL::default(),
            instance,
            completion,
        });

        let result = unsafe { DnsServiceRegister(&inner.request, &mut inner.cancel) };
        if result != DNS_REQUEST_PENDING as u32 {
            inner.free_instance();
            return Err(AdvertisementError::PlatformFailure(result.into()));
        }

        match inner.completion.wait_for_generation(1) {
            Ok(result) if result.status == ERROR_SUCCESS && result.identity_matches => {
                Ok(Self { inner: Some(inner) })
            }
            Ok(result) if result.status == ERROR_SUCCESS => {
                deregister_and_release(inner);
                Err(AdvertisementError::RegisteredIdentityChanged)
            }
            Ok(result) => {
                inner.free_instance();
                Err(AdvertisementError::PlatformFailure(result.status.into()))
            }
            Err(error) => {
                let _ = unsafe { DnsServiceRegisterCancel(&inner.cancel) };
                if inner.completion.wait_for_generation(1).is_ok() {
                    inner.free_instance();
                } else {
                    // Preserve callback-owned pointers if Windows does not acknowledge a
                    // cancellation. The process-scoped registration is reclaimed on exit.
                    Box::leak(inner);
                }
                Err(error)
            }
        }
    }

    pub(super) fn health(&self) -> Result<(), AdvertisementError> {
        let inner = self
            .inner
            .as_ref()
            .ok_or(AdvertisementError::RegistrationWorkerStopped)?;
        let outcome = inner
            .completion
            .outcome
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        if outcome.status == ERROR_SUCCESS && outcome.identity_matches {
            Ok(())
        } else if outcome.status == ERROR_SUCCESS {
            Err(AdvertisementError::RegisteredIdentityChanged)
        } else {
            Err(AdvertisementError::PlatformFailure(outcome.status.into()))
        }
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        let Some(inner) = self.inner.take() else {
            return;
        };
        deregister_and_release(inner);
    }
}

fn deregister_and_release(mut inner: Box<RegistrationInner>) {
    let deregister_result = unsafe { DnsServiceDeRegister(&inner.request, ptr::null_mut()) };
    if deregister_result != DNS_REQUEST_PENDING as u32
        || inner.completion.wait_for_generation(2).is_err()
    {
        // A failed or unacknowledged deregistration may still own the request/context pointers.
        // The process-scoped registration is reclaimed by Windows when the app exits.
        Box::leak(inner);
        return;
    }
    inner.free_instance();
}

fn wide_string(value: String) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn registration_callback(
    status: u32,
    context: *const c_void,
    instance: *const DNS_SERVICE_INSTANCE,
) {
    if context.is_null() {
        if !instance.is_null() {
            unsafe { DnsServiceFreeInstance(instance) };
        }
        return;
    }
    let completion_pointer = context.cast::<CompletionState>();
    // The completion notification can wake the registration or deregistration waiter, which
    // may then drop RegistrationInner and its Arc before this callback returns. Hold one callback-
    // owned strong reference so the Rust reference remains valid through the function epilogue.
    unsafe { Arc::increment_strong_count(completion_pointer) };
    let completion = unsafe { Arc::from_raw(completion_pointer) };
    let identity_matches = if instance.is_null() {
        false
    } else {
        let instance = unsafe { &*instance };
        match (
            decode_wide_dns_name(instance.pszInstanceName),
            decode_wide_dns_name(instance.pszHostName),
        ) {
            (Some(instance_name), Some(hostname)) => {
                completion.identity_matches(&instance_name, &hostname)
            }
            _ => false,
        }
    };
    if !instance.is_null() {
        unsafe { DnsServiceFreeInstance(instance) };
    }
    completion.complete(status, identity_matches);
}

fn decode_wide_dns_name(pointer: *const u16) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    let mut length = 0;
    while length <= MAX_DNS_NAME_UTF16_UNITS {
        let unit = unsafe { pointer.add(length).read() };
        if unit == 0 {
            let units = unsafe { std::slice::from_raw_parts(pointer, length) };
            return String::from_utf16(units).ok();
        }
        length += 1;
    }
    None
}
