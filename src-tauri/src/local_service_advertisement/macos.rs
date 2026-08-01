use super::{AdvertisementError, ValidatedAdvertisementConfig, COMPANION_SERVICE_TYPE};
use std::ffi::{c_char, c_int, c_void, CString};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

type DnsServiceRef = *mut c_void;
type DnsRecordRef = *mut c_void;
type DnsServiceFlags = u32;
type DnsServiceError = i32;

const DNS_SERVICE_NO_ERROR: DnsServiceError = 0;
const DNS_SERVICE_ERR_NAME_CONFLICT: DnsServiceError = -65548;
const DNS_SERVICE_FLAGS_NO_AUTO_RENAME: DnsServiceFlags = 0x8;
const DNS_SERVICE_FLAGS_UNIQUE: DnsServiceFlags = 0x20;
const DNS_SERVICE_FLAGS_SHARE_CONNECTION: DnsServiceFlags = 0x4000;
const DNS_SERVICE_TYPE_A: u16 = 1;
const DNS_SERVICE_CLASS_IN: u16 = 1;
const REGISTRATION_TIMEOUT: Duration = Duration::from_secs(5);
const WORKER_POLL_MILLIS: c_int = 250;

type RegisterRecordReply = unsafe extern "C" fn(
    DnsServiceRef,
    DnsRecordRef,
    DnsServiceFlags,
    DnsServiceError,
    *mut c_void,
);
type RegisterServiceReply = unsafe extern "C" fn(
    DnsServiceRef,
    DnsServiceFlags,
    DnsServiceError,
    *const c_char,
    *const c_char,
    *const c_char,
    *mut c_void,
);

// DNS-SD is exported by libSystem on macOS (there is no standalone libdns_sd SDK stub).
#[link(name = "System")]
unsafe extern "C" {
    fn DNSServiceCreateConnection(sd_ref: *mut DnsServiceRef) -> DnsServiceError;
    fn DNSServiceRegisterRecord(
        sd_ref: DnsServiceRef,
        record_ref: *mut DnsRecordRef,
        flags: DnsServiceFlags,
        interface_index: u32,
        full_name: *const c_char,
        record_type: u16,
        record_class: u16,
        data_length: u16,
        data: *const c_void,
        ttl: u32,
        callback: RegisterRecordReply,
        context: *mut c_void,
    ) -> DnsServiceError;
    fn DNSServiceRegister(
        sd_ref: *mut DnsServiceRef,
        flags: DnsServiceFlags,
        interface_index: u32,
        name: *const c_char,
        registration_type: *const c_char,
        domain: *const c_char,
        host: *const c_char,
        port: u16,
        txt_length: u16,
        txt_record: *const c_void,
        callback: RegisterServiceReply,
        context: *mut c_void,
    ) -> DnsServiceError;
    fn DNSServiceRefSockFD(sd_ref: DnsServiceRef) -> c_int;
    fn DNSServiceProcessResult(sd_ref: DnsServiceRef) -> DnsServiceError;
    fn DNSServiceRefDeallocate(sd_ref: DnsServiceRef);
}

#[derive(Default)]
struct CallbackOutcome {
    pending_initial_callbacks: usize,
    error: Option<DnsServiceError>,
    worker_stopped: bool,
}

struct CallbackState {
    outcome: Mutex<CallbackOutcome>,
    changed: Condvar,
}

impl CallbackState {
    fn new() -> Self {
        Self {
            outcome: Mutex::new(CallbackOutcome {
                pending_initial_callbacks: 2,
                ..CallbackOutcome::default()
            }),
            changed: Condvar::new(),
        }
    }

    fn complete_registration(&self, error: DnsServiceError) {
        if let Ok(mut outcome) = self.outcome.lock() {
            if outcome.pending_initial_callbacks > 0 {
                outcome.pending_initial_callbacks -= 1;
            }
            if error != DNS_SERVICE_NO_ERROR {
                outcome.error = Some(error);
            }
            self.changed.notify_all();
        }
    }

