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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolWithMasterRow {
    pub spool: SpoolRow,
    pub master: FilamentMasterSummary,
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
