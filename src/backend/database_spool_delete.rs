use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::require_rows;
use super::database_result::{InventoryError, InventoryResult};
use super::loan_defaults::ACTIVE_LOAN_PREDICATE_SQL;

pub(crate) fn soft_delete_spool(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let tx = conn.unchecked_transaction()?;
    let active_loan_exists: Option<i64> = tx
        .query_row(
            &format!(
                "SELECT 1
             FROM spool_loans
             WHERE spool_id = ?1
               AND {ACTIVE_LOAN_PREDICATE_SQL}
             LIMIT 1"
            ),
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if active_loan_exists.is_some() {
        return Err(InventoryError::InvalidOperation {
            code: "inventory.spool.active_loan",
            message: "spool has an active loan; return it before deleting".to_string(),
        });
    }

    let affected = tx.execute(
        "UPDATE filament_spools
         SET deleted_at = datetime('now'),
             status = 'DELETED',
             location_id = NULL,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![spool_id],
    )?;
    require_rows(affected)?;
    tx.execute(
        "UPDATE ams_slots
         SET spool_id = NULL,
             last_seen_at = datetime('now')
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn purge_spool(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let tx = conn.unchecked_transaction()?;
    let exists: Option<i64> = tx
        .query_row(
            "SELECT 1
             FROM filament_spools
             WHERE id = ?1
             LIMIT 1",
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(InventoryError::NotFound);
    }

    tx.execute(
        "UPDATE ams_slots
         SET spool_id = NULL
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM weight_readings
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM spool_loans
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM scan_events
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM label_print_jobs
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM print_jobs
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM printer_live_usage_session_spools
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    tx.execute(
        "DELETE FROM spool_history_events
         WHERE spool_id = ?1",
        params![spool_id],
    )?;

    let removed = tx.execute(
        "DELETE FROM filament_spools
         WHERE id = ?1",
        params![spool_id],
    )?;
    require_rows(removed)?;

    tx.commit()?;
    Ok(())
}
