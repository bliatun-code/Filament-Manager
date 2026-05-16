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
