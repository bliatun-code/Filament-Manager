use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::InventoryResult;
use super::database_rows::{map_spool_row, map_spool_with_master_row};
use super::database_spool_models::{SpoolRow, SpoolWithMasterRow};

pub(crate) fn get_spool_by_qr(
    conn: &Connection,
    qr_code: &str,
) -> InventoryResult<Option<SpoolRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, master_id, qr_code, status, ownership_type, owner_name, owner_contact,
                rfid_tag, rfid_observed_at, ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at,
                purchase_currency, supplier_reference, purchase_price_batch_locked,
                purchase_price_source
         FROM filament_spools
         WHERE qr_code = ?1 AND deleted_at IS NULL",
    )?;
    let row = stmt.query_row(params![qr_code], map_spool_row).optional()?;
    Ok(row)
}

pub(crate) fn get_spool_by_id(
    conn: &Connection,
    spool_id: &str,
) -> InventoryResult<Option<SpoolRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, master_id, qr_code, status, ownership_type, owner_name, owner_contact,
                rfid_tag, rfid_observed_at, ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
                location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at,
                purchase_currency, supplier_reference, purchase_price_batch_locked,
                purchase_price_source
         FROM filament_spools
         WHERE id = ?1
         LIMIT 1",
    )?;
    let row = stmt
        .query_row(params![spool_id], map_spool_row)
        .optional()?;
    Ok(row)
}

pub(crate) fn get_spool_with_master_by_id(
    conn: &Connection,
    spool_id: &str,
) -> InventoryResult<Option<SpoolWithMasterRow>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.master_id, s.qr_code, s.status, s.ownership_type, s.owner_name,
                s.owner_contact, s.rfid_tag, s.rfid_observed_at, s.ownership_note, s.initial_weight_g, s.current_weight_g,
                s.remaining_g, s.spool_tare_weight_g, s.location_id, s.home_location_id, s.purchase_date,
                s.purchase_price, s.batch_code, s.last_used_at, s.purchase_currency,
                s.supplier_reference, s.purchase_price_batch_locked, s.purchase_price_source,
                m.id, m.material,
                m.filament_name, m.color_name, m.hex_color, m.product_url, m.default_weight, m.vendor,
                location.name, home_location.name
         FROM filament_spools s
         JOIN filament_master_list m ON m.id = s.master_id
         LEFT JOIN inventory_locations location ON location.id = s.location_id
         LEFT JOIN inventory_locations home_location ON home_location.id = s.home_location_id
         WHERE s.id = ?1 AND s.deleted_at IS NULL
         LIMIT 1",
    )?;
    let row = stmt
        .query_row(params![spool_id], map_spool_with_master_row)
        .optional()?;
    Ok(row)
}

pub(crate) fn list_spools_with_master_by_rfid(
    conn: &Connection,
    rfid_tag: &str,
) -> InventoryResult<Vec<SpoolWithMasterRow>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.master_id, s.qr_code, s.status, s.ownership_type, s.owner_name,
                s.owner_contact, s.rfid_tag, s.rfid_observed_at, s.ownership_note, s.initial_weight_g, s.current_weight_g,
                s.remaining_g, s.spool_tare_weight_g, s.location_id, s.home_location_id, s.purchase_date,
                s.purchase_price, s.batch_code, s.last_used_at, s.purchase_currency,
                s.supplier_reference, s.purchase_price_batch_locked, s.purchase_price_source,
                m.id, m.material,
                m.filament_name, m.color_name, m.hex_color, m.product_url, m.default_weight, m.vendor,
                location.name, home_location.name
         FROM filament_spools s
         JOIN filament_master_list m ON m.id = s.master_id
         LEFT JOIN inventory_locations location ON location.id = s.location_id
         LEFT JOIN inventory_locations home_location ON home_location.id = s.home_location_id
         WHERE s.deleted_at IS NULL
           AND trim(s.rfid_tag) COLLATE NOCASE = trim(?1) COLLATE NOCASE
         ORDER BY s.updated_at DESC, s.id DESC",
    )?;
    let rows = stmt.query_map(params![rfid_tag], map_spool_with_master_row)?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn list_spools_with_master(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> InventoryResult<Vec<SpoolWithMasterRow>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.master_id, s.qr_code, s.status, s.ownership_type, s.owner_name,
                s.owner_contact, s.rfid_tag, s.rfid_observed_at, s.ownership_note, s.initial_weight_g, s.current_weight_g,
                s.remaining_g, s.spool_tare_weight_g, s.location_id, s.home_location_id, s.purchase_date,
                s.purchase_price, s.batch_code, s.last_used_at, s.purchase_currency,
                s.supplier_reference, s.purchase_price_batch_locked, s.purchase_price_source,
                m.id, m.material,
                m.filament_name, m.color_name, m.hex_color, m.product_url, m.default_weight, m.vendor,
                location.name, home_location.name
         FROM filament_spools s
         JOIN filament_master_list m ON m.id = s.master_id
         LEFT JOIN inventory_locations location ON location.id = s.location_id
         LEFT JOIN inventory_locations home_location ON home_location.id = s.home_location_id
         WHERE s.deleted_at IS NULL
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let rows = stmt.query_map(params![limit, offset], map_spool_with_master_row)?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn list_all_spools_with_master(
    conn: &Connection,
) -> InventoryResult<Vec<SpoolWithMasterRow>> {
    list_spools_with_master(conn, i64::MAX, 0)
}
