use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrinterRow {
    pub id: String,
    pub model: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrinterUsageRow {
    pub total_jobs: i64,
    pub successful_jobs: i64,
    pub failed_jobs: i64,
    pub total_used_g: i64,
    pub last_job_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrinterAmsSlotRow {
    pub slot_id: String,
    pub ams_id: String,
    pub slot_index: i64,
    pub spool_id: Option<String>,
    pub spool_status: Option<String>,
    pub spool_ownership_type: Option<String>,
    pub spool_owner_name: Option<String>,
    pub spool_remaining_g: Option<i64>,
    pub spool_rfid_tag: Option<String>,
    pub spool_material: Option<String>,
    pub spool_filament_name: Option<String>,
    pub spool_color_name: Option<String>,
    pub spool_hex_color: Option<String>,
    pub rfid_override_tray_uuid: Option<String>,
    pub rfid_override_color_hex: Option<String>,
    pub live_cache_cleared_at: Option<String>,
    pub live_loaded: Option<bool>,
    pub live_observed_rfid_tag: Option<String>,
    pub live_tray_uuid: Option<String>,
    pub live_chip_id: Option<String>,
    pub live_tray_info_idx: Option<String>,
    pub live_tray_id_name: Option<String>,
    pub live_filament_type: Option<String>,
    pub live_filament_name: Option<String>,
    pub live_color_hex: Option<String>,
    pub live_tray_weight_g: Option<i64>,
    pub live_remaining_percent: Option<i64>,
    pub live_last_identity_seen_at: Option<String>,
    pub live_match_status: Option<String>,
    pub live_match_note: Option<String>,
    pub live_matched_inventory_spool_id: Option<String>,
    pub live_matched_inventory_mode: Option<String>,
    pub live_is_active: Option<bool>,
    pub live_printer_last_seen_at: Option<String>,
    pub live_mqtt_connected: Option<bool>,
    pub live_ams_exist_bits: Option<String>,
    pub live_ams_read_done_bits: Option<String>,
    pub live_ams_bambu_bits: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrinterOverviewRow {
    pub printer: PrinterRow,
    pub usage: PrinterUsageRow,
    pub slots: Vec<PrinterAmsSlotRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BambuLiveObservedTrayRow {
    pub tray_index: i64,
    pub loaded: bool,
    pub filament_type: Option<String>,
    pub filament_name: Option<String>,
    pub color_hex: Option<String>,
    pub tray_weight_g: Option<i64>,
    pub remaining_percent: Option<i64>,
    pub remaining_grams: Option<i64>,
    pub observed_rfid_tag: Option<String>,
    pub tray_uuid: Option<String>,
    pub chip_id: Option<String>,
    pub tray_info_idx: Option<String>,
    pub tray_id_name: Option<String>,
    pub last_identity_seen_at: Option<String>,
    pub last_empty_seen_at: Option<String>,
    pub empty_observation_count: Option<i64>,
    pub matched_inventory_spool_id: Option<String>,
    pub matched_inventory_mode: Option<String>,
    pub match_status: Option<String>,
    pub match_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BambuLiveObservedStateRow {
    pub online: bool,
    pub last_seen_at: Option<String>,
    pub mqtt_connected: bool,
    pub progress_percent: Option<i64>,
    pub remaining_minutes: Option<i64>,
    pub prepare_percent: Option<i64>,
    pub print_stage: Option<i64>,
    pub print_error_code: Option<i64>,
    pub job_state_code: Option<i64>,
    pub gcode_state: Option<String>,
    pub print_type: Option<String>,
    pub subtask_id: Option<String>,
    pub subtask_name: Option<String>,
    pub active_tray_index: Option<i64>,
    pub nozzle_temp_c: Option<f64>,
    pub bed_temp_c: Option<f64>,
    pub ams_humidity_index: Option<i64>,
    pub ams_temperature_c: Option<f64>,
    pub ams_reading_bits: Option<String>,
    pub ams_exist_bits: Option<String>,
    pub ams_read_done_bits: Option<String>,
    pub ams_bambu_bits: Option<String>,
    pub ams_status_code: Option<i64>,
    pub ams_status_main: Option<i64>,
    pub ams_status_sub: Option<i64>,
    pub raw_status_note: Option<String>,
    pub raw_payload_json: Option<Value>,
    pub trays: Vec<BambuLiveObservedTrayRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BambuLiveIntegrationRow {
    pub enabled: bool,
    pub host: Option<String>,
    pub access_code: Option<String>,
    pub printer_serial: Option<String>,
    pub last_error: Option<String>,
    pub observed_state: Option<BambuLiveObservedStateRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BambuLiveIntegrationEntryRow {
    pub printer_id: String,
    pub config: BambuLiveIntegrationRow,
}
