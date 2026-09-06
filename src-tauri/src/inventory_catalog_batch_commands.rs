use crate::active_library_gateway::with_authoritative_local_library;
use crate::app_error::coded_command_error;
use crate::backend::inventory_engine::{CatalogSpoolBatchInput, CatalogSpoolBatchReceipt};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn create_catalog_spool_batch(
    state: tauri::State<'_, AppState>,
    input: CatalogSpoolBatchInput,
    expected_library_id: String,
    expected_target_generation: u64,
) -> Result<CatalogSpoolBatchReceipt, String> {
    create_catalog_spool_batch_for_target(
        &state,
        input,
        &expected_library_id,
        expected_target_generation,
    )
}

pub(crate) fn create_catalog_spool_batch_for_target(
    state: &AppState,
    input: CatalogSpoolBatchInput,
    expected_library_id: &str,
    expected_target_generation: u64,
) -> Result<CatalogSpoolBatchReceipt, String> {
    // The role/identity check and transaction share the same gate as library
    // transitions. A persisted pending request cannot cross a restore or an
    // A -> B -> A transition, even when its original library ID reappears.
    with_authoritative_local_library(state, || {
        let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
        if expected_library_id.is_empty()
            || settings.library_id != expected_library_id
            || settings.target_generation != expected_target_generation
        {
            return Err(coded_command_error("common.invalid_request"));
        }
        with_inventory(state, |engine| engine.create_catalog_spool_batch(input))
    })
}

#[cfg(test)]
#[path = "inventory_catalog_batch_command_tests.rs"]
mod tests;
