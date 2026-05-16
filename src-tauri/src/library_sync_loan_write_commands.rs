use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write;
use crate::library_sync_models::{LibrarySyncLendSpoolInput, LibrarySyncReturnLoanInput};
use crate::state::AppState;

#[tauri::command]
pub(crate) fn return_library_sync_host_loan(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let loan_id = input.loan_id.trim();
    if loan_id.is_empty() {
        return Err("Loan id is required.".to_string());
    }
    let path = if input.inbound {
        format!("/api/v1/loans/{loan_id}/hand-back")
    } else {
        format!("/api/v1/loans/{loan_id}/return")
    };

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &path,
        &serde_json::json!({
            "returned_grams": input.returned_grams.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host loan updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn lend_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("spool_id is required".to_string());
    }
    let borrower_name = input.borrower_name.trim();
    if borrower_name.is_empty() {
        return Err("borrower_name is required".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/lend"),
        &serde_json::json!({
            "borrower_name": borrower_name,
            "grams_out": input.grams_out.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host loan-out write completed.", None)?;

    Ok(())
}
