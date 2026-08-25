use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::filament_master_models::FilamentMasterSummary;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolRow {
    pub id: String,
    pub master_id: String,
    pub qr_code: Option<String>,
    pub rfid_tag: Option<String>,
    pub rfid_observed_at: Option<String>,
    pub status: String,
    pub ownership_type: String,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
    pub initial_weight_g: Option<i64>,
    pub current_weight_g: Option<i64>,
    pub remaining_g: Option<i64>,
    pub spool_tare_weight_g: Option<i64>,
    pub location_id: Option<String>,
    pub home_location_id: Option<String>,
    pub purchase_date: Option<String>,
    pub purchase_price: Option<f64>,
    pub batch_code: Option<String>,
    pub last_used_at: Option<String>,
    /// Missing on payloads cached or fetched from a schema-3 Host.
    #[serde(default)]
    pub purchase_currency: Option<String>,
    /// Missing on payloads cached or fetched from a schema-3 Host.
    #[serde(default)]
    pub supplier_reference: Option<String>,
    /// Missing on payloads cached or fetched from a pre-price-standards Host.
    #[serde(default)]
    pub purchase_price_batch_locked: bool,
    /// `None` on older Host/cache payloads and on spools without a purchase price.
    #[serde(default)]
    pub purchase_price_source: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolWithMasterRow {
    pub spool: SpoolRow,
    pub master: FilamentMasterSummary,
    /// Human-readable label for `spool.location_id`. Missing on older Hosts.
    #[serde(default)]
    pub location_name: Option<String>,
    /// Human-readable label for `spool.home_location_id`. Missing on older Hosts.
    #[serde(default)]
    pub home_location_name: Option<String>,
    /// `None` is accepted only for payloads cached or fetched from a pre-policy Host.
    /// New local and Host reads always populate the material-effective threshold.
    #[serde(default)]
    pub low_stock_threshold_g: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolHistoryEventRow {
    pub id: String,
    pub spool_id: String,
    pub event_type: String,
    pub payload_json: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolUsagePointRow {
    pub captured_at: String,
    pub grams: i64,
    pub source: String,
}

#[cfg(test)]
mod tests {
    use super::SpoolWithMasterRow;

    #[test]
    fn legacy_host_spool_payload_without_threshold_remains_readable() {
        let row: SpoolWithMasterRow = serde_json::from_value(serde_json::json!({
            "spool": {
                "id": "legacy-spool",
                "master_id": "master-1",
                "qr_code": null,
                "rfid_tag": null,
                "rfid_observed_at": null,
                "status": "IN_STOCK",
                "ownership_type": "OWNED",
                "owner_name": null,
                "owner_contact": null,
                "ownership_note": null,
                "initial_weight_g": 1000,
                "current_weight_g": 200,
                "remaining_g": 200,
                "spool_tare_weight_g": null,
                "location_id": null,
                "home_location_id": null,
                "purchase_date": null,
                "purchase_price": null,
                "batch_code": null,
                "last_used_at": null
            },
            "master": {
                "id": "master-1",
                "material": "PLA",
                "filament_name": "Basic",
                "color_name": "Black",
                "hex_color": "#000000",
                "product_url": null,
                "default_weight": 1000,
                "vendor": "Generic"
            }
        }))
        .expect("legacy Host row should deserialize");

        assert_eq!(row.location_name, None);
        assert_eq!(row.home_location_name, None);
        assert_eq!(row.low_stock_threshold_g, None);
        assert_eq!(row.spool.purchase_currency, None);
        assert_eq!(row.spool.supplier_reference, None);
        assert!(!row.spool.purchase_price_batch_locked);
        assert_eq!(row.spool.purchase_price_source, None);
    }
}
