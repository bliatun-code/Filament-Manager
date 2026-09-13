use crate::app_error::coded_command_error;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_loan_cache, refresh_library_sync_printer_cache,
    refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_write,
    save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write_and_parse_for_target;
use crate::library_sync_models::LibrarySyncDeleteSpoolInput;
use crate::library_sync_target_guard::ensure_library_sync_target_current;
use crate::state::AppState;

#[derive(serde::Deserialize)]
struct RemovalAcknowledgment {
    ok: bool,
}

#[tauri::command]
pub(crate) async fn delete_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || delete_library_sync_host_spool_blocking(&state, input)).await
}

pub(crate) fn delete_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    remove_library_sync_host_spool(state, input, "delete")
}

#[tauri::command]
pub(crate) async fn purge_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || purge_library_sync_host_spool_blocking(&state, input)).await
}

pub(crate) fn purge_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    remove_library_sync_host_spool(state, input, "purge")
}

fn remove_library_sync_host_spool(
    state: &AppState,
    input: LibrarySyncDeleteSpoolInput,
    operation: &str,
) -> Result<(), String> {
    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() || trimmed_non_empty(input.expected_library_id.as_deref()).is_none() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;
    ensure_library_sync_target_current(state, &target)?;
    if input.expected_target_generation != target.generation() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let spool_id = encode_library_sync_path_segment(spool_id);
    // Keep the reviewed authority through health, authentication and the write.
    // Existing Hosts already return this acknowledgment; no new capability is needed.
    let receipt: RemovalAcknowledgment = perform_library_sync_host_write_and_parse_for_target(
        state,
        &base_url,
        &format!("/api/v1/spools/{spool_id}/{operation}"),
        &serde_json::json!({ "reason": trimmed_non_empty(input.reason.as_deref()) }),
        &target,
        None,
    )?;
    if !receipt.ok {
        return Err(coded_command_error("common.internal"));
    }
    refresh_library_sync_spool_cache(state, &base_url, &target);
    refresh_library_sync_printer_cache(state, &base_url, &target);
    refresh_library_sync_loan_cache(state, &base_url, &target);
    // A cache/status failure must not turn an accepted deletion into a retry.
    let _ = save_library_sync_success(state, &target, "Host spool removal saved.", None);
    Ok(())
}
