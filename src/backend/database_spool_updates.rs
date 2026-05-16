use rusqlite::{params, Connection};

use super::database_result::{require_rows, InventoryResult};
use super::database_text::normalize_optional_text;

pub(crate) fn update_spool_status(
    conn: &Connection,
    spool_id: &str,
    status: &str,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET status = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL",
        params![status, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn update_spool_weight(
    conn: &Connection,
    spool_id: &str,
    current_weight_g: Option<i64>,
    remaining_g: Option<i64>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET current_weight_g = ?1, remaining_g = ?2, updated_at = datetime('now')
         WHERE id = ?3 AND deleted_at IS NULL",
        params![current_weight_g, remaining_g, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn update_spool_tare_weight(
    conn: &Connection,
    spool_id: &str,
    spool_tare_weight_g: Option<i64>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET spool_tare_weight_g = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL",
        params![spool_tare_weight_g, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn update_spool_rfid_tag(
    conn: &Connection,
    spool_id: &str,
    rfid_tag: Option<&str>,
    rfid_observed_at: Option<&str>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET rfid_tag = ?1, rfid_observed_at = ?2, updated_at = datetime('now')
         WHERE id = ?3 AND deleted_at IS NULL",
        params![
            normalize_optional_text(rfid_tag),
            normalize_optional_text(rfid_observed_at),
            spool_id
        ],
    )?;
    require_rows(affected)
}

pub(crate) fn set_spool_location(
    conn: &Connection,
    spool_id: &str,
    location_id: Option<&str>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET location_id = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL",
        params![location_id, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn update_spool_details(
    conn: &Connection,
    spool_id: &str,
    qr_code: Option<&str>,
    status: &str,
    location_id: Option<&str>,
    home_location_id: Option<&str>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET qr_code = ?1,
             status = ?2,
             location_id = ?3,
             home_location_id = ?4,
             updated_at = datetime('now')
         WHERE id = ?5 AND deleted_at IS NULL",
        params![qr_code, status, location_id, home_location_id, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn set_spool_home_location(
    conn: &Connection,
    spool_id: &str,
    home_location_id: Option<&str>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET home_location_id = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL",
        params![home_location_id, spool_id],
    )?;
    require_rows(affected)
}

pub(crate) fn update_spool_ownership_metadata(
    conn: &Connection,
    spool_id: &str,
    owner_name: Option<&str>,
    owner_contact: Option<&str>,
    ownership_note: Option<&str>,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE filament_spools
         SET owner_name = ?1,
             owner_contact = ?2,
             ownership_note = ?3,
             updated_at = datetime('now')
         WHERE id = ?4
           AND deleted_at IS NULL",
        params![
            normalize_optional_text(owner_name),
            normalize_optional_text(owner_contact),
            normalize_optional_text(ownership_note),
            spool_id
        ],
    )?;
    require_rows(affected)
}
