use rusqlite::Connection;

use super::database_library_sync_models::{
    LibrarySyncCachedFilamentConsumptionListRow, LibrarySyncCachedLoanListRow,
    LibrarySyncCachedLocationListRow, LibrarySyncCachedPrinterOverviewRow,
    LibrarySyncCachedSnapshotRow, LibrarySyncCachedSpoolListRow, LibrarySyncCachedWishlistListRow,
};
use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_location_models::InventoryLocationRow;
use super::database_printer_models::PrinterOverviewRow;
use super::database_result::{InventoryError, InventoryResult};
use super::database_settings::get_setting;
use super::database_settings::set_setting;
use super::database_spool_models::SpoolWithMasterRow;
use super::database_time::sqlite_now;
use super::database_wishlist_models::WishlistItemRow;
use super::statistics::FilamentConsumptionRow;

pub(crate) const DASHBOARD_SNAPSHOT_KEY: &str = "library_sync_cached_dashboard_snapshot_json";
pub(crate) const SNAPSHOT_CAPTURED_AT_KEY: &str = "library_sync_snapshot_captured_at";
pub(crate) const CACHED_ACTIVE_LOANS_KEY: &str = "library_sync_cached_active_loans_json";

pub(crate) fn save_library_sync_cached_snapshot(
    conn: &Connection,
    mut snapshot: LibrarySyncCachedSnapshotRow,
    dashboard: bool,
) -> InventoryResult<()> {
    let tx = conn.unchecked_transaction()?;
    let encode = |snapshot: &LibrarySyncCachedSnapshotRow| {
        serde_json::to_string(snapshot).map_err(|error| InventoryError::Db(error.to_string()))
    };
    if dashboard {
        if snapshot.dashboard_stock.is_some() {
            set_setting(&tx, DASHBOARD_SNAPSHOT_KEY, &encode(&snapshot)?)?;
        } else {
            super::database_settings::delete_setting(&tx, DASHBOARD_SNAPSHOT_KEY)?;
        }
    }
    snapshot.dashboard_stock = None;
    let serialized = encode(&snapshot)?;
    set_setting(&tx, "library_sync_cached_snapshot_json", &serialized)?;
    set_setting(&tx, SNAPSHOT_CAPTURED_AT_KEY, &snapshot.captured_at)?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn save_library_sync_cached_spools(
    conn: &Connection,
    rows: &[SpoolWithMasterRow],
) -> InventoryResult<String> {
    let payload = LibrarySyncCachedSpoolListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_spools_json", &serialized)?;
    Ok(payload.captured_at)
}

pub(crate) fn save_library_sync_cached_locations(
    conn: &Connection,
    rows: &[InventoryLocationRow],
) -> InventoryResult<LibrarySyncCachedLocationListRow> {
    let payload = LibrarySyncCachedLocationListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_locations_json", &serialized)?;
    Ok(payload)
}

pub(crate) fn get_library_sync_cached_locations(
    conn: &Connection,
) -> InventoryResult<Option<LibrarySyncCachedLocationListRow>> {
    get_setting(conn, "library_sync_cached_locations_json")?
        .map(|payload| {
            serde_json::from_str(&payload).map_err(|error| InventoryError::Db(error.to_string()))
        })
        .transpose()
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
    save_library_sync_loan_list(conn, "library_sync_cached_loans_json", rows)
}

pub(crate) fn save_library_sync_cached_active_loans(
    conn: &Connection,
    rows: &[SpoolLoanDetailsRow],
) -> InventoryResult<()> {
    save_library_sync_loan_list(conn, CACHED_ACTIVE_LOANS_KEY, rows)
}

fn save_library_sync_loan_list(
    conn: &Connection,
    key: &str,
    rows: &[SpoolLoanDetailsRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedLoanListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, key, &serialized)
}

pub(crate) fn save_library_sync_cached_consumption(
    conn: &Connection,
    rows: &[FilamentConsumptionRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedFilamentConsumptionListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_consumption_json", &serialized)
}

pub(crate) fn save_library_sync_cached_wishlist(
    conn: &Connection,
    rows: &[WishlistItemRow],
) -> InventoryResult<()> {
    let payload = LibrarySyncCachedWishlistListRow {
        captured_at: sqlite_now(conn)?,
        rows: rows.to_vec(),
    };
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(conn, "library_sync_cached_wishlist_json", &serialized)
}
