use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use serde::Serialize;
use std::sync::{Arc, RwLock};
use tauri::async_runtime::JoinHandle;
use tokio::sync::oneshot;

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
    qa_mode: bool,
}

#[derive(Clone, Debug, Default)]
struct TrustedLanCompanionConfig {
    enabled: bool,
    selected_interface: Option<TrustedLanCompanionInterface>,
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
}

#[derive(Clone, Debug, Serialize)]
pub struct TrustedLanCompanionRuntimeSnapshot {
    pub enabled: bool,
    pub selected_interface_name: Option<String>,
    pub selected_interface_address: Option<String>,
    pub bind_address: Option<String>,
    pub base_url: Option<String>,
    pub shell_url: Option<String>,
    pub listen_port: u16,
    pub shell_reachable: bool,
    pub health_error: Option<String>,
    pub running: bool,
    pub last_error: Option<String>,
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
                listen_port: port,
            })),
            status: Arc::new(RwLock::new(TrustedLanCompanionRuntimeStatus::default())),
            server: Arc::new(RwLock::new(None)),
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

    pub fn base_url(&self) -> Option<String> {
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
        let base_url = if enabled {
            effective_interface_address
                .as_ref()
                .map(|address| format!("http://{address}:{listen_port}"))
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
            base_url,
            shell_url,
            listen_port,
            shell_reachable: false,
            health_error: None,
            running: status.as_ref().map(|value| value.running).unwrap_or(false),
            last_error: status.and_then(|value| value.last_error.clone()),
            api_version: COMPANION_API_VERSION.to_string(),
            auth_mode: TRUSTED_LAN_COMPANION_AUTH_MODE.to_string(),
        }
    }
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
    fn visual_qa_runtime_binds_only_to_loopback() {
        let runtime = TrustedLanCompanionRuntime::new(4279)
            .with_selected_interface("Wi-Fi", "192.168.1.50")
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
        assert_eq!(snapshot.base_url.as_deref(), Some("http://127.0.0.1:4279"));
        assert_eq!(
            snapshot.shell_url.as_deref(),
            Some("http://127.0.0.1:4279/companion"),
        );
    }
}
