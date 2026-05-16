use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn delete_printer(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_printer(&printer_id))
}
