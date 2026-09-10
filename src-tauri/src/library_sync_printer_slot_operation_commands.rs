use crate::app_error::coded_command_error;
use crate::companion_models::PRINTER_SLOT_OPERATIONS_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_printer_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, normalize_library_sync_base_url, save_library_sync_success,
};
use crate::library_sync_host_client::{
    ensure_library_sync_host_matches, perform_library_sync_host_write_and_parse_for_target,
};
use crate::library_sync_target_guard::{
    capture_library_sync_target, ensure_library_sync_target_current,
};
use crate::printer_slot_write_commands::DesktopPrinterSlotOperationInput;
use crate::state::AppState;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct LibrarySyncPrinterSlotOperationInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: String,
    pub(crate) expected_target_generation: u64,
    pub(crate) operation: DesktopPrinterSlotOperationInput,
}

#[derive(Deserialize)]
struct PrinterSlotOperationAcknowledgment {
    ok: bool,
}

#[tauri::command]
pub(crate) async fn operate_library_sync_host_printer_slot(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncPrinterSlotOperationInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        operate_library_sync_host_printer_slot_blocking(&state, input)
    })
    .await
}

pub(crate) fn operate_library_sync_host_printer_slot_blocking(
    state: &AppState,
    input: LibrarySyncPrinterSlotOperationInput,
) -> Result<(), String> {
    let operation = input.operation.into_operation()?;
    let base_url = normalize_library_sync_base_url(&input.base_url)?;
    if input.expected_library_id.trim().is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    // Capture once before health/authentication: an A -> B -> A transition must
    // not let this request silently adopt a new authority generation.
    let target = capture_library_sync_target(state, &base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.expected_target_generation {
        return Err(coded_command_error("common.invalid_request"));
    }
    let health = ensure_library_sync_host_matches(&base_url, Some(target.library_id()))?;
    ensure_library_sync_target_current(state, &target)?;
    if !health
        .capabilities
        .iter()
        .any(|value| value == PRINTER_SLOT_OPERATIONS_CAPABILITY)
    {
        return Err(coded_command_error(
            "printers.slot_operation_host_unsupported",
        ));
    }
    let printer_id = encode_library_sync_path_segment(&operation.printer_id);
    let slot_id = encode_library_sync_path_segment(&operation.slot_id);
    let acknowledgment: PrinterSlotOperationAcknowledgment =
        perform_library_sync_host_write_and_parse_for_target(
            state,
            &base_url,
            &format!("/api/v1/printers/{printer_id}/slots/{slot_id}/operation"),
            &serde_json::json!({
                "expected_current_spool_id": operation.expected_current_spool_id,
                "target_spool_id": operation.target_spool_id,
                "outgoing_measured_total_g": operation.outgoing_measured_total_g,
                "incoming_measured_total_g": operation.incoming_measured_total_g,
            }),
            &target,
            None,
        )?;
    if !acknowledgment.ok {
        return Err(coded_command_error("common.internal"));
    }
    // A valid acknowledgment confirms the atomic Host commit. Refresh failures
    // must not invite the UI to retry a successfully saved operation.
    refresh_library_sync_printer_cache(state, &base_url, &target);
    refresh_library_sync_spool_cache(state, &base_url, &target);
    let _ = save_library_sync_success(state, &target, "Host printer slot operation saved.", None);
    Ok(())
}

#[cfg(test)]
#[path = "library_sync_printer_slot_operation_tests.rs"]
mod tests;
