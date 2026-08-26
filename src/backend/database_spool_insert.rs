use rusqlite::{params, Connection};

use super::database_result::InventoryResult;
use super::database_spool_models::SpoolRow;
use super::inventory_domain::is_historical_spool_status;

pub(crate) fn insert_spool(conn: &Connection, spool: &SpoolRow) -> InventoryResult<()> {
    let purchase_price_batch_locked =
        spool.purchase_price_batch_locked || is_historical_spool_status(Some(&spool.status));
    conn.execute(
        "INSERT INTO filament_spools (
            id, master_id, qr_code, rfid_tag, rfid_observed_at, status, ownership_type, owner_name, owner_contact,
            ownership_note, initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g,
            location_id, home_location_id, purchase_date, purchase_price, batch_code, last_used_at,
            purchase_currency, supplier_reference, purchase_price_batch_locked, purchase_price_source
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
        params![
            spool.id,
            spool.master_id,
            spool.qr_code,
            spool.rfid_tag,
            spool.rfid_observed_at,
            spool.status,
            spool.ownership_type,
            spool.owner_name,
            spool.owner_contact,
            spool.ownership_note,
            spool.initial_weight_g,
            spool.current_weight_g,
            spool.remaining_g,
            spool.spool_tare_weight_g,
            spool.location_id,
            spool.home_location_id,
            spool.purchase_date,
            spool.purchase_price,
            spool.batch_code,
            spool.last_used_at,
            spool.purchase_currency,
            spool.supplier_reference,
            purchase_price_batch_locked,
            spool.purchase_price_source.as_deref().or_else(|| {
                spool.purchase_price.map(|_| "MANUAL")
            })
        ],
    )?;
    Ok(())
}
