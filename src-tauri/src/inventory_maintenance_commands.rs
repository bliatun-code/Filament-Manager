use crate::backend::filament_database::CatalogResetStats;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn reset_app_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_inventory(&state, |engine| engine.reset_app_state())
}

#[tauri::command]
pub(crate) fn reset_catalog_data(
    state: tauri::State<'_, AppState>,
) -> Result<CatalogResetStats, String> {
    with_inventory(&state, |engine| engine.reset_catalogs())
}

#[tauri::command]
pub(crate) fn check_low_stock(
    state: tauri::State<'_, AppState>,
    threshold: i64,
) -> Result<usize, String> {
    with_inventory(&state, |engine| engine.check_low_stock_alerts(threshold))
}

#[tauri::command]
pub(crate) fn enqueue_sync_action(
    state: tauri::State<'_, AppState>,
    action_type: String,
    payload_json: String,
) -> Result<String, String> {
    with_inventory(&state, |engine| {
        engine.enqueue_sync_action(&action_type, &payload_json)
    })
}