    fn stop_worker(&self, error: Option<DnsServiceError>) {
        if let Ok(mut outcome) = self.outcome.lock() {
            outcome.worker_stopped = true;
            if let Some(error) = error {
                outcome.error = Some(error);
            }
            self.changed.notify_all();
        }
    }

    fn wait_until_registered(&self) -> Result<(), AdvertisementError> {
        let outcome = self
            .outcome
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        let (outcome, timeout) = self
            .changed
            .wait_timeout_while(outcome, REGISTRATION_TIMEOUT, |outcome| {
                outcome.pending_initial_callbacks > 0
                    && outcome.error.is_none()
                    && !outcome.worker_stopped
            })
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        if let Some(error) = outcome.error {
            return Err(advertisement_error(error));
        }
        if outcome.worker_stopped {
            return Err(AdvertisementError::RegistrationWorkerStopped);
        }
        if timeout.timed_out() && outcome.pending_initial_callbacks > 0 {
            return Err(AdvertisementError::RegistrationTimedOut);
        }
        Ok(())
    }

    fn health(&self) -> Result<(), AdvertisementError> {
        let outcome = self
            .outcome
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        if let Some(error) = outcome.error {
            return Err(advertisement_error(error));
        }
        if outcome.worker_stopped {
            return Err(AdvertisementError::RegistrationWorkerStopped);
        }
        Ok(())
    }
}

pub(super) struct Registration {
    stop: Arc<AtomicBool>,
    callback_state: Arc<CallbackState>,
    worker: Option<JoinHandle<()>>,
}

impl Registration {
    pub(super) fn register(
        config: &ValidatedAdvertisementConfig,
    ) -> Result<Self, AdvertisementError> {
        let callback_state = Arc::new(CallbackState::new());
        let callback_context = Arc::as_ptr(&callback_state).cast_mut().cast::<c_void>();
        let mut shared_ref: DnsServiceRef = ptr::null_mut();
        let connection_result = unsafe { DNSServiceCreateConnection(&mut shared_ref) };
        if connection_result != DNS_SERVICE_NO_ERROR || shared_ref.is_null() {
            return Err(advertisement_error(connection_result));
        }

        let registration_result = register_records(shared_ref, config, callback_context);
        if let Err(error) = registration_result {
            unsafe { DNSServiceRefDeallocate(shared_ref) };
            return Err(error);
        }

        let stop = Arc::new(AtomicBool::new(false));
        let worker = spawn_worker(shared_ref, Arc::clone(&stop), Arc::clone(&callback_state))?;
        let mut registration = Self {
            stop,
            callback_state,
            worker: Some(worker),
        };
        if let Err(error) = registration.callback_state.wait_until_registered() {
            registration.stop_and_join();
            return Err(error);
        }
        Ok(registration)
    }

    pub(super) fn health(&self) -> Result<(), AdvertisementError> {
        self.callback_state.health()
    }

    fn stop_and_join(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        self.stop_and_join();
    }
}

fn register_records(
    shared_ref: DnsServiceRef,
    config: &ValidatedAdvertisementConfig,
    callback_context: *mut c_void,
) -> Result<(), AdvertisementError> {
    let host = c_string(config.fqdn())?;
    let instance = c_string(config.instance_name())?;
    let registration_type = c_string(COMPANION_SERVICE_TYPE.trim_end_matches(".local."))?;
    let domain = c_string("local.")?;
    let address = config.address().octets();
    let mut record_ref: DnsRecordRef = ptr::null_mut();
    let record_result = unsafe {
        DNSServiceRegisterRecord(
            shared_ref,
            &mut record_ref,
            DNS_SERVICE_FLAGS_UNIQUE,
            config.interface_index(),
            host.as_ptr(),
            DNS_SERVICE_TYPE_A,
            DNS_SERVICE_CLASS_IN,
            address.len() as u16,
            address.as_ptr().cast::<c_void>(),
            0,
            address_record_callback,
            callback_context,
        )
    };
    if record_result != DNS_SERVICE_NO_ERROR {
        return Err(advertisement_error(record_result));
    }

    let mut service_ref = shared_ref;
    let service_result = unsafe {
        DNSServiceRegister(
            &mut service_ref,
            DNS_SERVICE_FLAGS_SHARE_CONNECTION | DNS_SERVICE_FLAGS_NO_AUTO_RENAME,
            config.interface_index(),
            instance.as_ptr(),
            registration_type.as_ptr(),
            domain.as_ptr(),
            host.as_ptr(),
            config.port().to_be(),
            0,
            ptr::null(),
            service_record_callback,
            callback_context,
        )
    };
    if service_result != DNS_SERVICE_NO_ERROR {
        return Err(advertisement_error(service_result));
    }
    Ok(())
}

