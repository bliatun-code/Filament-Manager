use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::local_service_advertisement::{AdvertisementError, LocalServiceAdvertisement};
use serde::Serialize;
use std::sync::{Arc, Mutex, RwLock};
use tauri::async_runtime::JoinHandle;
use tokio::sync::{oneshot, OwnedMutexGuard};

const COMPANION_API_VERSION: &str = "v1";
const TRUSTED_LAN_COMPANION_AUTH_MODE: &str = "pairing-session";
const VISUAL_QA_LOOPBACK_ADDRESS: &str = "127.0.0.1";
pub const TRUSTED_LAN_DEFAULT_PORT: u16 = 4278;

#[derive(Clone)]
pub struct AppState {
    pub db_path: String,
    pub companion: CompanionRuntimeState,
    pub credentials: CredentialStore,
    pub library_sync_auth: LibrarySyncRuntimeAuth,
}

#[derive(Clone)]
pub struct CompanionRuntimeState {
    pub trusted_lan: TrustedLanCompanionRuntime,
}

#[derive(Clone)]
pub struct TrustedLanCompanionRuntime {
    config: Arc<RwLock<TrustedLanCompanionConfig>>,
    status: Arc<RwLock<TrustedLanCompanionRuntimeStatus>>,
    server: Arc<RwLock<Option<TrustedLanCompanionServerHandle>>>,
    local_service_advertisement: Arc<Mutex<Option<LocalServiceAdvertisement>>>,
    reconcile_gate: Arc<tokio::sync::Mutex<()>>,
    qa_mode: bool,
}

#[derive(Clone, Debug, Default)]
struct TrustedLanCompanionConfig {
    enabled: bool,
    selected_interface: Option<TrustedLanCompanionInterface>,
    advertised_hostname: Option<String>,
    listen_port: u16,
}

#[derive(Clone, Debug)]
struct TrustedLanCompanionInterface {
    name: String,
    address: String,
}

pub(crate) struct TrustedLanCompanionServerHandle {
    shutdown_tx: Option<oneshot::Sender<()>>,
    join_handle: JoinHandle<()>,
}

#[derive(Clone, Debug, Default)]
struct TrustedLanCompanionRuntimeStatus {
    running: bool,
    last_error: Option<String>,
    local_name_running: bool,
    local_name_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TrustedLanCompanionRuntimeSnapshot {
    pub enabled: bool,
    pub selected_interface_name: Option<String>,
    pub selected_interface_address: Option<String>,
    pub bind_address: Option<String>,
    pub advertised_hostname: Option<String>,
    pub direct_base_url: Option<String>,
    pub base_url: Option<String>,
    pub shell_url: Option<String>,
    pub listen_port: u16,
    pub shell_reachable: bool,
    pub health_error: Option<String>,
    pub running: bool,
    pub last_error: Option<String>,
    pub local_name_running: bool,
    pub local_name_error: Option<String>,
    pub api_version: String,
    pub auth_mode: String,
}

impl CompanionRuntimeState {
    pub fn new(trusted_lan: TrustedLanCompanionRuntime) -> Self {
        Self { trusted_lan }
    }
}

impl TrustedLanCompanionRuntime {
    pub fn new(listen_port: u16) -> Self {
        let port = if listen_port == 0 {
            TRUSTED_LAN_DEFAULT_PORT
        } else {
            listen_port
        };
        Self {
            config: Arc::new(RwLock::new(TrustedLanCompanionConfig {
                enabled: false,
                selected_interface: None,
                advertised_hostname: None,
                listen_port: port,
            })),
            status: Arc::new(RwLock::new(TrustedLanCompanionRuntimeStatus::default())),
            server: Arc::new(RwLock::new(None)),
            local_service_advertisement: Arc::new(Mutex::new(None)),
            reconcile_gate: Arc::new(tokio::sync::Mutex::new(())),
            qa_mode: companion_visual_qa_enabled(),
        }
    }

    pub fn with_enabled(self, enabled: bool) -> Self {
        if let Ok(mut config) = self.config.write() {
            config.enabled = enabled;
        }
        self
    }

