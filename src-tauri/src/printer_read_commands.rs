use crate::backend::filament_database::PrinterOverviewRow;
use crate::printer_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;

#[tauri::command]
pub(crate) fn list_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PrinterOverviewRow>, String> {
    companion_service(&state)
        .list_printer_overview()
        .map_err(inventory_error_to_string)
}
