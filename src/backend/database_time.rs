use rusqlite::{params, Connection};

use super::filament_database::InventoryResult;

pub(crate) fn sqlite_now(conn: &Connection) -> InventoryResult<String> {
    let value = conn.query_row("SELECT datetime('now')", [], |row| row.get(0))?;
    Ok(value)
}

pub(crate) fn sqlite_datetime_shift(
    conn: &Connection,
    base: &str,
    modifier: &str,
) -> InventoryResult<String> {
    let value = conn.query_row("SELECT datetime(?1, ?2)", params![base, modifier], |row| {
        row.get(0)
    })?;
    Ok(value)
}
