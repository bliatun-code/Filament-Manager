use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_schema::table_has_column;

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

pub(crate) fn ensure_catalog_seed_columns(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_master_list", "catalog_source")? {
        conn.execute(
            "ALTER TABLE filament_master_list
             ADD COLUMN catalog_source TEXT NOT NULL DEFAULT 'unknown'",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_master_list", "catalog_seed_version")? {
        conn.execute(
            "ALTER TABLE filament_master_list
             ADD COLUMN catalog_seed_version TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_master_list", "catalog_user_edited")? {
        conn.execute(
            "ALTER TABLE filament_master_list
             ADD COLUMN catalog_user_edited INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    Ok(())
}
