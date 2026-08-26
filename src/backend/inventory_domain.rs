pub use super::shared_contracts::{LoanDirection, LoanStatus, OwnershipType, SpoolStatus};

pub const LOW_STOCK_THRESHOLD_G: i64 = 200;

fn normalize_domain_token(value: Option<&str>, fallback: &str) -> String {
    value
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .unwrap_or(fallback)
        .to_uppercase()
        .replace(['-', ' '], "_")
}

impl OwnershipType {
    pub fn from_raw(value: Option<&str>) -> Self {
        match normalize_domain_token(value, "OWNED").as_str() {
            "BORROWED_IN" => Self::BorrowedIn,
            _ => Self::Owned,
        }
    }

    pub fn is_borrowed_in(self) -> bool {
        self == Self::BorrowedIn
    }
}

impl SpoolStatus {
    pub fn from_raw(value: Option<&str>) -> Self {
        match normalize_domain_token(value, "IN_STOCK").as_str() {
            "IN_USE" | "ASSIGNED" => Self::Assigned,
            "LOANED_OUT" | "LOANED" => Self::Borrowed,
            "BORROWED" => Self::Borrowed,
            "EMPTY" => Self::Empty,
            "LOST" => Self::Lost,
            "MISSING" => Self::Missing,
            "DELETED" => Self::Deleted,
            _ => Self::InStock,
        }
    }

    pub fn is_assigned(self) -> bool {
        self == Self::Assigned
    }

    pub fn is_historical(self) -> bool {
        matches!(
            self,
            Self::Empty | Self::Lost | Self::Missing | Self::Deleted
        )
    }
}

/// Classifies both canonical historical statuses and the legacy-only
/// `ARCHIVED` token without expanding the shared wire enum.
pub(crate) fn is_historical_spool_status(value: Option<&str>) -> bool {
    let normalized = normalize_domain_token(value, "IN_STOCK");
    normalized == "ARCHIVED" || SpoolStatus::from_raw(Some(&normalized)).is_historical()
}

impl LoanDirection {
    pub fn from_raw(value: Option<&str>) -> Self {
        match normalize_domain_token(value, "OUTBOUND").as_str() {
            "INBOUND" | "IN_BOUND" => Self::Inbound,
            _ => Self::Outbound,
        }
    }
}

impl LoanStatus {
    pub fn from_raw(value: Option<&str>, returned_at: Option<&str>) -> Self {
        if returned_at
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            return Self::Returned;
        }
        match normalize_domain_token(value, "ACTIVE").as_str() {
            "RETURNED" => Self::Returned,
            "LOST" => Self::Lost,
            "CANCELLED" => Self::Cancelled,
            _ => Self::Active,
        }
    }

    pub fn is_active(self) -> bool {
        self == Self::Active
    }
}

#[cfg(test)]
mod tests {
    use super::{LoanDirection, LoanStatus, OwnershipType, SpoolStatus};

    #[test]
    fn normalizes_legacy_spool_and_ownership_values() {
        assert_eq!(SpoolStatus::from_raw(Some("IN_USE")), SpoolStatus::Assigned);
        assert_eq!(
            SpoolStatus::from_raw(Some("assigned")),
            SpoolStatus::Assigned
        );
        assert_eq!(
            SpoolStatus::from_raw(Some("loaned out")),
            SpoolStatus::Borrowed
        );
        assert_eq!(SpoolStatus::from_raw(Some("loaned")), SpoolStatus::Borrowed);
        assert_eq!(SpoolStatus::Assigned.as_str(), "ASSIGNED");
        assert_eq!(SpoolStatus::from_raw(Some("missing")), SpoolStatus::Missing);
        assert_eq!(SpoolStatus::from_raw(Some("unknown")), SpoolStatus::InStock);
        assert_eq!(
            OwnershipType::from_raw(Some("borrowed-in")),
            OwnershipType::BorrowedIn
        );
        assert_eq!(OwnershipType::from_raw(None), OwnershipType::Owned);
    }

    #[test]
    fn normalizes_loan_direction_and_status_values() {
        assert_eq!(
            LoanDirection::from_raw(Some("inbound")),
            LoanDirection::Inbound
        );
        assert_eq!(
            LoanDirection::from_raw(Some("in bound")),
            LoanDirection::Inbound
        );
        assert_eq!(
            LoanDirection::from_raw(Some("in-bound")),
            LoanDirection::Inbound
        );
        assert_eq!(
            LoanDirection::from_raw(Some("sideways")),
            LoanDirection::Outbound
        );
        assert_eq!(
            LoanStatus::from_raw(Some("returned"), None),
            LoanStatus::Returned
        );
        assert_eq!(
            LoanStatus::from_raw(Some("active"), None),
            LoanStatus::Active
        );
        assert_eq!(
            LoanStatus::from_raw(Some("ACTIVE"), Some("2026-07-01 10:00:00")),
            LoanStatus::Returned
        );
        assert_eq!(LoanStatus::from_raw(Some("lost"), None), LoanStatus::Lost);
        assert_eq!(
            LoanStatus::from_raw(Some("cancelled"), None),
            LoanStatus::Cancelled
        );
    }
}
