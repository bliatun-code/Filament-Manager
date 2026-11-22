use crate::backend::filament_database::{
    PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated_for_target;
use crate::library_sync_models::LibrarySyncSpoolSnapshot;
use crate::library_sync_target_guard::{with_current_library_sync_target, LibrarySyncTargetGuard};
use crate::state::AppState;

pub(crate) fn refresh_library_sync_spool_cache(state: &AppState, target: &LibrarySyncTargetGuard) {
    let _ = fetch_and_cache_library_sync_spools(state, target, 2_500);
}

pub(crate) fn fetch_and_cache_library_sync_spools(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
    page_size: usize,
) -> Result<LibrarySyncSpoolSnapshot, String> {
    let rows = read_consistent_pages(
        page_size,
        500_000 / page_size,
        |offset| {
            get_library_sync_host_json_authenticated_for_target::<Vec<SpoolWithMasterRow>>(
                state,
                &format!("/api/v1/library/spools?limit={page_size}&offset={offset}"),
                target,
            )
        },
        || {
            let revision = crate::library_revision_commands::read_target_revisions(state, target)?;
            Ok((revision.inventory, revision.catalog))
        },
    )?;
    let mut ids = std::collections::HashSet::with_capacity(rows.len());
    if !rows.iter().all(|row| ids.insert(&row.spool.id)) {
        return Err("Host spool pagination repeated a spool id.".into());
    }
    // A local cache write failure still leaves a complete live read. A target
    // change rejects the entire result outside the save, including its rows.
    let captured_at = with_current_library_sync_target(state, target, |engine| {
        Ok(engine.save_library_sync_cached_spools(&rows).ok())
    })?;
    Ok(LibrarySyncSpoolSnapshot { captured_at, rows })
}

fn read_consistent_pages<T>(
    page_size: usize,
    max_pages: usize,
    mut read_page: impl FnMut(usize) -> Result<Vec<T>, String>,
    mut read_revision: impl FnMut() -> Result<(i64, i64), String>,
) -> Result<Vec<T>, String> {
    let first = read_page(0)?;
    if first.len() < page_size {
        return Ok(first);
    }
    drop(first);
    // Include page zero in the revision bracket. A retry always starts from scratch.
    let mut before = read_revision()?;
    for _ in 0..2 {
        let mut rows = Vec::new();
        for page_index in 0..max_pages {
            let page = read_page(rows.len())?;
            let complete = page.len() < page_size;
            rows.extend(page);
            if complete {
                let after = read_revision()?;
                if before == after {
                    return Ok(rows);
                }
                before = after;
                break;
            }
            if page_index + 1 == max_pages {
                return Err("Spool pagination did not finish.".into());
            }
        }
    }
    Err("Inventory changed during pagination.".into())
}

pub(crate) fn refresh_library_sync_printer_cache(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
) {
    let rows: Result<Vec<PrinterOverviewRow>, String> =
        get_library_sync_host_json_authenticated_for_target(
            state,
            "/api/v1/library/printers",
            target,
        );
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_printers(&rows)
        });
    }
}

pub(crate) fn fetch_and_cache_library_sync_active_loans(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let rows: Vec<SpoolLoanDetailsRow> = get_library_sync_host_json_authenticated_for_target(
        state,
        "/api/v1/library/loans?include_returned=false&direction=ALL&limit=2500",
        target,
    )?;
    with_current_library_sync_target(state, target, |engine| {
        engine.save_library_sync_cached_active_loans(&rows)
    })?;
    Ok(rows)
}

pub(crate) fn refresh_library_sync_loan_cache(state: &AppState, target: &LibrarySyncTargetGuard) {
    let _ = fetch_and_cache_library_sync_active_loans(state, target);
    let rows: Result<Vec<SpoolLoanDetailsRow>, String> =
        get_library_sync_host_json_authenticated_for_target(
            state,
            "/api/v1/library/loans?include_returned=true&direction=ALL&limit=2000",
            target,
        );
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_loans(&rows)
        });
    }
}

pub(crate) fn refresh_library_sync_wishlist_cache(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
) {
    let rows: Result<Vec<WishlistItemRow>, String> =
        get_library_sync_host_json_authenticated_for_target(
            state,
            "/api/v1/library/wishlist?limit=500",
            target,
        );
    if let Ok(rows) = rows {
        let _ = with_current_library_sync_target(state, target, |engine| {
            engine.save_library_sync_cached_wishlist(&rows)
        });
    }
}

#[cfg(test)]
mod spool_page_tests {
    use super::read_consistent_pages;
    use std::cell::Cell;

    #[test]
    fn a_deleted_spool_between_pages_never_hides_the_next_spool() {
        let removed = Cell::new(false);
        let rows = read_consistent_pages(
            2,
            4,
            |offset| {
                if offset == 2 {
                    removed.set(true);
                }
                let current = if removed.get() {
                    &[2, 3, 4][..]
                } else {
                    &[1, 2, 3, 4][..]
                };
                Ok(current.iter().skip(offset).take(2).copied().collect())
            },
            || Ok((i64::from(removed.get()), 0)),
        )
        .unwrap();
        assert_eq!(rows, [2, 3, 4]);
    }

    #[test]
    fn unstable_catalog_fails_after_one_retry() {
        let mut catalog = 0;
        let rows = read_consistent_pages(
            2,
            4,
            |offset| Ok(if offset == 0 { vec![1, 2] } else { vec![] }),
            || {
                catalog += 1;
                Ok((0, catalog))
            },
        );
        assert!(rows.is_err());
        assert_eq!(catalog, 3);
    }

    #[test]
    fn single_page_including_an_empty_library_does_not_need_revision_support() {
        for rows in [vec![], vec![1]] {
            let read = read_consistent_pages(
                2,
                4,
                |offset| {
                    assert_eq!(offset, 0);
                    Ok(rows.clone())
                },
                || panic!("single-page read must not fetch revisions"),
            )
            .unwrap();
            assert_eq!(read, rows);
        }
    }
}
