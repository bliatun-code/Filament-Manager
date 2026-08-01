use super::{
    validate_windows_announcement, AdvertisementError, ValidatedAdvertisementConfig,
    WindowsAnnouncementValidation, COMPANION_SERVICE_TYPE,
};
use mdns_sd::{DaemonEvent, Error as MdnsError, IfKind, Receiver, ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const REGISTRATION_TIMEOUT: Duration = Duration::from_secs(5);
const MONITOR_POLL_INTERVAL: Duration = Duration::from_millis(100);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
const SERVICE_NAME_LENGTH: u8 = 16;

// mdns-sd errors do not carry an OS error code. Keep the public error free of the daemon's
// message because those messages may contain local interface or service metadata.
const MDNS_PLATFORM_ERROR: i64 = -70_001;
const MDNS_COMMAND_QUEUE_FULL: i64 = -70_002;

#[derive(Clone, Debug, Eq, PartialEq)]
enum MonitorStatus {
    Pending,
    Healthy,
    Failed(AdvertisementError),
}

struct MonitorState {
    status: Mutex<MonitorStatus>,
    changed: Condvar,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            status: Mutex::new(MonitorStatus::Pending),
            changed: Condvar::new(),
        }
    }
}

impl MonitorState {
    fn mark_healthy(&self) {
        if let Ok(mut status) = self.status.lock() {
            if matches!(*status, MonitorStatus::Pending) {
                *status = MonitorStatus::Healthy;
                self.changed.notify_all();
            }
        }
    }

    fn fail(&self, error: AdvertisementError) {
        if let Ok(mut status) = self.status.lock() {
            if !matches!(*status, MonitorStatus::Failed(_)) {
                *status = MonitorStatus::Failed(error);
                self.changed.notify_all();
            }
        }
    }

    fn wait_until_registered(&self) -> Result<(), AdvertisementError> {
        let status = self
            .status
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        let (status, timeout) = self
            .changed
            .wait_timeout_while(status, REGISTRATION_TIMEOUT, |status| {
                matches!(*status, MonitorStatus::Pending)
            })
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;

        match &*status {
            MonitorStatus::Healthy => Ok(()),
            MonitorStatus::Failed(error) => Err(error.clone()),
            MonitorStatus::Pending if timeout.timed_out() => {
                Err(AdvertisementError::RegistrationTimedOut)
            }
            MonitorStatus::Pending => Err(AdvertisementError::RegistrationWorkerStopped),
        }
    }

    fn health(&self) -> Result<(), AdvertisementError> {
        let status = self
            .status
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        match &*status {
            MonitorStatus::Healthy => Ok(()),
            MonitorStatus::Failed(error) => Err(error.clone()),
            MonitorStatus::Pending => Err(AdvertisementError::RegistrationWorkerStopped),
        }
    }
}

pub(super) struct Registration {
    daemon: ServiceDaemon,
    service_fullname: String,
    state: Arc<MonitorState>,
    stop_requested: Arc<AtomicBool>,
    monitor_worker: Option<JoinHandle<()>>,
}

impl Registration {
    pub(super) fn register(
        config: &ValidatedAdvertisementConfig,
    ) -> Result<Self, AdvertisementError> {
        let service = build_service_info(config)?;
        let service_fullname = service.get_fullname().to_string();
        let daemon = ServiceDaemon::new().map_err(map_mdns_error)?;
        let monitor = match daemon.monitor() {
            Ok(monitor) => monitor,
            Err(error) => {
                shutdown_daemon(&daemon);
                return Err(map_mdns_error(error));
            }
        };

        // mdns-sd relies on loopback for reliable same-host discovery on Windows. Keep loopback
        // alongside the explicitly selected LAN interface, but exclude every other adapter. The
        // explicit service address below also disables automatic address discovery, so only the
        // selected private IPv4 is published as an A record.
        if let Err(error) = configure_daemon(&daemon, config.interface_index()) {
            shutdown_daemon(&daemon);
            return Err(error);
        }

        let state = Arc::new(MonitorState::default());
        let stop_requested = Arc::new(AtomicBool::new(false));
        let monitor_worker = match spawn_monitor_worker(
            monitor,
            daemon.clone(),
            config.clone(),
            service_fullname.clone(),
            Arc::clone(&state),
            Arc::clone(&stop_requested),
        ) {
            Ok(worker) => worker,
            Err(error) => {
                shutdown_daemon(&daemon);
                return Err(error);
            }
        };

        if let Err(error) = daemon.register(service) {
            stop_requested.store(true, Ordering::Release);
            shutdown_daemon(&daemon);
            join_monitor_worker(monitor_worker);
            return Err(map_mdns_error(error));
        }

        if let Err(error) = state.wait_until_registered() {
            stop_requested.store(true, Ordering::Release);
            unregister_and_shutdown(&daemon, &service_fullname);
            join_monitor_worker(monitor_worker);
            return Err(error);
        }

        Ok(Self {
            daemon,
            service_fullname,
            state,
            stop_requested,
            monitor_worker: Some(monitor_worker),
        })
    }

