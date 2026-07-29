use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::{InventoryError, InventoryResult};
use super::database_text::normalize_optional_text;
use super::printer_slot_location::{
    format_printer_slot_location, is_printer_slot_location, PRINTER_SLOT_LOCATION_PREDICATE_SQL,
};
use super::spool_defaults::SPOOL_STATUS_ASSIGNED_PREDICATE_SQL;

pub(crate) fn assign_spool_to_ams_slot(
    conn: &Connection,
    printer_id: &str,
    slot_id: &str,
    spool_id: Option<&str>,
    rfid_override_tray_uuid: Option<&str>,
    rfid_override_color_hex: Option<&str>,
    clear_live_cache_before_next_refresh: bool,
) -> InventoryResult<()> {
    let tx = conn.unchecked_transaction()?;
    assign_spool_to_ams_slot_in_transaction(
        &tx,
        printer_id,
        slot_id,
        spool_id,
        rfid_override_tray_uuid,
        rfid_override_color_hex,
        clear_live_cache_before_next_refresh,
    )?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn assign_spool_to_ams_slot_in_transaction(
    conn: &Connection,
    printer_id: &str,
    slot_id: &str,
    spool_id: Option<&str>,
    rfid_override_tray_uuid: Option<&str>,
    rfid_override_color_hex: Option<&str>,
    clear_live_cache_before_next_refresh: bool,
) -> InventoryResult<()> {
    let slot_entry: Option<(Option<String>, String)> = conn
        .query_row(
            "SELECT s.spool_id, p.name
             FROM ams_slots s
             JOIN ams_units u ON u.id = s.ams_id
             JOIN printers p ON p.id = u.printer_id
             WHERE s.id = ?1 AND p.id = ?2
             LIMIT 1",
            params![slot_id, printer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let (previous_spool_id, printer_name) = slot_entry.ok_or(InventoryError::NotFound)?;

    if let Some(candidate_spool_id) = spool_id {
        ensure_spool_exists(conn, candidate_spool_id)?;
    }

    conn.execute(
        "UPDATE ams_slots
         SET spool_id = ?1,
             last_seen_at = datetime('now'),
             rfid_override_tray_uuid = ?3,
             rfid_override_color_hex = ?4,
             live_cache_cleared_at = CASE
                 WHEN ?5 = 1 THEN datetime('now')
                 ELSE NULL
             END
         WHERE id = ?2",
        params![
            spool_id,
            slot_id,
            normalize_optional_text(rfid_override_tray_uuid),
            normalize_optional_text(rfid_override_color_hex),
            if clear_live_cache_before_next_refresh {
                1
            } else {
                0
            }
        ],
    )?;

    if previous_spool_id.as_deref() != spool_id {
        if let Some(old_spool_id) = previous_spool_id {
            release_printer_spool(conn, &old_spool_id)?;
        }

        if let Some(new_spool_id) = spool_id {
            clear_spool_from_other_slots(conn, new_spool_id, slot_id)?;
            assign_spool_location(conn, new_spool_id, &printer_name, slot_id)?;
        }
    }

    Ok(())
}

fn ensure_spool_exists(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let exists: Option<String> = conn
        .query_row(
            "SELECT id
             FROM filament_spools
             WHERE id = ?1 AND deleted_at IS NULL
             LIMIT 1",
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(InventoryError::NotFound);
    }
    Ok(())
}

fn release_printer_spool(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let sql = format!(
        "UPDATE filament_spools
             SET status = CASE WHEN {SPOOL_STATUS_ASSIGNED_PREDICATE_SQL} THEN 'IN_STOCK' ELSE status END,
                 location_id = CASE
                     WHEN {PRINTER_SLOT_LOCATION_PREDICATE_SQL} THEN home_location_id
                     ELSE location_id
                 END,
                 updated_at = datetime('now')
             WHERE id = ?1 AND deleted_at IS NULL"
    );
    conn.execute(&sql, params![spool_id])?;
    Ok(())
}

fn clear_spool_from_other_slots(
    conn: &Connection,
    spool_id: &str,
    active_slot_id: &str,
) -> InventoryResult<()> {
    conn.execute(
        "UPDATE ams_slots
         SET spool_id = NULL,
             last_seen_at = datetime('now')
         WHERE spool_id = ?1
           AND id != ?2",
        params![spool_id, active_slot_id],
    )?;
    Ok(())
}

fn assign_spool_location(
    conn: &Connection,
    spool_id: &str,
    printer_name: &str,
    slot_id: &str,
) -> InventoryResult<()> {
    let location = format_printer_slot_location(printer_name, slot_id);
    debug_assert!(is_printer_slot_location(&location));
    conn.execute(
        "INSERT INTO inventory_locations (id, name, type)
         VALUES (?1, ?2, 'PRINTER_SLOT')
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name",
        params![location, location],
    )?;
    conn.execute(
        "UPDATE filament_spools
         SET status = 'ASSIGNED',
             location_id = ?2,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![spool_id, location],
    )?;
    Ok(())
}
