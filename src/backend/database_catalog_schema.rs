use rusqlite::Connection;

use super::database_schema::table_has_column;
use super::filament_database::InventoryResult;

pub(crate) fn ensure_catalog_lifecycle_columns(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_master_list", "is_discontinued")? {
        conn.execute(
            "ALTER TABLE filament_master_list
             ADD COLUMN is_discontinued INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_master_list", "discontinued_at")? {
        conn.execute(
            "ALTER TABLE filament_master_list
             ADD COLUMN discontinued_at TEXT",
            [],
        )?;
    }

    Ok(())
}
