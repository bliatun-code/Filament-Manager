use std::collections::HashSet;

use rusqlite::Connection;

use super::database_result::{InventoryError, InventoryResult};

pub const CURRENT_SCHEMA_VERSION: i64 = 5;

pub fn database_schema_version(conn: &Connection) -> InventoryResult<i64> {
    let version = conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))?;
    if version < 0 {
        return Err(InventoryError::Db(format!(
            "Invalid negative database schema version: {version}"
        )));
    }
    Ok(version)
}

pub(crate) fn ensure_supported_schema_version(conn: &Connection) -> InventoryResult<i64> {
    let version = database_schema_version(conn)?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(InventoryError::Db(format!(
            "Database schema version {version} is newer than the supported version {CURRENT_SCHEMA_VERSION}"
        )));
    }
    Ok(version)
}

pub(crate) fn ensure_database_quick_check(conn: &Connection) -> InventoryResult<()> {
    let mut statement = conn.prepare("PRAGMA quick_check")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }

    if results.len() == 1 && results[0] == "ok" {
        return Ok(());
    }

    let detail = if results.is_empty() {
        "quick_check returned no result".to_string()
    } else {
        results.into_iter().take(3).collect::<Vec<_>>().join("; ")
    };
    Err(InventoryError::Db(format!(
        "SQLite quick_check failed: {detail}"
    )))
}

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
