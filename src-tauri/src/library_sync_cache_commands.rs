use crate::library_sync_models::{
    LibrarySyncCachedLoanList, LibrarySyncCachedPrinterOverview, LibrarySyncCachedSpoolList,
    LibrarySyncCachedWishlistList, SaveLibrarySyncSpoolCacheInput,
};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_spools(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedSpoolList>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_spools
        .map(|cached| LibrarySyncCachedSpoolList {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn save_library_sync_spool_cache(
    state: tauri::State<'_, AppState>,
    input: SaveLibrarySyncSpoolCacheInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_spools(&input.rows)
    })
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedPrinterOverview>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_printers
        .map(|cached| LibrarySyncCachedPrinterOverview {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_loans(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedLoanList>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_loans
        .map(|cached| LibrarySyncCachedLoanList {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_wishlist(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedWishlistList>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_wishlist
        .map(|cached| LibrarySyncCachedWishlistList {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}
