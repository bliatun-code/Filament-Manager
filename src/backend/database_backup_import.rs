use rusqlite::Connection;

use super::database_backup::{
    ensure_full_backup_is_safe_to_import, ensure_full_backup_rows_are_importable,
    insert_portable_full_backup_rows, parse_full_backup_content,
};
use super::database_borrowed_schema::ensure_borrowed_in_schema;
use super::database_printer_schema::{
    ensure_printer_external_slot_schema, ensure_printer_slot_live_cache_schema,
    ensure_printer_slot_rfid_override_schema,
};
use super::database_result::InventoryResult;
use super::database_schema::{
    ensure_database_quick_check, ensure_no_foreign_key_violations, ensure_supported_schema_version,
};
use super::database_table_ops::delete_all_rows;
use super::database_tables::FULL_BACKUP_TABLES;
use super::database_trusted_lan_schema::ensure_trusted_lan_schema;

pub(crate) fn import_full_backup_content(
    conn: &Connection,
    content: &str,
    schema_sql: &str,
) -> InventoryResult<()> {
    let parsed = parse_full_backup_content(content)?;
    ensure_full_backup_is_safe_to_import(&parsed)?;
    ensure_full_backup_rows_are_importable(&parsed, schema_sql)?;

    conn.execute_batch(schema_sql)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;",
    )?;
    let result: InventoryResult<()> = (|| {
        delete_all_rows(conn, &FULL_BACKUP_TABLES)?;

        insert_portable_full_backup_rows(conn, &parsed)?;
        ensure_post_import_schema(conn)?;

        ensure_no_foreign_key_violations(conn, "Full backup import")?;
        ensure_supported_schema_version(conn)?;
        ensure_database_quick_check(conn)?;

        Ok(())
    })();

    match result {
        Ok(()) => match conn.execute_batch("COMMIT") {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(error.into())
            }
        },
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
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
