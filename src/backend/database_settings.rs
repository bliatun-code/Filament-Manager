use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::InventoryResult;

pub(crate) fn set_setting(conn: &Connection, key: &str, value: &str) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub(crate) fn delete_setting(conn: &Connection, key: &str) -> InventoryResult<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub(crate) fn get_setting(conn: &Connection, key: &str) -> InventoryResult<Option<String>> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1 LIMIT 1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value)
}
