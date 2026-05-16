use super::database_alerts::{
    alert_exists_for_spool as alert_exists_for_spool_row, insert_alert as insert_alert_row,
};
pub use super::database_backup::BackupValidationStats;
use super::database_backup::{export_full_backup_content, validate_full_backup_content};
use super::database_backup_import::import_full_backup_content;
use super::database_bambu_live_settings::{
    delete_bambu_live_integration as delete_bambu_live_integration_row,
    list_bambu_live_integrations as list_bambu_live_integration_rows,
    save_bambu_live_integration as save_bambu_live_integration_row,
};
use super::database_catalog_esun::normalize_esun_catalog_colors as normalize_esun_catalog_colors_rows;
pub use super::database_catalog_inputs::{ManualMasterInput, MasterCatalogUpdateInput};
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
    export_inventory_spools_csv as export_inventory_spool_rows_csv,
    export_inventory_spools_json as export_inventory_spool_rows_json,
    export_loans_csv_for_direction as export_loan_rows_csv_for_direction,
};
pub use super::database_import::ImportDataStats;
use super::database_import::{
    import_data_content as import_data_content_rows, InventoryImportRow, InventoryImportStats,
};
use super::database_inventory_import_apply::import_inventory_spools_rows as import_inventory_spool_rows;
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
use super::database_library_sync_settings::{
    get_library_sync_settings as get_library_sync_setting_rows,
    save_library_sync_settings as save_library_sync_setting_rows,
};
use super::database_library_sync_validation::save_library_sync_validation_state as save_library_sync_validation_state_row;
use super::database_loan_create::{
    create_inbound_spool_loan as create_inbound_spool_loan_row,
    create_spool_loan as create_spool_loan_row,
};
pub use super::database_loan_models::{
    ActiveSpoolLoanRow, LoanUsageByPersonRow, SpoolLoanDetailsRow, SpoolLoanRow,
};
use super::database_loan_queries::{
    find_active_spool_loan_for_direction as find_active_spool_loan_for_direction_row,
    list_active_spool_loans as list_active_spool_loan_rows,
    list_loan_usage_by_person_for_direction as list_loan_usage_by_person_for_direction_rows,
    list_spool_loans_for_direction as list_spool_loans_for_direction_rows,
    spool_has_active_loan as spool_has_active_loan_row,
};
use super::database_loan_return::{
    return_inbound_spool_loan as return_inbound_spool_loan_row,
    return_spool_loan as return_spool_loan_row,
};
use super::database_loan_update::update_active_inbound_spool_loan_counterparty as update_active_inbound_spool_loan_counterparty_row;
use super::database_locations::ensure_location as ensure_location_row;
use super::database_print_jobs::insert_print_job as insert_print_job_row;
use super::database_printer_live_events::insert_printer_live_event as insert_printer_live_event_row;
pub use super::database_printer_models::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveObservedTrayRow, PrinterAmsSlotRow, PrinterOverviewRow, PrinterRow, PrinterUsageRow,
};
use super::database_printer_mutations::{
    delete_printer as delete_printer_row, upsert_printer_with_ams as upsert_printer_with_ams_row,
};
use super::database_printer_queries::{
    list_printer_overview as list_printer_overview_rows, list_printers as list_printer_rows,
    printer_exists as printer_exists_row,
};
use super::database_printer_slot_assignment::assign_spool_to_ams_slot as assign_spool_to_ams_slot_row;
use super::database_reset::{
    reset_app_state_data as reset_app_state_data_rows,
    reset_catalog_data as reset_catalog_data_rows,
};
pub use super::database_result::{InventoryError, InventoryResult};
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
pub use super::database_spool_models::{
    SpoolHistoryEventRow, SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow,
};
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
pub use super::database_tables::{FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES};
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
use super::database_trusted_lan_settings::{
    get_trusted_lan_settings as get_trusted_lan_setting_rows,
    save_trusted_lan_settings as save_trusted_lan_setting_rows,
};
use super::database_wishlist::{
    delete_wishlist_item as delete_wishlist_item_row,
    insert_wishlist_item as insert_wishlist_item_row,
    list_wishlist_items as list_wishlist_item_rows,
    update_wishlist_item_status as update_wishlist_item_status_row,
};
pub use super::database_wishlist_models::WishlistItemRow;
pub use super::filament_master_models::{
    CatalogLifecycleStats, EsunColorNormalizationStats, FilamentMasterCatalogRow,
    FilamentMasterSummary,
};
use super::statistics::InventoryOverview;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) type LibrarySyncClientAuthState = (String, String, String, Option<String>);
const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogResetStats {
    pub removed_count: i64,
    pub remaining_count: i64,
    pub reactivated_count: i64,
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
        update_active_inbound_spool_loan_counterparty_row(
            &self.conn,
            spool_id,
            counterparty_name,
            counterparty_contact,
            counterparty_note,
        )
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
        return_spool_loan_row(&self.conn, loan_id, returned_grams, return_note)
    }

    pub fn return_inbound_spool_loan(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        return_inbound_spool_loan_row(&self.conn, loan_id, returned_grams, return_note)
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
        export_loan_rows_csv_for_direction(&self.conn, include_returned, Some("OUTBOUND"))
    }

    pub fn export_loans_csv_for_direction(
        &self,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<String> {
        export_loan_rows_csv_for_direction(&self.conn, include_returned, direction)
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
        upsert_printer_with_ams_row(
            &self.conn,
            printer_id,
            model,
            name,
            ams_units,
            slots_per_unit,
        )
    }

    pub fn delete_printer(&self, printer_id: &str) -> InventoryResult<()> {
        delete_printer_row(&self.conn, printer_id)
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
        save_bambu_live_integration_row(&self.conn, printer_id, config)
    }

    pub fn delete_bambu_live_integration(&self, printer_id: &str) -> InventoryResult<()> {
        delete_bambu_live_integration_row(&self.conn, printer_id)
    }

    pub fn list_bambu_live_integrations(
        &self,
    ) -> InventoryResult<Vec<BambuLiveIntegrationEntryRow>> {
        list_bambu_live_integration_rows(&self.conn)
    }

    pub fn insert_printer_live_event(
        &self,
        printer_id: &str,
        event_type: &str,
        payload_json: &Value,
    ) -> InventoryResult<()> {
        insert_printer_live_event_row(&self.conn, printer_id, event_type, payload_json)
    }

    pub fn get_trusted_lan_settings(&self) -> InventoryResult<TrustedLanSettingsRow> {
        get_trusted_lan_setting_rows(&self.conn)
    }

    pub fn save_trusted_lan_settings(
        &self,
        settings: &TrustedLanSettingsRow,
    ) -> InventoryResult<()> {
        save_trusted_lan_setting_rows(&self.conn, settings)
    }

    pub fn get_library_sync_settings(&self) -> InventoryResult<LibrarySyncSettingsRow> {
        get_library_sync_setting_rows(&self.conn)
    }

    pub fn save_library_sync_settings(
        &self,
        settings: &LibrarySyncSettingsRow,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        save_library_sync_setting_rows(&self.conn, settings)
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
        assign_spool_to_ams_slot_row(
            &self.conn,
            printer_id,
            slot_id,
            spool_id,
            rfid_override_tray_uuid,
            rfid_override_color_hex,
            clear_live_cache_before_next_refresh,
        )
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
        export_inventory_spool_rows_csv(&self.conn)
    }

    pub fn export_spools_json(&self) -> InventoryResult<String> {
        export_inventory_spool_rows_json(&self.conn)
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
        import_full_backup_content(&self.conn, content, SCHEMA_SQL)
    }

    pub fn import_data_content(&self, content: &str) -> InventoryResult<ImportDataStats> {
        import_data_content_rows(
            content,
            |normalized| self.validate_full_backup_json(normalized),
            |normalized| self.import_full_backup_json(normalized),
            |rows| self.import_inventory_spools_rows(rows),
        )
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
        import_inventory_spool_rows(&self.conn, rows)
    }
}

#[cfg(test)]
#[path = "filament_database_tests.rs"]
mod tests;