    pub fn with_selected_interface(
        self,
        name: impl Into<String>,
        address: impl Into<String>,
    ) -> Self {
        if let Ok(mut config) = self.config.write() {
            config.selected_interface = Some(TrustedLanCompanionInterface {
                name: name.into(),
                address: address.into(),
            });
        }
        self
    }

    pub fn with_advertised_hostname(self, hostname: impl Into<String>) -> Self {
        let hostname = normalize_local_hostname(&hostname.into());
        if let Ok(mut config) = self.config.write() {
            config.advertised_hostname = hostname;
        }
        self
    }

    #[cfg(test)]
    pub fn with_qa_mode(mut self, qa_mode: bool) -> Self {
        self.qa_mode = qa_mode;
        self
    }

    pub fn apply_config(
        &self,
        enabled: bool,
        selected_interface: Option<(impl Into<String>, impl Into<String>)>,
        listen_port: u16,
    ) {
        if let Ok(mut config) = self.config.write() {
            config.enabled = enabled;
            config.listen_port = normalize_trusted_lan_port(listen_port);
            config.selected_interface =
                selected_interface.map(|(name, address)| TrustedLanCompanionInterface {
                    name: name.into(),
                    address: address.into(),
                });
        }
    }

    pub fn apply_loaded_config(
        &self,
        enabled: bool,
        selected_interface: Option<(String, String)>,
        listen_port: u16,
        advertised_hostname: &str,
    ) {
        if let Ok(mut config) = self.config.write() {
            config.enabled = enabled;
            config.listen_port = normalize_trusted_lan_port(listen_port);
            config.selected_interface = selected_interface
                .map(|(name, address)| TrustedLanCompanionInterface { name, address });
            config.advertised_hostname = normalize_local_hostname(advertised_hostname);
        }
    }

    pub fn mark_running(&self) {
        if let Ok(mut status) = self.status.write() {
            status.running = true;
            status.last_error = None;
        }
    }

    pub fn mark_stopped(&self) {
        if let Ok(mut status) = self.status.write() {
            status.running = false;
            status.last_error = None;
        }
    }

    pub fn mark_failed(&self, error: impl Into<String>) {
        if let Ok(mut status) = self.status.write() {
            status.running = false;
            status.last_error = Some(error.into());
        }
    }

    pub fn mark_local_name_running(&self) {
        if let Ok(mut status) = self.status.write() {
            status.local_name_running = true;
            status.local_name_error = None;
        }
    }

    pub fn mark_local_name_stopped(&self) {
        if let Ok(mut status) = self.status.write() {
            status.local_name_running = false;
            status.local_name_error = None;
        }
    }

    pub fn mark_local_name_failed(&self, error: impl Into<String>) {
        if let Ok(mut status) = self.status.write() {
            status.local_name_running = false;
            status.local_name_error = Some(error.into());
        }
    }

    pub fn enabled(&self) -> bool {
        self.config
            .read()
            .map(|config| config.enabled)
            .unwrap_or(false)
    }

    pub fn listen_port(&self) -> u16 {
        self.config
            .read()
            .ok()
            .map(|config| normalize_trusted_lan_port(config.listen_port))
            .unwrap_or(TRUSTED_LAN_DEFAULT_PORT)
    }

    pub fn selected_interface(&self) -> Option<(String, String)> {
        self.config
            .read()
            .ok()
            .and_then(|config| config.selected_interface.clone())
            .map(|value| (value.name, value.address))
    }

    pub fn advertised_hostname(&self) -> Option<String> {
        self.config
            .read()
            .ok()
            .and_then(|config| config.advertised_hostname.clone())
    }

    pub fn local_name_running(&self) -> bool {
        self.status
            .read()
            .map(|status| status.local_name_running)
            .unwrap_or(false)
    }

    pub fn running(&self) -> bool {
        self.status
            .read()
            .map(|status| status.running)
            .unwrap_or(false)
    }

    pub(crate) async fn lock_reconcile(&self) -> OwnedMutexGuard<()> {
        Arc::clone(&self.reconcile_gate).lock_owned().await
    }

    pub fn qa_mode(&self) -> bool {
        self.qa_mode
    }

