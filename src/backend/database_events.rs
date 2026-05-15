use rusqlite::{params, Connection};
use serde_json::Value;

use super::database_ids::new_id;
use super::filament_database::{InventoryResult, SpoolHistoryEventRow, SpoolUsagePointRow};

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

pub(crate) fn insert_scan_event(
    conn: &Connection,
    spool_id: Option<&str>,
    qr_code: Option<&str>,
    source: &str,
    detected_color_hex: Option<&str>,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO scan_events (id, spool_id, qr_code, source, detected_color_hex)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![new_id(), spool_id, qr_code, source, detected_color_hex],
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
         ORDER BY created_at DESC
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
         FROM weight_readings
         WHERE spool_id = ?1
         ORDER BY captured_at ASC
         LIMIT ?2",
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