fn spawn_worker(
    shared_ref: DnsServiceRef,
    stop: Arc<AtomicBool>,
    callback_state: Arc<CallbackState>,
) -> Result<JoinHandle<()>, AdvertisementError> {
    let shared_ref_address = shared_ref as usize;
    thread::Builder::new()
        .name("companion-dnssd".to_string())
        .spawn(move || {
            let shared_ref = shared_ref_address as DnsServiceRef;
            run_worker(shared_ref, &stop, &callback_state);
            unsafe { DNSServiceRefDeallocate(shared_ref) };
        })
        .map_err(|_| {
            unsafe { DNSServiceRefDeallocate(shared_ref) };
            AdvertisementError::RegistrationWorkerStopped
        })
}

fn run_worker(shared_ref: DnsServiceRef, stop: &AtomicBool, callback_state: &CallbackState) {
    let socket = unsafe { DNSServiceRefSockFD(shared_ref) };
    if socket < 0 {
        callback_state.stop_worker(None);
        return;
    }
    while !stop.load(Ordering::Acquire) {
        let mut descriptor = libc::pollfd {
            fd: socket,
            events: libc::POLLIN,
            revents: 0,
        };
        let poll_result = unsafe { libc::poll(&mut descriptor, 1, WORKER_POLL_MILLIS) };
        if poll_result < 0 {
            let interrupted =
                std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted;
            if interrupted {
                continue;
            }
            callback_state.stop_worker(None);
            return;
        }
        if poll_result == 0 {
            continue;
        }
        if descriptor.revents & libc::POLLIN != 0 {
            let result = unsafe { DNSServiceProcessResult(shared_ref) };
            if result != DNS_SERVICE_NO_ERROR {
                callback_state.stop_worker(Some(result));
                return;
            }
        }
        if descriptor.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
            callback_state.stop_worker(None);
            return;
        }
    }
}

fn c_string(value: impl Into<Vec<u8>>) -> Result<CString, AdvertisementError> {
    CString::new(value).map_err(|_| AdvertisementError::InvalidHostname)
}

fn advertisement_error(error: DnsServiceError) -> AdvertisementError {
    if error == DNS_SERVICE_ERR_NAME_CONFLICT {
        AdvertisementError::NameConflict
    } else {
        AdvertisementError::PlatformFailure(error.into())
    }
}

unsafe extern "C" fn address_record_callback(
    _service_ref: DnsServiceRef,
    _record_ref: DnsRecordRef,
    _flags: DnsServiceFlags,
    error: DnsServiceError,
    context: *mut c_void,
) {
    complete_callback(context, error);
}

unsafe extern "C" fn service_record_callback(
    _service_ref: DnsServiceRef,
    _flags: DnsServiceFlags,
    error: DnsServiceError,
    _name: *const c_char,
    _registration_type: *const c_char,
    _domain: *const c_char,
    context: *mut c_void,
) {
    complete_callback(context, error);
}

fn complete_callback(context: *mut c_void, error: DnsServiceError) {
    if context.is_null() {
        return;
    }
    let callback_state = unsafe { &*context.cast::<CallbackState>() };
    callback_state.complete_registration(error);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_dns_sd_name_conflict_to_actionable_error() {
        assert_eq!(
            advertisement_error(DNS_SERVICE_ERR_NAME_CONFLICT),
            AdvertisementError::NameConflict
        );
    }

    #[test]
    fn preserves_other_dns_sd_error_codes() {
        assert_eq!(
            advertisement_error(-65537),
            AdvertisementError::PlatformFailure(-65537)
        );
    }
}
