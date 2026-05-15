use std::collections::HashSet;

use super::bambu_live_settings::{
    bambu_live_integration_setting_key, BAMBU_LIVE_INTEGRATION_SETTING_PREFIX,
};
pub use super::database_backup::BackupValidationStats;
use super::database_backup::{parse_full_backup_content, validate_full_backup_content};
use super::database_borrowed_schema::ensure_borrowed_in_schema as ensure_borrowed_in_schema_impl;
use super::database_catalog_schema::ensure_catalog_lifecycle_columns as ensure_catalog_lifecycle_columns_schema;
use super::database_connection::open_connection;
use super::database_ids::new_id;
pub use super::database_import::ImportDataStats;
use super::database_import::{
    parse_inventory_spools_csv, parse_inventory_spools_json, InventoryImportRow,
    InventoryImportStats,
};
use super::database_locations::ensure_location as ensure_location_row;
use super::database_printer_schema::{
    ensure_printer_external_slot_schema as ensure_printer_external_slot_schema_impl,
    ensure_printer_slot_live_cache_schema as ensure_printer_slot_live_cache_schema_impl,
    ensure_printer_slot_rfid_override_schema as ensure_printer_slot_rfid_override_schema_impl,
};
use super::database_result::require_rows;
use super::database_rows::{
    map_active_spool_loan_row, map_spool_loan_row, map_spool_row, map_spool_with_master_row,
    map_trusted_lan_paired_browser_row,
};
use super::database_schema::{ensure_no_foreign_key_violations, table_columns};
use super::database_schema_setup::apply_schema_migrations;
use super::database_settings::{
    delete_setting as delete_setting_row, get_setting as get_setting_row,
    set_setting as set_setting_row,
};
use super::database_table_ops::delete_all_rows;
use super::database_tables::should_import_backup_row;
pub use super::database_tables::{FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES};
use super::database_text::{escape_csv, escape_json, normalize_optional_text};
use super::database_time::{
    sqlite_datetime_shift as sqlite_datetime_shift_value, sqlite_now as sqlite_now_value,
};
use super::database_trusted_lan_schema::ensure_trusted_lan_schema as ensure_trusted_lan_schema_impl;
use super::database_values::{json_value_to_sql, sqlite_value_to_json};
use super::database_wishlist::{
    delete_wishlist_item as delete_wishlist_item_row,
    insert_wishlist_item as insert_wishlist_item_row,
    list_wishlist_items as list_wishlist_item_rows,
    update_wishlist_item_status as update_wishlist_item_status_row,
};
use super::library_sync_defaults::{default_library_sync_device_name, normalize_library_sync_mode};
use super::loan_defaults::normalize_loan_direction_filter;
use super::spool_defaults::normalize_spool_status;
use super::statistics::InventoryOverview;
use super::vendor_lookup::normalize_esun_color_name_for_catalog;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

