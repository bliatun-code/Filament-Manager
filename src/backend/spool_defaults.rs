use super::inventory_domain::SpoolStatus;

pub(crate) const SPOOL_STATUS_ON_HAND_PREDICATE_SQL: &str =
    "REPLACE(REPLACE(UPPER(TRIM(COALESCE(status, ''))), '-', '_'), ' ', '_') IN ('IN_STOCK', 'IN_USE', 'ASSIGNED')";
pub(crate) const SPOOL_STATUS_ASSIGNED_PREDICATE_SQL: &str =
    "REPLACE(REPLACE(UPPER(TRIM(COALESCE(status, ''))), '-', '_'), ' ', '_') IN ('IN_USE', 'ASSIGNED')";
pub(crate) const SPOOL_OWNERSHIP_SELECT_SQL: &str =
    "CASE WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(ownership_type, ''))), '-', '_'), ' ', '_') = 'BORROWED_IN' THEN 'BORROWED_IN' ELSE 'OWNED' END";
pub(crate) const SPOOL_OWNERSHIP_SELECT_SQL_S: &str =
    "CASE WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(s.ownership_type, ''))), '-', '_'), ' ', '_') = 'BORROWED_IN' THEN 'BORROWED_IN' ELSE 'OWNED' END";
pub(crate) const SPOOL_OWNERSHIP_SELECT_SQL_SP: &str =
    "CASE WHEN REPLACE(REPLACE(UPPER(TRIM(COALESCE(sp.ownership_type, ''))), '-', '_'), ' ', '_') = 'BORROWED_IN' THEN 'BORROWED_IN' ELSE 'OWNED' END";

pub(crate) fn normalize_spool_status(raw: Option<&str>) -> String {
    let status = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("IN_STOCK")
        .to_uppercase()
        .replace(['-', ' '], "_");
    match status.as_str() {
        "LOANED_OUT" | "LOANED" => SpoolStatus::Borrowed.as_str().to_string(),
        "ARCHIVED" => status,
        _ => SpoolStatus::from_raw(Some(&status)).as_str().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_spool_status;

    #[test]
    fn normalizes_imported_spool_statuses_through_domain_values() {
        assert_eq!(normalize_spool_status(Some("in-stock")), "IN_STOCK");
        assert_eq!(normalize_spool_status(Some("IN_USE")), "ASSIGNED");
        assert_eq!(normalize_spool_status(Some("loaned out")), "BORROWED");
        assert_eq!(normalize_spool_status(Some("missing")), "MISSING");
        assert_eq!(normalize_spool_status(Some("archived")), "ARCHIVED");
        assert_eq!(normalize_spool_status(Some("unknown")), "IN_STOCK");
        assert_eq!(normalize_spool_status(None), "IN_STOCK");
    }
}
