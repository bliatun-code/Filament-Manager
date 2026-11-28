use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};

use super::bambu_live_settings::bambu_live_integration_setting_key;
use super::database_loan_queries::ensure_spool_not_outbound_loan_locked;
use super::database_result::require_rows;
use super::database_result::{InventoryError, InventoryResult};
use super::printer_slot_location::{
    format_printer_slot_location, PRINTER_SLOT_LOCATION_PREDICATE_SQL,
};
use super::spool_defaults::SPOOL_STATUS_ASSIGNED_PREDICATE_SQL;

pub(crate) fn upsert_printer_with_ams(
    conn: &Connection,
    printer_id: &str,
    model: &str,
    name: &str,
    ams_units: i64,
    slots_per_unit: i64,
) -> InventoryResult<bool> {
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
    let tx = rusqlite::Transaction::new_unchecked(conn, rusqlite::TransactionBehavior::Immediate)?;

    let previous_name: Option<String> = tx
        .query_row(
            "SELECT name FROM printers WHERE id = ?1",
            [printer_id],
            |row| row.get(0),
        )
        .optional()?;
    let renamed_from = previous_name.as_deref().filter(|old| *old != name);
    let mut obsolete_locations = HashSet::new();
    if let Some(old) = renamed_from {
        let mut stmt = tx.prepare(
            "SELECT s.id FROM ams_slots s JOIN ams_units u ON u.id = s.ams_id WHERE u.printer_id = ?1",
        )?;
        for slot in stmt.query_map([printer_id], |row| row.get::<_, String>(0))? {
            obsolete_locations.insert(format_printer_slot_location(old, &slot?));
        }
    }
    let mut placements_changed = false;
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
                    placements_changed = true;
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

    placements_changed |=
        sync_assigned_slot_locations(&tx, printer_id, name, &mut obsolete_locations)?;
    for old in obsolete_locations {
        let removed = tx.execute(
            "DELETE FROM inventory_locations WHERE id = ?1 AND type = 'PRINTER_SLOT'
             AND NOT EXISTS (SELECT 1 FROM filament_spools WHERE location_id = ?1 OR home_location_id = ?1)
             AND NOT EXISTS (SELECT 1 FROM inventory_locations WHERE parent_id = ?1)",
            [old],
        )?;
        placements_changed |= removed > 0;
    }
    tx.commit()?;
    Ok(placements_changed)
}

// Use the actual assigned slot so that saving also repairs names left stale by older versions.
fn sync_assigned_slot_locations(
    conn: &Connection,
    printer_id: &str,
    name: &str,
    obsolete_locations: &mut HashSet<String>,
) -> InventoryResult<bool> {
    let mut stmt = conn.prepare(
        "SELECT s.id, f.id, f.location_id FROM ams_slots s
        JOIN ams_units u ON u.id = s.ams_id
        JOIN filament_spools f ON f.id = s.spool_id
        JOIN inventory_locations l ON l.id = f.location_id
        WHERE u.printer_id = ?1 AND f.deleted_at IS NULL AND l.type = 'PRINTER_SLOT'",
    )?;
    let assigned = stmt
        .query_map([printer_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut changed = false;
    for (slot, spool, old_location) in assigned {
        let location = format_printer_slot_location(name, &slot);
        if old_location == location || !old_location.ends_with(&format!(":{slot}")) {
            continue;
        }
        super::database_printer_slot_assignment::ensure_slot_location(conn, &location)?;
        conn.execute(
            "UPDATE filament_spools SET location_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![location, spool],
        )?;
        obsolete_locations.insert(old_location);
        changed = true;
    }
    Ok(changed)
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
        "DELETE FROM printer_live_usage_session_spools
         WHERE session_id IN (
            SELECT id FROM printer_live_usage_sessions WHERE printer_id = ?1
         )",
        params![printer_id],
    )?;
    tx.execute(
        "DELETE FROM printer_live_usage_sessions
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
    ensure_spool_not_outbound_loan_locked(conn, spool_id)?;
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
