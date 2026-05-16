use rusqlite::{params, Connection, OptionalExtension};

use super::database_catalog_inputs::ManualMasterInput;
use super::database_ids::new_id;
use super::filament_database::{InventoryError, InventoryResult};

pub(crate) fn upsert_manual_master(
    conn: &Connection,
    input: ManualMasterInput<'_>,
) -> InventoryResult<String> {
    let ManualMasterInput {
        material,
        filament_name,
        color_name,
        hex_color,
        product_url,
        vendor,
        default_weight,
    } = input;
    let material = material.trim();
    let filament_name = filament_name.trim();
    let color_name = color_name.trim();
    let vendor = vendor
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Manual");
    let default_weight = default_weight.unwrap_or(1000).max(1);
    if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
        return Err(InventoryError::Db(
            "material, filament name and color are required".to_string(),
        ));
    }

    let generated_id = new_id();
    conn.execute(
        "INSERT INTO filament_master_list (
            id, material, filament_name, color_name, hex_color, product_url,
            default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), 0, NULL)
        ON CONFLICT(material, filament_name, color_name) DO UPDATE SET
            hex_color = COALESCE(excluded.hex_color, filament_master_list.hex_color),
            product_url = COALESCE(excluded.product_url, filament_master_list.product_url),
            default_weight = CASE
                WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.default_weight
                ELSE excluded.default_weight
            END,
            vendor = CASE
                WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.vendor
                ELSE excluded.vendor
            END,
            is_discontinued = CASE
                WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.is_discontinued
                ELSE 0
            END,
            discontinued_at = CASE
                WHEN filament_master_list.vendor = 'Bambu' THEN filament_master_list.discontinued_at
                ELSE NULL
            END,
            last_seen_at = datetime('now'),
            updated_at = datetime('now')",
        params![
            generated_id,
            material,
            filament_name,
            color_name,
            hex_color,
            product_url,
            default_weight,
            vendor
        ],
    )?;

    let id: Option<String> = conn
        .query_row(
            "SELECT id
             FROM filament_master_list
             WHERE material = ?1 AND filament_name = ?2 AND color_name = ?3
             LIMIT 1",
            params![material, filament_name, color_name],
            |row| row.get(0),
        )
        .optional()?;
    match id {
        Some(value) => Ok(value),
        None => Err(InventoryError::Db(
            "failed to resolve master id after upsert".to_string(),
        )),
    }
}
