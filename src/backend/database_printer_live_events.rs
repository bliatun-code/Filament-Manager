use rusqlite::{params, Connection};
use serde_json::Value;

use super::database_ids::new_id;
use super::filament_database::{InventoryError, InventoryResult};

pub(crate) fn insert_printer_live_event(
    conn: &Connection,
    printer_id: &str,
    event_type: &str,
    payload_json: &Value,
) -> InventoryResult<()> {
    let normalized_printer_id = printer_id.trim();
    let normalized_event_type = event_type.trim();
    if normalized_printer_id.is_empty() || normalized_event_type.is_empty() {
        return Err(InventoryError::Db(
            "printer id and event type are required for printer live events".to_string(),
        ));
    }

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
