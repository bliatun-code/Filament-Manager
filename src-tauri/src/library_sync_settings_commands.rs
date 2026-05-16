use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::library_sync_models::SaveLibrarySyncSettingsInput;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn get_library_sync_settings(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| engine.get_library_sync_settings())
}

#[tauri::command]
pub(crate) fn save_library_sync_settings(
    state: tauri::State<'_, AppState>,
    input: SaveLibrarySyncSettingsInput,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| {
        engine.save_library_sync_settings(&LibrarySyncSettingsRow {
            mode: input.mode,
            device_name: input.device_name,
            library_id: input.library_id,
            host_base_url: input.host_base_url,
            host_device_name: input.host_device_name,
            client_auth_paired: false,
            client_auth_paired_at: None,
            client_auth_expires_at: None,
            last_checked_at: None,
            last_reachable_at: None,
            last_validation_message: None,
            cached_snapshot: None,
            cached_spools: None,
            cached_printers: None,
            cached_loans: None,
        })
    })
}

#[tauri::command]
pub(crate) fn clear_library_sync_client_auth(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| {
        engine.clear_library_sync_client_auth_state()?;
        engine.get_library_sync_settings()
    })
}
