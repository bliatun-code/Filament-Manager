use crate::app_error::coded_command_error;
use crate::backend::inventory_engine::{CatalogSpoolBatchInput, CatalogSpoolBatchReceipt};
use crate::companion_models::CATALOG_SPOOL_BATCH_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_loan_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    normalize_library_sync_base_url, save_library_sync_success,
};
use crate::library_sync_host_client::{
    ensure_library_sync_host_matches, perform_library_sync_host_write_and_parse_for_target,
};
use crate::library_sync_location_commands::refresh_location_cache_best_effort;
use crate::library_sync_target_guard::{
    capture_library_sync_target, ensure_library_sync_target_current,
};
use crate::state::AppState;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCatalogSpoolBatchInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: String,
    pub(crate) expected_target_generation: u64,
    pub(crate) batch: CatalogSpoolBatchInput,
}

#[tauri::command]
pub(crate) async fn create_library_sync_host_catalog_spool_batch(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogSpoolBatchInput,
) -> Result<CatalogSpoolBatchReceipt, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        create_library_sync_host_catalog_spool_batch_blocking(&state, input)
    })
    .await
}

pub(crate) fn create_library_sync_host_catalog_spool_batch_blocking(
    state: &AppState,
    input: LibrarySyncCatalogSpoolBatchInput,
) -> Result<CatalogSpoolBatchReceipt, String> {
    let base_url = normalize_library_sync_base_url(&input.base_url)?;
    if input.expected_library_id.is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let target = capture_library_sync_target(state, &base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.expected_target_generation {
        return Err(coded_command_error("common.invalid_request"));
    }
    let health = ensure_library_sync_host_matches(&base_url, Some(target.library_id()))?;
    if !health
        .capabilities
        .iter()
        .any(|value| value == CATALOG_SPOOL_BATCH_CAPABILITY)
    {
        // No authentication or mutation has been attempted. An older Host must
        // never fall back to a sequence of individual spool writes.
        return Err(coded_command_error("inventory.batch.host_unsupported"));
    }
    ensure_library_sync_target_current(state, &target)?;
    let receipt: CatalogSpoolBatchReceipt = perform_library_sync_host_write_and_parse_for_target(
        state,
        &base_url,
        "/api/v1/spools/catalog-batch",
        &input.batch,
        &target,
        Some(std::time::Duration::from_secs(30)),
    )?;
    if receipt.batch_id != input.batch.batch_id.trim()
        || receipt.spool_ids.len() != input.batch.master_ids.len()
        || receipt.spool_ids.iter().any(|id| id.trim().is_empty())
        || receipt
            .spool_ids
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != receipt.spool_ids.len()
    {
        // A malformed acknowledgement leaves the same immutable request
        // retryable; never manufacture a success from an unrelated receipt.
        return Err(coded_command_error("common.internal"));
    }

    // The receipt proves the transaction committed. Cache/status refreshes are
    // scoped and best effort; failure must not turn it into a failed write.
    refresh_library_sync_spool_cache(state, &base_url, &target);
    if input
        .batch
        .ownership_type
        .trim()
        .eq_ignore_ascii_case("BORROWED_IN")
    {
        refresh_library_sync_loan_cache(state, &base_url, &target);
    }
    if input.batch.location.is_some() {
        refresh_location_cache_best_effort(state, &base_url, &target);
    }
    let _ = save_library_sync_success(state, &target, "Host catalog spool batch saved.", None);
    Ok(receipt)
}

#[cfg(test)]
#[path = "library_sync_catalog_batch_tests.rs"]
mod tests;
