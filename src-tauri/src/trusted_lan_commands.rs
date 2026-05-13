use crate::backend::filament_database::{
    FilamentDatabase, TrustedLanPairedBrowserRow, TrustedLanSettingsRow,
};
use crate::companion_api;
use crate::security::hash_secret;
use crate::state::{AppState, TrustedLanCompanionRuntime, TrustedLanCompanionRuntimeSnapshot};
use crate::with_db;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;

const TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS: u64 = 10 * 60;

#[derive(Deserialize)]
pub(crate) struct CompanionHealthCheckResponse {
    pub(crate) ok: bool,
    pub(crate) api_version: String,
    pub(crate) auth_mode: String,
    pub(crate) access_mode: Option<String>,
    pub(crate) library_id: Option<String>,
    pub(crate) device_name: Option<String>,
    pub(crate) sync_mode: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct TrustedLanInterfaceOption {
    name: String,
    address: String,
    label: String,
}

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
pub(crate) fn get_trusted_lan_companion_status(
    state: tauri::State<'_, AppState>,
) -> Result<TrustedLanCompanionRuntimeSnapshot, String> {
    Ok(trusted_lan_server_status_snapshot(
        &state.companion.trusted_lan,
    ))
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

pub(crate) fn trusted_lan_server_status_snapshot(
    runtime: &TrustedLanCompanionRuntime,
) -> TrustedLanCompanionRuntimeSnapshot {
    let mut snapshot = runtime.snapshot();
    if !snapshot.enabled || !snapshot.running {
        return snapshot;
    }

    let Some(base_url) = snapshot.base_url.clone() else {
        snapshot.shell_reachable = false;
        snapshot.health_error =
            Some("Trusted-LAN companion does not have a valid interface binding yet.".to_string());
        return snapshot;
    };

    match verify_companion_health_url(&base_url, "pairing-session", "Trusted-LAN companion") {
        Ok(()) => {
            snapshot.shell_reachable = true;
            snapshot.health_error = None;
        }
        Err(error) => {
            snapshot.shell_reachable = false;
            snapshot.health_error = Some(error);
        }
    }

    snapshot
}

fn verify_companion_health_url(
    base_url: &str,
    expected_auth_mode: &str,
    companion_label: &str,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .map_err(|error| format!("Failed to prepare {companion_label} health check: {error}"))?;

    let health_url = format!("{}/api/v1/health", base_url.trim_end_matches('/'));
    let response = client
        .get(&health_url)
        .send()
        .map_err(|error| format!("{companion_label} health check failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "{companion_label} health check returned {}.",
            response.status()
        ));
    }

    let response_text = response.text().map_err(|error| {
        format!("{companion_label} health check body could not be read: {error}")
    })?;
    let payload =
        serde_json::from_str::<CompanionHealthCheckResponse>(&response_text).map_err(|error| {
            format!("{companion_label} health check returned invalid JSON: {error}")
        })?;

    if !payload.ok {
        return Err(format!(
            "{companion_label} health check reported not ready."
        ));
    }
    if payload.api_version.trim() != "v1" {
        return Err(format!(
            "{companion_label} health check returned unexpected API version {}.",
            payload.api_version
        ));
    }
    if payload.auth_mode.trim() != expected_auth_mode {
        return Err(format!(
            "{companion_label} health check returned unexpected auth mode {}.",
            payload.auth_mode
        ));
    }

    Ok(())
}

pub(crate) fn load_trusted_lan_runtime(
    db_path: &str,
) -> Result<TrustedLanCompanionRuntime, String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_trusted_lan_settings()
        .map_err(|error| error.to_string())?;
    let runtime =
        TrustedLanCompanionRuntime::new(settings.listen_port).with_enabled(settings.enabled);
    let runtime = match (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        (Some(name), Some(address)) if !name.trim().is_empty() && !address.trim().is_empty() => {
            runtime.with_selected_interface(name.trim(), address.trim())
        }
        _ => runtime,
    };
    Ok(runtime)
}

fn list_private_trusted_lan_interfaces() -> Vec<TrustedLanInterfaceOption> {
    let mut interfaces = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ipv4) if !interface.is_loopback() && ipv4.is_private() => {
                Some(TrustedLanInterfaceOption {
                    label: format!("{} ({})", interface.name, ipv4),
                    name: interface.name,
                    address: ipv4.to_string(),
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    interfaces.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.address.cmp(&right.address))
    });
    interfaces.dedup_by(|left, right| left.name == right.name && left.address == right.address);
    interfaces
}

fn normalize_trusted_lan_interface_selection(
    interface_name: Option<&str>,
    interface_address: Option<&str>,
) -> Option<(String, String)> {
    let name = interface_name?.trim();
    let address = interface_address?.trim();
    if name.is_empty() || address.is_empty() {
        return None;
    }
    Some((name.to_string(), address.to_string()))
}

fn ensure_private_trusted_lan_interface(address: &str) -> Result<(), String> {
    let available = list_private_trusted_lan_interfaces();
    if available
        .iter()
        .any(|value| value.address == address.trim())
    {
        return Ok(());
    }
    Err(format!(
        "Trusted-LAN address {} is not currently available on a private interface.",
        address.trim()
    ))
}
