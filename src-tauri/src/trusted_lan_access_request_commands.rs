use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_access_recovery::HostAccessRequest;
use crate::companion_access_recovery_api::access_request_scope;
use crate::state::AppState;
use std::time::Instant;

fn scope(state: &AppState) -> Result<String, String> {
    let db = FilamentDatabase::open(&state.db_path).map_err(|e| e.to_string())?;
    let id = db
        .get_library_sync_library_id()
        .map_err(|e| e.to_string())?;
    Ok(access_request_scope(&state.db_path, &id))
}

#[tauri::command]
pub(crate) fn list_companion_access_requests(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<HostAccessRequest>, String> {
    list_access_requests(&state)
}
pub(crate) fn list_access_requests(state: &AppState) -> Result<Vec<HostAccessRequest>, String> {
    if !state.companion.trusted_lan.enabled() || !state.companion.trusted_lan.running() {
        return Ok(Vec::new());
    }
    with_authoritative_local_library(state, || {
        state
            .companion
            .trusted_lan
            .access_recovery
            .list(&scope(state)?, Instant::now())
            .map_err(|_| "Could not load access requests".into())
    })
}

#[tauri::command]
pub(crate) fn decide_companion_access_request(
    state: tauri::State<'_, AppState>,
    request_id: String,
    approve: bool,
) -> Result<HostAccessRequest, String> {
    decide_access_request(&state, &request_id, approve)
}
pub(crate) fn decide_access_request(
    state: &AppState,
    request_id: &str,
    approve: bool,
) -> Result<HostAccessRequest, String> {
    with_authoritative_local_library(state, || {
        if !state.companion.trusted_lan.enabled() || !state.companion.trusted_lan.running() {
            return Err("Companion service is not running on this computer".into());
        }
        state
            .companion
            .trusted_lan
            .access_recovery
            .decide(&scope(state)?, request_id, approve, Instant::now())
            .map_err(|_| "This access request is no longer available".into())
    })
}
