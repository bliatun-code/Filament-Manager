use rusqlite::{params, Connection, OptionalExtension};

use super::filament_database::InventoryResult;

pub(crate) fn spool_assigned_to_printer(
    conn: &Connection,
    spool_id: &str,
) -> InventoryResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1
             FROM ams_slots s
             JOIN ams_units u ON u.id = s.ams_id
             JOIN printers p ON p.id = u.printer_id
             WHERE s.spool_id = ?1
             LIMIT 1",
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub(crate) fn spool_assigned_to_specific_printer(
    conn: &Connection,
    spool_id: &str,
    printer_id: &str,
) -> InventoryResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1
             FROM ams_slots s
             JOIN ams_units u ON u.id = s.ams_id
             WHERE s.spool_id = ?1
               AND u.printer_id = ?2
             LIMIT 1",
            params![spool_id, printer_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}
