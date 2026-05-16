use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_schema::table_has_column;

pub(crate) fn ensure_spool_lifecycle_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_spools", "deleted_at")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN deleted_at TEXT",
            [],
        )?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS spool_history_events (
            id TEXT PRIMARY KEY,
            spool_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spool_history_spool_time
         ON spool_history_events(spool_id, created_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spools_deleted_at
         ON filament_spools(deleted_at)",
        [],
    )?;

    Ok(())
}

pub(crate) fn ensure_spool_weight_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_spools", "spool_tare_weight_g")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN spool_tare_weight_g INTEGER",
            [],
        )?;
    }
    Ok(())
}

pub(crate) fn ensure_spool_identity_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_spools", "rfid_tag")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN rfid_tag TEXT",
            [],
        )?;
    }
    if !table_has_column(conn, "filament_spools", "rfid_observed_at")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN rfid_observed_at TEXT",
            [],
        )?;
    }
    Ok(())
}

pub(crate) fn ensure_spool_home_location_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_spools", "home_location_id")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN home_location_id TEXT REFERENCES inventory_locations(id)",
            [],
        )?;
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spools_home_location
         ON filament_spools(home_location_id)",
        [],
    )?;
    Ok(())
}
