use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_loan_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_write,
    save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write;
use crate::library_sync_models::*;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn delete_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || delete_library_sync_host_spool_blocking(&state, input)).await
}

fn delete_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let spool_id = encode_library_sync_path_segment(spool_id);
    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/delete"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    refresh_library_sync_loan_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host spool removed.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn purge_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || purge_library_sync_host_spool_blocking(&state, input)).await
}

fn purge_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let spool_id = encode_library_sync_path_segment(spool_id);
    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/purge"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    refresh_library_sync_loan_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host spool purged.", None)?;
    Ok(())
}
