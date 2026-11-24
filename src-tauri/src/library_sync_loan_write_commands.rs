use crate::backend::filament_database::SpoolWithMasterRow;
use crate::companion_models::LOAN_METADATA_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_loan_cache, refresh_library_sync_printer_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input,
    prepare_library_sync_host_write_for_generation, save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::{
    get_library_sync_host_json_authenticated_for_target, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::{LibrarySyncLendSpoolInput, LibrarySyncReturnLoanInput};
use crate::library_sync_target_guard::with_current_library_sync_target;
use crate::library_sync_target_guard::LibrarySyncTargetGuard;
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;

#[derive(serde::Deserialize)]
struct LoanReceipt {
    counts: Option<crate::backend::database_loan_workspace::LoanWorkspaceCounts>,
    loan: LoanIdentity,
    spool: Option<SpoolWithMasterRow>,
}

#[derive(serde::Deserialize)]
struct LoanIdentity {
    id: String,
    spool_id: String,
}

fn cache_acknowledged_roll(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
    receipt: LoanReceipt,
    handed_back: bool,
) {
    let loan = receipt.loan;
    let row = if handed_back {
        None
    } else {
        // Older Hosts return just the loan. Read only this roll and keep the
        // successful write acknowledged even if the follow-up is interrupted.
        let spool = receipt.spool.or_else(|| {
            #[derive(serde::Deserialize)]
            struct Detail {
                spool: SpoolWithMasterRow,
            }
            let id = encode_library_sync_path_segment(&loan.spool_id);
            get_library_sync_host_json_authenticated_for_target::<Detail>(
                state,
                &format!("/api/v1/spools/{id}?history_limit=1&usage_limit=1"),
                target,
            )
            .ok()
            .map(|detail| detail.spool)
        });
        let Some(spool) = spool.filter(|row| row.spool.id == loan.spool_id) else {
            return;
        };
        Some(spool)
    };
    let _ = with_current_library_sync_target(state, target, |engine| {
        engine.save_cached_loan_spool_change(&loan.spool_id, row.as_ref(), receipt.counts.as_ref())
    });
}

fn prepare_loan_write(
    state: &AppState,
    base_url: &str,
    library_id: &str,
    generation: u64,
) -> Result<(CompanionHealthCheckResponse, LibrarySyncTargetGuard), String> {
    if library_id.trim().is_empty() {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    let input = library_sync_host_input(base_url, Some(library_id));
    let (_, health, target) =
        prepare_library_sync_host_write_for_generation(state, &input, Some(generation))?;
    Ok((health, target))
}

#[tauri::command]
pub(crate) async fn return_library_sync_host_loan(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || return_library_sync_host_loan_blocking(&state, input)).await
}

pub(crate) fn return_library_sync_host_loan_blocking(
    state: &AppState,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let (_, target) = prepare_loan_write(
        state,
        &input.base_url,
        &input.expected_library_id,
        input.expected_target_generation,
    )?;

    let loan_id = input.loan_id.trim();
    if loan_id.is_empty() {
        return Err("Loan id is required.".to_string());
    }
    let loan_id = encode_library_sync_path_segment(loan_id);
    let path = if input.inbound {
        format!("/api/v1/loans/{loan_id}/hand-back")
    } else {
        format!("/api/v1/loans/{loan_id}/return")
    };

    let receipt = perform_library_sync_host_write_and_parse(
        state,
        &path,
        &serde_json::json!({
            "returned_grams": input.returned_grams.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
        &target,
    )?;

    if let Ok(receipt) = serde_json::from_value::<LoanReceipt>(receipt)
        && receipt.loan.id == input.loan_id.trim()
    {
        cache_acknowledged_roll(state, &target, receipt, input.inbound);
    }
    refresh_library_sync_loan_cache(state, &target);
    save_library_sync_success(state, &target, "Host loan updated.", None)?;
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

pub(crate) fn lend_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let (health, target) = prepare_loan_write(
        state,
        &input.base_url,
        &input.expected_library_id,
        input.expected_target_generation,
    )?;

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

    let spool_id = encode_library_sync_path_segment(spool_id);
    let receipt = perform_library_sync_host_write_and_parse(
        state,
        &format!("/api/v1/spools/{spool_id}/lend"),
        &serde_json::json!({
            "borrower_name": borrower_name,
            "counterparty_contact": counterparty_contact,
            "grams_out": input.grams_out.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
            "expected_return_at": expected_return_at,
        }),
        &target,
    )?;

    if let Ok(receipt) = serde_json::from_value::<LoanReceipt>(receipt)
        && receipt.loan.spool_id == input.spool_id.trim()
    {
        cache_acknowledged_roll(state, &target, receipt, false);
    }
    refresh_library_sync_loan_cache(state, &target);
    refresh_library_sync_printer_cache(state, &target);
    save_library_sync_success(state, &target, "Host loan-out write completed.", None)?;

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
