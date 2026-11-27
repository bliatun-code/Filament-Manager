use rusqlite::{params, Connection};
use serde_json::Value;

use super::database_ids::new_id;
use super::database_result::InventoryResult;
use super::database_spool_models::{SpoolHistoryEventRow, SpoolUsagePointRow};

pub(crate) fn ensure_scale(
    conn: &Connection,
    scale_id: &str,
    name: &str,
    protocol: &str,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO scales (id, name, protocol)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            protocol = excluded.protocol,
            updated_at = datetime('now')",
        params![scale_id, name, protocol],
    )?;
    Ok(())
}

pub(crate) fn insert_weight_reading(
    conn: &Connection,
    scale_id: &str,
    spool_id: &str,
    grams: i64,
    source: &str,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO weight_readings (id, scale_id, spool_id, grams, captured_at, source)
         VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5)",
        params![new_id(), scale_id, spool_id, grams, source],
    )?;
    Ok(())
}

pub(crate) fn insert_spool_history_event(
    conn: &Connection,
    spool_id: &str,
    event_type: &str,
    payload_json: &str,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO spool_history_events (id, spool_id, event_type, payload_json)
         VALUES (?1, ?2, ?3, ?4)",
        params![new_id(), spool_id, event_type, payload_json],
    )?;
    Ok(())
}

pub(crate) fn list_spool_history_events(
    conn: &Connection,
    spool_id: &str,
    limit: i64,
) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, spool_id, event_type, payload_json, created_at
         FROM spool_history_events
         WHERE spool_id = ?1
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![spool_id, limit], |row| {
        let payload_raw: String = row.get(3)?;
        let payload_json = serde_json::from_str::<Value>(&payload_raw).unwrap_or(Value::Null);
        Ok(SpoolHistoryEventRow {
            id: row.get(0)?,
            spool_id: row.get(1)?,
            event_type: row.get(2)?,
            payload_json,
            created_at: row.get(4)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn list_spool_usage_points(
    conn: &Connection,
    spool_id: &str,
    limit: i64,
) -> InventoryResult<Vec<SpoolUsagePointRow>> {
    let mut stmt = conn.prepare(
        "SELECT captured_at, grams, source
         FROM (
            SELECT rowid AS reading_order, captured_at, grams, source
            FROM weight_readings
            WHERE spool_id = ?1
            ORDER BY captured_at DESC, reading_order DESC
            LIMIT ?2
         )
         ORDER BY captured_at ASC, reading_order ASC",
    )?;
    let rows = stmt.query_map(params![spool_id, limit], |row| {
        Ok(SpoolUsagePointRow {
            captured_at: row.get(0)?,
            grams: row.get(1)?,
            source: row.get(2)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_second_spool_readings_and_events_keep_recording_order_at_the_limit() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE weight_readings(id TEXT PRIMARY KEY, spool_id TEXT, captured_at TEXT, grams INTEGER, source TEXT);
            CREATE TABLE spool_history_events(id TEXT PRIMARY KEY, spool_id TEXT, created_at TEXT, event_type TEXT, payload_json TEXT);").unwrap();
        for (id, grams) in [("z", 900), ("c", 800), ("a", 700)] {
            conn.execute(
                "INSERT INTO weight_readings VALUES (?1,'s','2026-01-01 12:00:00',?2,'scale')",
                params![id, grams],
            )
            .unwrap();
            conn.execute("INSERT INTO spool_history_events VALUES (?1,'s','2026-01-01 12:00:00','WEIGHED','{}')",[id]).unwrap();
        }
        let points = list_spool_usage_points(&conn, "s", 2).unwrap();
        assert_eq!(
            points.iter().map(|p| p.grams).collect::<Vec<_>>(),
            [800, 700]
        );
        assert_eq!(list_spool_history_events(&conn, "s", 1).unwrap()[0].id, "a");
    }
}