    pub fn auth_mode(&self) -> &'static str {
        TRUSTED_LAN_COMPANION_AUTH_MODE
    }

    pub fn bind_address(&self) -> Option<String> {
        let (enabled, selected_interface, listen_port) = (
            self.enabled(),
            self.selected_interface(),
            self.listen_port(),
        );
        if !enabled {
            return None;
        }

        if self.qa_mode {
            return Some(format!("{VISUAL_QA_LOOPBACK_ADDRESS}:{listen_port}"));
        }

        selected_interface.map(|(_, address)| format!("{address}:{listen_port}"))
    }

    pub fn direct_base_url(&self) -> Option<String> {
        let (enabled, selected_interface, listen_port) = (
            self.enabled(),
            self.selected_interface(),
            self.listen_port(),
        );
        if !enabled {
            return None;
        }

        if self.qa_mode {
            return Some(format!("http://{VISUAL_QA_LOOPBACK_ADDRESS}:{listen_port}"));
        }

        selected_interface.map(|(_, address)| format!("http://{address}:{listen_port}"))
    }

    pub fn base_url(&self) -> Option<String> {
        if self.qa_mode {
            return self.direct_base_url();
        }
        let Some(hostname) = self.advertised_hostname() else {
            // Test and legacy runtimes created without a stable hostname keep the historical
            // direct URL. Production runtimes always configure an advertised hostname.
            return self.direct_base_url();
        };
        if self.enabled() && self.local_name_running() {
            return Some(format!("http://{hostname}:{}", self.listen_port()));
        }
        None
    }

    pub fn allowed_host_authorities(&self) -> Vec<String> {
        let mut values = self
            .bind_address()
            .into_iter()
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if let Some(value) = self.stable_host_authority() {
            values.push(value);
        }
        values.sort();
        values.dedup();
        values
    }

