use rusqlite::{params, Connection, OptionalExtension};

use super::database_loan_queries::spool_is_outbound_loan_locked;
use super::database_result::require_rows;
use super::database_result::{InventoryError, InventoryResult};
use super::database_spool_price_lock::lock_spool_price_for_historical_status;
use super::loan_defaults::ACTIVE_LOAN_PREDICATE_SQL;

pub(crate) fn soft_delete_spool(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let tx = conn.unchecked_transaction()?;
    soft_delete_spool_in_transaction(&tx, spool_id)?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn soft_delete_spool_in_transaction(
    conn: &Connection,
    spool_id: &str,
) -> InventoryResult<()> {
    ensure_spool_has_no_active_loan(conn, spool_id)?;

    let affected = conn.execute(
        "UPDATE filament_spools
         SET deleted_at = datetime('now'),
             status = 'DELETED',
             location_id = NULL,
             home_location_id = NULL,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![spool_id],
    )?;
    require_rows(affected)?;
    lock_spool_price_for_historical_status(conn, spool_id, "DELETED", "SPOOL_DELETE")?;
    conn.execute(
        "UPDATE ams_slots
         SET spool_id = NULL,
             last_seen_at = datetime('now')
         WHERE spool_id = ?1",
        params![spool_id],
    )?;
    Ok(())
}

fn ensure_spool_has_no_active_loan(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    if spool_is_outbound_loan_locked(conn, spool_id)? {
        return Err(InventoryError::InvalidOperation {
            code: "inventory.spool.active_loan",
            message: "spool has an active loan; return it before deleting".to_string(),
        });
    }
    let active_loan_exists: Option<i64> = conn
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
    ensure_spool_has_no_active_loan(&tx, spool_id)?;

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
