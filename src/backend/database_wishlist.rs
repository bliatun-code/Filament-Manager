use rusqlite::{params, Connection};

use super::database_result::{require_rows, InventoryResult};
use super::database_wishlist_models::WishlistItemRow;

pub(crate) fn list_wishlist_items(
    conn: &Connection,
    limit: i64,
) -> InventoryResult<Vec<WishlistItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity,
                note, created_at, updated_at
         FROM wishlist_items
         ORDER BY updated_at DESC, created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(WishlistItemRow {
            id: row.get(0)?,
            master_id: row.get(1)?,
            material: row.get(2)?,
            filament_name: row.get(3)?,
            color_name: row.get(4)?,
            vendor: row.get(5)?,
            status: row.get(6)?,
            quantity: row.get(7)?,
            note: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn insert_wishlist_item(
    conn: &Connection,
    item: &WishlistItemRow,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO wishlist_items (
            id, master_id, material, filament_name, color_name, vendor, status, quantity, note,
            created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))",
        params![
            item.id,
            item.master_id,
            item.material,
            item.filament_name,
            item.color_name,
            item.vendor,
            item.status,
            item.quantity,
            item.note
        ],
    )?;
    Ok(())
}

pub(crate) fn update_wishlist_item_status(
    conn: &Connection,
    item_id: &str,
    status: &str,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE wishlist_items
         SET status = ?1,
             updated_at = datetime('now')
         WHERE id = ?2",
        params![status, item_id],
    )?;
    require_rows(affected)
}

pub(crate) fn delete_wishlist_item(conn: &Connection, item_id: &str) -> InventoryResult<()> {
    let affected = conn.execute(
        "DELETE FROM wishlist_items
         WHERE id = ?1",
        params![item_id],
    )?;
    require_rows(affected)
}
