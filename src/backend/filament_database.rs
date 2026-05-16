use super::database_alerts::{
    alert_exists_for_spool as alert_exists_for_spool_row, insert_alert as insert_alert_row,
};
pub use super::database_backup::BackupValidationStats;
use super::database_backup::{export_full_backup_content, validate_full_backup_content};
use super::database_backup_import::import_full_backup_content;
pub use super::database_catalog_inputs::{ManualMasterInput, MasterCatalogUpdateInput};
use super::database_connection::open_connection;
use super::database_export::{
    export_inventory_spools_csv as export_inventory_spool_rows_csv,
    export_inventory_spools_json as export_inventory_spool_rows_json,
};
pub use super::database_import::ImportDataStats;
use super::database_import::{
    import_data_content as import_data_content_rows, InventoryImportRow, InventoryImportStats,
};
use super::database_inventory_import_apply::import_inventory_spools_rows as import_inventory_spool_rows;
pub use super::database_library_sync_models::{
    LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow,
};
pub use super::database_loan_models::{
    ActiveSpoolLoanRow, LoanUsageByPersonRow, SpoolLoanDetailsRow, SpoolLoanRow,
};
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

    pub fn sqlite_now(&self) -> InventoryResult<String> {
        sqlite_now_value(&self.conn)
    }

    pub fn sqlite_datetime_shift(&self, base: &str, modifier: &str) -> InventoryResult<String> {
        sqlite_datetime_shift_value(&self.conn, base, modifier)
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
