use crate::backend::filament_database::TrustedLanPairedBrowserRow;
use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn list_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TrustedLanPairedBrowserRow>, String> {
    with_db(&state, |db| db.list_trusted_lan_paired_browsers())
}
