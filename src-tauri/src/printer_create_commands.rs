use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::inventory_engine::CreatePrinterInput;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn create_printer(
    state: tauri::State<'_, AppState>,
    input: CreatePrinterInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.create_printer(input))
    })
}
