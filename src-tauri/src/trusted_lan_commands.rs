use crate::backend::filament_database::{TrustedLanPairedBrowserRow, TrustedLanSettingsRow};
use crate::companion_api;
use crate::security::hash_secret;
use crate::state::{AppState, TrustedLanCompanionRuntimeSnapshot};
use crate::trusted_lan_interfaces::{
    ensure_private_trusted_lan_interface, list_private_trusted_lan_interfaces,
    normalize_trusted_lan_interface_selection, TrustedLanInterfaceOption,
};
use crate::trusted_lan_status_commands::trusted_lan_server_status_snapshot;
use crate::with_db;
use serde::{Deserialize, Serialize};

const TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS: u64 = 10 * 60;

#[derive(Deserialize)]
pub(crate) struct UpdateTrustedLanCompanionConfigInput {
    enabled: bool,
    selected_interface_name: Option<String>,
    selected_interface_address: Option<String>,
    listen_port: Option<u16>,
}

#[derive(Serialize)]
pub(crate) struct TrustedLanPairingLink {
    pairing_url: String,
    expires_in_seconds: u64,
}

#[tauri::command]
pub(crate) fn list_trusted_lan_interfaces() -> Result<Vec<TrustedLanInterfaceOption>, String> {
    Ok(list_private_trusted_lan_interfaces())
}

#[tauri::command]
pub(crate) async fn update_trusted_lan_companion_config(
    state: tauri::State<'_, AppState>,
    input: UpdateTrustedLanCompanionConfigInput,
) -> Result<TrustedLanCompanionRuntimeSnapshot, String> {
    let selected_interface = normalize_trusted_lan_interface_selection(
        input.selected_interface_name.as_deref(),
        input.selected_interface_address.as_deref(),
    );
    if input.enabled && selected_interface.is_none() {
        return Err(
            "Select one private LAN interface before enabling trusted-LAN access.".to_string(),
        );
    }

    if input.enabled {
        if let Some((_, address)) = selected_interface.as_ref() {
            ensure_private_trusted_lan_interface(address)?;
        }
    }

    let settings = TrustedLanSettingsRow {
        enabled: input.enabled,
        selected_interface_name: selected_interface.as_ref().map(|value| value.0.clone()),
        selected_interface_address: selected_interface.as_ref().map(|value| value.1.clone()),
        listen_port: input
            .listen_port
            .filter(|value| *value > 0)
            .unwrap_or(companion_api::COMPANION_DEFAULT_PORT),
    };
    with_db(&state, |db| db.save_trusted_lan_settings(&settings))?;
    state.companion.trusted_lan.apply_config(
        settings.enabled,
        selected_interface,
        settings.listen_port,
    );
    companion_api::reconcile_trusted_lan_server(state.inner().clone()).await?;
    Ok(state.companion.trusted_lan.snapshot())
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

    let shell_url = status
        .shell_url
        .ok_or_else(|| "Trusted-LAN shell URL is not available.".to_string())?;
    Ok(TrustedLanPairingLink {
        pairing_url: format!(
            "{}?pairing={}",
            shell_url.trim_end_matches('/'),
            pairing_token
        ),
        expires_in_seconds: TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS,
    })
}

#[tauri::command]
pub(crate) fn list_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TrustedLanPairedBrowserRow>, String> {
    with_db(&state, |db| db.list_trusted_lan_paired_browsers())
}

#[tauri::command]
pub(crate) fn revoke_trusted_lan_paired_browser(
    state: tauri::State<'_, AppState>,
    browser_id: String,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_trusted_lan_paired_browser(&browser_id)
    })
}

#[tauri::command]
pub(crate) fn revoke_all_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_all_trusted_lan_paired_browsers().map(|_| ())
    })
}
