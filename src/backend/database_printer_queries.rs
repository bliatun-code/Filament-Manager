use rusqlite::{params, Connection, OptionalExtension};

use super::database_printer_models::{
    PrinterAmsSlotRow, PrinterOverviewRow, PrinterRow, PrinterUsageRow,
};
use super::database_result::InventoryResult;

pub(crate) fn list_printers(conn: &Connection) -> InventoryResult<Vec<PrinterRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, model, name, created_at, updated_at
         FROM printers
         ORDER BY created_at ASC, name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PrinterRow {
            id: row.get(0)?,
            model: row.get(1)?,
            name: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn printer_exists(conn: &Connection, printer_id: &str) -> InventoryResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1
             FROM printers
             WHERE id = ?1
             LIMIT 1",
            params![printer_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub(crate) fn list_printer_overview(conn: &Connection) -> InventoryResult<Vec<PrinterOverviewRow>> {
    let printers = list_printers(conn)?;
    let mut output = Vec::with_capacity(printers.len());

    for printer in printers {
        let usage = conn.query_row(
            "SELECT
                COUNT(*) AS total_jobs,
                COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS successful_jobs,
                COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failed_jobs,
                COALESCE(SUM(material_used_g), 0) AS total_used_g,
                MAX(ended_at) AS last_job_at
             FROM print_jobs
             WHERE printer_id = ?1",
            params![&printer.id],
            |row| {
                Ok(PrinterUsageRow {
                    total_jobs: row.get(0)?,
                    successful_jobs: row.get(1)?,
                    failed_jobs: row.get(2)?,
                    total_used_g: row.get(3)?,
                    last_job_at: row.get(4)?,
                })
            },
        )?;

        let mut stmt = conn.prepare(
            "SELECT
                s.id, s.ams_id, s.slot_index, s.spool_id,
                sp.status,
                CASE
                    WHEN sp.id IS NULL THEN NULL
                    ELSE COALESCE(NULLIF(sp.ownership_type, ''), 'OWNED')
                END AS spool_ownership_type,
                NULLIF(sp.owner_name, '') AS spool_owner_name,
                sp.remaining_g,
                sp.rfid_tag,
                m.material, m.filament_name, m.color_name, m.hex_color,
                s.rfid_override_tray_uuid, s.rfid_override_color_hex,
                s.live_cache_cleared_at
             FROM ams_slots s
             JOIN ams_units u ON u.id = s.ams_id
             LEFT JOIN filament_spools sp ON sp.id = s.spool_id AND sp.deleted_at IS NULL
             LEFT JOIN filament_master_list m ON m.id = sp.master_id
             WHERE u.printer_id = ?1
             ORDER BY
                CASE WHEN u.id LIKE '%_ext' THEN 1 ELSE 0 END ASC,
                CASE WHEN u.id LIKE '%_ams_%' THEN 0 ELSE 1 END ASC,
                CASE
                    WHEN u.id LIKE '%_ams_%'
                    THEN CAST(substr(u.id, instr(u.id, '_ams_') + 5) AS INTEGER)
                    ELSE NULL
                END ASC,
                u.id COLLATE NOCASE ASC,
                s.slot_index ASC,
                s.id COLLATE NOCASE ASC",
        )?;
        let rows = stmt.query_map(params![&printer.id], |row| {
            Ok(PrinterAmsSlotRow {
                slot_id: row.get(0)?,
                ams_id: row.get(1)?,
                slot_index: row.get(2)?,
                spool_id: row.get(3)?,
                spool_status: row.get(4)?,
                spool_ownership_type: row.get(5)?,
                spool_owner_name: row.get(6)?,
                spool_remaining_g: row.get(7)?,
                spool_rfid_tag: row.get(8)?,
                spool_material: row.get(9)?,
                spool_filament_name: row.get(10)?,
                spool_color_name: row.get(11)?,
                spool_hex_color: row.get(12)?,
                rfid_override_tray_uuid: row.get(13)?,
                rfid_override_color_hex: row.get(14)?,
                live_cache_cleared_at: row.get(15)?,
                live_loaded: None,
                live_observed_rfid_tag: None,
                live_tray_uuid: None,
                live_chip_id: None,
                live_tray_info_idx: None,
                live_tray_id_name: None,
                live_filament_type: None,
                live_filament_name: None,
                live_color_hex: None,
                live_tray_weight_g: None,
                live_remaining_percent: None,
                live_last_identity_seen_at: None,
                live_match_status: None,
                live_match_note: None,
                live_matched_inventory_spool_id: None,
                live_matched_inventory_mode: None,
                live_is_active: None,
                live_printer_last_seen_at: None,
                live_mqtt_connected: None,
                live_ams_read_done_bits: None,
                live_ams_bambu_bits: None,
            })
        })?;
        let mut slots = Vec::new();
        for row in rows {
            slots.push(row?);
        }

        output.push(PrinterOverviewRow {
            printer,
            usage,
            slots,
        });
    }

    Ok(output)
}
