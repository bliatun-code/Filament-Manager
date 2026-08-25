use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::database_result::{InventoryError, InventoryResult};

pub const FILAMENT_STANDARDS_SCHEMA_VERSION: i64 = 1;
pub const PURCHASE_PRICE_SOURCE_MANUAL: &str = "MANUAL";
pub const PURCHASE_PRICE_SOURCE_STANDARD_BATCH: &str = "STANDARD_BATCH";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceStandard {
    pub group_key: String,
    pub vendor: String,
    pub material: String,
    pub filament_name: String,
    pub nominal_weight_g: i64,
    pub price: f64,
    pub currency: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentStandardsSettings {
    #[serde(default = "filament_standards_schema_version")]
    pub schema_version: i64,
    pub default_purchase_currency: Option<String>,
    #[serde(default)]
    pub price_standards: Vec<FilamentPriceStandard>,
}

impl Default for FilamentStandardsSettings {
    fn default() -> Self {
        Self {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency: None,
            price_standards: Vec::new(),
        }
    }
}

impl FilamentStandardsSettings {
    pub fn normalized(self) -> InventoryResult<Self> {
        if self.schema_version != FILAMENT_STANDARDS_SCHEMA_VERSION {
            return Err(invalid_standard(
                "filament_standards.version_unsupported",
                format!(
                    "Filament standards version {} is unsupported.",
                    self.schema_version
                ),
            ));
        }

        let default_purchase_currency = self
            .default_purchase_currency
            .map(normalize_currency)
            .transpose()?;
        let mut seen = HashSet::with_capacity(self.price_standards.len());
        let mut price_standards = Vec::with_capacity(self.price_standards.len());
        for standard in self.price_standards {
            let vendor = canonical_vendor_display_component(&standard.vendor);
            let material = normalize_display_component(&standard.material);
            let filament_name = normalize_display_component(&standard.filament_name);
            validate_group_component("vendor", &vendor)?;
            validate_group_component("material", &material)?;
            validate_group_component("filament name", &filament_name)?;
            if standard.nominal_weight_g <= 0 {
                return Err(invalid_standard(
                    "filament_standards.nominal_weight_invalid",
                    "Nominal filament weight must be greater than zero.",
                ));
            }
            validate_price(standard.price)?;
            let currency = normalize_currency(standard.currency)?;
            let group_key = standard.group_key.trim().to_string();
            if !filament_price_standard_group_key_matches(
                &group_key,
                &vendor,
                &material,
                &filament_name,
                standard.nominal_weight_g,
            ) {
                return Err(invalid_standard(
                    "filament_standards.group_key_mismatch",
                    format!("Filament price standard '{group_key}' has a stale group key."),
                ));
            }
            if !seen.insert(group_key.clone()) {
                return Err(invalid_standard(
                    "filament_standards.duplicate_group",
                    format!("Filament price group '{group_key}' appears more than once."),
                ));
            }
            price_standards.push(FilamentPriceStandard {
                group_key,
                vendor,
                material,
                filament_name,
                nominal_weight_g: standard.nominal_weight_g,
                price: standard.price.max(0.0),
                currency,
            });
        }
        price_standards.sort_by(|left, right| left.group_key.cmp(&right.group_key));

        Ok(Self {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency,
            price_standards,
        })
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentStandardsSnapshot {
    pub settings: FilamentStandardsSettings,
    pub settings_valid: bool,
    pub groups: Vec<FilamentPriceGroup>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceGroup {
    pub group_key: String,
    pub vendor: String,
    pub material: String,
    pub filament_name: String,
    pub nominal_weight_g: i64,
    pub spool_count: i64,
    pub owned_spool_count: i64,
    pub borrowed_in_spool_count: i64,
    pub missing_price_count: i64,
    pub missing_currency_count: i64,
    pub manual_price_count: i64,
    pub standard_batch_price_count: i64,
    pub locked_count: i64,
    pub standard: Option<FilamentPriceStandard>,
    pub spools: Vec<FilamentPriceGroupSpool>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceGroupSpool {
    pub spool_id: String,
    pub master_id: String,
    pub color_name: String,
    pub status: String,
    pub ownership_type: String,
    pub purchase_price: Option<f64>,
    pub purchase_currency: Option<String>,
    pub purchase_price_source: Option<String>,
    pub purchase_price_batch_locked: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum FilamentPriceBatchMode {
    #[serde(rename = "MISSING_ONLY")]
    MissingOnly,
    #[serde(rename = "OVERWRITE")]
    Overwrite,
}

impl FilamentPriceBatchMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MissingOnly => "MISSING_ONLY",
            Self::Overwrite => "OVERWRITE",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceBatchSpoolPrecondition {
    pub spool_id: String,
    pub expected_master_id: String,
    pub expected_status: String,
    pub expected_ownership_type: String,
    pub expected_purchase_price: Option<f64>,
    pub expected_purchase_currency: Option<String>,
    pub expected_purchase_price_source: Option<String>,
    pub expected_purchase_price_batch_locked: bool,
    #[serde(default)]
    pub allow_historical_missing_price_fill: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceBatchInput {
    pub mode: FilamentPriceBatchMode,
    pub group_key: String,
    pub price: f64,
    pub currency: String,
    pub spools: Vec<FilamentPriceBatchSpoolPrecondition>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceBatchReceipt {
    pub batch_id: String,
    pub mode: FilamentPriceBatchMode,
    pub group_key: String,
    pub committed: bool,
    pub updated_count: i64,
    pub skipped_count: i64,
    pub updated: Vec<FilamentPriceBatchUpdatedSpool>,
    pub skipped: Vec<FilamentPriceBatchSkippedSpool>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceBatchUpdatedSpool {
    pub spool_id: String,
    pub master_id: String,
    pub color_name: String,
    pub previous_purchase_price: Option<f64>,
    pub previous_purchase_currency: Option<String>,
    pub purchase_price: f64,
    pub purchase_currency: String,
    pub purchase_price_source: String,
    pub purchase_price_batch_locked: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum FilamentPriceBatchSkipReason {
    #[serde(rename = "BATCH_LOCKED")]
    BatchLocked,
    #[serde(rename = "BORROWED_IN")]
    BorrowedIn,
    #[serde(rename = "INACTIVE")]
    Inactive,
    #[serde(rename = "ALREADY_PRICED")]
    AlreadyPriced,
    #[serde(rename = "MANUAL_UPDATE_REQUIRED")]
    ManualUpdateRequired,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FilamentPriceBatchSkippedSpool {
    pub spool_id: String,
    pub master_id: String,
    pub color_name: String,
    pub reason: FilamentPriceBatchSkipReason,
}

pub fn filament_price_group_key(
    vendor: &str,
    material: &str,
    filament_name: &str,
    nominal_weight_g: i64,
) -> String {
    let components = serde_json::json!([
        canonical_vendor_group_key_component(vendor),
        normalize_group_key_component(material),
        normalize_group_key_component(filament_name),
        nominal_weight_g,
    ]);
    format!("v1:{components}")
}

/// Builds the authoritative price-group key for a catalog master.
///
/// Well-described series can safely share a price across colors and catalog
/// rows. Ambiguous manual/generic rows get a master-id discriminator so two
/// unrelated unknown products cannot be priced together by accident.
pub fn filament_price_group_key_for_master(
    vendor: &str,
    material: &str,
    filament_name: &str,
    nominal_weight_g: i64,
    master_id: &str,
) -> String {
    if !needs_master_id_group_fallback(vendor, filament_name) {
        return filament_price_group_key(vendor, material, filament_name, nominal_weight_g);
    }
    let components = serde_json::json!([
        canonical_vendor_group_key_component(vendor),
        normalize_group_key_component(material),
        normalize_group_key_component(filament_name),
        nominal_weight_g,
        master_id.trim(),
    ]);
    format!("v1:{components}")
}

pub(crate) fn normalize_currency(value: String) -> InventoryResult<String> {
    let currency = value.trim().to_ascii_uppercase();
    if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return Err(invalid_standard(
            "filament_standards.currency_invalid",
            "Purchase currency must be a three-letter ISO currency code.",
        ));
    }
    Ok(currency)
}

pub(crate) fn validate_price(price: f64) -> InventoryResult<()> {
    if !price.is_finite() || price < 0.0 {
        return Err(invalid_standard(
            "filament_standards.price_invalid",
            "Filament price must be a finite number greater than or equal to zero.",
        ));
    }
    Ok(())
}

fn filament_standards_schema_version() -> i64 {
    FILAMENT_STANDARDS_SCHEMA_VERSION
}

fn normalize_display_component(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_group_key_component(value: &str) -> String {
    normalize_display_component(value).to_uppercase()
}

pub(crate) fn canonical_vendor_group_key_component(value: &str) -> String {
    let compact = compact_vendor_component(value);
    match compact.as_str() {
        "BAMBU" | "BAMBULAB" => "BAMBU_LAB".to_string(),
        "ESUN" => "ESUN".to_string(),
        _ if is_ambiguous_vendor(value) => "GENERIC".to_string(),
        _ => normalize_group_key_component(value),
    }
}

pub(crate) fn canonical_vendor_display_component(value: &str) -> String {
    match compact_vendor_component(value).as_str() {
        "BAMBU" | "BAMBULAB" => "Bambu Lab".to_string(),
        "ESUN" => "eSUN".to_string(),
        _ if is_ambiguous_vendor(value) => "Generic".to_string(),
        _ => normalize_display_component(value),
    }
}

fn compact_vendor_component(value: &str) -> String {
    normalize_display_component(value)
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_uppercase)
        .collect()
}

fn filament_price_standard_group_key_matches(
    group_key: &str,
    vendor: &str,
    material: &str,
    filament_name: &str,
    nominal_weight_g: i64,
) -> bool {
    if !needs_master_id_group_fallback(vendor, filament_name) {
        return group_key
            == filament_price_group_key(vendor, material, filament_name, nominal_weight_g);
    }

    let Some(raw_components) = group_key.strip_prefix("v1:") else {
        return false;
    };
    let Ok(serde_json::Value::Array(components)) = serde_json::from_str(raw_components) else {
        return false;
    };
    components.len() == 5
        && components[0] == canonical_vendor_group_key_component(vendor)
        && components[1] == normalize_group_key_component(material)
        && components[2] == normalize_group_key_component(filament_name)
        && components[3] == nominal_weight_g
        && components[4]
            .as_str()
            .is_some_and(|master_id| !master_id.trim().is_empty())
}

fn needs_master_id_group_fallback(vendor: &str, filament_name: &str) -> bool {
    is_ambiguous_vendor(vendor) && is_ambiguous_filament_name(filament_name)
}

fn is_ambiguous_vendor(value: &str) -> bool {
    matches!(
        normalize_group_key_component(value).as_str(),
        "" | "GENERIC" | "MANUAL" | "UNKNOWN" | "UKJENT" | "OTHER" | "ANNET" | "UNSPECIFIED"
    )
}

fn is_ambiguous_filament_name(value: &str) -> bool {
    matches!(
        normalize_group_key_component(value).as_str(),
        "" | "GENERIC"
            | "MANUAL"
            | "UNKNOWN"
            | "UKJENT"
            | "FILAMENT"
            | "OTHER"
            | "ANNET"
            | "STANDARD"
            | "UNSPECIFIED"
    )
}

fn validate_group_component(label: &str, value: &str) -> InventoryResult<()> {
    if value.is_empty() || value.chars().count() > 160 {
        return Err(invalid_standard(
            "filament_standards.group_component_invalid",
            format!("Filament price group {label} must contain 1 to 160 characters."),
        ));
    }
    Ok(())
}

fn invalid_standard(code: &'static str, message: impl Into<String>) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_vendor_display_component, filament_price_group_key,
        filament_price_group_key_for_master, FilamentPriceStandard, FilamentStandardsSettings,
        FILAMENT_STANDARDS_SCHEMA_VERSION,
    };

    #[test]
    fn settings_normalize_currency_group_text_order_and_keys() {
        let key = filament_price_group_key(" eSUN ", " PLA ", " PLA+HS ", 1000);
        let settings = FilamentStandardsSettings {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency: Some(" nok ".to_string()),
            price_standards: vec![FilamentPriceStandard {
                group_key: key.clone(),
                vendor: " eSUN ".to_string(),
                material: " PLA ".to_string(),
                filament_name: " PLA+HS ".to_string(),
                nominal_weight_g: 1000,
                price: 219.0,
                currency: " nok ".to_string(),
            }],
        }
        .normalized()
        .expect("normalize standards");

        assert_eq!(settings.default_purchase_currency.as_deref(), Some("NOK"));
        assert_eq!(settings.price_standards[0].group_key, key);
        assert_eq!(settings.price_standards[0].vendor, "eSUN");
        assert_eq!(settings.price_standards[0].currency, "NOK");
    }

    #[test]
    fn settings_reject_stale_keys_invalid_money_and_duplicates() {
        let valid_key = filament_price_group_key("Bambu", "PLA", "PLA Basic", 1000);
        let standard = FilamentPriceStandard {
            group_key: valid_key,
            vendor: "Bambu".to_string(),
            material: "PLA".to_string(),
            filament_name: "PLA Basic".to_string(),
            nominal_weight_g: 1000,
            price: 249.0,
            currency: "NOK".to_string(),
        };
        let duplicate = FilamentStandardsSettings {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency: None,
            price_standards: vec![standard.clone(), standard],
        };
        assert!(duplicate.normalized().is_err());

        let invalid = FilamentStandardsSettings {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency: Some("kr".to_string()),
            price_standards: Vec::new(),
        };
        assert!(invalid.normalized().is_err());
    }

    #[test]
    fn ambiguous_generic_series_are_isolated_by_master_id() {
        let first = filament_price_group_key_for_master(
            "Generic",
            "PLA",
            "Unknown",
            1000,
            "manual-master-a",
        );
        let second = filament_price_group_key_for_master(
            "Generic",
            "PLA",
            "Unknown",
            1000,
            "manual-master-b",
        );
        assert_ne!(first, second);
        assert_ne!(
            filament_price_group_key_for_master("Generic", "PLA", "Unknown", 1000, "Master-A"),
            filament_price_group_key_for_master("Generic", "PLA", "Unknown", 1000, "master-a"),
        );

        assert_eq!(
            filament_price_group_key_for_master("Bambu", "PLA", "PLA Basic", 1000, "master-a",),
            filament_price_group_key_for_master("Bambu Lab", "PLA", "PLA Basic", 1000, "master-b",)
        );
        assert_eq!(
            filament_price_group_key_for_master("e-SUN", "PETG", "PETG Basic", 1000, "master-a",),
            filament_price_group_key_for_master("ESUN", "PETG", "PETG Basic", 1000, "master-b",)
        );
        assert_eq!(canonical_vendor_display_component("bambu"), "Bambu Lab");
        assert_eq!(canonical_vendor_display_component("E SUN"), "eSUN");
        assert_eq!(
            filament_price_group_key_for_master(
                "Generic",
                "PETG",
                "Transparent Blue",
                1000,
                "master-a",
            ),
            filament_price_group_key_for_master(
                "Other",
                "PETG",
                "Transparent Blue",
                1000,
                "master-b",
            )
        );

        let settings = FilamentStandardsSettings {
            schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
            default_purchase_currency: None,
            price_standards: vec![FilamentPriceStandard {
                group_key: first.clone(),
                vendor: "Generic".to_string(),
                material: "PLA".to_string(),
                filament_name: "Unknown".to_string(),
                nominal_weight_g: 1000,
                price: 199.0,
                currency: "NOK".to_string(),
            }],
        }
        .normalized()
        .expect("generic master-specific standard remains valid");
        assert_eq!(settings.price_standards[0].group_key, first);

        assert_eq!(
            filament_price_group_key_for_master(
                "Generic",
                "PETG",
                "Transparent Blue",
                1000,
                "master-a",
            ),
            filament_price_group_key_for_master(
                "Generic",
                "PETG",
                "Transparent Blue",
                1000,
                "master-b",
            )
        );

        assert_ne!(
            filament_price_group_key_for_master("Other", "PLA", "Standard", 1000, "master-a",),
            filament_price_group_key_for_master("Other", "PLA", "Standard", 1000, "master-b",)
        );
    }
}
