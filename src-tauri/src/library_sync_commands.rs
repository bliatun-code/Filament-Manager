use crate::library_sync_command_support::{
    prepare_library_sync_host_write, save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write;
use crate::library_sync_models::*;
use crate::state::AppState;

#[tauri::command]
pub(crate) fn delete_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/delete"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host spool removed.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn purge_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/purge"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host spool purged.", None)?;
    Ok(())
}
