use rusqlite::Connection;

use super::filament_database::InventoryResult;

pub(crate) fn ensure_trusted_lan_schema(conn: &Connection) -> InventoryResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trusted_lan_pairings (
            id TEXT PRIMARY KEY,
            display_name TEXT,
            pairing_token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            used_at TEXT
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trusted_lan_paired_browsers (
            id TEXT PRIMARY KEY,
            display_name TEXT,
            device_token_hash TEXT NOT NULL UNIQUE,
            paired_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen_at TEXT,
            last_origin TEXT,
            revoked_at TEXT
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trusted_lan_pairings_expires
         ON trusted_lan_pairings(expires_at, used_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trusted_lan_paired_browsers_active
         ON trusted_lan_paired_browsers(revoked_at, paired_at)",
        [],
    )?;
    Ok(())
}
