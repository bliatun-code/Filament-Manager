use std::path::Path;

use rusqlite::Connection;

use super::filament_database::InventoryResult;

pub(crate) fn open_connection(path: impl AsRef<Path>) -> InventoryResult<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    #[cfg(target_os = "windows")]
    conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;",
    )?;

    Ok(conn)
}
