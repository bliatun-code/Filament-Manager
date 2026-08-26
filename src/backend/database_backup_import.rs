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
use super::database_spool_price_lock::backfill_historical_spool_price_locks_in_transaction;
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
        backfill_historical_spool_price_locks_in_transaction(conn, "FULL_BACKUP_RESTORE")?;

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
    conn.execute(
        "UPDATE inventory_locations
         SET created_at = COALESCE(created_at, datetime('now')),
             updated_at = COALESCE(updated_at, created_at, datetime('now'))
         WHERE created_at IS NULL OR updated_at IS NULL",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use super::import_full_backup_content;
    use crate::backend::database_backup::export_full_backup_content;
    use crate::backend::database_schema_setup::apply_schema_migrations;

    const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

    #[test]
    fn legacy_full_restore_locks_historical_spools_with_audit_before_commit() {
        let source = Connection::open_in_memory().expect("open source database");
        apply_schema_migrations(&source, SCHEMA_SQL).expect("apply source schema");
        source
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('legacy-history-master', 'PLA', 'Basic', 'Black', 1000, 'Generic');
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, purchase_price_batch_locked
                 ) VALUES
                    ('legacy-empty-restore', 'legacy-history-master', 'EMPTY', 'OWNED', 0),
                    ('legacy-archived-restore', 'legacy-history-master', 'ARCHIVED', 'OWNED', 0);",
            )
            .expect("seed legacy historical rows");

        let mut backup: serde_json::Value =
            serde_json::from_str(&export_full_backup_content(&source).expect("export full backup"))
                .expect("parse exported backup");
        backup["schema_version"] = json!(3);
        for spool in backup["tables"]["filament_spools"]
            .as_array_mut()
            .expect("backup spool rows")
        {
            let spool = spool.as_object_mut().expect("backup spool object");
            spool.remove("purchase_price_batch_locked");
            spool.remove("purchase_price_source");
        }

        let restored = Connection::open_in_memory().expect("open restore database");
        apply_schema_migrations(&restored, SCHEMA_SQL).expect("apply restore schema");
        import_full_backup_content(&restored, &backup.to_string(), SCHEMA_SQL)
            .expect("restore legacy backup");

        let locked: i64 = restored
            .query_row(
                "SELECT SUM(purchase_price_batch_locked = 1)
                 FROM filament_spools
                 WHERE id IN ('legacy-empty-restore', 'legacy-archived-restore')",
                [],
                |row| row.get(0),
            )
            .expect("read restored price locks");
        assert_eq!(locked, 2);

        let audit: (i64, i64) = restored
            .query_row(
                "SELECT
                    COUNT(*),
                    SUM(json_extract(payload_json, '$.source') = 'FULL_BACKUP_RESTORE')
                 FROM spool_history_events
                 WHERE event_type = 'PURCHASE_PRICE_BATCH_LOCK_UPDATED'
                   AND spool_id IN ('legacy-empty-restore', 'legacy-archived-restore')",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read restore audit events");
        assert_eq!(audit, (2, 2));
    }
}