    pub(super) fn health(&self) -> Result<(), AdvertisementError> {
        self.state.health()
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        // Wake the monitor independently of the daemon command queue. `mdns-sd` can reject
        // unregister/shutdown with `Again` when that queue is full; joining a worker blocked on
        // `recv()` in that state would otherwise hang application shutdown indefinitely.
        self.stop_requested.store(true, Ordering::Release);
        unregister_and_shutdown(&self.daemon, &self.service_fullname);
        if let Some(worker) = self.monitor_worker.take() {
            join_monitor_worker(worker);
        }
    }
}

fn configure_daemon(
    daemon: &ServiceDaemon,
    interface_index: u32,
) -> Result<(), AdvertisementError> {
    daemon
        .set_service_name_len_max(SERVICE_NAME_LENGTH)
        .map_err(map_mdns_error)?;
    daemon
        .disable_interface(IfKind::All)
        .map_err(map_mdns_error)?;
    daemon
        .enable_interface(IfKind::LoopbackV4)
        .map_err(map_mdns_error)?;
    daemon
        .enable_interface(IfKind::IndexV4(interface_index))
        .map_err(map_mdns_error)
}

fn build_service_info(
    config: &ValidatedAdvertisementConfig,
) -> Result<ServiceInfo, AdvertisementError> {
    let service_instance_fqdn = config.service_instance_fqdn();
    let suffix = format!(".{COMPANION_SERVICE_TYPE}");
    let instance_name = service_instance_fqdn
        .strip_suffix(&suffix)
        .ok_or(AdvertisementError::InvalidInstanceName)?;
    let address = Ipv4Addr::from(config.windows_ip4_address_host_order());
    let mut service = ServiceInfo::new(
        COMPANION_SERVICE_TYPE,
        instance_name,
        &config.fqdn(),
        IpAddr::V4(address),
        config.port(),
        None::<HashMap<String, String>>,
    )
    .map_err(map_mdns_error)?;
    service.set_interfaces(vec![IfKind::IndexV4(config.interface_index())]);
    Ok(service)
}

fn spawn_monitor_worker(
    monitor: Receiver<DaemonEvent>,
    daemon: ServiceDaemon,
    expected_identity: ValidatedAdvertisementConfig,
    service_fullname: String,
    state: Arc<MonitorState>,
    stop_requested: Arc<AtomicBool>,
) -> Result<JoinHandle<()>, AdvertisementError> {
    thread::Builder::new()
        .name("companion-mdns-monitor".to_string())
        .spawn(move || {
            monitor_worker(
                monitor,
                daemon,
                expected_identity,
                service_fullname,
                state,
                stop_requested,
            )
        })
        .map_err(|_| AdvertisementError::RegistrationWorkerStopped)
}

fn monitor_worker(
    monitor: Receiver<DaemonEvent>,
    daemon: ServiceDaemon,
    expected_identity: ValidatedAdvertisementConfig,
    service_fullname: String,
    state: Arc<MonitorState>,
    stop_requested: Arc<AtomicBool>,
) {
    loop {
        if stop_requested.load(Ordering::Acquire) {
            return;
        }

        let event = match monitor.recv_timeout(MONITOR_POLL_INTERVAL) {
            Ok(event) => event,
            Err(_) if stop_requested.load(Ordering::Acquire) => return,
            Err(_) if monitor.is_disconnected() => {
                state.fail(AdvertisementError::RegistrationWorkerStopped);
                return;
            }
            Err(_) => continue,
        };

        let failure = match event {
            DaemonEvent::Announce(instance_name, target) => {
                match validate_windows_announcement(&expected_identity, &instance_name, &target) {
                    WindowsAnnouncementValidation::Verified => {
                        state.mark_healthy();
                        None
                    }
                    WindowsAnnouncementValidation::Pending => None,
                    WindowsAnnouncementValidation::Rejected => {
                        Some(AdvertisementError::RegisteredIdentityChanged)
                    }
                }
            }
            // mdns-sd resolves both host and service conflicts by renaming. A permanent QR must
            // never silently follow such a rename, so stop the responder immediately.
            DaemonEvent::NameChange(_) => Some(AdvertisementError::NameConflict),
            DaemonEvent::IpDel(address) if address == IpAddr::V4(expected_identity.address()) => {
                Some(AdvertisementError::RegistrationWorkerStopped)
            }
            DaemonEvent::Error(error) => Some(map_mdns_error(error)),
            _ => None,
        };

        if let Some(error) = failure {
            state.fail(error);
            unregister_and_shutdown(&daemon, &service_fullname);
            return;
        }
    }
}

fn map_mdns_error(error: MdnsError) -> AdvertisementError {
    match error {
        MdnsError::Again => AdvertisementError::PlatformFailure(MDNS_COMMAND_QUEUE_FULL),
        MdnsError::DaemonShutdown => AdvertisementError::RegistrationWorkerStopped,
        MdnsError::Msg(_) | MdnsError::ParseIpAddr(_) => {
            AdvertisementError::PlatformFailure(MDNS_PLATFORM_ERROR)
        }
        _ => AdvertisementError::PlatformFailure(MDNS_PLATFORM_ERROR),
    }
}

