use rusqlite::{params, Connection, OptionalExtension};

use super::database_ids::new_id;
use super::filament_database::InventoryResult;

pub(crate) fn insert_alert(
    conn: &Connection,
    alert_type: &str,
    payload_json: &str,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO alerts (id, type, payload_json) VALUES (?1, ?2, ?3)",
        params![new_id(), alert_type, payload_json],
    )?;
    Ok(())
}

pub(crate) fn alert_exists_for_spool(
    conn: &Connection,
    alert_type: &str,
    spool_id: &str,
) -> InventoryResult<bool> {
    let pattern = format!("%\\\"spool_id\\\":\\\"{}\\\"%", spool_id);
    let mut stmt = conn.prepare(
        "SELECT 1 FROM alerts
         WHERE type = ?1 AND resolved_at IS NULL AND payload_json LIKE ?2
         LIMIT 1",
    )?;
    let row: Option<i64> = stmt
        .query_row(params![alert_type, pattern], |row| row.get(0))
        .optional()?;
    Ok(row.is_some())
}
