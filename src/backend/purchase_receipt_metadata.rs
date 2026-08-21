use serde::{Deserialize, Serialize};
use time::{Date, Month};

use super::database_result::{InventoryError, InventoryResult};
use super::database_spool_models::SpoolRow;

pub const PURCHASE_BATCH_CODE_MAX_LENGTH: usize = 120;
pub const PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH: usize = 200;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PurchaseReceiptMetadata {
    pub purchase_price: Option<f64>,
    pub purchase_currency: Option<String>,
    pub purchase_date: Option<String>,
    pub batch_code: Option<String>,
    pub supplier_reference: Option<String>,
}

impl PurchaseReceiptMetadata {
    pub fn is_empty(&self) -> bool {
        self.purchase_price.is_none()
            && self.purchase_currency.is_none()
            && self.purchase_date.is_none()
            && self.batch_code.is_none()
            && self.supplier_reference.is_none()
    }

    pub fn from_spool(spool: &SpoolRow) -> Self {
        Self {
            purchase_price: spool.purchase_price,
            purchase_currency: spool.purchase_currency.clone(),
            purchase_date: spool.purchase_date.clone(),
            batch_code: spool.batch_code.clone(),
            supplier_reference: spool.supplier_reference.clone(),
        }
    }

    pub fn normalize_for_new(self) -> InventoryResult<Self> {
        self.normalize(None)
    }

    pub fn normalize_for_edit(self, existing: &SpoolRow) -> InventoryResult<Self> {
        let legacy_unchanged_price = existing
            .purchase_currency
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
            .then_some(existing.purchase_price)
            .flatten();
        self.normalize(legacy_unchanged_price)
    }

    /// Inventory exports are also a round-trip format for databases migrated
    /// from older schemas. Those schemas did not validate receipt semantics, so
    /// preserve their type-correct values exactly instead of applying today's
    /// write rules. Non-finite prices are parser sentinels and remain invalid.
    pub(crate) fn normalize_for_import(self) -> InventoryResult<Self> {
        if self.purchase_price.is_some_and(|price| !price.is_finite()) {
            return Err(invalid_metadata(
                "purchase_metadata.price_invalid",
                "Purchase price must be a finite number",
            ));
        }
        Ok(self)
    }

    fn normalize(self, legacy_unchanged_price: Option<f64>) -> InventoryResult<Self> {
        let purchase_price = match self.purchase_price {
            Some(price) if !price.is_finite() || price < 0.0 => {
                return Err(invalid_metadata(
                    "purchase_metadata.price_invalid",
                    "Purchase price must be a finite number greater than or equal to zero",
                ));
            }
            Some(price) => Some(price.max(0.0)),
            None => None,
        };
        let purchase_currency = normalize_optional_text(self.purchase_currency);
        let purchase_currency = purchase_currency.map(|value| value.to_ascii_uppercase());
        if let Some(currency) = purchase_currency.as_deref()
            && (currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_alphabetic()))
        {
            return Err(invalid_metadata(
                "purchase_metadata.currency_invalid",
                "Purchase currency must be a three-letter ISO currency code",
            ));
        }
        match (purchase_price, purchase_currency.as_deref()) {
            (Some(price), None) if legacy_unchanged_price != Some(price) => {
                return Err(invalid_metadata(
                    "purchase_metadata.currency_required",
                    "Purchase currency is required when purchase price is set",
                ));
            }
            (None, Some(_)) => {
                return Err(invalid_metadata(
                    "purchase_metadata.price_required",
                    "Purchase price is required when purchase currency is set",
                ));
            }
            _ => {}
        }

        let purchase_date = normalize_optional_text(self.purchase_date);
        if let Some(value) = purchase_date.as_deref()
            && !is_valid_purchase_date(value)
        {
            return Err(invalid_metadata(
                "purchase_metadata.date_invalid",
                "Purchase date must be a valid date in YYYY-MM-DD format",
            ));
        }
        let batch_code = normalize_limited_text(
            self.batch_code,
            PURCHASE_BATCH_CODE_MAX_LENGTH,
            "purchase_metadata.batch_code_too_long",
            "Batch code",
        )?;
        let supplier_reference = normalize_limited_text(
            self.supplier_reference,
            PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH,
            "purchase_metadata.supplier_reference_too_long",
            "Supplier reference",
        )?;

