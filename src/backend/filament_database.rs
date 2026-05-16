pub use super::database_backup_facade::BackupValidationStats;
pub use super::database_catalog_inputs::{ManualMasterInput, MasterCatalogUpdateInput};
use super::database_connection::open_connection;
pub use super::database_import::ImportDataStats;
pub use super::database_library_sync_models::{
    LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow,
};
pub use super::database_loan_models::{
    ActiveSpoolLoanRow, LoanUsageByPersonRow, SpoolLoanDetailsRow, SpoolLoanRow,
};
pub use super::database_printer_models::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveObservedTrayRow, PrinterAmsSlotRow, PrinterOverviewRow, PrinterRow, PrinterUsageRow,
};
pub use super::database_reset_models::CatalogResetStats;
pub use super::database_result::{InventoryError, InventoryResult};
use super::database_schema_setup::apply_schema_migrations;
pub use super::database_spool_models::{
    SpoolHistoryEventRow, SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow,
};
pub use super::database_tables::{FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES};
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

}

#[cfg(test)]
#[path = "filament_database_tests.rs"]
mod tests;