type LibrarySyncClientAuthState = (String, String, String, Option<String>);
type MasterCatalogExistingRow = (
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
        let mut results = Vec::new();
        if let Some(raw) = search {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let term = format!("%{}%", trimmed.to_lowercase());
                let mut stmt = self.conn.prepare(
                    "SELECT id, material, filament_name, color_name, hex_color, product_url,
                            default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
                     FROM filament_master_list
                     WHERE lower(material) LIKE ?1
                        OR lower(filament_name) LIKE ?1
                        OR lower(color_name) LIKE ?1
                        OR lower(vendor) LIKE ?1
                     ORDER BY material, filament_name, color_name
                     LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![term, limit], |row| {
                    Ok(FilamentMasterCatalogRow {
                        id: row.get(0)?,
                        material: row.get(1)?,
                        filament_name: row.get(2)?,
                        color_name: row.get(3)?,
                        hex_color: row.get(4)?,
                        product_url: row.get(5)?,
                        default_weight: row.get(6)?,
                        vendor: row.get(7)?,
                        last_seen_at: row.get(8)?,
                        is_discontinued: row.get::<_, i64>(9)? != 0,
                        discontinued_at: row.get(10)?,
                    })
                })?;
                for row in rows {
                    results.push(row?);
                }
                return Ok(results);
            }
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, material, filament_name, color_name, hex_color, product_url,
                    default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
             FROM filament_master_list
             ORDER BY material, filament_name, color_name
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(FilamentMasterCatalogRow {
                id: row.get(0)?,
                material: row.get(1)?,
                filament_name: row.get(2)?,
                color_name: row.get(3)?,
                hex_color: row.get(4)?,
                product_url: row.get(5)?,
                default_weight: row.get(6)?,
                vendor: row.get(7)?,
                last_seen_at: row.get(8)?,
                is_discontinued: row.get::<_, i64>(9)? != 0,
                discontinued_at: row.get(10)?,
            })
        })?;
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn upsert_manual_master(&self, input: ManualMasterInput<'_>) -> InventoryResult<String> {
        let ManualMasterInput {
            material,
            filament_name,
            color_name,
            hex_color,
            product_url,
            vendor,
            default_weight,
        } = input;
        let material = material.trim();
        let filament_name = filament_name.trim();
        let color_name = color_name.trim();
        let vendor = vendor
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Manual");
        let default_weight = default_weight.unwrap_or(1000).max(1);
        if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
            return Err(InventoryError::Db(
                "material, filament name and color are required".to_string(),
            ));
        }

        let generated_id = new_id();
        self.conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, hex_color, product_url,
                default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), 0, NULL)
            ON CONFLICT(material, filament_name, color_name) DO UPDATE SET
                hex_color = COALESCE(excluded.hex_color, filament_master_list.hex_color),
                product_url = COALESCE(excluded.product_url, filament_master_list.product_url),
                default_weight = CASE
                    WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.default_weight
                    ELSE excluded.default_weight
                END,
                vendor = CASE
                    WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.vendor
                    ELSE excluded.vendor
                END,
                is_discontinued = CASE
                    WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.is_discontinued
                    ELSE 0
                END,
                discontinued_at = CASE
                    WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.discontinued_at
                    ELSE NULL
                END,
                last_seen_at = datetime('now'),
                updated_at = datetime('now')",
            params![
                generated_id,
                material,
                filament_name,
                color_name,
                hex_color,
                product_url,
                default_weight,
                vendor
            ],
        )?;

        let id: Option<String> = self
            .conn
            .query_row(
                "SELECT id
                 FROM filament_master_list
                 WHERE material = ?1 AND filament_name = ?2 AND color_name = ?3
                 LIMIT 1",
                params![material, filament_name, color_name],
                |row| row.get(0),
            )
            .optional()?;
        match id {
            Some(value) => Ok(value),
            None => Err(InventoryError::Db(
                "failed to resolve master id after upsert".to_string(),
            )),
        }
    }

    pub fn normalize_esun_catalog_colors(&self) -> InventoryResult<EsunColorNormalizationStats> {
        let mut stmt = self.conn.prepare(
            "SELECT id, material, filament_name, color_name
             FROM filament_master_list
             WHERE lower(vendor) = 'esun'
             ORDER BY material, filament_name, color_name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        let mut scanned_count = 0i64;
        let mut normalized_count = 0i64;
        let mut merged_count = 0i64;
        let mut skipped_conflicts = 0i64;

        for row in rows {
            let (master_id, material, filament_name, color_name) = row?;
            scanned_count += 1;
            let normalized_color =
                normalize_esun_color_name_for_catalog(&color_name, &material, &filament_name);
            if normalized_color.eq_ignore_ascii_case(color_name.trim()) {
                continue;
            }

            let conflict: Option<(String, String)> = self
                .conn
                .query_row(
                    "SELECT id, vendor
                     FROM filament_master_list
                     WHERE id != ?1
                       AND material = ?2
                       AND filament_name = ?3
                       AND lower(color_name) = lower(?4)
                     LIMIT 1",
                    params![master_id, material, filament_name, normalized_color],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            if let Some((target_master_id, target_vendor)) = conflict {
                if target_vendor.eq_ignore_ascii_case("eSUN") {
                    self.conn.execute(
                        "UPDATE filament_spools
                         SET master_id = ?1
                         WHERE master_id = ?2",
                        params![target_master_id, master_id],
                    )?;
                    self.conn.execute(
                        "UPDATE wishlist_items
                         SET master_id = ?1,
                             material = ?2,
                             filament_name = ?3,
                             color_name = ?4,
                             vendor = 'eSUN',
                             updated_at = datetime('now')
                         WHERE master_id = ?5",
                        params![
                            target_master_id,
                            material,
                            filament_name,
                            normalized_color,
                            master_id
                        ],
                    )?;
                    self.conn.execute(
                        "UPDATE wishlist_items
                         SET material = ?1,
                             filament_name = ?2,
                             color_name = ?3,
                             vendor = 'eSUN',
                             updated_at = datetime('now')
                         WHERE master_id IS NULL
                           AND lower(vendor) = 'esun'
                           AND material = ?1
                           AND filament_name = ?2
                           AND color_name = ?4",
                        params![material, filament_name, normalized_color, color_name],
                    )?;
                    self.conn.execute(
                        "DELETE FROM filament_master_list WHERE id = ?1",
                        params![master_id],
                    )?;
                    normalized_count += 1;
                    merged_count += 1;
                } else {
                    skipped_conflicts += 1;
                }
                continue;
            }

            self.conn.execute(
                "UPDATE filament_master_list
                 SET color_name = ?1,
                     updated_at = datetime('now')
                 WHERE id = ?2",
                params![normalized_color, master_id],
            )?;
            self.conn.execute(
                "UPDATE wishlist_items
                 SET color_name = ?1,
                     updated_at = datetime('now')
                 WHERE master_id = ?2",
                params![normalized_color, master_id],
            )?;
            self.conn.execute(
                "UPDATE wishlist_items
                 SET color_name = ?1,
                     vendor = 'eSUN',
                     updated_at = datetime('now')
                 WHERE master_id IS NULL
                   AND lower(vendor) = 'esun'
                   AND material = ?2
                   AND filament_name = ?3
                   AND color_name = ?4",
                params![normalized_color, material, filament_name, color_name],
            )?;
            normalized_count += 1;
        }

        Ok(EsunColorNormalizationStats {
            scanned_count,
            normalized_count,
            merged_count,
            skipped_conflicts,
        })
    }

    pub fn update_master_catalog_entry(
        &self,
        input: MasterCatalogUpdateInput<'_>,
    ) -> InventoryResult<String> {
        let MasterCatalogUpdateInput {
            master_id,
            material,
            filament_name,
            color_name,
            hex_color,
            product_url,
            vendor,
            default_weight,
        } = input;
        let existing: Option<MasterCatalogExistingRow> = self
            .conn
            .query_row(
                "SELECT material, filament_name, color_name, hex_color, product_url, default_weight, vendor
                 FROM filament_master_list
                 WHERE id = ?1
                 LIMIT 1",
                params![master_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            old_material,
            old_filament_name,
            old_color_name,
            old_hex_color,
            old_product_url,
            old_default_weight,
            old_vendor,
        )) = existing
        else {
            return Err(InventoryError::NotFound);
        };

        let material = material.trim();
        let filament_name = filament_name.trim();
        let color_name = color_name.trim();
        if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
            return Err(InventoryError::Db(
                "material, filament name and color are required".to_string(),
            ));
        }

        let vendor = vendor
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(old_vendor.as_str())
            .to_string();
        let default_weight = default_weight.unwrap_or(old_default_weight).max(1);
        let normalized_hex = hex_color
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .or(old_hex_color);
        let normalized_product = product_url
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .or(old_product_url);

        let duplicate_master_id: Option<String> = self
            .conn
            .query_row(
                "SELECT id
                 FROM filament_master_list
                 WHERE id != ?1
                   AND material = ?2
                   AND filament_name = ?3
                   AND color_name = ?4
                 LIMIT 1",
                params![master_id, material, filament_name, color_name],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(target_master_id) = duplicate_master_id {
            self.conn.execute(
                "UPDATE filament_master_list
                 SET hex_color = COALESCE(?1, hex_color),
                     product_url = COALESCE(?2, product_url),
                     default_weight = ?3,
                     vendor = ?4,
                     is_discontinued = CASE WHEN ?4 = 'Bambu' THEN is_discontinued ELSE 0 END,
                     discontinued_at = CASE WHEN ?4 = 'Bambu' THEN discontinued_at ELSE NULL END,
                     last_seen_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?5",
                params![
                    normalized_hex,
                    normalized_product,
                    default_weight,
                    vendor,
                    target_master_id
                ],
            )?;
            self.conn.execute(
                "UPDATE filament_spools
                 SET master_id = ?1
                 WHERE master_id = ?2",
                params![target_master_id, master_id],
            )?;
            self.conn.execute(
                "UPDATE wishlist_items
                 SET master_id = ?1,
                     material = ?2,
                     filament_name = ?3,
                     color_name = ?4,
                     vendor = ?5,
                     updated_at = datetime('now')
                 WHERE master_id = ?6",
                params![
                    target_master_id,
                    material,
                    filament_name,
                    color_name,
                    vendor,
                    master_id
                ],
            )?;
            self.conn.execute(
                "UPDATE wishlist_items
                 SET material = ?1,
                     filament_name = ?2,
                     color_name = ?3,
                     vendor = ?4,
                     updated_at = datetime('now')
                 WHERE master_id IS NULL
                   AND lower(vendor) = lower(?5)
                   AND material = ?6
                   AND filament_name = ?7
                   AND color_name = ?8",
                params![
                    material,
                    filament_name,
                    color_name,
                    vendor,
                    old_vendor,
                    old_material,
                    old_filament_name,
                    old_color_name
                ],
            )?;
            self.conn.execute(
                "DELETE FROM filament_master_list WHERE id = ?1",
                params![master_id],
            )?;
            return Ok(target_master_id);
        }

        self.conn.execute(
            "UPDATE filament_master_list
             SET material = ?1,
                 filament_name = ?2,
                 color_name = ?3,
                 hex_color = ?4,
                 product_url = ?5,
                 default_weight = ?6,
                 vendor = ?7,
                 is_discontinued = CASE WHEN ?7 = 'Bambu' THEN is_discontinued ELSE 0 END,
                 discontinued_at = CASE WHEN ?7 = 'Bambu' THEN discontinued_at ELSE NULL END,
                 last_seen_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ?8",
            params![
                material,
                filament_name,
                color_name,
                normalized_hex,
                normalized_product,
                default_weight,
                vendor,
                master_id
            ],
        )?;
        self.conn.execute(
            "UPDATE wishlist_items
             SET material = ?1,
                 filament_name = ?2,
                 color_name = ?3,
                 vendor = ?4,
                 updated_at = datetime('now')
             WHERE master_id = ?5",
            params![material, filament_name, color_name, vendor, master_id],
        )?;
        self.conn.execute(
            "UPDATE wishlist_items
             SET material = ?1,
                 filament_name = ?2,
                 color_name = ?3,
                 vendor = ?4,
                 updated_at = datetime('now')
             WHERE master_id IS NULL
               AND lower(vendor) = lower(?5)
               AND material = ?6
               AND filament_name = ?7
               AND color_name = ?8",
            params![
                material,
                filament_name,
                color_name,
                vendor,
                old_vendor,
                old_material,
                old_filament_name,
                old_color_name
            ],
        )?;

        Ok(master_id.to_string())
    }

    pub fn insert_spool(&self, spool: &SpoolRow) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO filament_spools (
                id, master_id, qr_code, rfid_tag, rfid_observed_at, status, ownership_type, owner_name, owner_contact,
                ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                spool.id,
                spool.master_id,
                spool.qr_code,
                spool.rfid_tag,
                spool.rfid_observed_at,
                spool.status,
                spool.ownership_type,
                spool.owner_name,
                spool.owner_contact,
                spool.ownership_note,
                spool.initial_weight_g,
                spool.current_weight_g,
                spool.remaining_g,
                spool.spool_tare_weight_g,
                spool.location_id,
                spool.home_location_id,
                spool.purchase_date,
                spool.purchase_price,
                spool.batch_code,
                spool.last_used_at
            ],
        )?;
        Ok(())
    }

    pub fn get_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, master_id, qr_code, status, ownership_type, owner_name, owner_contact,
                    rfid_tag, rfid_observed_at, ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                    location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at
             FROM filament_spools
             WHERE qr_code = ?1 AND deleted_at IS NULL",
        )?;
        let row = stmt.query_row(params![qr_code], map_spool_row).optional()?;
        Ok(row)
    }

    pub fn get_spool_by_id(&self, spool_id: &str) -> InventoryResult<Option<SpoolRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, master_id, qr_code, status, ownership_type, owner_name, owner_contact,
                    rfid_tag, rfid_observed_at, ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                    location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at
             FROM filament_spools
             WHERE id = ?1
             LIMIT 1",
        )?;
        let row = stmt
            .query_row(params![spool_id], map_spool_row)
            .optional()?;
        Ok(row)
    }

    pub fn get_spool_with_master_by_id(
        &self,
        spool_id: &str,
    ) -> InventoryResult<Option<SpoolWithMasterRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.master_id, s.qr_code, s.status, s.ownership_type, s.owner_name,
                    s.owner_contact, s.rfid_tag, s.rfid_observed_at, s.ownership_note, s.initial_weight_g, s.current_weight_g,
                    s.remaining_g, s.spool_tare_weight_g, s.location_id, s.home_location_id, s.purchase_date,
                    s.purchase_price, s.batch_code, s.last_used_at, m.id, m.material,
                    m.filament_name, m.color_name, m.hex_color, m.product_url, m.default_weight, m.vendor
             FROM filament_spools s
             JOIN filament_master_list m ON m.id = s.master_id
             WHERE s.id = ?1 AND s.deleted_at IS NULL
             LIMIT 1",
        )?;
        let row = stmt
            .query_row(params![spool_id], map_spool_with_master_row)
            .optional()?;
        Ok(row)
    }

    pub fn update_spool_status(&self, spool_id: &str, status: &str) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET status = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND deleted_at IS NULL",
            params![status, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        current_weight_g: Option<i64>,
        remaining_g: Option<i64>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET current_weight_g = ?1, remaining_g = ?2, updated_at = datetime('now')
             WHERE id = ?3 AND deleted_at IS NULL",
            params![current_weight_g, remaining_g, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn update_spool_tare_weight(
        &self,
        spool_id: &str,
        spool_tare_weight_g: Option<i64>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET spool_tare_weight_g = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND deleted_at IS NULL",
            params![spool_tare_weight_g, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn update_spool_rfid_tag(
        &self,
        spool_id: &str,
        rfid_tag: Option<&str>,
        rfid_observed_at: Option<&str>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET rfid_tag = ?1, rfid_observed_at = ?2, updated_at = datetime('now')
             WHERE id = ?3 AND deleted_at IS NULL",
            params![
                normalize_optional_text(rfid_tag),
                normalize_optional_text(rfid_observed_at),
                spool_id
            ],
        )?;
        require_rows(affected)
    }

    pub fn set_spool_location(
        &self,
        spool_id: &str,
        location_id: Option<&str>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET location_id = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND deleted_at IS NULL",
            params![location_id, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn update_spool_details(
        &self,
        spool_id: &str,
        qr_code: Option<&str>,
        status: &str,
        location_id: Option<&str>,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET qr_code = ?1,
                 status = ?2,
                 location_id = ?3,
                 home_location_id = ?4,
                 updated_at = datetime('now')
             WHERE id = ?5 AND deleted_at IS NULL",
            params![qr_code, status, location_id, home_location_id, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn set_spool_home_location(
        &self,
        spool_id: &str,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET home_location_id = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND deleted_at IS NULL",
            params![home_location_id, spool_id],
        )?;
        require_rows(affected)
    }

    pub fn update_spool_ownership_metadata(
        &self,
        spool_id: &str,
        owner_name: Option<&str>,
        owner_contact: Option<&str>,
        ownership_note: Option<&str>,
    ) -> InventoryResult<()> {
        let affected = self.conn.execute(
            "UPDATE filament_spools
             SET owner_name = ?1,
                 owner_contact = ?2,
                 ownership_note = ?3,
                 updated_at = datetime('now')
             WHERE id = ?4
               AND deleted_at IS NULL",
            params![
                normalize_optional_text(owner_name),
                normalize_optional_text(owner_contact),
                normalize_optional_text(ownership_note),
                spool_id
            ],
        )?;
        require_rows(affected)
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
        let tx = self.conn.unchecked_transaction()?;
        let active_loan_exists: Option<i64> = tx
            .query_row(
                "SELECT 1
                 FROM spool_loans
                 WHERE spool_id = ?1
                   AND returned_at IS NULL
                 LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if active_loan_exists.is_some() {
            return Err(InventoryError::InvalidOperation(
                "spool has an active loan; return it before deleting".to_string(),
            ));
        }

        let affected = tx.execute(
            "UPDATE filament_spools
             SET deleted_at = datetime('now'),
                 status = 'DELETED',
                 location_id = NULL,
                 updated_at = datetime('now')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![spool_id],
        )?;
        require_rows(affected)?;
        tx.execute(
            "UPDATE ams_slots
             SET spool_id = NULL,
                 last_seen_at = datetime('now')
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn purge_spool(&self, spool_id: &str) -> InventoryResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        let exists: Option<i64> = tx
            .query_row(
                "SELECT 1
                 FROM filament_spools
                 WHERE id = ?1
                 LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err(InventoryError::NotFound);
        }

        tx.execute(
            "UPDATE ams_slots
             SET spool_id = NULL
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM weight_readings
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM spool_loans
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM scan_events
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM label_print_jobs
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM print_jobs
             WHERE spool_id = ?1",
            params![spool_id],
        )?;
        tx.execute(
            "DELETE FROM spool_history_events
             WHERE spool_id = ?1",
            params![spool_id],
        )?;

        let removed = tx.execute(
            "DELETE FROM filament_spools
             WHERE id = ?1",
            params![spool_id],
        )?;
        require_rows(removed)?;

        tx.commit()?;
        Ok(())
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
        self.ensure_catalog_lifecycle_columns()?;

        let reactivated = self.conn.execute(
            "UPDATE filament_master_list
             SET is_discontinued = 0,
                 discontinued_at = NULL,
                 updated_at = datetime('now')
             WHERE vendor = ?2
               AND last_seen_at IS NOT NULL
               AND last_seen_at >= ?1",
            params![refresh_started_at, vendor],
        )? as i64;

        let discontinued = self.conn.execute(
            "UPDATE filament_master_list
             SET is_discontinued = 1,
                 discontinued_at = COALESCE(discontinued_at, datetime('now')),
                 updated_at = datetime('now')
             WHERE vendor = ?2
               AND (last_seen_at IS NULL OR last_seen_at < ?1)",
            params![refresh_started_at, vendor],
        )? as i64;

        Ok(CatalogLifecycleStats {
            reactivated_count: reactivated,
            discontinued_count: discontinued,
        })
    }

    pub fn apply_bambu_discontinued_rules(
        &self,
        refresh_started_at: &str,
    ) -> InventoryResult<CatalogLifecycleStats> {
        self.apply_vendor_discontinued_rules("Bambu", refresh_started_at)
    }

    pub fn ensure_scale(&self, scale_id: &str, name: &str, protocol: &str) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO scales (id, name, protocol)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                protocol = excluded.protocol,
                updated_at = datetime('now')",
            params![scale_id, name, protocol],
        )?;
        Ok(())
    }

    pub fn insert_weight_reading(
        &self,
        scale_id: &str,
        spool_id: &str,
        grams: i64,
        source: &str,
    ) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO weight_readings (id, scale_id, spool_id, grams, captured_at, source)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5)",
            params![new_id(), scale_id, spool_id, grams, source],
        )?;
        Ok(())
    }

    pub fn insert_scan_event(
        &self,
        spool_id: Option<&str>,
        qr_code: Option<&str>,
        source: &str,
        detected_color_hex: Option<&str>,
    ) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO scan_events (id, spool_id, qr_code, source, detected_color_hex)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id(), spool_id, qr_code, source, detected_color_hex],
        )?;
        Ok(())
    }

    pub fn insert_spool_history_event(
        &self,
        spool_id: &str,
        event_type: &str,
        payload_json: &str,
    ) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO spool_history_events (id, spool_id, event_type, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![new_id(), spool_id, event_type, payload_json],
        )?;
        Ok(())
    }

    pub fn list_spool_history_events(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, spool_id, event_type, payload_json, created_at
             FROM spool_history_events
             WHERE spool_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![spool_id, limit], |row| {
            let payload_raw: String = row.get(3)?;
            let payload_json = serde_json::from_str::<Value>(&payload_raw).unwrap_or(Value::Null);
            Ok(SpoolHistoryEventRow {
                id: row.get(0)?,
                spool_id: row.get(1)?,
                event_type: row.get(2)?,
                payload_json,
                created_at: row.get(4)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn list_spool_usage_points(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolUsagePointRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT captured_at, grams, source
             FROM weight_readings
             WHERE spool_id = ?1
             ORDER BY captured_at ASC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![spool_id, limit], |row| {
            Ok(SpoolUsagePointRow {
                captured_at: row.get(0)?,
                grams: row.get(1)?,
                source: row.get(2)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn list_spools_with_master(
        &self,
        limit: i64,
        offset: i64,
    ) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.master_id, s.qr_code, s.status, s.ownership_type, s.owner_name,
                    s.owner_contact, s.rfid_tag, s.rfid_observed_at, s.ownership_note, s.initial_weight_g, s.current_weight_g,
                    s.remaining_g, s.spool_tare_weight_g, s.location_id, s.home_location_id, s.purchase_date,
                    s.purchase_price, s.batch_code, s.last_used_at, m.id, m.material,
                    m.filament_name, m.color_name, m.hex_color, m.product_url, m.default_weight, m.vendor
             FROM filament_spools s
             JOIN filament_master_list m ON m.id = s.master_id
             WHERE s.deleted_at IS NULL
             ORDER BY s.updated_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let rows = stmt.query_map(params![limit, offset], map_spool_with_master_row)?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn list_low_stock_spools(&self, threshold: i64) -> InventoryResult<Vec<SpoolRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, master_id, qr_code, status, ownership_type, owner_name, owner_contact,
                    rfid_tag, rfid_observed_at, ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                    location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at
             FROM filament_spools
             WHERE deleted_at IS NULL
               AND remaining_g IS NOT NULL
               AND remaining_g > 0
               AND remaining_g <= ?1
               AND status NOT IN ('EMPTY', 'LOST')",
        )?;
        let rows = stmt.query_map(params![threshold], map_spool_row)?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
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
        let found: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1
                 FROM ams_slots s
                 JOIN ams_units u ON u.id = s.ams_id
                 JOIN printers p ON p.id = u.printer_id
                 WHERE s.spool_id = ?1
                 LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }

    pub fn spool_assigned_to_specific_printer(
        &self,
        spool_id: &str,
        printer_id: &str,
    ) -> InventoryResult<bool> {
        let found: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1
                 FROM ams_slots s
                 JOIN ams_units u ON u.id = s.ams_id
                 WHERE s.spool_id = ?1
                   AND u.printer_id = ?2
                 LIMIT 1",
                params![spool_id, printer_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }

    pub fn create_spool_loan(
        &self,
        spool_id: &str,
        borrower_name: &str,
        grams_out: i64,
        lent_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        let borrower = borrower_name.trim();
        if borrower.is_empty() {
            return Err(InventoryError::Db("borrower name is required".to_string()));
        }

        let tx = self.conn.unchecked_transaction()?;
        let spool_exists: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM filament_spools WHERE id = ?1 AND deleted_at IS NULL LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if spool_exists.is_none() {
            return Err(InventoryError::NotFound);
        }

        let already_loaned: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM spool_loans WHERE spool_id = ?1 AND returned_at IS NULL LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if already_loaned.is_some() {
            return Err(InventoryError::Db(
                "this spool already has an active loan".to_string(),
            ));
        }

        tx.execute(
            "UPDATE ams_slots
             SET spool_id = NULL, last_seen_at = datetime('now')
             WHERE spool_id = ?1",
            params![spool_id],
        )?;

        let loan_id = new_id();
        tx.execute(
            "INSERT INTO spool_loans (
                id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
                counterparty_contact, counterparty_note, grams_out, lent_note, lent_at
            ) VALUES (?1, ?2, ?3, 'OUTBOUND', 'ACTIVE', ?3, NULL, NULL, ?4, ?5, datetime('now'))",
            params![loan_id, spool_id, borrower, grams_out.max(0), lent_note],
        )?;

        let location = format!("Loaned to: {borrower}");
        tx.execute(
            "INSERT INTO inventory_locations (id, name, type)
             VALUES (?1, ?2, 'LOAN')
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name",
            params![location, location],
        )?;
        tx.execute(
            "UPDATE filament_spools
             SET status = 'BORROWED',
                 location_id = ?2,
                 current_weight_g = ?3,
                 remaining_g = ?3,
                 updated_at = datetime('now')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![spool_id, location, grams_out.max(0)],
        )?;

        let loan = tx.query_row(
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
        Ok(loan)
    }

    pub fn spool_has_active_loan(&self, spool_id: &str) -> InventoryResult<bool> {
        let exists: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1
                 FROM spool_loans
                 WHERE spool_id = ?1
                   AND returned_at IS NULL
                 LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    }

    pub fn create_inbound_spool_loan(
        &self,
        spool_id: &str,
        counterparty_name: &str,
        counterparty_contact: Option<&str>,
        counterparty_note: Option<&str>,
        grams_out: i64,
    ) -> InventoryResult<SpoolLoanRow> {
        let counterparty = counterparty_name.trim();
        if counterparty.is_empty() {
            return Err(InventoryError::Db(
                "counterparty name is required".to_string(),
            ));
        }

        let tx = self.conn.unchecked_transaction()?;
        let spool_exists: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM filament_spools WHERE id = ?1 AND deleted_at IS NULL LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if spool_exists.is_none() {
            return Err(InventoryError::NotFound);
        }

        let already_loaned: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM spool_loans WHERE spool_id = ?1 AND returned_at IS NULL LIMIT 1",
                params![spool_id],
                |row| row.get(0),
            )
            .optional()?;
        if already_loaned.is_some() {
            return Err(InventoryError::Db(
                "this spool already has an active loan".to_string(),
            ));
        }

        let loan_id = new_id();
        tx.execute(
            "INSERT INTO spool_loans (
                id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
                counterparty_contact, counterparty_note, grams_out, lent_note, lent_at
            ) VALUES (?1, ?2, ?3, 'INBOUND', 'ACTIVE', ?3, ?4, ?5, ?6, ?5, datetime('now'))",
            params![
                loan_id,
                spool_id,
                counterparty,
                normalize_optional_text(counterparty_contact),
                normalize_optional_text(counterparty_note),
                grams_out.max(0)
            ],
        )?;

        let loan = tx.query_row(
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
        Ok(loan)
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
        let mut stmt = self.conn.prepare(
            "SELECT
                l.id, l.spool_id, l.borrower_name,
                COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
                COALESCE(NULLIF(l.loan_status, ''), CASE
                    WHEN l.returned_at IS NULL THEN 'ACTIVE'
                    ELSE 'RETURNED'
                END) AS loan_status,
                COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
                l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
                l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
                s.status, s.remaining_g, s.spool_tare_weight_g,
                m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
             FROM spool_loans l
             JOIN filament_spools s ON s.id = l.spool_id
             JOIN filament_master_list m ON m.id = s.master_id
             WHERE COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'
               AND l.returned_at IS NULL
               AND s.deleted_at IS NULL
             ORDER BY l.lent_at DESC",
        )?;

        let rows = stmt.query_map([], map_active_spool_loan_row)?;
        let mut output = Vec::new();
        for row in rows {
            output.push(row?);
        }
        Ok(output)
    }

    pub fn find_active_spool_loan_for_direction(
        &self,
        spool_id: &str,
        direction: &str,
    ) -> InventoryResult<Option<ActiveSpoolLoanRow>> {
        let loan_direction = if direction.trim().eq_ignore_ascii_case("INBOUND") {
            "INBOUND"
        } else {
            "OUTBOUND"
        };

        self.conn
            .query_row(
                "SELECT
                    l.id, l.spool_id, l.borrower_name,
                    COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
                    COALESCE(NULLIF(l.loan_status, ''), CASE
                        WHEN l.returned_at IS NULL THEN 'ACTIVE'
                        ELSE 'RETURNED'
                    END) AS loan_status,
                    COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
                    l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
                    l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
                    s.status, s.remaining_g, s.spool_tare_weight_g,
                    m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
                 FROM spool_loans l
                 JOIN filament_spools s ON s.id = l.spool_id
                 JOIN filament_master_list m ON m.id = s.master_id
                 WHERE l.spool_id = ?1
                   AND COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = ?2
                   AND l.returned_at IS NULL
                   AND s.deleted_at IS NULL
                 LIMIT 1",
                params![spool_id, loan_direction],
                map_active_spool_loan_row,
            )
            .optional()
            .map_err(InventoryError::from)
    }

    pub fn list_loan_usage_by_person_for_direction(
        &self,
        limit: i64,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<LoanUsageByPersonRow>> {
        let direction_clause = match normalize_loan_direction_filter(direction).as_str() {
            "INBOUND" => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'INBOUND'",
            "ALL" => "1 = 1",
            _ => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'",
        };
        let mut stmt = self.conn.prepare(
            &format!(
                "SELECT
                COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
                COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS borrower_name,
                COALESCE(SUM(l.consumed_grams), 0) AS total_consumed_g,
                COALESCE(SUM(CASE WHEN l.returned_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_loans,
                COALESCE(SUM(CASE
                    WHEN l.returned_at IS NULL AND s.id IS NOT NULL AND s.deleted_at IS NULL THEN 1
                    ELSE 0
                END), 0) AS active_loans
             FROM spool_loans l
             LEFT JOIN filament_spools s ON s.id = l.spool_id
             WHERE {}
             GROUP BY
                COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND'),
                COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name)
             HAVING total_consumed_g > 0
                OR completed_loans > 0
                OR active_loans > 0
             ORDER BY total_consumed_g DESC, borrower_name ASC
             LIMIT ?1",
                direction_clause
            ),
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(LoanUsageByPersonRow {
                loan_direction: row.get(0)?,
                borrower_name: row.get(1)?,
                total_consumed_g: row.get(2)?,
                completed_loans: row.get(3)?,
                active_loans: row.get(4)?,
            })
        })?;
        let mut output = Vec::new();
        for row in rows {
            output.push(row?);
        }
        Ok(output)
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
        let direction_clause = match normalize_loan_direction_filter(direction).as_str() {
            "INBOUND" => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'INBOUND'",
            "ALL" => "1 = 1",
            _ => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'",
        };
        let status_clause = if include_returned {
            "1 = 1"
        } else {
            "l.returned_at IS NULL AND s.deleted_at IS NULL"
        };
        let mut stmt = self.conn.prepare(&format!(
            "SELECT
                l.id, l.spool_id, l.borrower_name,
                COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
                COALESCE(NULLIF(l.loan_status, ''), CASE
                    WHEN l.returned_at IS NULL THEN 'ACTIVE'
                    ELSE 'RETURNED'
                END) AS loan_status,
                COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
                l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
                l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
                s.status, s.remaining_g, s.spool_tare_weight_g,
                m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
             FROM spool_loans l
             LEFT JOIN filament_spools s ON s.id = l.spool_id
             LEFT JOIN filament_master_list m ON m.id = s.master_id
             WHERE {}
               AND {}
             ORDER BY l.lent_at DESC
             LIMIT ?1",
            direction_clause, status_clause
        ))?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(SpoolLoanDetailsRow {
                loan: SpoolLoanRow {
                    id: row.get(0)?,
                    spool_id: row.get(1)?,
                    borrower_name: row.get(2)?,
                    loan_direction: row.get(3)?,
                    loan_status: row.get(4)?,
                    counterparty_name: row.get(5)?,
                    counterparty_contact: row.get(6)?,
                    counterparty_note: row.get(7)?,
                    grams_out: row.get(8)?,
                    lent_note: row.get(9)?,
                    lent_at: row.get(10)?,
                    expected_return_at: row.get(11)?,
                    returned_at: row.get(12)?,
                    returned_grams: row.get(13)?,
                    consumed_grams: row.get(14)?,
                    return_note: row.get(15)?,
                },
                spool_status: row.get(16)?,
                spool_remaining_g: row.get(17)?,
                spool_tare_weight_g: row.get(18)?,
                material: row.get(19)?,
                filament_name: row.get(20)?,
                color_name: row.get(21)?,
                vendor: row.get(22)?,
                hex_color: row.get(23)?,
            })
        })?;

        let mut output = Vec::new();
        for row in rows {
            output.push(row?);
        }
        Ok(output)
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
        let mut output = String::from(
            "loan_id,spool_id,direction,counterparty,grams_out,lent_at,returned_at,returned_grams,consumed_grams,material,filament,color,vendor,status\n",
        );
        for row in rows {
            output.push_str(&format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
                escape_csv(&row.loan.id),
                escape_csv(&row.loan.spool_id),
                escape_csv(&row.loan.loan_direction),
                escape_csv(&row.loan.counterparty_name),
                row.loan.grams_out,
                escape_csv(&row.loan.lent_at),
                escape_csv(row.loan.returned_at.as_deref().unwrap_or("")),
                row.loan.returned_grams.unwrap_or(0),
                row.loan.consumed_grams.unwrap_or(0),
                escape_csv(row.material.as_deref().unwrap_or("")),
                escape_csv(row.filament_name.as_deref().unwrap_or("")),
                escape_csv(row.color_name.as_deref().unwrap_or("")),
                escape_csv(row.vendor.as_deref().unwrap_or("")),
                escape_csv(row.spool_status.as_deref().unwrap_or("")),
            ));
        }
        Ok(output)
    }

    pub fn list_printers(&self) -> InventoryResult<Vec<PrinterRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, model, name, created_at, updated_at
             FROM printers
             ORDER BY created_at ASC, name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PrinterRow {
                id: row.get(0)?,
                model: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn printer_exists(&self, printer_id: &str) -> InventoryResult<bool> {
        let found: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1
                 FROM printers
                 WHERE id = ?1
                 LIMIT 1",
                params![printer_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
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
        let now = self
            .conn
            .query_row("SELECT datetime('now')", [], |row| row.get::<_, String>(0))?;
        self.set_setting("library_sync_last_checked_at", &now)?;
        if reachable {
            self.set_setting("library_sync_last_reachable_at", &now)?;
        }
        match message.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => self.set_setting("library_sync_last_validation_message", value)?,
            None => self.delete_setting("library_sync_last_validation_message")?,
        }
        match host_device_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(value) => self.set_setting("library_sync_host_device_name", value)?,
            None => self.delete_setting("library_sync_host_device_name")?,
        }
        Ok(())
    }

    pub fn save_library_sync_client_auth_state(
        &self,
        session_id: &str,
        device_token: &str,
        csrf_token: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        let paired_at = self.current_timestamp()?;
        self.set_setting("library_sync_client_session_id", session_id.trim())?;
        self.set_setting("library_sync_client_device_token", device_token.trim())?;
        self.set_setting("library_sync_client_csrf_token", csrf_token.trim())?;
        self.set_setting("library_sync_client_auth_paired_at", &paired_at)?;
        match expires_at.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => self.set_setting("library_sync_client_auth_expires_at", value)?,
            None => self.delete_setting("library_sync_client_auth_expires_at")?,
        }
        Ok(())
    }

    pub fn clear_library_sync_client_auth_state(&self) -> InventoryResult<()> {
        self.delete_setting("library_sync_client_session_id")?;
        self.delete_setting("library_sync_client_device_token")?;
        self.delete_setting("library_sync_client_csrf_token")?;
        self.delete_setting("library_sync_client_auth_paired_at")?;
        self.delete_setting("library_sync_client_auth_expires_at")?;
        Ok(())
    }

    pub fn get_library_sync_client_auth_state(
        &self,
    ) -> InventoryResult<Option<LibrarySyncClientAuthState>> {
        let session_id = self
            .get_setting("library_sync_client_session_id")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let device_token = self
            .get_setting("library_sync_client_device_token")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let csrf_token = self
            .get_setting("library_sync_client_csrf_token")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let expires_at = self
            .get_setting("library_sync_client_auth_expires_at")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        match (session_id, device_token, csrf_token) {
            (Some(session_id), Some(device_token), Some(csrf_token)) => {
                Ok(Some((session_id, device_token, csrf_token, expires_at)))
            }
            _ => Ok(None),
        }
    }

    pub fn save_library_sync_cached_snapshot(
        &self,
        snapshot: &LibrarySyncCachedSnapshotRow,
    ) -> InventoryResult<()> {
        let serialized = serde_json::to_string(snapshot)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.set_setting("library_sync_cached_snapshot_json", &serialized)?;
        Ok(())
    }

    pub fn save_library_sync_cached_spools(
        &self,
        rows: &[SpoolWithMasterRow],
    ) -> InventoryResult<()> {
        let payload = LibrarySyncCachedSpoolListRow {
            captured_at: self.current_timestamp()?,
            rows: rows.to_vec(),
        };
        let serialized = serde_json::to_string(&payload)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.set_setting("library_sync_cached_spools_json", &serialized)?;
        Ok(())
    }

    pub fn save_library_sync_cached_printers(
        &self,
        rows: &[PrinterOverviewRow],
    ) -> InventoryResult<()> {
        let payload = LibrarySyncCachedPrinterOverviewRow {
            captured_at: self.current_timestamp()?,
            rows: rows.to_vec(),
        };
        let serialized = serde_json::to_string(&payload)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.set_setting("library_sync_cached_printers_json", &serialized)?;
        Ok(())
    }

    pub fn save_library_sync_cached_loans(
        &self,
        rows: &[SpoolLoanDetailsRow],
    ) -> InventoryResult<()> {
        let payload = LibrarySyncCachedLoanListRow {
            captured_at: self.current_timestamp()?,
            rows: rows.to_vec(),
        };
        let serialized = serde_json::to_string(&payload)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.set_setting("library_sync_cached_loans_json", &serialized)?;
        Ok(())
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
        let pairing_id = new_id();
        let expiry_modifier = format!("+{} seconds", expires_in_seconds.max(1));
        self.conn.execute(
            "INSERT INTO trusted_lan_pairings (
                id, display_name, pairing_token_hash, expires_at
            ) VALUES (?1, ?2, ?3, datetime('now', ?4))",
            params![
                pairing_id,
                display_name
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                pairing_token_hash.trim(),
                expiry_modifier
            ],
        )?;
        Ok(pairing_id)
    }

    pub fn consume_trusted_lan_pairing(
        &self,
        pairing_token_hash: &str,
    ) -> InventoryResult<Option<Option<String>>> {
        let pairing = self
            .conn
            .query_row(
                "SELECT id, display_name
                 FROM trusted_lan_pairings
                 WHERE pairing_token_hash = ?1
                   AND used_at IS NULL
                   AND expires_at >= datetime('now')
                 LIMIT 1",
                params![pairing_token_hash.trim()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?;

        let Some((pairing_id, display_name)) = pairing else {
            return Ok(None);
        };

        let updated = self.conn.execute(
            "UPDATE trusted_lan_pairings
             SET used_at = datetime('now')
             WHERE id = ?1
               AND used_at IS NULL
               AND expires_at >= datetime('now')",
            params![pairing_id],
        )?;
        if updated == 0 {
            return Ok(None);
        }

        Ok(Some(display_name))
    }

    pub fn create_trusted_lan_paired_browser(
        &self,
        display_name: Option<&str>,
        device_token_hash: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<TrustedLanPairedBrowserRow> {
        let browser_id = new_id();
        self.conn.execute(
            "INSERT INTO trusted_lan_paired_browsers (
                id, display_name, device_token_hash, last_seen_at, last_origin
            ) VALUES (?1, ?2, ?3, datetime('now'), ?4)",
            params![
                browser_id,
                display_name
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                device_token_hash.trim(),
                last_origin.map(str::trim).filter(|value| !value.is_empty())
            ],
        )?;
        self.get_trusted_lan_paired_browser_by_id(&browser_id)
            .and_then(|value| {
                value.ok_or_else(|| {
                    InventoryError::Db(
                        "Failed to resolve trusted-LAN paired browser after insert".to_string(),
                    )
                })
            })
    }

    pub fn get_trusted_lan_paired_browser_by_id(
        &self,
        browser_id: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        self.conn
            .query_row(
                "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
                 FROM trusted_lan_paired_browsers
                 WHERE id = ?1
                 LIMIT 1",
                params![browser_id.trim()],
                map_trusted_lan_paired_browser_row,
            )
            .optional()
            .map_err(InventoryError::from)
    }

    pub fn get_active_trusted_lan_paired_browser_by_device_token_hash(
        &self,
        device_token_hash: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        self.conn
            .query_row(
                "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
                 FROM trusted_lan_paired_browsers
                 WHERE device_token_hash = ?1
                   AND revoked_at IS NULL
                 LIMIT 1",
                params![device_token_hash.trim()],
                map_trusted_lan_paired_browser_row,
            )
            .optional()
            .map_err(InventoryError::from)
    }

    pub fn list_trusted_lan_paired_browsers(
        &self,
    ) -> InventoryResult<Vec<TrustedLanPairedBrowserRow>> {
        let mut results = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
             FROM trusted_lan_paired_browsers
             ORDER BY revoked_at IS NULL DESC, COALESCE(last_seen_at, paired_at) DESC, paired_at DESC",
        )?;
        let rows = stmt.query_map([], map_trusted_lan_paired_browser_row)?;
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn touch_trusted_lan_paired_browser(
        &self,
        browser_id: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<()> {
        let updated = self.conn.execute(
            "UPDATE trusted_lan_paired_browsers
             SET last_seen_at = datetime('now'),
                 last_origin = COALESCE(?1, last_origin)
             WHERE id = ?2
               AND revoked_at IS NULL",
            params![
                last_origin.map(str::trim).filter(|value| !value.is_empty()),
                browser_id.trim()
            ],
        )?;
        require_rows(updated)
    }

    pub fn revoke_trusted_lan_paired_browser(&self, browser_id: &str) -> InventoryResult<()> {
        let updated = self.conn.execute(
            "UPDATE trusted_lan_paired_browsers
             SET revoked_at = COALESCE(revoked_at, datetime('now'))
             WHERE id = ?1",
            params![browser_id.trim()],
        )?;
        require_rows(updated)
    }

    pub fn revoke_all_trusted_lan_paired_browsers(&self) -> InventoryResult<usize> {
        let updated = self.conn.execute(
            "UPDATE trusted_lan_paired_browsers
             SET revoked_at = COALESCE(revoked_at, datetime('now'))
             WHERE revoked_at IS NULL",
            [],
        )?;
        Ok(updated)
    }

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        let printers = self.list_printers()?;
        let mut output = Vec::with_capacity(printers.len());

        for printer in printers {
            let usage = self.conn.query_row(
                "SELECT
                    COUNT(*) AS total_jobs,
                    COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS successful_jobs,
                    COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failed_jobs,
                    COALESCE(SUM(material_used_g), 0) AS total_used_g,
                    MAX(ended_at) AS last_job_at
                 FROM print_jobs
                 WHERE printer_id = ?1",
                params![&printer.id],
                |row| {
                    Ok(PrinterUsageRow {
                        total_jobs: row.get(0)?,
                        successful_jobs: row.get(1)?,
                        failed_jobs: row.get(2)?,
                        total_used_g: row.get(3)?,
                        last_job_at: row.get(4)?,
                    })
                },
            )?;

            let mut stmt = self.conn.prepare(
                "SELECT
                    s.id, s.ams_id, s.slot_index, s.spool_id,
                    sp.status,
                    CASE
                        WHEN sp.id IS NULL THEN NULL
                        ELSE COALESCE(NULLIF(sp.ownership_type, ''), 'OWNED')
                    END AS spool_ownership_type,
                    NULLIF(sp.owner_name, '') AS spool_owner_name,
                    sp.remaining_g,
                    sp.rfid_tag,
                    m.material, m.filament_name, m.color_name, m.hex_color,
                    s.rfid_override_tray_uuid, s.rfid_override_color_hex,
                    s.live_cache_cleared_at
                 FROM ams_slots s
                 JOIN ams_units u ON u.id = s.ams_id
                 LEFT JOIN filament_spools sp ON sp.id = s.spool_id AND sp.deleted_at IS NULL
                 LEFT JOIN filament_master_list m ON m.id = sp.master_id
                 WHERE u.printer_id = ?1
                 ORDER BY
                    CASE WHEN u.id LIKE '%_ext' THEN 1 ELSE 0 END ASC,
                    CASE WHEN u.id LIKE '%_ams_%' THEN 0 ELSE 1 END ASC,
                    CASE
                        WHEN u.id LIKE '%_ams_%'
                        THEN CAST(substr(u.id, instr(u.id, '_ams_') + 5) AS INTEGER)
                        ELSE NULL
                    END ASC,
                    u.id COLLATE NOCASE ASC,
                    s.slot_index ASC,
                    s.id COLLATE NOCASE ASC",
            )?;
            let rows = stmt.query_map(params![&printer.id], |row| {
                Ok(PrinterAmsSlotRow {
                    slot_id: row.get(0)?,
                    ams_id: row.get(1)?,
                    slot_index: row.get(2)?,
                    spool_id: row.get(3)?,
                    spool_status: row.get(4)?,
                    spool_ownership_type: row.get(5)?,
                    spool_owner_name: row.get(6)?,
                    spool_remaining_g: row.get(7)?,
                    spool_rfid_tag: row.get(8)?,
                    spool_material: row.get(9)?,
                    spool_filament_name: row.get(10)?,
                    spool_color_name: row.get(11)?,
                    spool_hex_color: row.get(12)?,
                    rfid_override_tray_uuid: row.get(13)?,
                    rfid_override_color_hex: row.get(14)?,
                    live_cache_cleared_at: row.get(15)?,
                    live_loaded: None,
                    live_observed_rfid_tag: None,
                    live_tray_uuid: None,
                    live_chip_id: None,
                    live_tray_info_idx: None,
                    live_tray_id_name: None,
                    live_filament_type: None,
                    live_filament_name: None,
                    live_color_hex: None,
                    live_tray_weight_g: None,
                    live_remaining_percent: None,
                    live_last_identity_seen_at: None,
                    live_match_status: None,
                    live_match_note: None,
                    live_matched_inventory_spool_id: None,
                    live_matched_inventory_mode: None,
                    live_is_active: None,
                    live_printer_last_seen_at: None,
                    live_mqtt_connected: None,
                    live_ams_read_done_bits: None,
                    live_ams_bambu_bits: None,
                })
            })?;
            let mut slots = Vec::new();
            for row in rows {
                slots.push(row?);
            }

            output.push(PrinterOverviewRow {
                printer,
                usage,
                slots,
            });
        }

        Ok(output)
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
        let id = new_id();
        self.conn.execute(
            "INSERT INTO print_jobs (
                id, printer_id, spool_id, job_name, started_at, ended_at, material_used_g, success
             ) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'), ?5, ?6)",
            params![
                id,
                printer_id,
                spool_id,
                job_name,
                material_used_g,
                if success { 1 } else { 0 }
            ],
        )?;
        Ok(id)
    }

    pub fn reset_app_state_data(&self) -> InventoryResult<()> {
        self.conn
            .execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")?;

        let result: InventoryResult<()> = (|| {
            delete_all_rows(&self.conn, &RESET_APP_STATE_TABLES)?;

            ensure_no_foreign_key_violations(&self.conn, "App-state reset")?;

            Ok(())
        })();

        match result {
            Ok(()) => match self.conn.execute_batch("COMMIT") {
                Ok(()) => {
                    self.conn.execute_batch("PRAGMA foreign_keys = ON;")?;
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

    pub fn reset_catalog_data(&self) -> InventoryResult<CatalogResetStats> {
        let tx = self.conn.unchecked_transaction()?;

        let removed_count = tx.execute(
            "DELETE FROM filament_master_list
             WHERE id NOT IN (SELECT master_id FROM filament_spools)
               AND id NOT IN (
                 SELECT master_id FROM wishlist_items WHERE master_id IS NOT NULL
               )",
            [],
        )? as i64;

        let reactivated_count = tx.execute(
            "UPDATE filament_master_list
             SET is_discontinued = 0,
                 discontinued_at = NULL,
                 last_seen_at = NULL,
                 updated_at = datetime('now')
             WHERE is_discontinued != 0
                OR discontinued_at IS NOT NULL
                OR last_seen_at IS NOT NULL",
            [],
        )? as i64;

        let remaining_count: i64 =
            tx.query_row("SELECT COUNT(*) FROM filament_master_list", [], |row| {
                row.get(0)
            })?;

        tx.commit()?;
        Ok(CatalogResetStats {
            removed_count,
            remaining_count,
            reactivated_count,
        })
    }

    pub fn insert_alert(&self, alert_type: &str, payload_json: &str) -> InventoryResult<()> {
        self.conn.execute(
            "INSERT INTO alerts (id, type, payload_json) VALUES (?1, ?2, ?3)",
            params![new_id(), alert_type, payload_json],
        )?;
        Ok(())
    }

    pub fn alert_exists_for_spool(
        &self,
        alert_type: &str,
        spool_id: &str,
    ) -> InventoryResult<bool> {
        let pattern = format!("%\\\"spool_id\\\":\\\"{}\\\"%", spool_id);
        let mut stmt = self.conn.prepare(
            "SELECT 1 FROM alerts
             WHERE type = ?1 AND resolved_at IS NULL AND payload_json LIKE ?2
             LIMIT 1",
        )?;
        let row: Option<i64> = stmt
            .query_row(params![alert_type, pattern], |row| row.get(0))
            .optional()?;
        Ok(row.is_some())
    }

    pub fn export_spools_csv(&self) -> InventoryResult<String> {
        let rows = self.list_spools_with_master(10_000, 0)?;
        let mut output = String::from(
            "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code\n",
        );
        for entry in rows {
            output.push_str(&format!(
                "{},{},{},{},{},{},{},{}\n",
                escape_csv(&entry.spool.id),
                escape_csv(&entry.master.material),
                escape_csv(&entry.master.filament_name),
                escape_csv(&entry.master.color_name),
                escape_csv(&entry.spool.status),
                entry.spool.remaining_g.unwrap_or(0),
                escape_csv(entry.spool.location_id.as_deref().unwrap_or("")),
                escape_csv(entry.spool.qr_code.as_deref().unwrap_or("")),
            ));
        }
        Ok(output)
    }

    pub fn export_spools_json(&self) -> InventoryResult<String> {
        let rows = self.list_spools_with_master(10_000, 0)?;
        let mut output = String::from("[");
        for (index, entry) in rows.iter().enumerate() {
            if index > 0 {
                output.push(',');
            }
            output.push_str(&format!(
                "{{\"spool_id\":\"{}\",\"material\":\"{}\",\"filament_name\":\"{}\",\"color_name\":\"{}\",\"status\":\"{}\",\"remaining_g\":{},\"location\":\"{}\",\"qr_code\":\"{}\"}}",
                escape_json(&entry.spool.id),
                escape_json(&entry.master.material),
                escape_json(&entry.master.filament_name),
                escape_json(&entry.master.color_name),
                escape_json(&entry.spool.status),
                entry.spool.remaining_g.unwrap_or(0),
                escape_json(entry.spool.location_id.as_deref().unwrap_or("")),
                escape_json(entry.spool.qr_code.as_deref().unwrap_or("")),
            ));
        }
        output.push(']');
        Ok(output)
    }

    pub fn export_full_backup_json(&self) -> InventoryResult<String> {
        let exported_at: String = self
            .conn
            .query_row("SELECT datetime('now')", [], |row| row.get(0))?;

        let mut tables = Map::new();
        for table in FULL_BACKUP_TABLES {
            tables.insert(
                table.to_string(),
                Value::Array(self.export_table_rows(table)?),
            );
        }

        let mut root = Map::new();
        root.insert(
            "format".to_string(),
            Value::String("filament-manager-backup-v1".to_string()),
        );
        root.insert("exported_at".to_string(), Value::String(exported_at));
        root.insert("tables".to_string(), Value::Object(tables));

        serde_json::to_string_pretty(&Value::Object(root))
            .map_err(|error| InventoryError::Db(error.to_string()))
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

    fn export_table_rows(&self, table: &str) -> InventoryResult<Vec<Value>> {
        let query = format!("SELECT * FROM {table}");
        let mut stmt = self.conn.prepare(&query)?;
        let columns: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|name| (*name).to_string())
            .collect();

        let mut rows = stmt.query([])?;
        let mut output = Vec::new();
        while let Some(row) = rows.next()? {
            let mut object = Map::new();
            for (index, column_name) in columns.iter().enumerate() {
                let value = row.get_ref(index)?;
                object.insert(column_name.clone(), sqlite_value_to_json(value));
            }
            output.push(Value::Object(object));
        }
        Ok(output)
    }

    pub fn enqueue_sync_action(
        &self,
        action_type: &str,
        payload_json: &str,
    ) -> InventoryResult<String> {
        let id = new_id();
        self.conn.execute(
            "INSERT INTO sync_queue (id, action_type, payload_json) VALUES (?1, ?2, ?3)",
            params![id, action_type, payload_json],
        )?;
        Ok(id)
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
