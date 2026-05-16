use crate::backend::filament_database::{
    FilamentMasterCatalogRow, SpoolRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;
use crate::{with_db, with_inventory};

#[tauri::command]
pub(crate) fn list_spools(
    state: tauri::State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    companion_service(&state)
        .list_spools(limit, offset)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn list_wishlist_items(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<WishlistItemRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_inventory(&state, |engine| engine.list_wishlist_items(capped))
}

#[tauri::command]
pub(crate) fn list_master_catalog(
    state: tauri::State<'_, AppState>,
    limit: i64,
    search: Option<String>,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    with_db(&state, |db| {
        db.list_master_catalog(limit, search.as_deref())
    })
}

#[tauri::command]
pub(crate) fn find_spool_by_qr(
    state: tauri::State<'_, AppState>,
    qr_code: String,
) -> Result<Option<SpoolRow>, String> {
    companion_service(&state)
        .find_spool_row_by_qr_or_id(&qr_code)
        .map_err(inventory_error_to_string)
}
