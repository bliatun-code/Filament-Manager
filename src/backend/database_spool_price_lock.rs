use rusqlite::{params, Connection, Transaction, TransactionBehavior};
use serde_json::json;

use super::database_events::insert_spool_history_event;
use super::database_result::{InventoryError, InventoryResult};
use super::inventory_domain::is_historical_spool_status;

pub(crate) const HISTORICAL_PRICE_LOCK_REASON: &str = "HISTORICAL_STATUS";

/// Enforces the batch-price lock when a spool enters a historical status.
///
/// The caller owns the surrounding business transaction. Updating the spool and
/// recording the audit event on the same connection means either both changes
/// commit or neither does.
pub(crate) fn lock_spool_price_for_historical_status(
    conn: &Connection,
    spool_id: &str,
    status: &str,
    source: &str,
) -> InventoryResult<bool> {
    if !is_historical_spool_status(Some(status)) {
        return Ok(false);
    }

    let affected = conn.execute(
        "UPDATE filament_spools
         SET purchase_price_batch_locked = 1,
             updated_at = datetime('now')
         WHERE id = ?1
           AND purchase_price_batch_locked = 0",
        params![spool_id],
    )?;
    if affected == 0 {
        return Ok(false);
    }
    if affected != 1 {
        return Err(InventoryError::Db(format!(
            "Historical price lock updated {affected} rows for spool '{spool_id}'"
        )));
    }

    let payload = serde_json::to_string(&json!({
        "before": false,
        "after": true,
        "reason": HISTORICAL_PRICE_LOCK_REASON,
        "status": status.trim().to_uppercase().replace(['-', ' '], "_"),
        "source": source,
    }))
    .map_err(|error| InventoryError::Db(error.to_string()))?;
    insert_spool_history_event(
        conn,
        spool_id,
        "PURCHASE_PRICE_BATCH_LOCK_UPDATED",
        &payload,
    )?;
    Ok(true)
}

/// Repairs historical rows created before automatic batch-price protection was
/// introduced. This recurring, idempotent data backfill is intentionally kept
/// outside the frozen structural migration chain.
pub(crate) fn backfill_historical_spool_price_locks(conn: &Connection) -> InventoryResult<usize> {
    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let updated =
        backfill_historical_spool_price_locks_in_transaction(&transaction, "STARTUP_BACKFILL")?;
    transaction.commit()?;
    Ok(updated)
}

/// Applies the historical price-lock repair inside a transaction owned by the
/// caller. Full-library restore uses this variant so restored rows, repair
/// history, validation, and commit remain one atomic operation.
pub(crate) fn backfill_historical_spool_price_locks_in_transaction(
    conn: &Connection,
    source: &str,
) -> InventoryResult<usize> {
    let candidates = {
        let mut statement = conn.prepare(
            "SELECT id, status
             FROM filament_spools
             WHERE purchase_price_batch_locked = 0
             ORDER BY id",
        )?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };

    let mut updated = 0;
    for (spool_id, raw_status) in candidates {
        if lock_spool_price_for_historical_status(conn, &spool_id, &raw_status, source)? {
            updated += 1;
        }
    }
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::backfill_historical_spool_price_locks;
    use crate::backend::filament_database::FilamentDatabase;

    #[test]
    fn backfill_locks_existing_historical_rows_once_with_audit_history() {
        let database = FilamentDatabase::open(":memory:").expect("open database");
        database.apply_schema().expect("apply schema");
        database
            .connection()
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('backfill-master', 'PLA', 'Basic', 'Black', 1000, 'Generic')",
                [],
            )
            .expect("insert master");
        database
            .connection()
            .execute_batch(
                "INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, purchase_price_batch_locked
                 ) VALUES
                    ('historical-empty', 'backfill-master', 'EMPTY', 'OWNED', 0),
                    ('historical-lost', 'backfill-master', 'lost', 'OWNED', 0),
                    ('historical-missing', 'backfill-master', 'MISSING', 'OWNED', 0),
                    ('historical-archived', 'backfill-master', 'ARCHIVED', 'OWNED', 0),
                    ('active', 'backfill-master', 'IN_STOCK', 'OWNED', 0),
                    ('already-locked', 'backfill-master', 'DELETED', 'OWNED', 1);",
            )
            .expect("insert spools");

        assert_eq!(
            backfill_historical_spool_price_locks(database.connection()).expect("backfill locks"),
            4
        );
        assert_eq!(
            backfill_historical_spool_price_locks(database.connection()).expect("repeat backfill"),
            0
        );

        let locks: (i64, i64, i64, i64, i64, i64) = database
            .connection()
            .query_row(
                "SELECT
                    SUM(id = 'historical-empty' AND purchase_price_batch_locked = 1),
                    SUM(id = 'historical-lost' AND purchase_price_batch_locked = 1),
                    SUM(id = 'historical-missing' AND purchase_price_batch_locked = 1),
                    SUM(id = 'historical-archived' AND purchase_price_batch_locked = 1),
                    SUM(id = 'active' AND purchase_price_batch_locked = 1),
                    SUM(id = 'already-locked' AND purchase_price_batch_locked = 1)
                 FROM filament_spools",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("read locks");
        assert_eq!(locks, (1, 1, 1, 1, 0, 1));

        let events: i64 = database
            .connection()
            .query_row(
                "SELECT COUNT(*)
                 FROM spool_history_events
                 WHERE event_type = 'PURCHASE_PRICE_BATCH_LOCK_UPDATED'
                   AND json_extract(payload_json, '$.reason') = 'HISTORICAL_STATUS'
                   AND json_extract(payload_json, '$.source') = 'STARTUP_BACKFILL'",
                [],
                |row| row.get(0),
            )
            .expect("count audit events");
        assert_eq!(events, 4);
    }
}
