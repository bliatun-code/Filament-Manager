use std::collections::HashSet;

use super::bambu_live_settings::{
    bambu_live_integration_setting_key, BAMBU_LIVE_INTEGRATION_SETTING_PREFIX,
};
use super::database_alerts::{
    alert_exists_for_spool as alert_exists_for_spool_row, insert_alert as insert_alert_row,
};
pub use super::database_backup::BackupValidationStats;
use super::database_backup::{
    export_full_backup_content, parse_full_backup_content, validate_full_backup_content,
};
use super::database_borrowed_schema::ensure_borrowed_in_schema as ensure_borrowed_in_schema_impl;
use super::database_catalog_esun::normalize_esun_catalog_colors as normalize_esun_catalog_colors_rows;
use super::database_catalog_lifecycle::apply_vendor_discontinued_rules as apply_vendor_discontinued_rules_row;
use super::database_catalog_manual::upsert_manual_master as upsert_manual_master_row;
use super::database_catalog_queries::list_master_catalog as list_master_catalog_rows;
use super::database_catalog_schema::ensure_catalog_lifecycle_columns as ensure_catalog_lifecycle_columns_schema;
use super::database_catalog_update::update_master_catalog_entry as update_master_catalog_entry_row;
use super::database_connection::open_connection;
use super::database_events::{
    ensure_scale as ensure_scale_row, insert_scan_event as insert_scan_event_row,
    insert_spool_history_event as insert_spool_history_event_row,
    insert_weight_reading as insert_weight_reading_row,
    list_spool_history_events as list_spool_history_event_rows,
    list_spool_usage_points as list_spool_usage_point_rows,
};
use super::database_export::{
    export_loans_csv as export_loan_rows_csv, export_spools_csv as export_spool_rows_csv,
    export_spools_json as export_spool_rows_json,
};
use super::database_ids::new_id;
pub use super::database_import::ImportDataStats;
use super::database_import::{
    parse_inventory_spools_csv, parse_inventory_spools_json, InventoryImportRow,
    InventoryImportStats,
};
use super::database_library_sync_auth::{
    clear_library_sync_client_auth_state as clear_library_sync_client_auth_state_rows,
    get_library_sync_client_auth_state as get_library_sync_client_auth_state_rows,
    save_library_sync_client_auth_state as save_library_sync_client_auth_state_rows,
};
use super::database_library_sync_cache::{
    save_library_sync_cached_loans as save_library_sync_cached_loan_rows,
    save_library_sync_cached_printers as save_library_sync_cached_printer_rows,
    save_library_sync_cached_snapshot as save_library_sync_cached_snapshot_row,
    save_library_sync_cached_spools as save_library_sync_cached_spool_rows,
};
use super::database_library_sync_validation::save_library_sync_validation_state as save_library_sync_validation_state_row;
use super::database_loan_create::{
    create_inbound_spool_loan as create_inbound_spool_loan_row,
    create_spool_loan as create_spool_loan_row,
};
use super::database_loan_queries::{
    find_active_spool_loan_for_direction as find_active_spool_loan_for_direction_row,
    list_active_spool_loans as list_active_spool_loan_rows,
    list_loan_usage_by_person_for_direction as list_loan_usage_by_person_for_direction_rows,
    list_spool_loans_for_direction as list_spool_loans_for_direction_rows,
    spool_has_active_loan as spool_has_active_loan_row,
};
use super::database_locations::ensure_location as ensure_location_row;
use super::database_print_jobs::insert_print_job as insert_print_job_row;
use super::database_printer_queries::{
    list_printer_overview as list_printer_overview_rows, list_printers as list_printer_rows,
    printer_exists as printer_exists_row,
};
use super::database_printer_schema::{
    ensure_printer_external_slot_schema as ensure_printer_external_slot_schema_impl,
    ensure_printer_slot_live_cache_schema as ensure_printer_slot_live_cache_schema_impl,
    ensure_printer_slot_rfid_override_schema as ensure_printer_slot_rfid_override_schema_impl,
};
use super::database_reset::{
    reset_app_state_data as reset_app_state_data_rows,
    reset_catalog_data as reset_catalog_data_rows,
};
use super::database_result::require_rows;
use super::database_rows::map_spool_loan_row;
use super::database_schema::{ensure_no_foreign_key_violations, table_columns};
use super::database_schema_setup::apply_schema_migrations;
use super::database_settings::{
    delete_setting as delete_setting_row, get_setting as get_setting_row,
    set_setting as set_setting_row,
};
use super::database_spool_assignment::{
    spool_assigned_to_printer as spool_assigned_to_printer_row,
    spool_assigned_to_specific_printer as spool_assigned_to_specific_printer_row,
};
use super::database_spool_delete::{
    purge_spool as purge_spool_row, soft_delete_spool as soft_delete_spool_row,
};
use super::database_spool_insert::insert_spool as insert_spool_row;
use super::database_spool_queries::{
    get_spool_by_id as get_spool_by_id_row, get_spool_by_qr as get_spool_by_qr_row,
    get_spool_with_master_by_id as get_spool_with_master_by_id_row,
    list_low_stock_spools as list_low_stock_spool_rows,
    list_spools_with_master as list_spools_with_master_rows,
};
use super::database_spool_updates::{
    set_spool_home_location as set_spool_home_location_row,
    set_spool_location as set_spool_location_row, update_spool_details as update_spool_details_row,
    update_spool_ownership_metadata as update_spool_ownership_metadata_row,
    update_spool_rfid_tag as update_spool_rfid_tag_row,
    update_spool_status as update_spool_status_row,
    update_spool_tare_weight as update_spool_tare_weight_row,
    update_spool_weight as update_spool_weight_row,
};
use super::database_sync_queue::enqueue_sync_action as enqueue_sync_action_row;
use super::database_table_ops::delete_all_rows;
use super::database_tables::should_import_backup_row;
pub use super::database_tables::{FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES};
use super::database_text::normalize_optional_text;
use super::database_time::{
    sqlite_datetime_shift as sqlite_datetime_shift_value, sqlite_now as sqlite_now_value,
};
use super::database_trusted_lan::{
    consume_trusted_lan_pairing as consume_trusted_lan_pairing_row,
    create_trusted_lan_paired_browser as create_trusted_lan_paired_browser_row,
    create_trusted_lan_pairing as create_trusted_lan_pairing_row,
    get_active_trusted_lan_paired_browser_by_device_token_hash as get_active_trusted_lan_paired_browser_by_device_token_hash_row,
    get_trusted_lan_paired_browser_by_id as get_trusted_lan_paired_browser_by_id_row,
    list_trusted_lan_paired_browsers as list_trusted_lan_paired_browser_rows,
    revoke_all_trusted_lan_paired_browsers as revoke_all_trusted_lan_paired_browser_rows,
    revoke_trusted_lan_paired_browser as revoke_trusted_lan_paired_browser_row,
    touch_trusted_lan_paired_browser as touch_trusted_lan_paired_browser_row,
};
use super::database_trusted_lan_schema::ensure_trusted_lan_schema as ensure_trusted_lan_schema_impl;
use super::database_values::json_value_to_sql;
use super::database_wishlist::{
    delete_wishlist_item as delete_wishlist_item_row,
    insert_wishlist_item as insert_wishlist_item_row,
    list_wishlist_items as list_wishlist_item_rows,
    update_wishlist_item_status as update_wishlist_item_status_row,
};
use super::library_sync_defaults::{default_library_sync_device_name, normalize_library_sync_mode};
use super::spool_defaults::normalize_spool_status;
use super::statistics::InventoryOverview;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub(crate) type LibrarySyncClientAuthState = (String, String, String, Option<String>);
pub(crate) type MasterCatalogExistingRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    String,
);

pub struct ManualMasterInput<'a> {
    pub material: &'a str,
    pub filament_name: &'a str,
    pub color_name: &'a str,
    pub hex_color: Option<&'a str>,
    pub product_url: Option<&'a str>,
    pub vendor: Option<&'a str>,
    pub default_weight: Option<i64>,
}

