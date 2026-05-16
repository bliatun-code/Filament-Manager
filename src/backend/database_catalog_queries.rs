use rusqlite::{params, Connection};

use super::database_result::InventoryResult;
use super::filament_master_models::FilamentMasterCatalogRow;

pub(crate) fn list_master_catalog(
    conn: &Connection,
    limit: i64,
    search: Option<&str>,
) -> InventoryResult<Vec<FilamentMasterCatalogRow>> {
    let mut results = Vec::new();
    if let Some(raw) = search {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let term = format!("%{}%", trimmed.to_lowercase());
            let mut stmt = conn.prepare(
                "SELECT id, material, filament_name, color_name, hex_color, product_url,
                        default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
                 FROM filament_master_list
                 WHERE lower(material) LIKE ?1
                    OR lower(filament_name) LIKE ?1
                    OR lower(color_name) LIKE ?1
                    OR lower(vendor) LIKE ?1
                 ORDER BY material, filament_name, color_name
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![term, limit], map_catalog_row)?;
            for row in rows {
                results.push(row?);
            }
            return Ok(results);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT id, material, filament_name, color_name, hex_color, product_url,
                default_weight, vendor, last_seen_at, is_discontinued, discontinued_at
         FROM filament_master_list
         ORDER BY material, filament_name, color_name
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], map_catalog_row)?;
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

fn map_catalog_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FilamentMasterCatalogRow> {
    Ok(FilamentMasterCatalogRow {
        id: row.get(0)?,
        material: row.get(1)?,
        filament_name: row.get(2)?,
        color_name: row.get(3)?,
        hex_color: row.get(4)?,
        product_url: row.get(5)?,
        default_weight: row.get(6)?,
        vendor: row.get(7)?,
        last_seen_at: row.get(8)?,
        is_discontinued: row.get::<_, i64>(9)? != 0,
        discontinued_at: row.get(10)?,
    })
}
