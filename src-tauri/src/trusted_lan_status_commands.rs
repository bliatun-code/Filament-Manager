use crate::state::{AppState, TrustedLanCompanionRuntime, TrustedLanCompanionRuntimeSnapshot};
use crate::trusted_lan_health::verify_companion_health_url;

#[tauri::command]
pub(crate) fn get_trusted_lan_companion_status(
    state: tauri::State<'_, AppState>,
) -> Result<TrustedLanCompanionRuntimeSnapshot, String> {
    Ok(trusted_lan_server_status_snapshot(
        &state.companion.trusted_lan,
    ))
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
