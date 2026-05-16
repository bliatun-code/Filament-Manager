use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::InventoryResult;
use super::filament_master_models::EsunColorNormalizationStats;
use super::vendor_lookup::normalize_esun_color_name_for_catalog;

pub(crate) fn normalize_esun_catalog_colors(
    conn: &Connection,
) -> InventoryResult<EsunColorNormalizationStats> {
    let mut stmt = conn.prepare(
        "SELECT id, material, filament_name, color_name
         FROM filament_master_list
         WHERE lower(vendor) = 'esun'
         ORDER BY material, filament_name, color_name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    let mut scanned_count = 0i64;
    let mut normalized_count = 0i64;
    let mut merged_count = 0i64;
    let mut skipped_conflicts = 0i64;

    for row in rows {
        let (master_id, material, filament_name, color_name) = row?;
        scanned_count += 1;
        let normalized_color =
            normalize_esun_color_name_for_catalog(&color_name, &material, &filament_name);
        if normalized_color.eq_ignore_ascii_case(color_name.trim()) {
            continue;
        }

        let conflict: Option<(String, String)> = conn
            .query_row(
                "SELECT id, vendor
                 FROM filament_master_list
                 WHERE id != ?1
                   AND material = ?2
                   AND filament_name = ?3
                   AND lower(color_name) = lower(?4)
                 LIMIT 1",
                params![master_id, material, filament_name, normalized_color],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        if let Some((target_master_id, target_vendor)) = conflict {
            if target_vendor.eq_ignore_ascii_case("eSUN") {
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
                         vendor = 'eSUN',
                         updated_at = datetime('now')
                     WHERE master_id = ?5",
                    params![
                        target_master_id,
                        material,
                        filament_name,
                        normalized_color,
                        master_id
                    ],
                )?;
                conn.execute(
                    "UPDATE wishlist_items
                     SET material = ?1,
                         filament_name = ?2,
                         color_name = ?3,
                         vendor = 'eSUN',
                         updated_at = datetime('now')
                     WHERE master_id IS NULL
                       AND lower(vendor) = 'esun'
                       AND material = ?1
                       AND filament_name = ?2
                       AND color_name = ?4",
                    params![material, filament_name, normalized_color, color_name],
                )?;
                conn.execute(
                    "DELETE FROM filament_master_list WHERE id = ?1",
                    params![master_id],
                )?;
                normalized_count += 1;
                merged_count += 1;
            } else {
                skipped_conflicts += 1;
            }
            continue;
        }

        conn.execute(
            "UPDATE filament_master_list
             SET color_name = ?1,
                 updated_at = datetime('now')
             WHERE id = ?2",
            params![normalized_color, master_id],
        )?;
        conn.execute(
            "UPDATE wishlist_items
             SET color_name = ?1,
                 updated_at = datetime('now')
             WHERE master_id = ?2",
            params![normalized_color, master_id],
        )?;
        conn.execute(
            "UPDATE wishlist_items
             SET color_name = ?1,
                 vendor = 'eSUN',
                 updated_at = datetime('now')
             WHERE master_id IS NULL
               AND lower(vendor) = 'esun'
               AND material = ?2
               AND filament_name = ?3
               AND color_name = ?4",
            params![normalized_color, material, filament_name, color_name],
        )?;
        normalized_count += 1;
    }

    Ok(EsunColorNormalizationStats {
        scanned_count,
        normalized_count,
        merged_count,
        skipped_conflicts,
    })
}
