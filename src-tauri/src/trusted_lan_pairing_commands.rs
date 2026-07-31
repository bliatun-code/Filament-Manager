use crate::companion_api;
use crate::security::hash_secret;
use crate::state::AppState;
use crate::trusted_lan_status_commands::trusted_lan_server_status_snapshot;
use crate::with_db;
use serde::Serialize;

const TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS: u64 = 10 * 60;

#[derive(Serialize)]
pub(crate) struct TrustedLanPairingLink {
    pairing_url: String,
    expires_in_seconds: u64,
}

#[tauri::command]
pub(crate) fn create_trusted_lan_pairing(
    state: tauri::State<'_, AppState>,
    browser_label: Option<String>,
) -> Result<TrustedLanPairingLink, String> {
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
    with_db(&state, |db| {
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
}