    pub fn allowed_origins(&self) -> Vec<String> {
        let mut values = if self.qa_mode || self.advertised_hostname().is_none() {
            self.direct_base_url()
                .into_iter()
                .map(|value| value.to_ascii_lowercase())
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        if let Some(value) = self.base_url() {
            values.push(value.to_ascii_lowercase());
        }
        values.sort();
        values.dedup();
        values
    }

    pub fn stable_host_authority(&self) -> Option<String> {
        if !self.enabled() || !self.local_name_running() {
            return None;
        }
        self.advertised_hostname()
            .map(|hostname| format!("{hostname}:{}", self.listen_port()).to_ascii_lowercase())
    }

    pub fn stable_request_host_required(&self) -> bool {
        !self.qa_mode && self.advertised_hostname().is_some()
    }

    pub(crate) fn install_server_handle(
        &self,
        shutdown_tx: oneshot::Sender<()>,
        join_handle: JoinHandle<()>,
    ) {
        if let Ok(mut server) = self.server.write() {
            *server = Some(TrustedLanCompanionServerHandle {
                shutdown_tx: Some(shutdown_tx),
                join_handle,
            });
        }
    }

    pub(crate) fn take_server_handle(&self) -> Option<TrustedLanCompanionServerHandle> {
        self.server
            .write()
            .ok()
            .and_then(|mut server| server.take())
    }

    pub(crate) fn install_local_service_advertisement(
        &self,
        advertisement: LocalServiceAdvertisement,
    ) {
        if let Ok(mut current) = self.local_service_advertisement.lock() {
            *current = Some(advertisement);
        }
    }

    pub(crate) fn take_local_service_advertisement(&self) -> Option<LocalServiceAdvertisement> {
        self.local_service_advertisement
            .lock()
            .ok()
            .and_then(|mut current| current.take())
    }

    pub(crate) fn local_service_advertisement_health(&self) -> Result<(), AdvertisementError> {
        let current = self
            .local_service_advertisement
            .lock()
            .map_err(|_| AdvertisementError::RegistrationWorkerStopped)?;
        current
            .as_ref()
            .ok_or(AdvertisementError::RegistrationWorkerStopped)?
            .health()
    }

    pub fn snapshot(&self) -> TrustedLanCompanionRuntimeSnapshot {
        let config = self.config.read().ok();
        let status = self.status.read().ok();

        let enabled = config.as_ref().map(|value| value.enabled).unwrap_or(false);
        let listen_port = config
            .as_ref()
            .map(|value| value.listen_port)
            .filter(|value| *value > 0)
            .unwrap_or(TRUSTED_LAN_DEFAULT_PORT);
        let selected_interface_name = config
            .as_ref()
            .and_then(|value| value.selected_interface.as_ref())
            .map(|value| value.name.clone());
        let selected_interface_address = config
            .as_ref()
            .and_then(|value| value.selected_interface.as_ref())
            .map(|value| value.address.clone());
        let advertised_hostname = config
            .as_ref()
            .and_then(|value| value.advertised_hostname.clone());
        let registered_local_name_running = status
            .as_ref()
            .map(|value| value.local_name_running)
            .unwrap_or(false);
        // Visual QA keeps the listener on loopback and deliberately skips mDNS
        // registration, but public screenshots still need to show the stable,
        // library-bound `.local` address that a real host presents. Treat the
        // configured synthetic hostname as display-ready only; health checks
        // continue to use `direct_base_url` below and the runtime never tries
        // to resolve or advertise this name.
        let local_name_running = registered_local_name_running
            || (self.qa_mode && enabled && advertised_hostname.is_some());

        let effective_interface_address = if self.qa_mode {
            Some(VISUAL_QA_LOOPBACK_ADDRESS.to_string())
        } else {
            selected_interface_address.clone()
        };
        let bind_address = if enabled {
            effective_interface_address
                .as_ref()
                .map(|address| format!("{address}:{listen_port}"))
        } else {
            None
        };
        let direct_base_url = if enabled {
            effective_interface_address
                .as_ref()
                .map(|address| format!("http://{address}:{listen_port}"))
        } else {
            None
        };
        let base_url = if self.qa_mode && enabled && advertised_hostname.is_some() {
            advertised_hostname
                .as_ref()
                .map(|hostname| format!("http://{hostname}:{listen_port}"))
        } else if advertised_hostname.is_none() {
            direct_base_url.clone()
        } else if enabled && local_name_running {
            advertised_hostname
                .as_ref()
                .map(|hostname| format!("http://{hostname}:{listen_port}"))
        } else {
            None
        };
        let shell_url = base_url
            .as_ref()
            .map(|value| format!("{}/companion", value.trim_end_matches('/')));

        TrustedLanCompanionRuntimeSnapshot {
            enabled,
            selected_interface_name,
            selected_interface_address,
            bind_address,
            advertised_hostname,
            direct_base_url,
            base_url,
            shell_url,
            listen_port,
            shell_reachable: false,
            health_error: None,
            running: status.as_ref().map(|value| value.running).unwrap_or(false),
            last_error: status.as_ref().and_then(|value| value.last_error.clone()),
            local_name_running,
            local_name_error: status.and_then(|value| value.local_name_error.clone()),
            api_version: COMPANION_API_VERSION.to_string(),
            auth_mode: TRUSTED_LAN_COMPANION_AUTH_MODE.to_string(),
        }
    }
}

fn normalize_local_hostname(value: &str) -> Option<String> {
    let normalized = value.trim().trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty()
        || !normalized.ends_with(".local")
        || normalized
            .split('.')
            .any(|label| label.is_empty() || label.len() > 63)
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '.'))
    {
        return None;
    }
    Some(normalized)
}

impl TrustedLanCompanionServerHandle {
    pub fn shutdown(mut self) -> JoinHandle<()> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        self.join_handle
    }
}

fn normalize_trusted_lan_port(listen_port: u16) -> u16 {
    if listen_port == 0 {
        TRUSTED_LAN_DEFAULT_PORT
    } else {
        listen_port
    }
}

