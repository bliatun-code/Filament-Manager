use rusqlite::{params, Connection};

use super::database_catalog_schema::ensure_catalog_lifecycle_columns;
use super::database_result::InventoryResult;
use super::filament_master_models::CatalogLifecycleStats;

pub(crate) fn apply_vendor_discontinued_rules(
    conn: &Connection,
    vendor: &str,
    refresh_started_at: &str,
) -> InventoryResult<CatalogLifecycleStats> {
    ensure_catalog_lifecycle_columns(conn)?;

    let reactivated = conn.execute(
        "UPDATE filament_master_list
         SET is_discontinued = 0,
             discontinued_at = NULL,
             updated_at = datetime('now')
         WHERE vendor = ?2
           AND last_seen_at IS NOT NULL
           AND last_seen_at >= ?1",
        params![refresh_started_at, vendor],
    )? as i64;

    let discontinued = conn.execute(
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
