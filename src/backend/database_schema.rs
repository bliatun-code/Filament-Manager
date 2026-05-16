use std::collections::HashSet;

use rusqlite::Connection;

use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn table_columns(conn: &Connection, table: &str) -> InventoryResult<HashSet<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut rows = stmt.query([])?;
    let mut columns = HashSet::new();
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        columns.insert(name);
    }
    Ok(columns)
}

pub(crate) fn table_has_column(
    conn: &Connection,
    table: &str,
    column: &str,
) -> InventoryResult<bool> {
    Ok(table_columns(conn, table)?.contains(column))
}

pub(crate) fn ensure_no_foreign_key_violations(
    conn: &Connection,
    context: &str,
) -> InventoryResult<()> {
    let mut statement = conn.prepare("PRAGMA foreign_key_check")?;
    let mut rows = statement.query([])?;
    if let Some(row) = rows.next()? {
        let table: String = row.get(0)?;
        let parent_table: String = row.get(2)?;
        return Err(InventoryError::Db(format!(
            "{context} would leave a foreign key violation in `{table}` referencing `{parent_table}`"
        )));
    }
    Ok(())
}
