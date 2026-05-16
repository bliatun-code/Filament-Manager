use rusqlite::Connection;

use super::database_library_sync_models::{
    LibrarySyncCachedLoanListRow, LibrarySyncCachedPrinterOverviewRow,
    LibrarySyncCachedSnapshotRow, LibrarySyncCachedSpoolListRow,
};
use super::database_settings::set_setting;
use super::database_time::sqlite_now;
use super::filament_database::{
    InventoryError, InventoryResult, PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow,
};

pub(crate) fn save_library_sync_cached_snapshot(
    conn: &Connection,
    snapshot: &LibrarySyncCachedSnapshotRow,
) -> InventoryResult<()> {
    let serialized =
        serde_json::to_string(snapshot).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_snapshot_json", &serialized)
}

pub(crate) fn save_library_sync_cached_spools(
    conn: &Connection,
    rows: &[SpoolWithMasterRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedSpoolListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_spools_json", &serialized)
}

pub(crate) fn save_library_sync_cached_printers(
    conn: &Connection,
    rows: &[PrinterOverviewRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedPrinterOverviewRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_printers_json", &serialized)
}

pub(crate) fn save_library_sync_cached_loans(
    conn: &Connection,
    rows: &[SpoolLoanDetailsRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedLoanListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_loans_json", &serialized)
}
