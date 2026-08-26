use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::filament_database::TrustedLanSettingsRow;
use crate::companion_api;
use crate::state::{AppState, TrustedLanCompanionRuntimeSnapshot};
use crate::trusted_lan_interfaces::{
    ensure_private_trusted_lan_interface, normalize_trusted_lan_interface_selection,
};
use crate::with_db;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct UpdateTrustedLanCompanionConfigInput {
    enabled: bool,
    selected_interface_name: Option<String>,
    selected_interface_address: Option<String>,
    listen_port: Option<u16>,
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

    if input.enabled
        && let Some((_, address)) = selected_interface.as_ref()
    {
        ensure_private_trusted_lan_interface(address)?;
    }

    let _reconcile_guard = state.companion.trusted_lan.lock_reconcile().await;

    let settings = TrustedLanSettingsRow {
        enabled: input.enabled,
        selected_interface_name: selected_interface.as_ref().map(|value| value.0.clone()),
        selected_interface_address: selected_interface.as_ref().map(|value| value.1.clone()),
        listen_port: input
            .listen_port
            .filter(|value| *value > 0)
            .unwrap_or(companion_api::COMPANION_DEFAULT_PORT),
    };
    if settings.enabled {
        with_authoritative_local_library(&state, || {
            with_db(&state, |db| db.save_trusted_lan_settings(&settings))?;
            state.companion.trusted_lan.apply_config(
                true,
                selected_interface.clone(),
                settings.listen_port,
            );
            Ok(())
        })?;
    } else {
        // Disabling the local server is always safe and remains available as a
        // recovery action even when this device is already a Client.
        with_db(&state, |db| db.save_trusted_lan_settings(&settings))?;
        state
            .companion
            .trusted_lan
            .apply_config(false, selected_interface, settings.listen_port);
    }
    companion_api::reconcile_trusted_lan_server_locked(state.inner()).await?;
    Ok(state.companion.trusted_lan.snapshot())
}
