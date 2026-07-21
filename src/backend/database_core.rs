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

    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
    }
}
