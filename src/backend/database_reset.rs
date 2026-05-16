use rusqlite::Connection;

use super::database_schema::ensure_no_foreign_key_violations;
use super::database_table_ops::delete_all_rows;
use super::database_tables::RESET_APP_STATE_TABLES;
use super::database_reset_models::CatalogResetStats;
use super::database_result::InventoryResult;

pub(crate) fn reset_app_state_data(conn: &Connection) -> InventoryResult<()> {
    conn.execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")?;

    let result: InventoryResult<()> = (|| {
        delete_all_rows(conn, &RESET_APP_STATE_TABLES)?;
        ensure_no_foreign_key_violations(conn, "App-state reset")?;
        Ok(())
    })();

    match result {
        Ok(()) => match conn.execute_batch("COMMIT") {
            Ok(()) => {
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                Ok(())
            }
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                Err(error.into())
            }
        },
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
            Err(error)
        }
    }
}

pub(crate) fn reset_catalog_data(conn: &Connection) -> InventoryResult<CatalogResetStats> {
    let tx = conn.unchecked_transaction()?;

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
