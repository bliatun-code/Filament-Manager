use rusqlite::Connection;

use super::database_connection::open_connection;
use super::database_result::InventoryResult;
use super::database_schema_setup::apply_schema_migrations;

const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

pub struct FilamentDatabase {
    pub(crate) conn: Connection,
}

impl FilamentDatabase {
    pub fn open(path: impl AsRef<std::path::Path>) -> InventoryResult<Self> {
        Ok(Self {
            conn: open_connection(path)?,
        })
    }

    pub fn apply_schema(&self) -> InventoryResult<()> {
        apply_schema_migrations(&self.conn, SCHEMA_SQL)
    }

    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
    }
}
