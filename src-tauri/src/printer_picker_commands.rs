use serde::Deserialize;

use crate::{
    backend::database_printer_picker::{PrinterPickerPage, PrinterPickerQuery},
    companion_models::PRINTER_PICKER_CAPABILITY,
    library_sync_blocking_executor::run_library_sync_blocking,
    library_sync_command_support::{
        library_sync_host_input, prepare_library_sync_host_write_for_generation,
    },
    library_sync_host_client::{
        perform_library_sync_host_write_and_parse_for_target, LIBRARY_SYNC_REQUEST_TIMEOUT,
    },
    library_sync_target_guard::ensure_library_sync_target_current,
    state::AppState,
    with_db,
};

#[derive(Deserialize)]
pub(crate) struct PrinterPickerTarget {
    base_url: Option<String>,
    expected_library_id: String,
    target_generation: u64,
}

#[tauri::command]
pub(crate) async fn get_printer_picker_page(
    state: tauri::State<'_, AppState>,
    query: PrinterPickerQuery,
    target: PrinterPickerTarget,
) -> Result<Option<PrinterPickerPage>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || printer_picker_page_blocking(&state, query, target)).await
}

pub(crate) fn printer_picker_page_blocking(
    state: &AppState,
    query: PrinterPickerQuery,
    target: PrinterPickerTarget,
) -> Result<Option<PrinterPickerPage>, String> {
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
            let page = db.printer_picker_page(&query)?;
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
    if !health
        .capabilities
        .iter()
        .any(|c| c == PRINTER_PICKER_CAPABILITY)
    {
        ensure_library_sync_target_current(state, &target)?;
        return Ok(None);
    }
    // Authenticated JSON POST carries translated placement labels even for large printer farms.
    // The route only reads. Keep the normal read timeout and leave the full offline snapshot intact.
    perform_library_sync_host_write_and_parse_for_target(
        state,
        "/api/v1/library/printer-spool-picker",
        &query,
        &target,
        Some(LIBRARY_SYNC_REQUEST_TIMEOUT),
    )
    .map(Some)
}