fn unregister_and_shutdown(daemon: &ServiceDaemon, service_fullname: &str) {
    if let Ok(receiver) = daemon.unregister(service_fullname) {
        let _ = receiver.recv_timeout(SHUTDOWN_TIMEOUT);
    }
    shutdown_daemon(daemon);
}

fn shutdown_daemon(daemon: &ServiceDaemon) {
    if let Ok(receiver) = daemon.shutdown() {
        let _ = receiver.recv_timeout(SHUTDOWN_TIMEOUT);
    }
}

fn join_monitor_worker(worker: JoinHandle<()>) {
    let _ = worker.join();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    fn valid_config() -> ValidatedAdvertisementConfig {
        super::super::LocalServiceAdvertisementConfig {
            hostname: "filament-manager-a7c4.local".to_string(),
            instance_name: "Filament Manager A7C4".to_string(),
            address: Ipv4Addr::new(192, 168, 1, 42),
            port: 4278,
            interface_index: 7,
        }
        .validate()
        .expect("valid advertisement config")
    }

    #[test]
    fn service_info_preserves_the_requested_identity_and_ipv4() {
        let service = build_service_info(&valid_config()).expect("service info");

        assert_eq!(
            service.get_fullname(),
            "Filament Manager A7C4._filament-manager._tcp.local."
        );
        assert_eq!(service.get_hostname(), "filament-manager-a7c4.local.");
        assert_eq!(service.get_port(), 4278);
        assert_eq!(
            service.get_addresses_v4(),
            std::collections::HashSet::from([&Ipv4Addr::new(192, 168, 1, 42)])
        );
        assert!(!service.is_addr_auto());
        assert!(service.requires_probe());
    }

    #[test]
    fn daemon_limit_explicitly_allows_the_companion_service_label() {
        let service_label = COMPANION_SERVICE_TYPE
            .strip_prefix('_')
            .and_then(|value| value.split_once('.'))
            .map(|(label, _)| label)
            .expect("service label");

        assert_eq!(service_label.len(), usize::from(SERVICE_NAME_LENGTH));
    }

    #[test]
    fn announcement_accepts_both_mdns_sd_payload_shapes() {
        let config = valid_config();

        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "[192.168.1.42]"
            ),
            WindowsAnnouncementValidation::Pending
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "[192.168.1.42, 192.168.1.43]"
            ),
            WindowsAnnouncementValidation::Pending
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "filament-manager-a7c4.local.:Ethernet"
            ),
            WindowsAnnouncementValidation::Verified
        );
    }

    #[test]
    fn announcement_rejects_changed_identity_but_ignores_unknown_payload_shapes() {
        let config = valid_config();

        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4 (2)._filament-manager._tcp.local.",
                "[192.168.1.42]"
            ),
            WindowsAnnouncementValidation::Rejected
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "[192.168.1.99]"
            ),
            WindowsAnnouncementValidation::Rejected
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "filament-manager-a7c4-2.local.:Ethernet"
            ),
            WindowsAnnouncementValidation::Rejected
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "future-mdns-sd-payload"
            ),
            WindowsAnnouncementValidation::Pending
        );
    }

    #[test]
    fn announcement_rejects_malformed_address_lists() {
        let config = valid_config();

        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "[not-an-ip]"
            ),
            WindowsAnnouncementValidation::Pending
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "[]"
            ),
            WindowsAnnouncementValidation::Rejected
        );
    }

    #[test]
    fn retransmission_announcement_requires_exact_requested_identity() {
        let config = valid_config();

        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "filament-manager-a7c4.local.:Ethernet"
            ),
            WindowsAnnouncementValidation::Verified
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4 (2)._filament-manager._tcp.local.",
                "filament-manager-a7c4.local.:Ethernet"
            ),
            WindowsAnnouncementValidation::Rejected
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "filament-manager-a7c4-2.local.:Ethernet"
            ),
            WindowsAnnouncementValidation::Rejected
        );
        assert_eq!(
            validate_windows_announcement(
                &config,
                "Filament Manager A7C4._filament-manager._tcp.local.",
                "missing-interface-separator"
            ),
            WindowsAnnouncementValidation::Pending
        );
    }

    #[test]
    fn monitor_health_keeps_the_first_failure() {
        let state = MonitorState::default();
        state.mark_healthy();
        state.fail(AdvertisementError::NameConflict);
        state.fail(AdvertisementError::RegisteredIdentityChanged);

        assert_eq!(state.health(), Err(AdvertisementError::NameConflict));
    }

    #[test]
    fn mdns_error_mapping_does_not_echo_daemon_metadata() {
        let error = map_mdns_error(MdnsError::Msg(
            "failed on 192.168.1.42 for Filament Manager A7C4".to_string(),
        ));

        assert_eq!(
            error,
            AdvertisementError::PlatformFailure(MDNS_PLATFORM_ERROR)
        );
        assert!(!error.to_string().contains("192.168.1.42"));
        assert!(!error.to_string().contains("A7C4"));
    }
}
