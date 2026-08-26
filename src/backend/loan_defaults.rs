use crate::backend::database_result::InventoryError;
use crate::backend::inventory_domain::LoanDirection;

pub(crate) const LOAN_BORROWER_REQUIRED_CODE: &str = "loans.borrower_required";
pub(crate) const LOAN_COUNTERPARTY_REQUIRED_CODE: &str = "loans.counterparty_required";
pub(crate) const LOAN_ALREADY_ACTIVE_CODE: &str = "loans.already_active";
pub(crate) const LOAN_ALREADY_RETURNED_CODE: &str = "loans.already_returned";
pub(crate) const LOAN_DIRECTION_MISMATCH_CODE: &str = "loans.direction_mismatch";
pub(crate) const LOAN_BORROWED_IN_CANNOT_LEND_CODE: &str = "loans.borrowed_in_cannot_lend";
pub(crate) const LOAN_INBOUND_REQUIRED_CODE: &str = "loans.inbound_required";

pub(crate) fn invalid_loan_operation(
    code: &'static str,
    message: impl Into<String>,
) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.into(),
    }
}

pub(crate) const LOAN_DIRECTION_SELECT_SQL: &str = "CASE
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(loan_direction, ''))), '-', '_'), ' ', '_') IN ('INBOUND', 'IN_BOUND')
        THEN 'INBOUND'
    ELSE 'OUTBOUND'
END";

pub(crate) const LOAN_DIRECTION_SELECT_SQL_L: &str = "CASE
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_direction, ''))), '-', '_'), ' ', '_') IN ('INBOUND', 'IN_BOUND')
        THEN 'INBOUND'
    ELSE 'OUTBOUND'
END";

pub(crate) const LOAN_STATUS_SELECT_SQL: &str = "CASE
    WHEN returned_at IS NOT NULL THEN 'RETURNED'
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(loan_status, ''))), '-', '_'), ' ', '_') IN ('RETURNED', 'LOST', 'CANCELLED')
        THEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(loan_status, ''))), '-', '_'), ' ', '_')
    ELSE 'ACTIVE'
END";

pub(crate) const LOAN_STATUS_SELECT_SQL_L: &str = "CASE
    WHEN l.returned_at IS NOT NULL THEN 'RETURNED'
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_') IN ('RETURNED', 'LOST', 'CANCELLED')
        THEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_')
    ELSE 'ACTIVE'
END";

pub(crate) const ACTIVE_LOAN_PREDICATE_SQL: &str = "CASE
    WHEN returned_at IS NOT NULL THEN 'RETURNED'
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(loan_status, ''))), '-', '_'), ' ', '_') IN ('RETURNED', 'LOST', 'CANCELLED')
        THEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(loan_status, ''))), '-', '_'), ' ', '_')
    ELSE 'ACTIVE'
END = 'ACTIVE'";

pub(crate) const ACTIVE_LOAN_PREDICATE_SQL_L: &str = "CASE
    WHEN l.returned_at IS NOT NULL THEN 'RETURNED'
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_') IN ('RETURNED', 'LOST', 'CANCELLED')
        THEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_')
    ELSE 'ACTIVE'
END = 'ACTIVE'";

pub(crate) const RETURNED_LOAN_PREDICATE_SQL_L: &str = "CASE
    WHEN l.returned_at IS NOT NULL THEN 'RETURNED'
    WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_') IN ('RETURNED', 'LOST', 'CANCELLED')
        THEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(l.loan_status, ''))), '-', '_'), ' ', '_')
    ELSE 'ACTIVE'
END = 'RETURNED'";

pub(crate) fn normalize_loan_direction_filter(raw: Option<&str>) -> String {
    let token = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("OUTBOUND")
        .to_uppercase()
        .replace(['-', ' '], "_");
    match token.as_str() {
        "ALL" => "ALL".to_string(),
        _ => LoanDirection::from_raw(Some(&token)).as_str().to_string(),
    }
}
