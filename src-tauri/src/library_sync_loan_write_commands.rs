use crate::companion_models::LOAN_METADATA_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_loan_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_read, prepare_library_sync_host_write,
    save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write;
use crate::library_sync_models::{LibrarySyncLendSpoolInput, LibrarySyncReturnLoanInput};
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn return_library_sync_host_loan(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || return_library_sync_host_loan_blocking(&state, input)).await
}

fn return_library_sync_host_loan_blocking(
    state: &AppState,
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
        state,
        &normalized_base_url,
        &path,
        &serde_json::json!({
            "returned_grams": input.returned_grams.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    refresh_library_sync_loan_cache(state, &normalized_base_url);
    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host loan updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn lend_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || lend_library_sync_host_spool_blocking(&state, input)).await
}

fn lend_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("spool_id is required".to_string());
    }
    let borrower_name = input.borrower_name.trim();
    if borrower_name.is_empty() {
        return Err("borrower_name is required".to_string());
    }
    let counterparty_contact = trimmed_non_empty(input.counterparty_contact.as_deref());
    let expected_return_at = trimmed_non_empty(input.expected_return_at.as_deref());
    require_host_loan_metadata_capability(
        &health.capabilities,
        counterparty_contact.is_some() || expected_return_at.is_some(),
    )?;

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/lend"),
        &serde_json::json!({
            "borrower_name": borrower_name,
            "counterparty_contact": counterparty_contact,
            "grams_out": input.grams_out.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
            "expected_return_at": expected_return_at,
        }),
    )?;

    refresh_library_sync_loan_cache(state, &normalized_base_url);
    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host loan-out write completed.", None)?;

    Ok(())
}

fn require_host_loan_metadata_capability(
    capabilities: &[String],
    requested: bool,
) -> Result<(), String> {
    if !requested
        || capabilities
            .iter()
            .any(|capability| capability == LOAN_METADATA_CAPABILITY)
    {
        return Ok(());
    }

    Err(crate::app_error::coded_command_error(
        "loans.host_metadata_unsupported",
    ))
}

#[cfg(test)]
mod tests {
    use super::require_host_loan_metadata_capability;
    use crate::companion_models::LOAN_METADATA_CAPABILITY;

    #[test]
    fn legacy_host_is_allowed_for_legacy_loan_but_rejected_before_metadata_write() {
        assert!(require_host_loan_metadata_capability(&[], false).is_ok());

        let error = require_host_loan_metadata_capability(&[], true)
            .expect_err("metadata write must fail closed");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("coded error");
        assert_eq!(envelope["code"], "loans.host_metadata_unsupported");

        assert!(require_host_loan_metadata_capability(
            &[LOAN_METADATA_CAPABILITY.to_string()],
            true,
        )
        .is_ok());
    }
}
