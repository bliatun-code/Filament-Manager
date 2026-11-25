use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::{
    backend::database_loan_picker::{LoanPickerPage, LoanPickerQuery},
    backend::database_location_spools::{LocationSpoolPage, LocationSpoolQuery},
    backend::database_printer_picker::{PrinterPickerPage, PrinterPickerQuery},
    backend::database_result::InventoryResult,
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

#[derive(Deserialize)]
pub(crate) struct PickerTarget {
    base_url: Option<String>,
    expected_library_id: String,
    target_generation: u64,
}

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
