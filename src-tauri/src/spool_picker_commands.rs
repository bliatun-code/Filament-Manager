use serde::{de::DeserializeOwned, Serialize};

use crate::{
    backend::database_loan_picker::{LoanPickerPage, LoanPickerQuery},
    backend::database_location_spools::{LocationSpoolPage, LocationSpoolQuery},
    backend::database_printer_picker::{PrinterPickerPage, PrinterPickerQuery},
    backend::database_result::InventoryResult,
    backend::database_stock_cards::{StockCardPage, StockCardQuery},
    backend::database_wishlist_queue::{PurchaseQueuePage, PurchaseQueueQuery},
    backend::filament_database::FilamentDatabase,
    companion_models::{
        LOAN_PICKER_CAPABILITY, LOCATION_SPOOLS_CAPABILITY, PRINTER_PICKER_CAPABILITY,
    },
    library_sync_blocking_executor::run_library_sync_blocking,
    library_sync_command_support::{
        library_sync_host_input, prepare_library_sync_host_write_for_generation,
    },
    library_sync_host_client::{
        perform_library_sync_host_write_and_parse_for_target, LIBRARY_SYNC_REQUEST_TIMEOUT,
    },
    library_sync_target_guard::{
        capture_library_sync_target, ensure_library_sync_target_current,
        with_current_library_sync_target,
    },
    state::AppState,
    with_db,
};

pub(crate) use crate::library_sync_target_guard::LibraryReadTarget as PickerTarget;

#[tauri::command]
pub(crate) async fn get_printer_picker_page(
    state: tauri::State<'_, AppState>,
    query: PrinterPickerQuery,
    target: PickerTarget,
) -> Result<Option<PrinterPickerPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || printer_picker_page_blocking(&state, query, target)).await
}

pub(crate) fn printer_picker_page_blocking(
    state: &AppState,
    query: PrinterPickerQuery,
    target: PickerTarget,
) -> Result<Option<PrinterPickerPage>, String> {
    read_picker_page(
        state,
        &query,
        target,
        PRINTER_PICKER_CAPABILITY,
        "/api/v1/library/printer-spool-picker",
        FilamentDatabase::printer_picker_page,
    )
}

#[tauri::command]
pub(crate) async fn get_loan_picker_page(
    state: tauri::State<'_, AppState>,
    query: LoanPickerQuery,
    target: PickerTarget,
) -> Result<Option<LoanPickerPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || loan_picker_page_blocking(&state, query, target)).await
}

pub(crate) fn loan_picker_page_blocking(
    state: &AppState,
    query: LoanPickerQuery,
    target: PickerTarget,
) -> Result<Option<LoanPickerPage>, String> {
    read_picker_page(
        state,
        &query,
        target,
        LOAN_PICKER_CAPABILITY,
        "/api/v1/library/loan-spool-picker",
        FilamentDatabase::loan_picker_page,
    )
}

#[tauri::command]
pub(crate) async fn get_purchase_queue_page(
    state: tauri::State<'_, AppState>,
    query: PurchaseQueueQuery,
    target: PickerTarget,
) -> Result<Option<PurchaseQueuePage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || purchase_queue_page_blocking(&state, query, target)).await
}

pub(crate) fn purchase_queue_page_blocking(
    state: &AppState,
    query: PurchaseQueueQuery,
    target: PickerTarget,
) -> Result<Option<PurchaseQueuePage>, String> {
    let page = read_picker_page(
        state,
        &query,
        target.clone(),
        crate::companion_models::PURCHASE_QUEUE_CAPABILITY,
        "/api/v1/library/purchase-queue",
        FilamentDatabase::purchase_queue_page,
    )?;
    if let (Some(_), Some(page)) = (&target.base_url, &page) {
        target.with_database(state, |db| {
            // A cache storage failure must not hide a successful live read.
            let _ = db.cache_purchase_queue_page(page);
            Ok(())
        })?;
    }
    Ok(page)
}

#[tauri::command]
pub(crate) async fn get_stock_card_page(
    state: tauri::State<'_, AppState>,
    query: StockCardQuery,
    target: PickerTarget,
) -> Result<Option<StockCardPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || stock_card_page_blocking(&state, query, target)).await
}

