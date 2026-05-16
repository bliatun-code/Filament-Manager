use crate::backend::inventory_engine::{DeleteSpoolInput, PurgeSpoolInput};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn delete_spool(
    state: tauri::State<'_, AppState>,
    input: DeleteSpoolInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_spool(input))
}

#[tauri::command]
pub(crate) fn purge_spool(
    state: tauri::State<'_, AppState>,
    input: PurgeSpoolInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.purge_spool(input))
}
