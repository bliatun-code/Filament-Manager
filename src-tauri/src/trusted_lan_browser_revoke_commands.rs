use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn revoke_trusted_lan_paired_browser(
    state: tauri::State<'_, AppState>,
    browser_id: String,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_trusted_lan_paired_browser(&browser_id)
    })
}