pub struct MasterCatalogUpdateInput<'a> {
    pub master_id: &'a str,
    pub material: &'a str,
    pub filament_name: &'a str,
    pub color_name: &'a str,
    pub hex_color: Option<&'a str>,
    pub product_url: Option<&'a str>,
    pub vendor: Option<&'a str>,
    pub default_weight: Option<i64>,
}

const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

#[derive(Debug)]
pub enum InventoryError {
    Db(String),
    InvalidOperation(String),
    NotFound,
}

pub type InventoryResult<T> = Result<T, InventoryError>;

impl From<rusqlite::Error> for InventoryError {
    fn from(error: rusqlite::Error) -> Self {
        InventoryError::Db(error.to_string())
    }
}

impl std::fmt::Display for InventoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InventoryError::Db(message) => write!(f, "Database error: {message}"),
            InventoryError::InvalidOperation(message) => write!(f, "{message}"),
            InventoryError::NotFound => write!(f, "Record not found"),
        }
    }
}

impl std::error::Error for InventoryError {}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilamentMasterSummary {
    pub id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub default_weight: i64,
    pub vendor: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilamentMasterCatalogRow {
    pub id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub default_weight: i64,
    pub vendor: String,
    pub last_seen_at: Option<String>,
    pub is_discontinued: bool,
    pub discontinued_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogLifecycleStats {
    pub reactivated_count: i64,
    pub discontinued_count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunColorNormalizationStats {
    pub scanned_count: i64,
    pub normalized_count: i64,
    pub merged_count: i64,
    pub skipped_conflicts: i64,
}

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WishlistItemRow {
    pub id: String,
    pub master_id: Option<String>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub status: String,
    pub quantity: i64,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

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
    pub active_tray_index: Option<i64>,
    pub nozzle_temp_c: Option<f64>,
    pub bed_temp_c: Option<f64>,
    pub ams_humidity_index: Option<i64>,
    pub ams_temperature_c: Option<f64>,
    pub ams_reading_bits: Option<String>,
    pub ams_read_done_bits: Option<String>,
    pub ams_bambu_bits: Option<String>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogResetStats {
    pub removed_count: i64,
    pub remaining_count: i64,
    pub reactivated_count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolLoanRow {
    pub id: String,
    pub spool_id: String,
    pub borrower_name: String,
    pub loan_direction: String,
    pub loan_status: String,
    pub counterparty_name: String,
    pub counterparty_contact: Option<String>,
    pub counterparty_note: Option<String>,
    pub grams_out: i64,
    pub lent_note: Option<String>,
    pub lent_at: String,
    pub expected_return_at: Option<String>,
    pub returned_at: Option<String>,
    pub returned_grams: Option<i64>,
    pub consumed_grams: Option<i64>,
    pub return_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActiveSpoolLoanRow {
    pub loan: SpoolLoanRow,
    pub spool_status: String,
    pub spool_remaining_g: Option<i64>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub hex_color: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoanUsageByPersonRow {
    pub loan_direction: String,
    pub borrower_name: String,
    pub total_consumed_g: i64,
    pub completed_loans: i64,
    pub active_loans: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolLoanDetailsRow {
    pub loan: SpoolLoanRow,
    pub spool_status: Option<String>,
    pub spool_remaining_g: Option<i64>,
    pub spool_tare_weight_g: Option<i64>,
    pub material: Option<String>,
    pub filament_name: Option<String>,
    pub color_name: Option<String>,
    pub vendor: Option<String>,
    pub hex_color: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrustedLanSettingsRow {
    pub enabled: bool,
    pub selected_interface_name: Option<String>,
    pub selected_interface_address: Option<String>,
    pub listen_port: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncSettingsRow {
    pub mode: String,
    pub device_name: String,
    pub library_id: String,
    pub host_base_url: Option<String>,
    pub host_device_name: Option<String>,
    pub client_auth_paired: bool,
    pub client_auth_paired_at: Option<String>,
    pub client_auth_expires_at: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_reachable_at: Option<String>,
    pub last_validation_message: Option<String>,
    pub cached_snapshot: Option<LibrarySyncCachedSnapshotRow>,
    pub cached_spools: Option<LibrarySyncCachedSpoolListRow>,
    pub cached_printers: Option<LibrarySyncCachedPrinterOverviewRow>,
    pub cached_loans: Option<LibrarySyncCachedLoanListRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LibrarySyncCachedSnapshotRow {
    pub captured_at: String,
    pub library_id: String,
    pub device_name: String,
    pub sync_mode: String,
    pub inventory: InventoryOverview,
    pub total_spools: i64,
    pub in_use: i64,
    pub low_stock: i64,
    pub active_loans: i64,
    pub printers: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedSpoolListRow {
    pub captured_at: String,
    pub rows: Vec<SpoolWithMasterRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedPrinterOverviewRow {
    pub captured_at: String,
    pub rows: Vec<PrinterOverviewRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedLoanListRow {
    pub captured_at: String,
    pub rows: Vec<SpoolLoanDetailsRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrustedLanPairedBrowserRow {
    pub id: String,
    pub display_name: Option<String>,
    pub paired_at: String,
    pub last_seen_at: Option<String>,
    pub last_origin: Option<String>,
    pub revoked_at: Option<String>,
}

pub struct FilamentDatabase {
    conn: Connection,
}

impl FilamentDatabase {
    pub fn open(path: impl AsRef<std::path::Path>) -> InventoryResult<Self> {
        Ok(Self {
            conn: open_connection(path)?,
        })
    }

    pub fn apply_schema(&self) -> InventoryResult<()> {
        apply_schema_migrations(&self.conn, SCHEMA_SQL)
    }

    pub fn list_master_catalog(
        &self,
        limit: i64,
        search: Option<&str>,
    ) -> InventoryResult<Vec<FilamentMasterCatalogRow>> {
        list_master_catalog_rows(&self.conn, limit, search)
    }

    pub fn upsert_manual_master(&self, input: ManualMasterInput<'_>) -> InventoryResult<String> {
        upsert_manual_master_row(&self.conn, input)
    }

    pub fn normalize_esun_catalog_colors(&self) -> InventoryResult<EsunColorNormalizationStats> {
        normalize_esun_catalog_colors_rows(&self.conn)
    }

    pub fn update_master_catalog_entry(
        &self,
        input: MasterCatalogUpdateInput<'_>,
    ) -> InventoryResult<String> {
        update_master_catalog_entry_row(&self.conn, input)
    }

    pub fn insert_spool(&self, spool: &SpoolRow) -> InventoryResult<()> {
        insert_spool_row(&self.conn, spool)
    }

    pub fn get_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        get_spool_by_qr_row(&self.conn, qr_code)
    }

    pub fn get_spool_by_id(&self, spool_id: &str) -> InventoryResult<Option<SpoolRow>> {
        get_spool_by_id_row(&self.conn, spool_id)
    }

    pub fn get_spool_with_master_by_id(
        &self,
        spool_id: &str,
    ) -> InventoryResult<Option<SpoolWithMasterRow>> {
        get_spool_with_master_by_id_row(&self.conn, spool_id)
    }

    pub fn update_spool_status(&self, spool_id: &str, status: &str) -> InventoryResult<()> {
        update_spool_status_row(&self.conn, spool_id, status)
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        current_weight_g: Option<i64>,
        remaining_g: Option<i64>,
    ) -> InventoryResult<()> {
        update_spool_weight_row(&self.conn, spool_id, current_weight_g, remaining_g)
    }

    pub fn update_spool_tare_weight(
        &self,
        spool_id: &str,
        spool_tare_weight_g: Option<i64>,
    ) -> InventoryResult<()> {
        update_spool_tare_weight_row(&self.conn, spool_id, spool_tare_weight_g)
    }

    pub fn update_spool_rfid_tag(
        &self,
        spool_id: &str,
        rfid_tag: Option<&str>,
        rfid_observed_at: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_rfid_tag_row(&self.conn, spool_id, rfid_tag, rfid_observed_at)
    }

    pub fn set_spool_location(
        &self,
        spool_id: &str,
        location_id: Option<&str>,
    ) -> InventoryResult<()> {
        set_spool_location_row(&self.conn, spool_id, location_id)
    }

    pub fn update_spool_details(
        &self,
        spool_id: &str,
        qr_code: Option<&str>,
        status: &str,
        location_id: Option<&str>,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_details_row(
            &self.conn,
            spool_id,
            qr_code,
            status,
            location_id,
            home_location_id,
        )
    }

    pub fn set_spool_home_location(
        &self,
        spool_id: &str,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        set_spool_home_location_row(&self.conn, spool_id, home_location_id)
    }

    pub fn update_spool_ownership_metadata(
        &self,
        spool_id: &str,
        owner_name: Option<&str>,
        owner_contact: Option<&str>,
        ownership_note: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_ownership_metadata_row(
            &self.conn,
            spool_id,
            owner_name,
            owner_contact,
            ownership_note,
        )
    }

    pub fn update_active_inbound_spool_loan_counterparty(
        &self,
        spool_id: &str,
        counterparty_name: &str,
        counterparty_contact: Option<&str>,
        counterparty_note: Option<&str>,
    ) -> InventoryResult<()> {
        self.conn.execute(
            "UPDATE spool_loans
             SET borrower_name = ?1,
                 counterparty_name = ?1,
                 counterparty_contact = ?2,
                 counterparty_note = ?3,
                 lent_note = ?3
             WHERE spool_id = ?4
               AND COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') = 'INBOUND'
               AND returned_at IS NULL",
            params![
                counterparty_name.trim(),
                normalize_optional_text(counterparty_contact),
                normalize_optional_text(counterparty_note),
                spool_id
            ],
        )?;
        Ok(())
    }

    pub fn soft_delete_spool(&self, spool_id: &str) -> InventoryResult<()> {
        soft_delete_spool_row(&self.conn, spool_id)
    }

    pub fn purge_spool(&self, spool_id: &str) -> InventoryResult<()> {
        purge_spool_row(&self.conn, spool_id)
    }

    pub fn ensure_location(&self, name: &str) -> InventoryResult<String> {
        ensure_location_row(&self.conn, name)
    }

    pub fn sqlite_now(&self) -> InventoryResult<String> {
        sqlite_now_value(&self.conn)
    }

    pub fn sqlite_datetime_shift(&self, base: &str, modifier: &str) -> InventoryResult<String> {
        sqlite_datetime_shift_value(&self.conn, base, modifier)
    }

    pub fn ensure_catalog_lifecycle_columns(&self) -> InventoryResult<()> {
        ensure_catalog_lifecycle_columns_schema(&self.conn)
    }

    pub fn ensure_borrowed_in_schema(&self) -> InventoryResult<()> {
        ensure_borrowed_in_schema_impl(&self.conn)
    }

    pub fn ensure_printer_external_slot_schema(&self) -> InventoryResult<()> {
        ensure_printer_external_slot_schema_impl(&self.conn)
    }

    pub fn ensure_printer_slot_rfid_override_schema(&self) -> InventoryResult<()> {
        ensure_printer_slot_rfid_override_schema_impl(&self.conn)
    }

    pub fn ensure_printer_slot_live_cache_schema(&self) -> InventoryResult<()> {
        ensure_printer_slot_live_cache_schema_impl(&self.conn)
    }

    pub fn ensure_trusted_lan_schema(&self) -> InventoryResult<()> {
        ensure_trusted_lan_schema_impl(&self.conn)
    }

    pub fn apply_vendor_discontinued_rules(
        &self,
        vendor: &str,
        refresh_started_at: &str,
    ) -> InventoryResult<CatalogLifecycleStats> {
        apply_vendor_discontinued_rules_row(&self.conn, vendor, refresh_started_at)
    }

    pub fn apply_bambu_discontinued_rules(
        &self,
        refresh_started_at: &str,
    ) -> InventoryResult<CatalogLifecycleStats> {
        self.apply_vendor_discontinued_rules("Bambu", refresh_started_at)
    }

    pub fn ensure_scale(&self, scale_id: &str, name: &str, protocol: &str) -> InventoryResult<()> {
        ensure_scale_row(&self.conn, scale_id, name, protocol)
    }

    pub fn insert_weight_reading(
        &self,
        scale_id: &str,
        spool_id: &str,
        grams: i64,
        source: &str,
    ) -> InventoryResult<()> {
        insert_weight_reading_row(&self.conn, scale_id, spool_id, grams, source)
    }

    pub fn insert_scan_event(
        &self,
        spool_id: Option<&str>,
        qr_code: Option<&str>,
        source: &str,
        detected_color_hex: Option<&str>,
    ) -> InventoryResult<()> {
        insert_scan_event_row(&self.conn, spool_id, qr_code, source, detected_color_hex)
    }

    pub fn insert_spool_history_event(
        &self,
        spool_id: &str,
        event_type: &str,
        payload_json: &str,
    ) -> InventoryResult<()> {
        insert_spool_history_event_row(&self.conn, spool_id, event_type, payload_json)
    }

    pub fn list_spool_history_events(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
        list_spool_history_event_rows(&self.conn, spool_id, limit)
    }

    pub fn list_spool_usage_points(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolUsagePointRow>> {
        list_spool_usage_point_rows(&self.conn, spool_id, limit)
    }

    pub fn list_spools_with_master(
        &self,
        limit: i64,
        offset: i64,
    ) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        list_spools_with_master_rows(&self.conn, limit, offset)
    }

    pub fn list_low_stock_spools(&self, threshold: i64) -> InventoryResult<Vec<SpoolRow>> {
        list_low_stock_spool_rows(&self.conn, threshold)
    }

    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        list_wishlist_item_rows(&self.conn, limit)
    }

    pub fn insert_wishlist_item(&self, item: &WishlistItemRow) -> InventoryResult<()> {
        insert_wishlist_item_row(&self.conn, item)
    }

    pub fn update_wishlist_item_status(&self, item_id: &str, status: &str) -> InventoryResult<()> {
        update_wishlist_item_status_row(&self.conn, item_id, status)
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        delete_wishlist_item_row(&self.conn, item_id)
    }

    pub fn spool_assigned_to_printer(&self, spool_id: &str) -> InventoryResult<bool> {
        spool_assigned_to_printer_row(&self.conn, spool_id)
    }

    pub fn spool_assigned_to_specific_printer(
        &self,
        spool_id: &str,
        printer_id: &str,
    ) -> InventoryResult<bool> {
        spool_assigned_to_specific_printer_row(&self.conn, spool_id, printer_id)
    }

    pub fn create_spool_loan(
        &self,
        spool_id: &str,
        borrower_name: &str,
        grams_out: i64,
        lent_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        create_spool_loan_row(&self.conn, spool_id, borrower_name, grams_out, lent_note)
    }

    pub fn spool_has_active_loan(&self, spool_id: &str) -> InventoryResult<bool> {
        spool_has_active_loan_row(&self.conn, spool_id)
    }

    pub fn create_inbound_spool_loan(
        &self,
        spool_id: &str,
        counterparty_name: &str,
        counterparty_contact: Option<&str>,
        counterparty_note: Option<&str>,
        grams_out: i64,
    ) -> InventoryResult<SpoolLoanRow> {
        create_inbound_spool_loan_row(
            &self.conn,
            spool_id,
            counterparty_name,
            counterparty_contact,
            counterparty_note,
            grams_out,
        )
    }

    pub fn return_spool_loan(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        let tx = self.conn.unchecked_transaction()?;
        let current = tx
            .query_row(
                "SELECT id, spool_id, borrower_name,
                        COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') AS loan_direction,
                        COALESCE(NULLIF(loan_status, ''), CASE
                            WHEN returned_at IS NULL THEN 'ACTIVE'
                            ELSE 'RETURNED'
                        END) AS loan_status,
                        COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
                        counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
                        expected_return_at, returned_at, returned_grams, consumed_grams, return_note
                 FROM spool_loans
                 WHERE id = ?1
                 LIMIT 1",
                params![loan_id],
                map_spool_loan_row,
            )
            .optional()?;

        let loan = match current {
            Some(value) => value,
            None => return Err(InventoryError::NotFound),
        };
        if loan.returned_at.is_some() {
            return Err(InventoryError::Db("loan already returned".to_string()));
        }
        if !loan.loan_direction.eq_ignore_ascii_case("OUTBOUND") {
            return Err(InventoryError::Db(
                "inbound loans require a dedicated return flow".to_string(),
            ));
        }

        let safe_returned = returned_grams.max(0);
        let consumed = (loan.grams_out - safe_returned).max(0);

        tx.execute(
            "UPDATE spool_loans
             SET loan_status = 'RETURNED',
                 returned_at = datetime('now'),
                 returned_grams = ?2,
                 consumed_grams = ?3,
                 return_note = ?4
             WHERE id = ?1",
            params![loan_id, safe_returned, consumed, return_note],
        )?;

        let next_status = if safe_returned == 0 {
            "EMPTY"
        } else {
            "IN_STOCK"
        };
        tx.execute(
            "UPDATE filament_spools
             SET status = ?2,
                 location_id = NULL,
                 current_weight_g = ?3,
                 remaining_g = ?3,
                 updated_at = datetime('now')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![loan.spool_id, next_status, safe_returned],
        )?;

        tx.execute(
            "INSERT INTO scales (id, name, protocol, created_at, updated_at)
             VALUES ('loan-return', 'Loan Return', 'VIRTUAL', datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                protocol = excluded.protocol,
                updated_at = datetime('now')",
            [],
        )?;

        tx.execute(
            "INSERT INTO weight_readings (id, scale_id, spool_id, grams, captured_at, source)
             VALUES (?1, 'loan-return', ?2, ?3, datetime('now'), 'LOAN_RETURN')",
            params![new_id(), loan.spool_id, safe_returned],
        )?;

        let updated = tx.query_row(
            "SELECT id, spool_id, borrower_name,
                    COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') AS loan_direction,
                    COALESCE(NULLIF(loan_status, ''), CASE
                        WHEN returned_at IS NULL THEN 'ACTIVE'
                        ELSE 'RETURNED'
                    END) AS loan_status,
                    COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
                    counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
                    expected_return_at, returned_at, returned_grams, consumed_grams, return_note
             FROM spool_loans
             WHERE id = ?1
             LIMIT 1",
            params![loan_id],
            map_spool_loan_row,
        )?;

        tx.commit()?;
        Ok(updated)
    }

    pub fn return_inbound_spool_loan(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        let tx = self.conn.unchecked_transaction()?;
        let current = tx
            .query_row(
                "SELECT id, spool_id, borrower_name,
                        COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') AS loan_direction,
                        COALESCE(NULLIF(loan_status, ''), CASE
                            WHEN returned_at IS NULL THEN 'ACTIVE'
                            ELSE 'RETURNED'
                        END) AS loan_status,
                        COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
                        counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
                        expected_return_at, returned_at, returned_grams, consumed_grams, return_note
                 FROM spool_loans
                 WHERE id = ?1
                 LIMIT 1",
                params![loan_id],
                map_spool_loan_row,
            )
            .optional()?;

        let loan = match current {
            Some(value) => value,
            None => return Err(InventoryError::NotFound),
        };
        if loan.returned_at.is_some() {
            return Err(InventoryError::Db("loan already returned".to_string()));
        }
        if !loan.loan_direction.eq_ignore_ascii_case("INBOUND") {
            return Err(InventoryError::Db(
                "this flow only supports inbound loans".to_string(),
            ));
        }

        let spool_exists: Option<i64> = tx
            .query_row(
                "SELECT 1
                 FROM filament_spools
                 WHERE id = ?1
                   AND deleted_at IS NULL
                 LIMIT 1",
                params![loan.spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if spool_exists.is_none() {
            return Err(InventoryError::NotFound);
        }

        let safe_returned = returned_grams.max(0);
        let consumed = (loan.grams_out - safe_returned).max(0);

        tx.execute(
            "UPDATE spool_loans
             SET loan_status = 'RETURNED',
                 returned_at = datetime('now'),
                 returned_grams = ?2,
                 consumed_grams = ?3,
                 return_note = ?4
             WHERE id = ?1",
            params![
                loan_id,
                safe_returned,
                consumed,
                normalize_optional_text(return_note)
            ],
        )?;

        tx.execute(
            "UPDATE ams_slots
             SET spool_id = NULL, last_seen_at = datetime('now')
             WHERE spool_id = ?1",
            params![loan.spool_id],
        )?;

        tx.execute(
            "UPDATE filament_spools
             SET status = 'DELETED',
                 deleted_at = datetime('now'),
                 location_id = NULL,
                 current_weight_g = ?2,
                 remaining_g = ?2,
                 updated_at = datetime('now')
             WHERE id = ?1
               AND deleted_at IS NULL",
            params![loan.spool_id, safe_returned],
        )?;

        let updated = tx.query_row(
            "SELECT id, spool_id, borrower_name,
                    COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') AS loan_direction,
                    COALESCE(NULLIF(loan_status, ''), CASE
                        WHEN returned_at IS NULL THEN 'ACTIVE'
                        ELSE 'RETURNED'
                    END) AS loan_status,
                    COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
                    counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
                    expected_return_at, returned_at, returned_grams, consumed_grams, return_note
             FROM spool_loans
             WHERE id = ?1
             LIMIT 1",
            params![loan_id],
            map_spool_loan_row,
        )?;

        tx.commit()?;
        Ok(updated)
    }

    pub fn list_active_spool_loans(&self) -> InventoryResult<Vec<ActiveSpoolLoanRow>> {
        list_active_spool_loan_rows(&self.conn)
    }

    pub fn find_active_spool_loan_for_direction(
        &self,
        spool_id: &str,
        direction: &str,
    ) -> InventoryResult<Option<ActiveSpoolLoanRow>> {
        find_active_spool_loan_for_direction_row(&self.conn, spool_id, direction)
    }

    pub fn list_loan_usage_by_person_for_direction(
        &self,
        limit: i64,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<LoanUsageByPersonRow>> {
        list_loan_usage_by_person_for_direction_rows(&self.conn, limit, direction)
    }

    #[cfg(test)]
    pub fn list_spool_loans(
        &self,
        limit: i64,
        include_returned: bool,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        self.list_spool_loans_for_direction(limit, include_returned, Some("OUTBOUND"))
    }

    pub fn list_spool_loans_for_direction(
        &self,
        limit: i64,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        list_spool_loans_for_direction_rows(&self.conn, limit, include_returned, direction)
    }

    pub fn export_loans_csv(&self, include_returned: bool) -> InventoryResult<String> {
        self.export_loans_csv_for_direction(include_returned, Some("OUTBOUND"))
    }

    pub fn export_loans_csv_for_direction(
        &self,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<String> {
        let rows = self.list_spool_loans_for_direction(20_000, include_returned, direction)?;
        export_loan_rows_csv(&rows)
    }

    pub fn list_printers(&self) -> InventoryResult<Vec<PrinterRow>> {
        list_printer_rows(&self.conn)
    }

    pub fn printer_exists(&self, printer_id: &str) -> InventoryResult<bool> {
        printer_exists_row(&self.conn, printer_id)
    }

    pub fn upsert_printer_with_ams(
        &self,
        printer_id: &str,
        model: &str,
        name: &str,
        ams_units: i64,
        slots_per_unit: i64,
    ) -> InventoryResult<()> {
        let printer_id = printer_id.trim();
        let model = model.trim();
        let name = name.trim();
        if printer_id.is_empty() || model.is_empty() || name.is_empty() {
            return Err(InventoryError::Db(
                "printer id, model and name are required".to_string(),
            ));
        }

        let unit_count = ams_units.clamp(0, 4);
        let slot_count = slots_per_unit.clamp(1, 8);
        let tx = self.conn.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO printers (id, model, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                model = excluded.model,
                name = excluded.name,
                updated_at = datetime('now')",
            params![printer_id, model, name],
        )?;

        let ext_ams_id = format!("{printer_id}_ext");
        let mut target_ams_ids: HashSet<String> = HashSet::new();
        target_ams_ids.insert(ext_ams_id.clone());
        for unit_idx in 1..=unit_count {
            target_ams_ids.insert(format!("{printer_id}_ams_{unit_idx}"));
        }

        {
            let mut units_stmt = tx.prepare(
                "SELECT id
                 FROM ams_units
                 WHERE printer_id = ?1",
            )?;
            let existing_units = units_stmt.query_map(params![printer_id], |row| row.get(0))?;
            for unit in existing_units {
                let ams_id: String = unit?;
                let keep_unit = target_ams_ids.contains(&ams_id);
                let keep_slots = if ams_id == ext_ams_id {
                    1
                } else if keep_unit {
                    slot_count
                } else {
                    0
                };

                let mut removable_slot_stmt = tx.prepare(
                    "SELECT id, spool_id
                     FROM ams_slots
                     WHERE ams_id = ?1
                       AND (?2 = 0 OR slot_index > ?2)",
                )?;
                let removable_slots = removable_slot_stmt
                    .query_map(params![ams_id, keep_slots], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                    })?;

                for slot in removable_slots {
                    let (slot_id, spool_id) = slot?;
                    if let Some(assigned_spool_id) = spool_id {
                        tx.execute(
                            "UPDATE filament_spools
                             SET status = CASE WHEN status IN ('IN_USE', 'ASSIGNED') THEN 'IN_STOCK' ELSE status END,
                                 location_id = CASE
                                     WHEN location_id LIKE 'Printer:%' THEN home_location_id
                                     ELSE location_id
                                 END,
                                 updated_at = datetime('now')
                             WHERE id = ?1 AND deleted_at IS NULL",
                            params![assigned_spool_id],
                        )?;
                    }
                    tx.execute("DELETE FROM ams_slots WHERE id = ?1", params![slot_id])?;
                }

                if !keep_unit {
                    tx.execute("DELETE FROM ams_units WHERE id = ?1", params![ams_id])?;
                }
            }
        }

        tx.execute(
            "INSERT INTO ams_units (id, printer_id, slot_count, created_at, updated_at)
             VALUES (?1, ?2, 1, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                printer_id = excluded.printer_id,
                slot_count = 1,
                updated_at = datetime('now')",
            params![ext_ams_id, printer_id],
        )?;
        let ext_slot_id = format!("{printer_id}_ext_slot_1");
        tx.execute(
            "INSERT OR IGNORE INTO ams_slots (id, ams_id, slot_index)
             VALUES (?1, ?2, 1)",
            params![ext_slot_id, format!("{printer_id}_ext")],
        )?;

        for unit_idx in 1..=unit_count {
            let ams_id = format!("{printer_id}_ams_{unit_idx}");
            tx.execute(
                "INSERT INTO ams_units (id, printer_id, slot_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                    printer_id = excluded.printer_id,
                    slot_count = excluded.slot_count,
                    updated_at = datetime('now')",
                params![ams_id, printer_id, slot_count],
            )?;

            for slot_idx in 1..=slot_count {
                let slot_id = format!("{ams_id}_slot_{slot_idx}");
                tx.execute(
                    "INSERT OR IGNORE INTO ams_slots (id, ams_id, slot_index)
                     VALUES (?1, ?2, ?3)",
                    params![slot_id, ams_id, slot_idx],
                )?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn delete_printer(&self, printer_id: &str) -> InventoryResult<()> {
        let bambu_live_integration_key = bambu_live_integration_setting_key(printer_id.trim());
        let tx = self.conn.unchecked_transaction()?;

        {
            let mut stmt = tx.prepare(
                "SELECT s.spool_id
                 FROM ams_slots s
                 JOIN ams_units u ON u.id = s.ams_id
                 WHERE u.printer_id = ?1
                   AND s.spool_id IS NOT NULL",
            )?;
            let rows =
                stmt.query_map(params![printer_id], |row| row.get::<_, Option<String>>(0))?;
            for row in rows {
                if let Some(spool_id) = row? {
                    tx.execute(
                        "UPDATE filament_spools
                         SET status = CASE WHEN status IN ('IN_USE', 'ASSIGNED') THEN 'IN_STOCK' ELSE status END,
                             location_id = CASE
                                 WHEN location_id LIKE 'Printer:%' THEN home_location_id
                                 ELSE location_id
                             END,
                             updated_at = datetime('now')
                         WHERE id = ?1 AND deleted_at IS NULL",
                        params![spool_id],
                    )?;
                }
            }
        }

        tx.execute(
            "DELETE FROM print_jobs
             WHERE printer_id = ?1",
            params![printer_id],
        )?;
        tx.execute(
            "DELETE FROM printer_live_events
             WHERE printer_id = ?1",
            params![printer_id],
        )?;
        tx.execute(
            "DELETE FROM ams_slots
             WHERE ams_id IN (
                SELECT id FROM ams_units WHERE printer_id = ?1
             )",
            params![printer_id],
        )?;
        tx.execute(
            "DELETE FROM ams_units
             WHERE printer_id = ?1",
            params![printer_id],
        )?;
        tx.execute(
            "DELETE FROM settings
             WHERE key = 'active_printer_id' AND value = ?1",
            params![printer_id],
        )?;
        tx.execute(
            "DELETE FROM settings
             WHERE key = ?1",
            params![bambu_live_integration_key],
        )?;
        let removed = tx.execute(
            "DELETE FROM printers
             WHERE id = ?1",
            params![printer_id],
        )?;
        require_rows(removed)?;

        tx.commit()?;
        Ok(())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> InventoryResult<()> {
        set_setting_row(&self.conn, key, value)
    }

    pub fn delete_setting(&self, key: &str) -> InventoryResult<()> {
        delete_setting_row(&self.conn, key)
    }

    pub fn get_setting(&self, key: &str) -> InventoryResult<Option<String>> {
        get_setting_row(&self.conn, key)
    }

    pub fn save_bambu_live_integration(
        &self,
        printer_id: &str,
        config: &BambuLiveIntegrationRow,
    ) -> InventoryResult<()> {
        let normalized_printer_id = printer_id.trim();
        if normalized_printer_id.is_empty() {
            return Err(InventoryError::Db(
                "printer id is required for Bambu live integration".to_string(),
            ));
        }
        let payload =
            serde_json::to_string(config).map_err(|error| InventoryError::Db(error.to_string()))?;
        self.set_setting(
            &bambu_live_integration_setting_key(normalized_printer_id),
            &payload,
        )
    }

    pub fn delete_bambu_live_integration(&self, printer_id: &str) -> InventoryResult<()> {
        let normalized_printer_id = printer_id.trim();
        if normalized_printer_id.is_empty() {
            return Ok(());
        }
        self.delete_setting(&bambu_live_integration_setting_key(normalized_printer_id))
    }

    pub fn list_bambu_live_integrations(
        &self,
    ) -> InventoryResult<Vec<BambuLiveIntegrationEntryRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT key, value
             FROM settings
             WHERE key LIKE ?1 || '%'
             ORDER BY key ASC",
        )?;
        let rows = stmt.query_map(params![BAMBU_LIVE_INTEGRATION_SETTING_PREFIX], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })?;
        let mut entries = Vec::new();
        for row in rows {
            let (key, value) = row?;
            let Some(printer_id) = key.strip_prefix(BAMBU_LIVE_INTEGRATION_SETTING_PREFIX) else {
                continue;
            };
            let config = serde_json::from_str::<BambuLiveIntegrationRow>(&value)
                .map_err(|error| InventoryError::Db(error.to_string()))?;
            entries.push(BambuLiveIntegrationEntryRow {
                printer_id: printer_id.to_string(),
                config,
            });
        }
        Ok(entries)
    }

    pub fn insert_printer_live_event(
        &self,
        printer_id: &str,
        event_type: &str,
        payload_json: &Value,
    ) -> InventoryResult<()> {
        let normalized_printer_id = printer_id.trim();
        let normalized_event_type = event_type.trim();
        if normalized_printer_id.is_empty() || normalized_event_type.is_empty() {
            return Err(InventoryError::Db(
                "printer id and event type are required for printer live events".to_string(),
            ));
        }
        let payload = serde_json::to_string(payload_json)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.conn.execute(
            "INSERT INTO printer_live_events (id, printer_id, event_type, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params![
                new_id(),
                normalized_printer_id,
                normalized_event_type,
                payload
            ],
        )?;
        Ok(())
    }

    pub fn get_trusted_lan_settings(&self) -> InventoryResult<TrustedLanSettingsRow> {
        let enabled = self
            .get_setting("trusted_lan_enabled")?
            .map(|value| matches!(value.trim(), "1" | "true" | "TRUE" | "True"))
            .unwrap_or(false);
        let selected_interface_name = self.get_setting("trusted_lan_interface_name")?;
        let selected_interface_address = self.get_setting("trusted_lan_interface_address")?;
        let listen_port = self
            .get_setting("trusted_lan_port")?
            .and_then(|value| value.trim().parse::<u16>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(4278);
        Ok(TrustedLanSettingsRow {
            enabled,
            selected_interface_name,
            selected_interface_address,
            listen_port,
        })
    }

    pub fn save_trusted_lan_settings(
        &self,
        settings: &TrustedLanSettingsRow,
    ) -> InventoryResult<()> {
        self.set_setting(
            "trusted_lan_enabled",
            if settings.enabled { "1" } else { "0" },
        )?;
        self.set_setting("trusted_lan_port", &settings.listen_port.max(1).to_string())?;
        match settings
            .selected_interface_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(value) => self.set_setting("trusted_lan_interface_name", value)?,
            None => self.delete_setting("trusted_lan_interface_name")?,
        }
        match settings
            .selected_interface_address
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(value) => self.set_setting("trusted_lan_interface_address", value)?,
            None => self.delete_setting("trusted_lan_interface_address")?,
        }
        Ok(())
    }

    pub fn get_library_sync_settings(&self) -> InventoryResult<LibrarySyncSettingsRow> {
        let mode = normalize_library_sync_mode(self.get_setting("library_sync_mode")?.as_deref());
        let device_name = self
            .get_setting("library_sync_device_name")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(default_library_sync_device_name);

        let library_id = self
            .get_setting("library_sync_library_id")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| {
                let next = new_id();
                let _ = self.set_setting("library_sync_library_id", &next);
                next
            });

        let host_base_url = self
            .get_setting("library_sync_host_base_url")?
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty());
        let host_device_name = self
            .get_setting("library_sync_host_device_name")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let client_session_id = self
            .get_setting("library_sync_client_session_id")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let client_auth_paired = client_session_id.is_some();
        let client_auth_paired_at = self
            .get_setting("library_sync_client_auth_paired_at")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let client_auth_expires_at = self
            .get_setting("library_sync_client_auth_expires_at")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let last_checked_at = self
            .get_setting("library_sync_last_checked_at")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let last_reachable_at = self
            .get_setting("library_sync_last_reachable_at")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let last_validation_message = self
            .get_setting("library_sync_last_validation_message")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let cached_snapshot = self
            .get_setting("library_sync_cached_snapshot_json")?
            .and_then(|value| serde_json::from_str::<LibrarySyncCachedSnapshotRow>(&value).ok());
        let cached_spools = self
            .get_setting("library_sync_cached_spools_json")?
            .and_then(|value| serde_json::from_str::<LibrarySyncCachedSpoolListRow>(&value).ok());
        let cached_printers = self
            .get_setting("library_sync_cached_printers_json")?
            .and_then(|value| {
                serde_json::from_str::<LibrarySyncCachedPrinterOverviewRow>(&value).ok()
            });
        let cached_loans = self
            .get_setting("library_sync_cached_loans_json")?
            .and_then(|value| serde_json::from_str::<LibrarySyncCachedLoanListRow>(&value).ok());

        Ok(LibrarySyncSettingsRow {
            mode,
            device_name,
            library_id,
            host_base_url,
            host_device_name,
            client_auth_paired,
            client_auth_paired_at,
            client_auth_expires_at,
            last_checked_at,
            last_reachable_at,
            last_validation_message,
            cached_snapshot,
            cached_spools,
            cached_printers,
            cached_loans,
        })
    }

    pub fn save_library_sync_settings(
        &self,
        settings: &LibrarySyncSettingsRow,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        let mode = normalize_library_sync_mode(Some(settings.mode.as_str()));
        let device_name = settings
            .device_name
            .trim()
            .to_string()
            .chars()
            .take(120)
            .collect::<String>();
        let safe_device_name = if device_name.is_empty() {
            default_library_sync_device_name()
        } else {
            device_name
        };
        let library_id = settings
            .library_id
            .trim()
            .to_string()
            .chars()
            .take(160)
            .collect::<String>();
        let safe_library_id = if library_id.is_empty() {
            new_id()
        } else {
            library_id
        };
        let host_base_url = settings
            .host_base_url
            .as_deref()
            .map(str::trim)
            .map(|value| value.trim_end_matches('/'))
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let host_device_name = settings
            .host_device_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(120).collect::<String>());
        let previous_host_base_url = self
            .get_setting("library_sync_host_base_url")?
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty());

        self.set_setting("library_sync_mode", &mode)?;
        self.set_setting("library_sync_device_name", &safe_device_name)?;
        self.set_setting("library_sync_library_id", &safe_library_id)?;

        if mode == "CLIENT" {
            let host_changed = previous_host_base_url != host_base_url;
            match host_base_url.as_deref() {
                Some(value) => self.set_setting("library_sync_host_base_url", value)?,
                None => self.delete_setting("library_sync_host_base_url")?,
            }
            match host_device_name.as_deref() {
                Some(value) => self.set_setting("library_sync_host_device_name", value)?,
                None => self.delete_setting("library_sync_host_device_name")?,
            }
            if host_changed {
                self.clear_library_sync_client_auth_state()?;
            }
        } else {
            self.delete_setting("library_sync_host_base_url")?;
            self.delete_setting("library_sync_host_device_name")?;
            self.delete_setting("library_sync_last_checked_at")?;
            self.delete_setting("library_sync_last_reachable_at")?;
            self.delete_setting("library_sync_last_validation_message")?;
            self.delete_setting("library_sync_cached_snapshot_json")?;
            self.delete_setting("library_sync_cached_spools_json")?;
            self.delete_setting("library_sync_cached_printers_json")?;
            self.delete_setting("library_sync_cached_loans_json")?;
            self.clear_library_sync_client_auth_state()?;
        }

        self.get_library_sync_settings()
    }

    pub fn save_library_sync_validation_state(
        &self,
        reachable: bool,
        message: Option<&str>,
        host_device_name: Option<&str>,
    ) -> InventoryResult<()> {
        save_library_sync_validation_state_row(&self.conn, reachable, message, host_device_name)
    }

    pub fn save_library_sync_client_auth_state(
        &self,
        session_id: &str,
        device_token: &str,
        csrf_token: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        save_library_sync_client_auth_state_rows(
            &self.conn,
            session_id,
            device_token,
            csrf_token,
            expires_at,
        )
    }

    pub fn clear_library_sync_client_auth_state(&self) -> InventoryResult<()> {
        clear_library_sync_client_auth_state_rows(&self.conn)
    }

    pub fn get_library_sync_client_auth_state(
        &self,
    ) -> InventoryResult<Option<LibrarySyncClientAuthState>> {
        get_library_sync_client_auth_state_rows(&self.conn)
    }

    pub fn save_library_sync_cached_snapshot(
        &self,
        snapshot: &LibrarySyncCachedSnapshotRow,
    ) -> InventoryResult<()> {
        save_library_sync_cached_snapshot_row(&self.conn, snapshot)
    }

    pub fn save_library_sync_cached_spools(
        &self,
        rows: &[SpoolWithMasterRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_spool_rows(&self.conn, rows)
    }

    pub fn save_library_sync_cached_printers(
        &self,
        rows: &[PrinterOverviewRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_printer_rows(&self.conn, rows)
    }

    pub fn save_library_sync_cached_loans(
        &self,
        rows: &[SpoolLoanDetailsRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_loan_rows(&self.conn, rows)
    }

    pub fn current_timestamp(&self) -> InventoryResult<String> {
        sqlite_now_value(&self.conn)
    }

    pub fn create_trusted_lan_pairing(
        &self,
        display_name: Option<&str>,
        pairing_token_hash: &str,
        expires_in_seconds: u64,
    ) -> InventoryResult<String> {
        create_trusted_lan_pairing_row(
            &self.conn,
            display_name,
            pairing_token_hash,
            expires_in_seconds,
        )
    }

    pub fn consume_trusted_lan_pairing(
        &self,
        pairing_token_hash: &str,
    ) -> InventoryResult<Option<Option<String>>> {
        consume_trusted_lan_pairing_row(&self.conn, pairing_token_hash)
    }

    pub fn create_trusted_lan_paired_browser(
        &self,
        display_name: Option<&str>,
        device_token_hash: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<TrustedLanPairedBrowserRow> {
        create_trusted_lan_paired_browser_row(
            &self.conn,
            display_name,
            device_token_hash,
            last_origin,
        )
    }

    pub fn get_trusted_lan_paired_browser_by_id(
        &self,
        browser_id: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        get_trusted_lan_paired_browser_by_id_row(&self.conn, browser_id)
    }

    pub fn get_active_trusted_lan_paired_browser_by_device_token_hash(
        &self,
        device_token_hash: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        get_active_trusted_lan_paired_browser_by_device_token_hash_row(
            &self.conn,
            device_token_hash,
        )
    }

    pub fn list_trusted_lan_paired_browsers(
        &self,
    ) -> InventoryResult<Vec<TrustedLanPairedBrowserRow>> {
        list_trusted_lan_paired_browser_rows(&self.conn)
    }

    pub fn touch_trusted_lan_paired_browser(
        &self,
        browser_id: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<()> {
        touch_trusted_lan_paired_browser_row(&self.conn, browser_id, last_origin)
    }

    pub fn revoke_trusted_lan_paired_browser(&self, browser_id: &str) -> InventoryResult<()> {
        revoke_trusted_lan_paired_browser_row(&self.conn, browser_id)
    }

    pub fn revoke_all_trusted_lan_paired_browsers(&self) -> InventoryResult<usize> {
        revoke_all_trusted_lan_paired_browser_rows(&self.conn)
    }

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        list_printer_overview_rows(&self.conn)
    }

    pub fn assign_spool_to_ams_slot(
        &self,
        printer_id: &str,
        slot_id: &str,
        spool_id: Option<&str>,
        rfid_override_tray_uuid: Option<&str>,
        rfid_override_color_hex: Option<&str>,
        clear_live_cache_before_next_refresh: bool,
    ) -> InventoryResult<()> {
        let tx = self.conn.unchecked_transaction()?;

        let slot_entry: Option<(Option<String>, String)> = tx
            .query_row(
                "SELECT s.spool_id, p.name
                 FROM ams_slots s
                 JOIN ams_units u ON u.id = s.ams_id
                 JOIN printers p ON p.id = u.printer_id
                 WHERE s.id = ?1 AND p.id = ?2
                 LIMIT 1",
                params![slot_id, printer_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let (previous_spool_id, printer_name) = match slot_entry {
            Some(value) => value,
            None => return Err(InventoryError::NotFound),
        };

        if let Some(candidate_spool_id) = spool_id {
            let exists: Option<String> = tx
                .query_row(
                    "SELECT id
                     FROM filament_spools
                     WHERE id = ?1 AND deleted_at IS NULL
                     LIMIT 1",
                    params![candidate_spool_id],
                    |row| row.get(0),
                )
                .optional()?;
            if exists.is_none() {
                return Err(InventoryError::NotFound);
            }
        }

        tx.execute(
            "UPDATE ams_slots
             SET spool_id = ?1,
                 last_seen_at = datetime('now'),
                 rfid_override_tray_uuid = ?3,
                 rfid_override_color_hex = ?4,
                 live_cache_cleared_at = CASE
                     WHEN ?5 = 1 THEN datetime('now')
                     ELSE NULL
                 END
             WHERE id = ?2",
            params![
                spool_id,
                slot_id,
                normalize_optional_text(rfid_override_tray_uuid),
                normalize_optional_text(rfid_override_color_hex),
                if clear_live_cache_before_next_refresh {
                    1
                } else {
                    0
                }
            ],
        )?;

        if previous_spool_id.as_deref() != spool_id {
            if let Some(old_spool_id) = previous_spool_id {
                tx.execute(
                    "UPDATE filament_spools
                     SET status = CASE WHEN status IN ('IN_USE', 'ASSIGNED') THEN 'IN_STOCK' ELSE status END,
                         location_id = CASE
                             WHEN location_id LIKE 'Printer:%' THEN home_location_id
                             ELSE location_id
                         END,
                         updated_at = datetime('now')
                     WHERE id = ?1 AND deleted_at IS NULL",
                    params![old_spool_id],
                )?;
            }

            if let Some(new_spool_id) = spool_id {
                tx.execute(
                    "UPDATE ams_slots
                     SET spool_id = NULL,
                         last_seen_at = datetime('now')
                     WHERE spool_id = ?1
                       AND id != ?2",
                    params![new_spool_id, slot_id],
                )?;
                let location = format!("Printer:{printer_name}:{slot_id}");
                tx.execute(
                    "INSERT INTO inventory_locations (id, name, type)
                     VALUES (?1, ?2, 'PRINTER_SLOT')
                     ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name",
                    params![location, location],
                )?;
                tx.execute(
                    "UPDATE filament_spools
                     SET status = 'ASSIGNED',
                         location_id = ?2,
                         updated_at = datetime('now')
                     WHERE id = ?1 AND deleted_at IS NULL",
                    params![new_spool_id, location],
                )?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn insert_print_job(
        &self,
        printer_id: &str,
        spool_id: &str,
        job_name: Option<&str>,
        material_used_g: i64,
        success: bool,
    ) -> InventoryResult<String> {
        insert_print_job_row(
            &self.conn,
            printer_id,
            spool_id,
            job_name,
            material_used_g,
            success,
        )
    }

    pub fn reset_app_state_data(&self) -> InventoryResult<()> {
        reset_app_state_data_rows(&self.conn)
    }

    pub fn reset_catalog_data(&self) -> InventoryResult<CatalogResetStats> {
        reset_catalog_data_rows(&self.conn)
    }

    pub fn insert_alert(&self, alert_type: &str, payload_json: &str) -> InventoryResult<()> {
        insert_alert_row(&self.conn, alert_type, payload_json)
    }

    pub fn alert_exists_for_spool(
        &self,
        alert_type: &str,
        spool_id: &str,
    ) -> InventoryResult<bool> {
        alert_exists_for_spool_row(&self.conn, alert_type, spool_id)
    }

    pub fn export_spools_csv(&self) -> InventoryResult<String> {
        let rows = self.list_spools_with_master(10_000, 0)?;
        export_spool_rows_csv(&rows)
    }

    pub fn export_spools_json(&self) -> InventoryResult<String> {
        let rows = self.list_spools_with_master(10_000, 0)?;
        export_spool_rows_json(&rows)
    }

    pub fn export_full_backup_json(&self) -> InventoryResult<String> {
        export_full_backup_content(&self.conn)
    }

    pub fn validate_full_backup_json(
        &self,
        content: &str,
    ) -> InventoryResult<BackupValidationStats> {
        validate_full_backup_content(content)
    }

    pub fn import_full_backup_json(&self, content: &str) -> InventoryResult<()> {
        let parsed = parse_full_backup_content(content)?;

        self.conn.execute_batch(SCHEMA_SQL)?;
        self.conn
            .execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")?;
        let result: InventoryResult<()> = (|| {
            delete_all_rows(&self.conn, &FULL_BACKUP_TABLES)?;

            for table in FULL_BACKUP_TABLES {
                let Some(rows) = parsed.tables.get(table) else {
                    continue;
                };

                for row in rows {
                    if !should_import_backup_row(table, row) {
                        continue;
                    }
                    self.insert_backup_row(table, row)?;
                }
            }

            ensure_no_foreign_key_violations(&self.conn, "Full backup import")?;

            Ok(())
        })();

        match result {
            Ok(()) => match self.conn.execute_batch("COMMIT") {
                Ok(()) => {
                    self.conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                    self.ensure_borrowed_in_schema()?;
                    self.ensure_printer_external_slot_schema()?;
                    self.ensure_printer_slot_rfid_override_schema()?;
                    self.ensure_printer_slot_live_cache_schema()?;
                    self.ensure_trusted_lan_schema()?;
                    Ok(())
                }
                Err(error) => {
                    let _ = self.conn.execute_batch("ROLLBACK");
                    let _ = self.conn.execute_batch("PRAGMA foreign_keys = ON;");
                    Err(error.into())
                }
            },
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                let _ = self.conn.execute_batch("PRAGMA foreign_keys = ON;");
                Err(error)
            }
        }
    }

    pub fn import_data_content(&self, content: &str) -> InventoryResult<ImportDataStats> {
        let normalized = content.trim_start_matches('\u{feff}').trim();
        if normalized.is_empty() {
            return Err(InventoryError::Db("Import file is empty".to_string()));
        }

        if let Ok(validation) = self.validate_full_backup_json(normalized) {
            self.import_full_backup_json(normalized)?;
            return Ok(ImportDataStats {
                detected_format: "FULL_BACKUP".to_string(),
                imported_count: validation.total_rows,
                created_count: 0,
                updated_count: 0,
            });
        }

        if let Ok(rows) = parse_inventory_spools_json(normalized) {
            let stats = self.import_inventory_spools_rows(&rows)?;
            return Ok(ImportDataStats {
                detected_format: "INVENTORY_JSON".to_string(),
                imported_count: stats.imported_count,
                created_count: stats.created_count,
                updated_count: stats.updated_count,
            });
        }

        if let Ok(rows) = parse_inventory_spools_csv(normalized) {
            let stats = self.import_inventory_spools_rows(&rows)?;
            return Ok(ImportDataStats {
                detected_format: "INVENTORY_CSV".to_string(),
                imported_count: stats.imported_count,
                created_count: stats.created_count,
                updated_count: stats.updated_count,
            });
        }

        Err(InventoryError::Db(
            "Unsupported import format. Expected full backup JSON, inventory JSON array/object, or inventory CSV.".to_string(),
        ))
    }

    fn insert_backup_row(&self, table: &str, row: &Map<String, Value>) -> InventoryResult<()> {
        if row.is_empty() {
            return Ok(());
        }
        let allowed_columns = table_columns(&self.conn, table)?;
        let columns: Vec<String> = row
            .keys()
            .filter(|column| allowed_columns.contains(*column))
            .cloned()
            .collect();
        if columns.is_empty() {
            return Ok(());
        }
        let placeholders = vec!["?"; columns.len()].join(", ");
        let sql = format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            columns.join(", "),
            placeholders
        );
        let values: Vec<rusqlite::types::Value> = columns
            .iter()
            .map(|column| json_value_to_sql(row.get(column).unwrap_or(&Value::Null)))
            .collect();
        self.conn
            .execute(&sql, rusqlite::params_from_iter(values.iter()))?;
        Ok(())
    }

    pub fn enqueue_sync_action(
        &self,
        action_type: &str,
        payload_json: &str,
    ) -> InventoryResult<String> {
        enqueue_sync_action_row(&self.conn, action_type, payload_json)
    }
}

impl FilamentDatabase {
    fn import_inventory_spools_rows(
        &self,
        rows: &[InventoryImportRow],
    ) -> InventoryResult<InventoryImportStats> {
        if rows.is_empty() {
            return Err(InventoryError::Db(
                "Inventory import contains no spool rows".to_string(),
            ));
        }

        self.conn.execute_batch("BEGIN IMMEDIATE;")?;
        let result: InventoryResult<InventoryImportStats> = (|| {
            let mut created_count = 0_i64;
            let mut updated_count = 0_i64;

            for (index, row) in rows.iter().enumerate() {
                let spool_id = row.spool_id.trim();
                let material = row.material.trim();
                let filament_name = row.filament_name.trim();
                let color_name = row.color_name.trim();

                if spool_id.is_empty()
                    || material.is_empty()
                    || filament_name.is_empty()
                    || color_name.is_empty()
                {
                    return Err(InventoryError::Db(format!(
                        "Invalid inventory row at index {}: spool_id, material, filament_name and color_name are required",
                        index
                    )));
                }

                let remaining_g = row
                    .remaining_g
                    .or(row.current_weight_g)
                    .or(row.initial_weight_g)
                    .unwrap_or(1000)
                    .max(0);
                let current_weight_g = row.current_weight_g.unwrap_or(remaining_g).max(0);
                let initial_weight_g = row
                    .initial_weight_g
                    .unwrap_or(remaining_g.max(current_weight_g).max(1000))
                    .max(current_weight_g)
                    .max(remaining_g)
                    .max(1);
                let status = normalize_spool_status(row.status.as_deref());
                let location_id = match normalize_optional_text(row.location.as_deref()) {
                    Some(location) => Some(self.ensure_location(&location)?),
                    None => None,
                };
                let home_location_id = location_id.clone();
                let qr_code = normalize_optional_text(row.qr_code.as_deref());
                let vendor = normalize_optional_text(row.vendor.as_deref());
                let master_id = self.upsert_manual_master(ManualMasterInput {
                    material,
                    filament_name,
                    color_name,
                    hex_color: None,
                    product_url: None,
                    vendor: vendor.as_deref(),
                    default_weight: Some(initial_weight_g),
                })?;

                if self.get_spool_by_id(spool_id)?.is_some() {
                    self.conn.execute(
                        "UPDATE filament_spools
                         SET master_id = ?1,
                             qr_code = ?2,
                             status = ?3,
                             initial_weight_g = ?4,
                             current_weight_g = ?5,
                             remaining_g = ?6,
                             spool_tare_weight_g = NULL,
                             location_id = ?7,
                             home_location_id = ?8,
                             updated_at = datetime('now')
                         WHERE id = ?9",
                        params![
                            master_id,
                            qr_code,
                            status,
                            initial_weight_g,
                            current_weight_g,
                            remaining_g,
                            location_id,
                            location_id,
                            spool_id
                        ],
                    )?;
                    updated_count += 1;
                } else {
                    let spool = SpoolRow {
                        id: spool_id.to_string(),
                        master_id,
                        qr_code,
                        rfid_tag: None,
                        rfid_observed_at: None,
                        status,
                        ownership_type: "OWNED".to_string(),
                        owner_name: None,
                        owner_contact: None,
                        ownership_note: None,
                        initial_weight_g: Some(initial_weight_g),
                        current_weight_g: Some(current_weight_g),
                        remaining_g: Some(remaining_g),
                        spool_tare_weight_g: None,
                        location_id,
                        home_location_id,
                        purchase_date: None,
                        purchase_price: None,
                        batch_code: None,
                        last_used_at: None,
                    };
                    self.insert_spool(&spool)?;
                    created_count += 1;
                }
            }

            Ok(InventoryImportStats {
                imported_count: i64::try_from(rows.len()).unwrap_or(0),
                created_count,
                updated_count,
            })
        })();

        match result {
            Ok(stats) => {
                self.conn.execute_batch("COMMIT;")?;
                Ok(stats)
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK;");
                Err(error)
            }
        }
    }
}

#[cfg(test)]
#[path = "filament_database_tests.rs"]
mod tests;
