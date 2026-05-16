use super::database_alerts::{
    alert_exists_for_spool as alert_exists_for_spool_row, insert_alert as insert_alert_row,
};
pub use super::database_backup::BackupValidationStats;
use super::database_backup::{export_full_backup_content, validate_full_backup_content};
use super::database_backup_import::import_full_backup_content;
pub use super::database_catalog_inputs::{ManualMasterInput, MasterCatalogUpdateInput};
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
pub use super::database_library_sync_models::{
    LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow,
};
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
use super::database_print_jobs::insert_print_job as insert_print_job_row;
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
pub use super::database_reset_models::CatalogResetStats;
pub use super::database_result::{InventoryError, InventoryResult};
use super::database_schema_setup::apply_schema_migrations;
pub use super::database_spool_models::{
    SpoolHistoryEventRow, SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow,
};
use super::database_sync_queue::enqueue_sync_action as enqueue_sync_action_row;
pub use super::database_tables::{FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES};
use super::database_time::{
    sqlite_datetime_shift as sqlite_datetime_shift_value, sqlite_now as sqlite_now_value,
};
pub use super::database_trusted_lan_models::{
    TrustedLanPairedBrowserRow, TrustedLanSettingsRow,
};
pub use super::database_wishlist_models::WishlistItemRow;
pub use super::filament_master_models::{
    CatalogLifecycleStats, EsunColorNormalizationStats, FilamentMasterCatalogRow,
    FilamentMasterSummary,
};
use rusqlite::Connection;

const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

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

    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
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

    pub fn sqlite_now(&self) -> InventoryResult<String> {
        sqlite_now_value(&self.conn)
    }

    pub fn sqlite_datetime_shift(&self, base: &str, modifier: &str) -> InventoryResult<String> {
        sqlite_datetime_shift_value(&self.conn, base, modifier)
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
