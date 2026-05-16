use crate::backend::inventory_engine::RecordPrintUsageInput;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn record_print_usage(
    state: tauri::State<'_, AppState>,
    input: RecordPrintUsageInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.record_print_usage(input))
}