        Ok(Self {
            purchase_price,
            purchase_currency,
            purchase_date,
            batch_code,
            supplier_reference,
        })
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_limited_text(
    value: Option<String>,
    max_length: usize,
    code: &'static str,
    label: &str,
) -> InventoryResult<Option<String>> {
    let value = normalize_optional_text(value);
    if value
        .as_deref()
        .is_some_and(|value| value.chars().count() > max_length)
    {
        return Err(invalid_metadata(
            code,
            &format!("{label} must be {max_length} characters or fewer"),
        ));
    }
    Ok(value)
}

fn is_valid_purchase_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u8>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u8>() else {
        return false;
    };
    if year < 1 {
        return false;
    }
    let Ok(month) = Month::try_from(month) else {
        return false;
    };
    Date::from_calendar_date(year, month, day).is_ok()
}

fn invalid_metadata(code: &'static str, message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        PurchaseReceiptMetadata, PURCHASE_BATCH_CODE_MAX_LENGTH,
        PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH,
    };
    use crate::backend::database_result::InventoryError;
    use crate::backend::database_spool_models::SpoolRow;

    fn empty_spool() -> SpoolRow {
        SpoolRow {
            id: "spool-1".to_string(),
            master_id: "master-1".to_string(),
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(1000),
            remaining_g: Some(1000),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
            purchase_currency: None,
            supplier_reference: None,
        }
    }

    fn assert_error_code(result: Result<PurchaseReceiptMetadata, InventoryError>, code: &str) {
        match result.expect_err("metadata should be rejected") {
            InventoryError::InvalidOperation { code: actual, .. } => assert_eq!(actual, code),
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn normalizes_valid_metadata() {
        let normalized = PurchaseReceiptMetadata {
            purchase_price: Some(-0.0),
            purchase_currency: Some(" nok ".to_string()),
            purchase_date: Some(" 2024-02-29 ".to_string()),
            batch_code: Some(" batch-7 ".to_string()),
            supplier_reference: Some(" po-19 ".to_string()),
        }
        .normalize_for_new()
        .expect("normalize metadata");

        assert_eq!(normalized.purchase_price, Some(0.0));
        assert_eq!(normalized.purchase_currency.as_deref(), Some("NOK"));
        assert_eq!(normalized.purchase_date.as_deref(), Some("2024-02-29"));
        assert_eq!(normalized.batch_code.as_deref(), Some("batch-7"));
        assert_eq!(normalized.supplier_reference.as_deref(), Some("po-19"));
    }

    #[test]
    fn rejects_invalid_price_currency_and_calendar_dates() {
        assert_error_code(
            PurchaseReceiptMetadata {
                purchase_price: Some(f64::INFINITY),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.price_invalid",
        );
        assert_error_code(
            PurchaseReceiptMetadata {
                purchase_price: Some(10.0),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.currency_required",
        );
        assert_error_code(
            PurchaseReceiptMetadata {
                purchase_currency: Some("NOK".to_string()),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.price_required",
        );
        assert_error_code(
            PurchaseReceiptMetadata {
                purchase_price: Some(10.0),
                purchase_currency: Some("N0K".to_string()),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.currency_invalid",
        );
        for date in ["2023-02-29", "2024-13-01", "0000-01-01", "24-01-01"] {
            assert_error_code(
                PurchaseReceiptMetadata {
                    purchase_date: Some(date.to_string()),
                    ..Default::default()
                }
                .normalize_for_new(),
                "purchase_metadata.date_invalid",
            );
        }
    }

    #[test]
    fn validates_unicode_text_limits_by_scalar_count() {
        PurchaseReceiptMetadata {
            batch_code: Some("å".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH)),
            supplier_reference: Some("ø".repeat(PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH)),
            ..Default::default()
        }
        .normalize_for_new()
        .expect("accept exact limits");

        assert_error_code(
            PurchaseReceiptMetadata {
                batch_code: Some("å".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH + 1)),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.batch_code_too_long",
        );
        assert_error_code(
            PurchaseReceiptMetadata {
                supplier_reference: Some("ø".repeat(PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH + 1)),
                ..Default::default()
            }
            .normalize_for_new(),
            "purchase_metadata.supplier_reference_too_long",
        );
    }

    #[test]
    fn legacy_price_without_currency_can_only_remain_unchanged() {
        let mut spool = empty_spool();
        spool.purchase_price = Some(199.5);

        PurchaseReceiptMetadata {
            purchase_price: Some(199.5),
            batch_code: Some("new-batch".to_string()),
            ..Default::default()
        }
        .normalize_for_edit(&spool)
        .expect("preserve unchanged legacy price");

        assert_error_code(
            PurchaseReceiptMetadata {
                purchase_price: Some(200.0),
                ..Default::default()
            }
            .normalize_for_edit(&spool),
            "purchase_metadata.currency_required",
        );

        PurchaseReceiptMetadata::default()
            .normalize_for_edit(&spool)
            .expect("allow clearing legacy price");
    }
}
