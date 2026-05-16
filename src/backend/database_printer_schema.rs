use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_schema::table_has_column;

pub(crate) fn ensure_printer_external_slot_schema(conn: &Connection) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO ams_units (id, printer_id, slot_count, created_at, updated_at)
         SELECT p.id || '_ext', p.id, 1, datetime('now'), datetime('now')
         FROM printers p
         WHERE NOT EXISTS (
            SELECT 1
            FROM ams_units u
            WHERE u.id = p.id || '_ext'
         )",
        [],
    )?;

    conn.execute(
        "UPDATE ams_units
         SET slot_count = 1,
             updated_at = datetime('now')
         WHERE id LIKE '%_ext'
           AND slot_count != 1",
        [],
    )?;

    conn.execute(
        "INSERT INTO ams_slots (id, ams_id, slot_index)
         SELECT u.id || '_slot_1', u.id, 1
         FROM ams_units u
         WHERE u.id LIKE '%_ext'
           AND NOT EXISTS (
             SELECT 1
             FROM ams_slots s
             WHERE s.ams_id = u.id
               AND s.slot_index = 1
           )",
        [],
    )?;

    Ok(())
}

pub(crate) fn ensure_printer_slot_rfid_override_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "ams_slots", "rfid_override_tray_uuid")? {
        conn.execute(
            "ALTER TABLE ams_slots
             ADD COLUMN rfid_override_tray_uuid TEXT",
            [],
        )?;
    }
    if !table_has_column(conn, "ams_slots", "rfid_override_color_hex")? {
        conn.execute(
            "ALTER TABLE ams_slots
             ADD COLUMN rfid_override_color_hex TEXT",
            [],
        )?;
    }
    Ok(())
}

pub(crate) fn ensure_printer_slot_live_cache_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "ams_slots", "live_cache_cleared_at")? {
        conn.execute(
            "ALTER TABLE ams_slots
             ADD COLUMN live_cache_cleared_at TEXT",
            [],
        )?;
    }
    Ok(())
}