fn companion_visual_qa_enabled() -> bool {
    matches!(
        std::env::var("FILAMENT_MANAGER_VISUAL_QA")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

#[cfg(test)]
mod tests {
    use super::TrustedLanCompanionRuntime;

    #[test]
    fn trusted_lan_runtime_snapshot_stays_dark_until_explicitly_enabled() {
        let runtime =
            TrustedLanCompanionRuntime::new(4278).with_selected_interface("Wi-Fi", "192.168.1.50");

        let snapshot = runtime.snapshot();

        assert!(!snapshot.enabled);
        assert_eq!(snapshot.selected_interface_name.as_deref(), Some("Wi-Fi"));
        assert_eq!(
            snapshot.selected_interface_address.as_deref(),
            Some("192.168.1.50")
        );
        assert!(snapshot.bind_address.is_none());
        assert!(snapshot.base_url.is_none());
        assert!(snapshot.shell_url.is_none());
        assert_eq!(snapshot.listen_port, 4278);
    }

    #[test]
    fn trusted_lan_runtime_snapshot_builds_canonical_urls_once_enabled() {
        let runtime = TrustedLanCompanionRuntime::new(4278)
            .with_selected_interface("Ethernet", "192.168.0.42")
            .with_enabled(true);

        let snapshot = runtime.snapshot();

        assert!(snapshot.enabled);
        assert_eq!(snapshot.bind_address.as_deref(), Some("192.168.0.42:4278"));
        assert_eq!(
            snapshot.direct_base_url.as_deref(),
            Some("http://192.168.0.42:4278")
        );
        assert_eq!(
            snapshot.base_url.as_deref(),
            Some("http://192.168.0.42:4278")
        );
        assert_eq!(
            snapshot.shell_url.as_deref(),
            Some("http://192.168.0.42:4278/companion")
        );
        assert_eq!(snapshot.auth_mode, "pairing-session");
    }

    #[test]
    fn trusted_lan_runtime_advertises_one_stable_name_after_registration() {
        let runtime = TrustedLanCompanionRuntime::new(4278)
            .with_selected_interface("Ethernet", "192.168.0.42")
            .with_advertised_hostname("Filament-Manager-A7C4.local.")
            .with_enabled(true);

        assert_eq!(runtime.base_url().as_deref(), None);
        assert!(runtime.snapshot().shell_url.is_none());
        runtime.mark_local_name_running();

        let snapshot = runtime.snapshot();
        assert_eq!(
            snapshot.advertised_hostname.as_deref(),
            Some("filament-manager-a7c4.local")
        );
        assert_eq!(
            snapshot.direct_base_url.as_deref(),
            Some("http://192.168.0.42:4278")
        );
        assert_eq!(
            snapshot.base_url.as_deref(),
            Some("http://filament-manager-a7c4.local:4278")
        );
        assert_eq!(
            snapshot.shell_url.as_deref(),
            Some("http://filament-manager-a7c4.local:4278/companion")
        );
        assert_eq!(
            runtime.allowed_host_authorities(),
            vec![
                "192.168.0.42:4278".to_string(),
                "filament-manager-a7c4.local:4278".to_string(),
            ]
        );
        assert_eq!(
            runtime.allowed_origins(),
            vec!["http://filament-manager-a7c4.local:4278".to_string()]
        );
    }

    #[test]
    fn visual_qa_runtime_binds_only_to_loopback() {
        let runtime = TrustedLanCompanionRuntime::new(4279)
            .with_selected_interface("Wi-Fi", "192.168.1.50")
            .with_advertised_hostname("fm-qa7m4x2.local")
            .with_enabled(true)
            .with_qa_mode(true);

        assert_eq!(runtime.bind_address().as_deref(), Some("127.0.0.1:4279"));
        assert_eq!(runtime.base_url().as_deref(), Some("http://127.0.0.1:4279"));

        let snapshot = runtime.snapshot();
        assert_eq!(
            snapshot.selected_interface_address.as_deref(),
            Some("192.168.1.50")
        );
        assert_eq!(snapshot.bind_address.as_deref(), Some("127.0.0.1:4279"));
        assert_eq!(
            snapshot.base_url.as_deref(),
            Some("http://fm-qa7m4x2.local:4279")
        );
        assert_eq!(
            snapshot.shell_url.as_deref(),
            Some("http://fm-qa7m4x2.local:4279/companion"),
        );
        assert!(snapshot.local_name_running);
    }
}
