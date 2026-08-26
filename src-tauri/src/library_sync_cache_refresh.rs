use crate::backend::filament_database::{
    PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated;
use crate::library_sync_target_guard::{with_current_library_sync_target, LibrarySyncTargetGuard};
use crate::state::AppState;

pub(crate) fn refresh_library_sync_spool_cache(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) {
    const PAGE_SIZE: usize = 2_500;
    const MAX_PAGES: usize = 200;

    let mut rows = Vec::new();
    let mut complete = false;
    for page_index in 0..MAX_PAGES {
        let offset = page_index * PAGE_SIZE;
        let page: Result<Vec<SpoolWithMasterRow>, String> =
            get_library_sync_host_json_authenticated(
                state,
                base_url,
                &format!("/api/v1/library/spools?limit={PAGE_SIZE}&offset={offset}"),
            );
        let Ok(page) = page else {
            return;
        };
        let page_len = page.len();
        rows.extend(page);
        if page_len < PAGE_SIZE {
            complete = true;
            break;
        }
    }

    if complete {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_spools(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_printer_cache(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) {
    let rows: Result<Vec<PrinterOverviewRow>, String> =
        get_library_sync_host_json_authenticated(state, base_url, "/api/v1/library/printers");
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_printers(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_loan_cache(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) {
    let rows: Result<Vec<SpoolLoanDetailsRow>, String> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/loans?include_returned=true&direction=ALL&limit=2000",
    );
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_loans(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_wishlist_cache(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) {
    let rows: Result<Vec<WishlistItemRow>, String> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/wishlist?limit=500",
    );
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_wishlist(&rows)
        });
    }
}
