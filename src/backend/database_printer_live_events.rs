use rusqlite::{params, Connection};
use serde_json::Value;

use super::database_ids::new_id;
use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn insert_printer_live_event(
    conn: &Connection,
    printer_id: &str,
    event_type: &str,
    payload_json: &Value,
) -> InventoryResult<()> {
    let (normalized_printer_id, normalized_event_type) =
        normalize_live_event_identity(printer_id, event_type)?;

    let payload = serde_json::to_string(payload_json)
        .map_err(|error| InventoryError::Db(error.to_string()))?;
    conn.execute(
        "INSERT INTO printer_live_events (id, printer_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
        params![
            new_id(),
            normalized_printer_id,
            normalized_event_type,
            payload
        ],
    )?;
    Ok(())
}

pub(crate) fn insert_printer_live_event_unless_recent_duplicate(
    conn: &Connection,
    printer_id: &str,
    event_type: &str,
    payload_json: &Value,
    dedupe_key: &str,
    dedupe_window_seconds: i64,
) -> InventoryResult<bool> {
    let (normalized_printer_id, normalized_event_type) =
        normalize_live_event_identity(printer_id, event_type)?;
    let normalized_dedupe_key = dedupe_key.trim();
    if normalized_dedupe_key.is_empty() {
        insert_printer_live_event(conn, printer_id, event_type, payload_json)?;
        return Ok(true);
    }

    let window_seconds = dedupe_window_seconds.max(1);
    let window_modifier = format!("-{window_seconds} seconds");
    let mut stmt = conn.prepare(
        "SELECT payload_json
         FROM printer_live_events
         WHERE printer_id = ?1
           AND event_type = ?2
           AND created_at >= datetime('now', ?3)
         ORDER BY created_at DESC
         LIMIT 50",
    )?;
    let recent_payloads = stmt.query_map(
        params![
            normalized_printer_id,
            normalized_event_type,
            window_modifier
        ],
        |row| row.get::<_, String>(0),
    )?;

    for payload in recent_payloads {
        let payload = payload?;
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        if value
            .get("dedupe_key")
            .and_then(Value::as_str)
            .is_some_and(|value| value == normalized_dedupe_key)
        {
            return Ok(false);
        }
    }

    insert_printer_live_event(conn, printer_id, event_type, payload_json)?;
    Ok(true)
}

fn normalize_live_event_identity<'a>(
    printer_id: &'a str,
    event_type: &'a str,
) -> InventoryResult<(&'a str, &'a str)> {
    let normalized_printer_id = printer_id.trim();
    let normalized_event_type = event_type.trim();
    if normalized_printer_id.is_empty() || normalized_event_type.is_empty() {
        return Err(InventoryError::Db(
            "printer id and event type are required for printer live events".to_string(),
        ));
    }
    Ok((normalized_printer_id, normalized_event_type))
}
