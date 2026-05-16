use crate::backend::filament_database::{SpoolHistoryEventRow, SpoolUsagePointRow};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn list_spool_history(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolHistoryEventRow>, String> {
    let capped = limit.unwrap_or(50).clamp(1, 250);
    companion_service(&state)
        .list_spool_history(&spool_id, capped)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn list_spool_usage(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolUsagePointRow>, String> {
    let capped = limit.unwrap_or(300).clamp(1, 1_000);
    companion_service(&state)
        .list_spool_usage(&spool_id, capped)
        .map_err(inventory_error_to_string)
}
