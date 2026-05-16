use rusqlite::{params, Connection};

use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn ensure_location(conn: &Connection, name: &str) -> InventoryResult<String> {
    let id = name.trim().to_string();
    if id.is_empty() {
        return Err(InventoryError::Db("location cannot be empty".to_string()));
    }

    conn.execute(
        "INSERT INTO inventory_locations (id, name, type)
         VALUES (?1, ?2, 'GENERIC')
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name",
        params![id, name.trim()],
    )?;
    Ok(id)
}
