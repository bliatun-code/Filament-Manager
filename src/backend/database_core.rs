use rusqlite::Connection;

use super::database_connection::open_connection;
use super::database_maintenance::DatabaseMaintenanceGuard;
use super::database_result::InventoryResult;
use super::database_schema_setup::apply_schema_migrations;

const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

pub struct FilamentDatabase {
    pub(crate) conn: Connection,
    _maintenance_guard: DatabaseMaintenanceGuard,
}

impl FilamentDatabase {
    pub fn open(path: impl AsRef<std::path::Path>) -> InventoryResult<Self> {
        let path = path.as_ref();
        let maintenance_guard = DatabaseMaintenanceGuard::shared(path);
        Ok(Self {
            conn: open_connection(path)?,
            _maintenance_guard: maintenance_guard,
        })
    }

    pub fn open_exclusive_maintenance(path: impl AsRef<std::path::Path>) -> InventoryResult<Self> {
        let path = path.as_ref();
        let maintenance_guard = DatabaseMaintenanceGuard::exclusive(path);
        Ok(Self {
            conn: open_connection(path)?,
            _maintenance_guard: maintenance_guard,
        })
    }

    pub fn apply_schema(&self) -> InventoryResult<()> {
        apply_schema_migrations(&self.conn, SCHEMA_SQL)
    }

    /// Enables physical overwrite of deleted SQLite content for credential
    /// migrations performed by the desktop shell.
    pub fn enable_secure_delete(&self) -> InventoryResult<()> {
        self.conn
            .pragma_update(None, "secure_delete", "ON")
            .map_err(Into::into)
    }

    /// Removes obsolete credential bytes from WAL pages and free database
    /// blocks after their logical rows have been scrubbed.
    pub fn compact_after_secret_removal(&self) -> InventoryResult<()> {
        self.conn
            .execute_batch(
                "PRAGMA wal_checkpoint(TRUNCATE);
                 VACUUM;
                 PRAGMA wal_checkpoint(TRUNCATE);",
            )
            .map_err(Into::into)
    }

    /// Removes the obsolete pre-Bambu-Live printer token column content.
    ///
    /// The column remains for database compatibility, but no runtime code reads
    /// it and credentials must never remain in the active SQLite database.
    pub fn scrub_legacy_printer_access_tokens(&self) -> InventoryResult<usize> {
        self.conn
            .execute(
                "UPDATE printers
                 SET access_token = NULL
                 WHERE access_token IS NOT NULL",
                [],
            )
            .map_err(Into::into)
    }

    #[cfg(not(feature = "test-support"))]
    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
    }

    #[cfg(feature = "test-support")]
    #[doc(hidden)]
    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}
