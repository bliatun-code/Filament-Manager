use rusqlite::{params, Connection};

use super::bambu_lookup::official_bambu_composite_swatch_update;
use super::database_result::InventoryResult;

pub(crate) fn backfill_official_bambu_composite_swatches(
    conn: &Connection,
) -> InventoryResult<usize> {
    let candidates = {
        let mut stmt = conn.prepare(
            "SELECT id, filament_name, color_name, hex_color
             FROM filament_master_list
             WHERE lower(vendor) LIKE '%bambu%'",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut values = Vec::new();
        for row in rows {
            values.push(row?);
        }
        values
    };

    let mut updated = 0;
    for (id, filament_name, color_name, current_hex) in candidates {
        let Some((legacy_hex, composite_swatch)) =
            official_bambu_composite_swatch_update(&filament_name, &color_name)
        else {
            continue;
        };
        let current = current_hex.as_deref().map(str::trim).unwrap_or_default();
        if current.eq_ignore_ascii_case(&composite_swatch) {
            continue;
        }
        if !current.is_empty() && !current.eq_ignore_ascii_case(&legacy_hex) {
            continue;
        }
        updated += conn.execute(
            "UPDATE filament_master_list
             SET hex_color = ?1,
                 updated_at = datetime('now')
             WHERE id = ?2",
            params![composite_swatch, id],
        )?;
    }

    Ok(updated)
}
