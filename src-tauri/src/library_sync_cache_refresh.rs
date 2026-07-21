use crate::backend::filament_database::{
    PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated;
use crate::state::AppState;
use crate::with_inventory;

pub(crate) fn refresh_library_sync_spool_cache(state: &tauri::State<'_, AppState>, base_url: &str) {
    let rows: Result<Vec<SpoolWithMasterRow>, String> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/spools?limit=2500",
    );
    if let Ok(rows) = rows {
        let _ = with_inventory(state, |engine| {
            engine.save_library_sync_cached_spools(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_printer_cache(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
) {
    let rows: Result<Vec<PrinterOverviewRow>, String> =
        get_library_sync_host_json_authenticated(state, base_url, "/api/v1/library/printers");
    if let Ok(rows) = rows {
        let _ = with_inventory(state, |engine| {
            engine.save_library_sync_cached_printers(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_loan_cache(state: &tauri::State<'_, AppState>, base_url: &str) {
    let rows: Result<Vec<SpoolLoanDetailsRow>, String> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/loans?include_returned=true&direction=ALL&limit=2000",
    );
    if let Ok(rows) = rows {
        let _ = with_inventory(state, |engine| engine.save_library_sync_cached_loans(&rows));
    }
}

pub(crate) fn refresh_library_sync_wishlist_cache(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
) {
    let rows: Result<Vec<WishlistItemRow>, String> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/wishlist?limit=500",
    );
    if let Ok(rows) = rows {
        let _ = with_inventory(state, |engine| {
            engine.save_library_sync_cached_wishlist(&rows)
        });
    }
}