pub(crate) fn stock_card_page_blocking(
    state: &AppState,
    query: StockCardQuery,
    target: PickerTarget,
) -> Result<Option<StockCardPage>, String> {
    // A newly paired Client needs its first complete offline capture. The ordinary
    // snapshot command commits that capture atomically, including an empty library.
    if target.base_url.is_some()
        && !target.with_database(state, FilamentDatabase::has_complete_stock_capture)?
    {
        return Ok(None);
    }
    read_picker_page(
        state,
        &query,
        target,
        crate::companion_models::STOCK_CARDS_CAPABILITY,
        "/api/v1/library/stock-cards",
        FilamentDatabase::stock_card_page,
    )
}

#[tauri::command]
pub(crate) async fn get_location_spool_page(
    state: tauri::State<'_, AppState>,
    query: LocationSpoolQuery,
    target: PickerTarget,
) -> Result<Option<LocationSpoolPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || location_spool_page_blocking(&state, query, target)).await
}

pub(crate) fn location_spool_page_blocking(
    state: &AppState,
    query: LocationSpoolQuery,
    target: PickerTarget,
) -> Result<Option<LocationSpoolPage>, String> {
    read_picker_page(
        state,
        &query,
        target,
        LOCATION_SPOOLS_CAPABILITY,
        "/api/v1/library/location-spools",
        FilamentDatabase::location_spool_page,
    )
}

#[tauri::command]
pub(crate) async fn get_cached_location_spool_page(
    state: tauri::State<'_, AppState>,
    query: LocationSpoolQuery,
    target: PickerTarget,
) -> Result<Option<LocationSpoolPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || cached_location_spool_page_blocking(&state, query, target))
        .await
}

pub(crate) fn cached_location_spool_page_blocking(
    state: &AppState,
    query: LocationSpoolQuery,
    target: PickerTarget,
) -> Result<Option<LocationSpoolPage>, String> {
    let base_url = target
        .base_url
        .filter(|_| !target.expected_library_id.trim().is_empty())
        .ok_or_else(|| crate::app_error::coded_command_error("common.invalid_request"))?;
    let guard = capture_library_sync_target(state, &base_url, Some(&target.expected_library_id))?;
    if guard.generation() != target.target_generation {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    with_current_library_sync_target(state, &guard, |engine| {
        engine.cached_location_spool_page(&query)
    })
}

fn read_picker_page<Q: Serialize, P: DeserializeOwned>(
    state: &AppState,
    query: &Q,
    target: PickerTarget,
    capability: &str,
    path: &str,
    local: fn(&FilamentDatabase, &Q) -> InventoryResult<P>,
) -> Result<Option<P>, String> {
    if target.expected_library_id.trim().is_empty() {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    let Some(base_url) = &target.base_url else {
        return with_db(state, |db| {
            let check = || {
                let current = db.get_library_sync_page_status()?;
                if current.mode == "CLIENT"
                    || current.library_id != target.expected_library_id
                    || current.target_generation != target.target_generation
                {
                    return Err(
                        crate::backend::database_result::InventoryError::InvalidOperation {
                            code: "common.invalid_request",
                            message: "The selected library changed.".into(),
                        },
                    );
                }
                Ok(())
            };
            check()?;
            let page = local(db, query)?;
            check()?;
            Ok(Some(page))
        });
    };
    let host = library_sync_host_input(base_url, Some(&target.expected_library_id));
    let (_, health, target) = prepare_library_sync_host_write_for_generation(
        state,
        &host,
        Some(target.target_generation),
    )?;
    if !health.capabilities.iter().any(|c| c == capability) {
        ensure_library_sync_target_current(state, &target)?;
        return Ok(None);
    }
    // Send picker parameters in the authenticated POST body.
    // The route only reads. Keep the normal read timeout and leave the full offline snapshot intact.
    perform_library_sync_host_write_and_parse_for_target(
        state,
        path,
        query,
        &target,
        Some(LIBRARY_SYNC_REQUEST_TIMEOUT),
    )
    .map(Some)
}
