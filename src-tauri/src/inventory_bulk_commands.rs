use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::inventory_engine::{InventoryBulkMutationInput, InventoryBulkMutationResult};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn execute_inventory_bulk_mutation(
    state: tauri::State<'_, AppState>,
    input: InventoryBulkMutationInput,
) -> Result<InventoryBulkMutationResult, String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| {
            engine.execute_bulk_inventory_mutation(input)
        })
    })
}
