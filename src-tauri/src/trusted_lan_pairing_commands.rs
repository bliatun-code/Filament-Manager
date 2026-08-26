use crate::active_library_gateway::with_authoritative_local_library;
use crate::companion_api;
use crate::security::hash_secret;
use crate::state::AppState;
use crate::trusted_lan_status_commands::trusted_lan_server_status_snapshot;
use crate::with_db;
use serde::Serialize;

const TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS: u64 = 10 * 60;

#[derive(Debug, Serialize)]
pub(crate) struct TrustedLanPairingLink {
    pairing_url: String,
    expires_in_seconds: u64,
}

#[tauri::command]
pub(crate) fn create_trusted_lan_pairing(
    state: tauri::State<'_, AppState>,
    browser_label: Option<String>,
) -> Result<TrustedLanPairingLink, String> {
    create_trusted_lan_pairing_inner(&state, browser_label)
}

fn create_trusted_lan_pairing_inner(
    state: &AppState,
    browser_label: Option<String>,
) -> Result<TrustedLanPairingLink, String> {
    with_authoritative_local_library(state, || {
        let status = trusted_lan_server_status_snapshot(&state.companion.trusted_lan);
        if !status.enabled {
            return Err("Trusted-LAN companion access is disabled.".to_string());
        }
        if !status.running || !status.shell_reachable {
            return Err(status.health_error.unwrap_or_else(|| {
                "Trusted-LAN companion is not ready yet. Refresh status and try again.".to_string()
            }));
        }
        let shell_url = status
            .shell_url
            .ok_or_else(|| "Trusted-LAN shell URL is not available.".to_string())?;

        let pairing_token = companion_api::generate_pairing_token();
        let pairing_token_hash = hash_secret(&pairing_token);
        with_db(state, |db| {
            db.create_trusted_lan_pairing(
                browser_label.as_deref(),
                &pairing_token_hash,
                TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS,
            )?;
            Ok(())
        })?;

        Ok(TrustedLanPairingLink {
            pairing_url: format!(
                "{}?pairing={}",
                shell_url.trim_end_matches('/'),
                pairing_token
            ),
            expires_in_seconds: TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::create_trusted_lan_pairing_inner;
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn client_role_cannot_create_local_companion_pairing_tokens() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-client-pairing-{}-{suffix}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open test database");
        db.apply_schema().expect("apply schema");
        db.set_setting("library_sync_mode", "CLIENT")
            .expect("switch to Client");
        drop(db);
        let state = AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };

        let error = create_trusted_lan_pairing_inner(&state, Some("Browser".to_string()))
            .expect_err("Client mode must reject local Companion pairing");
        assert!(error.contains("common.forbidden"));

        let _ = std::fs::remove_file(db_path);
    }
}
