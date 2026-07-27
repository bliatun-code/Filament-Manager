pub use super::database_backup::BackupValidationStats;
use super::database_backup::{export_full_backup_content, validate_full_backup_content};
use super::database_backup_import::import_full_backup_content;
use super::database_core::FilamentDatabase;
use super::database_export::{
    export_inventory_spools_csv as export_inventory_spool_rows_csv,
    export_inventory_spools_json as export_inventory_spool_rows_json,
};
use super::database_import::{
    import_data_content as import_data_content_rows, ImportDataStats, InventoryImportRow,
    InventoryImportStats,
};
use super::database_inventory_import_apply::import_inventory_spools_rows as import_inventory_spool_rows;
use super::database_result::InventoryResult;

const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

impl FilamentDatabase {
    pub fn export_spools_csv(&self) -> InventoryResult<String> {
        export_inventory_spool_rows_csv(self.connection())
    }

    pub fn export_spools_json(&self) -> InventoryResult<String> {
        export_inventory_spool_rows_json(self.connection())
    }

    pub fn export_full_backup_json(&self) -> InventoryResult<String> {
        export_full_backup_content(self.connection())
    }

    pub fn validate_full_backup_json(
        &self,
        content: &str,
    ) -> InventoryResult<BackupValidationStats> {
        validate_full_backup_content(content, SCHEMA_SQL)
    }

    pub fn import_full_backup_json(&self, content: &str) -> InventoryResult<()> {
        import_full_backup_content(self.connection(), content, SCHEMA_SQL)
    }

    pub fn import_data_content(&self, content: &str) -> InventoryResult<ImportDataStats> {
        import_data_content_rows(
            content,
            |normalized| self.validate_full_backup_json(normalized),
            |normalized| self.import_full_backup_json(normalized),
            |rows| self.import_inventory_spools_rows(rows),
        )
    }

    fn import_inventory_spools_rows(
        &self,
        rows: &[InventoryImportRow],
    ) -> InventoryResult<InventoryImportStats> {
        import_inventory_spool_rows(self.connection(), rows)
    }
}
