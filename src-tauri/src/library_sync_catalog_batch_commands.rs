use crate::app_error::coded_command_error;
use crate::backend::inventory_engine::ExistingSpoolRfidInput;
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
    perform_library_sync_host_write_and_parse_for_target, verify_library_sync_target,
};
use crate::library_sync_location_commands::refresh_location_cache_best_effort;
use crate::library_sync_target_guard::{
    capture_library_sync_target, ensure_library_sync_target_current,
};
use crate::state::AppState;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCatalogSpoolBatchInput<T = CatalogSpoolBatchInput> {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: String,
    pub(crate) expected_target_generation: u64,
    pub(crate) batch: T,
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

#[tauri::command]
pub(crate) async fn supports_library_sync_host_ams_registration(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogSpoolBatchInput,
) -> Result<bool, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        supports_library_sync_host_ams_registration_blocking(&state, input)
    })
    .await
}

fn supports_library_sync_host_ams_registration_blocking(
    state: &AppState,
    input: LibrarySyncCatalogSpoolBatchInput,
) -> Result<bool, String> {
    let (health, _) = reviewed_batch_host(state, &input)?;
    Ok(health
        .capabilities
        .iter()
        .any(|cap| cap == crate::companion_models::AMS_REGISTRATION_CAPABILITY))
}

fn reviewed_batch_host<T>(
    state: &AppState,
    input: &LibrarySyncCatalogSpoolBatchInput<T>,
) -> Result<
    (
        crate::trusted_lan_health::CompanionHealthCheckResponse,
        crate::library_sync_target_guard::LibrarySyncTargetGuard,
    ),
    String,
> {
    let base_url = normalize_library_sync_base_url(&input.base_url)?;
    if input.expected_library_id.is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let target = capture_library_sync_target(state, &base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.expected_target_generation {
        return Err(coded_command_error("common.invalid_request"));
    }
    let (health, target) = verify_library_sync_target(target)?;
    ensure_library_sync_target_current(state, &target)?;
    Ok((health, target))
}

pub(crate) fn create_library_sync_host_catalog_spool_batch_blocking(
    state: &AppState,
    input: LibrarySyncCatalogSpoolBatchInput,
) -> Result<CatalogSpoolBatchReceipt, String> {
    let (health, target) = reviewed_batch_host(state, &input)?;
    let required = if input.batch.ams_assignment.is_some() {
        crate::companion_models::AMS_REGISTRATION_CAPABILITY
    } else {
        CATALOG_SPOOL_BATCH_CAPABILITY
    };
    if !health.capabilities.iter().any(|value| value == required) {
        return Err(coded_command_error("inventory.batch.host_unsupported"));
    }
    let receipt: CatalogSpoolBatchReceipt = perform_library_sync_host_write_and_parse_for_target(
        state,
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
    if input.batch.ams_assignment.is_some() {
        crate::library_sync_cache_refresh::refresh_library_sync_printer_cache(state, &target);
    }
    refresh_library_sync_spool_cache(state, &target);
    if input
        .batch
        .ownership_type
        .trim()
        .eq_ignore_ascii_case("BORROWED_IN")
    {
        refresh_library_sync_loan_cache(state, &target);
    }
    if input.batch.location.is_some() {
        refresh_location_cache_best_effort(state, &target);
    }
    let _ = save_library_sync_success(state, &target, "Host catalog spool batch saved.", None);
    Ok(receipt)
}

#[derive(serde::Serialize)]
#[serde(untagged)]
pub(crate) enum HostRfidRegistration {
    Committed(CatalogSpoolBatchReceipt),
    PreflightFailure { preflight_error: String },
    Unsupported,
}

#[tauri::command]
pub(crate) async fn register_library_sync_host_existing_spool_rfid(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogSpoolBatchInput<ExistingSpoolRfidInput>,
) -> Result<HostRfidRegistration, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        register_library_sync_host_existing_spool_rfid_blocking(&state, input)
    })
    .await
}

fn register_library_sync_host_existing_spool_rfid_blocking(
    state: &AppState,
    input: LibrarySyncCatalogSpoolBatchInput<ExistingSpoolRfidInput>,
) -> Result<HostRfidRegistration, String> {
    let (health, target) = match reviewed_batch_host(state, &input) {
        Ok(reviewed) => reviewed,
        Err(preflight_error) => {
            return Ok(HostRfidRegistration::PreflightFailure { preflight_error })
        }
    };
    if !health
        .capabilities
        .iter()
        .any(|v| v == crate::companion_models::EXISTING_SPOOL_RFID_CAPABILITY)
    {
        return Ok(HostRfidRegistration::Unsupported);
    }

    let receipt: CatalogSpoolBatchReceipt = perform_library_sync_host_write_and_parse_for_target(
        state,
        "/api/v1/spools/ams-rfid",
        &input.batch,
        &target,
        None,
    )?;
    if receipt.batch_id != input.batch.request_id
        || receipt.spool_ids.as_slice() != [input.batch.spool_id]
    {
        return Err(coded_command_error("common.internal"));
    }
    crate::library_sync_cache_refresh::refresh_library_sync_printer_cache(state, &target);
    refresh_library_sync_spool_cache(state, &target);
    Ok(HostRfidRegistration::Committed(receipt))
}

#[cfg(test)]
#[path = "library_sync_catalog_batch_tests.rs"]
mod tests;
