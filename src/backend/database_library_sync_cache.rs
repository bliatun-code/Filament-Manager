use rusqlite::Connection;
use std::collections::BTreeMap;

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
    let tx = conn.unchecked_transaction()?;
    set_setting(&tx, "library_sync_cached_spools_json", &serialized)?;
    clear_cached_loan_spool_changes(&tx)?;
    tx.commit()?;
    Ok(payload.captured_at)
}

// Store only the changed Host row on acknowledgement. Materialize these changes
// when Inventory actually reads its complete snapshot, retaining its capture time.
pub(crate) const LOAN_SPOOL_EPOCH: &str = "library_sync_loan_spool_epoch";
pub(crate) const LOAN_SPOOL_PREFIX: &str = "library_sync_cached_loan_spool:";

pub(crate) fn clear_cached_loan_spool_changes(conn: &Connection) -> InventoryResult<()> {
    conn.execute(
        "DELETE FROM settings WHERE key GLOB ?1",
        [format!("{LOAN_SPOOL_PREFIX}*")],
    )?;
    Ok(())
}

pub(crate) fn save_cached_loan_spool_change(
    conn: &Connection,
    id: &str,
    row: Option<&SpoolWithMasterRow>,
    counts: Option<&super::database_loan_workspace::LoanWorkspaceCounts>,
) -> InventoryResult<()> {
    let value = serde_json::to_string(&row).map_err(|e| InventoryError::Db(e.to_string()))?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO settings(key,value) VALUES (?1,1)
        ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1",
        [LOAN_SPOOL_EPOCH],
    )?;
    tx.execute("INSERT OR REPLACE INTO settings (key,value)
        SELECT ?1,json_object('epoch',CAST(value AS INTEGER),'spool',json(?2)) FROM settings WHERE key=?3",
        rusqlite::params![format!("{LOAN_SPOOL_PREFIX}{id}"), value, LOAN_SPOOL_EPOCH])?;
    if let Some(counts) = counts {
        let json = serde_json::to_string(counts).map_err(|e| InventoryError::Db(e.to_string()))?;
        set_setting(&tx, super::database_loan_workspace::CACHED_COUNTS, &json)?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn cached_loan_spool_epoch(conn: &Connection) -> InventoryResult<i64> {
    Ok(conn.query_row(
        "SELECT coalesce((SELECT CAST(value AS INTEGER) FROM settings WHERE key=?1),0)",
        [LOAN_SPOOL_EPOCH],
        |row| row.get(0),
    )?)
}

pub(crate) fn apply_cached_loan_spool_changes(
    conn: &Connection,
    spools: &mut Vec<SpoolWithMasterRow>,
    since: i64,
) -> InventoryResult<()> {
    let mut stmt = conn.prepare("SELECT key,value -> '$.spool' FROM settings WHERE key GLOB ?1 AND value ->> '$.epoch' > ?2")?;
    let mut rows = stmt.query(rusqlite::params![format!("{LOAN_SPOOL_PREFIX}*"), since])?;
    let mut changes = BTreeMap::<String, Option<SpoolWithMasterRow>>::new();
    while let Some(row) = rows.next()? {
        let key: String = row.get(0)?;
        let value: String = row.get(1)?;
        changes.insert(
            key[LOAN_SPOOL_PREFIX.len()..].to_owned(),
            serde_json::from_str(&value).map_err(|e| InventoryError::Db(e.to_string()))?,
        );
    }
    if !changes.is_empty() {
        spools.retain_mut(|row| match changes.remove(&row.spool.id) {
            Some(Some(updated)) => {
                *row = updated;
                true
            }
            Some(None) => false,
            None => true,
        });
        spools.extend(changes.into_values().flatten());
    }
    Ok(())
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
