use crate::backend::inventory_domain::LoanDirection;

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
