use rusqlite::Connection;
use serde_json::{Map, Value};

use super::database_backup::parse_full_backup_content;
use super::database_borrowed_schema::ensure_borrowed_in_schema;
use super::database_printer_schema::{
    ensure_printer_external_slot_schema, ensure_printer_slot_live_cache_schema,
    ensure_printer_slot_rfid_override_schema,
};
use super::database_result::InventoryResult;
use super::database_schema::{ensure_no_foreign_key_violations, table_columns};
use super::database_table_ops::delete_all_rows;
use super::database_tables::{should_import_backup_row, FULL_BACKUP_TABLES};
use super::database_trusted_lan_schema::ensure_trusted_lan_schema;
use super::database_values::json_value_to_sql;

pub(crate) fn import_full_backup_content(
    conn: &Connection,
    content: &str,
    schema_sql: &str,
) -> InventoryResult<()> {
    let parsed = parse_full_backup_content(content)?;

    conn.execute_batch(schema_sql)?;
    conn.execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")?;
    let result: InventoryResult<()> = (|| {
        delete_all_rows(conn, &FULL_BACKUP_TABLES)?;

        for table in FULL_BACKUP_TABLES {
            let Some(rows) = parsed.tables.get(table) else {
                continue;
            };

            for row in rows {
                if !should_import_backup_row(table, row) {
                    continue;
                }
                insert_backup_row(conn, table, row)?;
            }
        }

        ensure_no_foreign_key_violations(conn, "Full backup import")?;

        Ok(())
    })();

    match result {
        Ok(()) => match conn.execute_batch("COMMIT") {
            Ok(()) => {
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                ensure_post_import_schema(conn)
            }
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
                Err(error.into())
            }
        },
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
            Err(error)
        }
    }
}

fn ensure_post_import_schema(conn: &Connection) -> InventoryResult<()> {
    ensure_borrowed_in_schema(conn)?;
    ensure_printer_external_slot_schema(conn)?;
    ensure_printer_slot_rfid_override_schema(conn)?;
    ensure_printer_slot_live_cache_schema(conn)?;
    ensure_trusted_lan_schema(conn)?;
    Ok(())
}

fn insert_backup_row(
    conn: &Connection,
    table: &str,
    row: &Map<String, Value>,
) -> InventoryResult<()> {
    if row.is_empty() {
        return Ok(());
    }
    let allowed_columns = table_columns(conn, table)?;
    let columns: Vec<String> = row
        .keys()
        .filter(|column| allowed_columns.contains(*column))
        .cloned()
        .collect();
    if columns.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; columns.len()].join(", ");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({})",
        columns.join(", "),
        placeholders
    );
    let values: Vec<rusqlite::types::Value> = columns
        .iter()
        .map(|column| json_value_to_sql(row.get(column).unwrap_or(&Value::Null)))
        .collect();
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
    Ok(())
}
