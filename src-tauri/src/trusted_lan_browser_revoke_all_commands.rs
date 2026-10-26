use crate::active_library_gateway::with_authoritative_local_library;
use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn revoke_all_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    revoke_all_browsers(state.inner())
}

pub(crate) fn revoke_all_browsers(state: &AppState) -> Result<(), String> {
    with_authoritative_local_library(state, || {
        with_db(state, |db| {
            db.revoke_all_trusted_lan_paired_browsers().map(|_| ())
        })?;
        state.companion.trusted_lan.access_recovery.clear();
        Ok(())
    })
}
