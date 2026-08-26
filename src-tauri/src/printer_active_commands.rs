use crate::active_library_gateway::with_authoritative_local_library;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn set_active_printer(
    state: tauri::State<'_, AppState>,
    printer_id: Option<String>,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| {
            engine.set_active_printer(printer_id.as_deref())
        })
    })
}
