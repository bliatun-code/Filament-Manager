use std::collections::HashSet;

use rusqlite::{params, Connection};

use super::bambu_live_settings::bambu_live_integration_setting_key;
use super::database_result::require_rows;
use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn upsert_printer_with_ams(
    conn: &Connection,
    printer_id: &str,
    model: &str,
    name: &str,
    ams_units: i64,
    slots_per_unit: i64,
) -> InventoryResult<()> {
    let printer_id = printer_id.trim();
    let model = model.trim();
    let name = name.trim();
    if printer_id.is_empty() || model.is_empty() || name.is_empty() {
        return Err(InventoryError::Db(
            "printer id, model and name are required".to_string(),
        ));
    }

    let unit_count = ams_units.clamp(0, 4);
    let slot_count = slots_per_unit.clamp(1, 8);
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO printers (id, model, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            model = excluded.model,
            name = excluded.name,
            updated_at = datetime('now')",
        params![printer_id, model, name],
    )?;

    let ext_ams_id = format!("{printer_id}_ext");
    let mut target_ams_ids: HashSet<String> = HashSet::new();
    target_ams_ids.insert(ext_ams_id.clone());
    for unit_idx in 1..=unit_count {
        target_ams_ids.insert(format!("{printer_id}_ams_{unit_idx}"));
    }

    {
        let mut units_stmt = tx.prepare(
            "SELECT id
             FROM ams_units
             WHERE printer_id = ?1",
        )?;
        let existing_units = units_stmt.query_map(params![printer_id], |row| row.get(0))?;
        for unit in existing_units {
            let ams_id: String = unit?;
            let keep_unit = target_ams_ids.contains(&ams_id);
            let keep_slots = if ams_id == ext_ams_id {
                1
            } else if keep_unit {
                slot_count
            } else {
                0
            };

            let mut removable_slot_stmt = tx.prepare(
                "SELECT id, spool_id
                 FROM ams_slots
                 WHERE ams_id = ?1
                   AND (?2 = 0 OR slot_index > ?2)",
            )?;
            let removable_slots = removable_slot_stmt
                .query_map(params![ams_id, keep_slots], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                })?;

            for slot in removable_slots {
                let (slot_id, spool_id) = slot?;
                if let Some(assigned_spool_id) = spool_id {
                    release_printer_spool(&tx, &assigned_spool_id)?;
                }
                tx.execute("DELETE FROM ams_slots WHERE id = ?1", params![slot_id])?;
            }

            if !keep_unit {
                tx.execute("DELETE FROM ams_units WHERE id = ?1", params![ams_id])?;
            }
        }
    }

    tx.execute(
        "INSERT INTO ams_units (id, printer_id, slot_count, created_at, updated_at)
         VALUES (?1, ?2, 1, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            printer_id = excluded.printer_id,
            slot_count = 1,
            updated_at = datetime('now')",
        params![ext_ams_id, printer_id],
    )?;
    let ext_slot_id = format!("{printer_id}_ext_slot_1");
    tx.execute(
        "INSERT OR IGNORE INTO ams_slots (id, ams_id, slot_index)
         VALUES (?1, ?2, 1)",
        params![ext_slot_id, format!("{printer_id}_ext")],
    )?;

    for unit_idx in 1..=unit_count {
        let ams_id = format!("{printer_id}_ams_{unit_idx}");
        tx.execute(
            "INSERT INTO ams_units (id, printer_id, slot_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                printer_id = excluded.printer_id,
                slot_count = excluded.slot_count,
                updated_at = datetime('now')",
            params![ams_id, printer_id, slot_count],
        )?;

        for slot_idx in 1..=slot_count {
            let slot_id = format!("{ams_id}_slot_{slot_idx}");
            tx.execute(
                "INSERT OR IGNORE INTO ams_slots (id, ams_id, slot_index)
                 VALUES (?1, ?2, ?3)",
                params![slot_id, ams_id, slot_idx],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}

pub(crate) fn delete_printer(conn: &Connection, printer_id: &str) -> InventoryResult<()> {
    let bambu_live_integration_key = bambu_live_integration_setting_key(printer_id.trim());
    let tx = conn.unchecked_transaction()?;

    {
        let mut stmt = tx.prepare(
            "SELECT s.spool_id
             FROM ams_slots s
             JOIN ams_units u ON u.id = s.ams_id
             WHERE u.printer_id = ?1
               AND s.spool_id IS NOT NULL",
        )?;
        let rows = stmt.query_map(params![printer_id], |row| row.get::<_, Option<String>>(0))?;
        for row in rows {
            if let Some(spool_id) = row? {
                release_printer_spool(&tx, &spool_id)?;
            }
        }
    }

    tx.execute(
        "DELETE FROM print_jobs
         WHERE printer_id = ?1",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM printer_live_events
         WHERE printer_id = ?1",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM ams_slots
         WHERE ams_id IN (
            SELECT id FROM ams_units WHERE printer_id = ?1
         )",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM ams_units
         WHERE printer_id = ?1",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM settings
         WHERE key = 'active_printer_id' AND value = ?1",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM settings
         WHERE key = ?1",
        params![bambu_live_integration_key],
    )?;
    let removed = tx.execute(
        "DELETE FROM printers
         WHERE id = ?1",
        params![printer_id],
    )?;
    require_rows(removed)?;

    tx.commit()?;
    Ok(())
}

fn release_printer_spool(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    conn.execute(
        "UPDATE filament_spools
         SET status = CASE WHEN status IN ('IN_USE', 'ASSIGNED') THEN 'IN_STOCK' ELSE status END,
             location_id = CASE
                 WHEN location_id LIKE 'Printer:%' THEN home_location_id
                 ELSE location_id
             END,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![spool_id],
    )?;
    Ok(())
}
