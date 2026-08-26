use crate::backend::filament_database::LibraryDomainRevisions;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::prepare_library_sync_host_checked;
use crate::library_sync_host_client::get_library_sync_host_json_authenticated;
use crate::library_sync_models::{
    LibrarySyncDomainRevisionsResponse, ValidateLibrarySyncHostInput,
};
use crate::library_sync_target_guard::ensure_library_sync_target_current;
use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn get_library_domain_revisions(
    state: tauri::State<'_, AppState>,
) -> Result<LibraryDomainRevisions, String> {
    with_db(&state, |db| db.library_domain_revisions())
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_domain_revisions(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibraryDomainRevisions, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_domain_revisions_blocking(&state, input))
        .await
}

fn fetch_library_sync_domain_revisions_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibraryDomainRevisions, String> {
    // Verify the library identity without credentials before sending the runtime session to a
    // cached LAN address. This also refreshes a stale DHCP route before revision polling.
    let (normalized_base_url, expected_library_id, target) =
        prepare_library_sync_host_checked(state, &input)?;
    let expected_library_id = expected_library_id
        .ok_or_else(|| "Expected host library id is required for revision polling.".to_string())?;
    let response: LibrarySyncDomainRevisionsResponse = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/revisions",
    )?;
    if response.library_id.trim() != expected_library_id {
        return Err("Host library identity changed during revision polling.".to_string());
    }
    ensure_library_sync_target_current(state, &target)?;
    Ok(response.revisions)
}
