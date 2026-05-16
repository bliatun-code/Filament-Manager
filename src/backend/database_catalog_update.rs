use rusqlite::{params, Connection, OptionalExtension};

use super::database_catalog_inputs::{MasterCatalogExistingRow, MasterCatalogUpdateInput};
use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn update_master_catalog_entry(
    conn: &Connection,
    input: MasterCatalogUpdateInput<'_>,
) -> InventoryResult<String> {
    let MasterCatalogUpdateInput {
        master_id,
        material,
        filament_name,
        color_name,
        hex_color,
        product_url,
        vendor,
        default_weight,
    } = input;
    let existing: Option<MasterCatalogExistingRow> = conn
        .query_row(
            "SELECT material, filament_name, color_name, hex_color, product_url, default_weight, vendor
             FROM filament_master_list
             WHERE id = ?1
             LIMIT 1",
            params![master_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .optional()?;

    let Some((
        old_material,
        old_filament_name,
        old_color_name,
        old_hex_color,
        old_product_url,
        old_default_weight,
        old_vendor,
    )) = existing
    else {
        return Err(InventoryError::NotFound);
    };

    let material = material.trim();
    let filament_name = filament_name.trim();
    let color_name = color_name.trim();
    if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
        return Err(InventoryError::Db(
            "material, filament name and color are required".to_string(),
        ));
    }

    let vendor = vendor
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(old_vendor.as_str())
        .to_string();
    let default_weight = default_weight.unwrap_or(old_default_weight).max(1);
    let normalized_hex = hex_color
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .or(old_hex_color);
    let normalized_product = product_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .or(old_product_url);

    let duplicate_master_id: Option<String> = conn
        .query_row(
            "SELECT id
             FROM filament_master_list
             WHERE id != ?1
               AND material = ?2
               AND filament_name = ?3
               AND color_name = ?4
             LIMIT 1",
            params![master_id, material, filament_name, color_name],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(target_master_id) = duplicate_master_id {
        conn.execute(
            "UPDATE filament_master_list
             SET hex_color = COALESCE(?1, hex_color),
                 product_url = COALESCE(?2, product_url),
                 default_weight = ?3,
                 vendor = ?4,
                 is_discontinued = CASE WHEN ?4 = 'Bambu' THEN is_discontinued ELSE 0 END,
                 discontinued_at = CASE WHEN ?4 = 'Bambu' THEN discontinued_at ELSE NULL END,
                 last_seen_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ?5",
            params![
                normalized_hex,
                normalized_product,
                default_weight,
                vendor,
                target_master_id
            ],
        )?;
        conn.execute(
            "UPDATE filament_spools
             SET master_id = ?1
             WHERE master_id = ?2",
            params![target_master_id, master_id],
        )?;
        conn.execute(
            "UPDATE wishlist_items
             SET master_id = ?1,
                 material = ?2,
                 filament_name = ?3,
                 color_name = ?4,
                 vendor = ?5,
                 updated_at = datetime('now')
             WHERE master_id = ?6",
            params![
                target_master_id,
                material,
                filament_name,
                color_name,
                vendor,
                master_id
            ],
        )?;
        conn.execute(
            "UPDATE wishlist_items
             SET material = ?1,
                 filament_name = ?2,
                 color_name = ?3,
                 vendor = ?4,
                 updated_at = datetime('now')
             WHERE master_id IS NULL
               AND lower(vendor) = lower(?5)
               AND material = ?6
               AND filament_name = ?7
               AND color_name = ?8",
            params![
                material,
                filament_name,
                color_name,
                vendor,
                old_vendor,
                old_material,
                old_filament_name,
                old_color_name
            ],
        )?;
        conn.execute(
            "DELETE FROM filament_master_list WHERE id = ?1",
            params![master_id],
        )?;
        return Ok(target_master_id);
    }

    conn.execute(
        "UPDATE filament_master_list
         SET material = ?1,
             filament_name = ?2,
             color_name = ?3,
             hex_color = ?4,
             product_url = ?5,
             default_weight = ?6,
             vendor = ?7,
             is_discontinued = CASE WHEN ?7 = 'Bambu' THEN is_discontinued ELSE 0 END,
             discontinued_at = CASE WHEN ?7 = 'Bambu' THEN discontinued_at ELSE NULL END,
             last_seen_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?8",
        params![
            material,
            filament_name,
            color_name,
            normalized_hex,
            normalized_product,
            default_weight,
            vendor,
            master_id
        ],
    )?;
    conn.execute(
        "UPDATE wishlist_items
         SET material = ?1,
             filament_name = ?2,
             color_name = ?3,
             vendor = ?4,
             updated_at = datetime('now')
         WHERE master_id = ?5",
        params![material, filament_name, color_name, vendor, master_id],
    )?;
    conn.execute(
        "UPDATE wishlist_items
         SET material = ?1,
             filament_name = ?2,
             color_name = ?3,
             vendor = ?4,
             updated_at = datetime('now')
         WHERE master_id IS NULL
           AND lower(vendor) = lower(?5)
           AND material = ?6
           AND filament_name = ?7
           AND color_name = ?8",
        params![
            material,
            filament_name,
            color_name,
            vendor,
            old_vendor,
            old_material,
            old_filament_name,
            old_color_name
        ],
    )?;

    Ok(master_id.to_string())
}
