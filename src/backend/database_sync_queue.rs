use rusqlite::{params, Connection};

use super::database_ids::new_id;
use super::database_result::InventoryResult;

pub(crate) fn enqueue_sync_action(
    conn: &Connection,
    action_type: &str,
    payload_json: &str,
) -> InventoryResult<String> {
    let id = new_id();
    conn.execute(
        "INSERT INTO sync_queue (id, action_type, payload_json) VALUES (?1, ?2, ?3)",
        params![id, action_type, payload_json],
    )?;
    Ok(id)
}
