use crate::backend::inventory_engine::InventoryBulkMutationResult;
use crate::companion_models::INVENTORY_BULK_MUTATION_CAPABILITY;
use crate::inventory_bulk_models::LibrarySyncInventoryBulkMutationInput;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::refresh_library_sync_spool_cache;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
};
use crate::library_sync_host_client::perform_library_sync_host_write_and_parse;
use crate::state::AppState;

const LEGACY_BULK_MUTATION_HOST_ERROR: &str =
    "The Host does not support atomic inventory bulk changes. Upgrade the Host before changing multiple rolls.";

#[tauri::command]
pub(crate) async fn execute_library_sync_host_inventory_bulk_mutation(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncInventoryBulkMutationInput,
) -> Result<InventoryBulkMutationResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        execute_library_sync_host_inventory_bulk_mutation_blocking(&state, input)
    })
    .await
}

fn execute_library_sync_host_inventory_bulk_mutation_blocking(
    state: &AppState,
    input: LibrarySyncInventoryBulkMutationInput,
) -> Result<InventoryBulkMutationResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (base_url, health) = prepare_library_sync_host_write(&host_input)?;
    require_inventory_bulk_mutation_capability(&health.capabilities)?;
    let result = perform_library_sync_host_write_and_parse(
        state,
        &base_url,
        "/api/v1/inventory/bulk-mutations",
        &input.mutation,
    )
    .map_err(map_inventory_bulk_host_error)?;

    refresh_library_sync_spool_cache(state, &base_url);
    save_library_sync_success(state, "Host inventory bulk change saved.", None)?;
    Ok(result)
}

fn require_inventory_bulk_mutation_capability(capabilities: &[String]) -> Result<(), String> {
    if capabilities
        .iter()
        .any(|capability| capability == INVENTORY_BULK_MUTATION_CAPABILITY)
    {
        Ok(())
    } else {
        Err(LEGACY_BULK_MUTATION_HOST_ERROR.to_string())
    }
}

fn map_inventory_bulk_host_error(error: String) -> String {
    if error.contains("404 Not Found") {
        LEGACY_BULK_MUTATION_HOST_ERROR.to_string()
    } else {
        error
    }
}

#[cfg(test)]
mod tests {
    use crate::companion_models::INVENTORY_BULK_MUTATION_CAPABILITY;

    use super::{
        map_inventory_bulk_host_error, require_inventory_bulk_mutation_capability,
        LEGACY_BULK_MUTATION_HOST_ERROR,
    };

    #[test]
    fn legacy_host_is_explicitly_unsupported_without_masking_other_failures() {
        assert_eq!(
            require_inventory_bulk_mutation_capability(&[])
                .expect_err("legacy host must fail before the bulk POST"),
            LEGACY_BULK_MUTATION_HOST_ERROR
        );
        assert!(require_inventory_bulk_mutation_capability(&[
            INVENTORY_BULK_MUTATION_CAPABILITY.to_string()
        ])
        .is_ok());
        assert_eq!(
            map_inventory_bulk_host_error(
                "Desktop sync write request returned 404 Not Found.".to_string()
            ),
            LEGACY_BULK_MUTATION_HOST_ERROR
        );
        assert_eq!(
            map_inventory_bulk_host_error(
                "Desktop sync write request returned 409 Conflict.".to_string()
            ),
            "Desktop sync write request returned 409 Conflict."
        );
    }

    #[test]
    fn host_transport_contains_one_bulk_write_and_no_local_fallback() {
        let source = include_str!("library_sync_inventory_bulk_write_commands.rs");
        let production = source
            .split_once("#[cfg(test)]")
            .map(|(production, _)| production)
            .expect("module should keep tests after production code");
        assert_eq!(
            production
                .matches("perform_library_sync_host_write_and_parse(")
                .count(),
            1
        );
        assert!(!production.contains("execute_bulk_inventory_mutation("));
        assert!(!production.contains("with_inventory("));
    }
}
