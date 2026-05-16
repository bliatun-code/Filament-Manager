use crate::backend::filament_database::TrustedLanPairedBrowserRow;
use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn list_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TrustedLanPairedBrowserRow>, String> {
    with_db(&state, |db| db.list_trusted_lan_paired_browsers())
}

#[tauri::command]
pub(crate) fn revoke_trusted_lan_paired_browser(
    state: tauri::State<'_, AppState>,
    browser_id: String,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_trusted_lan_paired_browser(&browser_id)
    })
}

#[tauri::command]
pub(crate) fn revoke_all_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_all_trusted_lan_paired_browsers().map(|_| ())
    })
}
