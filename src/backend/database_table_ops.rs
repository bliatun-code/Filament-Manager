use rusqlite::Connection;

use super::database_result::InventoryResult;

pub(crate) fn delete_all_rows(conn: &Connection, tables: &[&str]) -> InventoryResult<()> {
    for table in tables {
        conn.execute(&format!("DELETE FROM {table}"), [])?;
    }
    Ok(())
}
