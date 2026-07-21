use std::path::Path;

use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_schema::{ensure_database_quick_check, ensure_supported_schema_version};

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

pub(crate) fn inspect_existing_database_schema(path: &Path) -> InventoryResult<Option<i64>> {
    if !path.exists() {
        return Ok(None);
    }

    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    ensure_database_quick_check(&conn)?;
    ensure_supported_schema_version(&conn).map(Some)
}

#[cfg(test)]
mod tests {
    use super::{inspect_existing_database_schema, open_connection};
    use crate::backend::database_schema::CURRENT_SCHEMA_VERSION;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "filament-manager-{test_name}-{}-{nanos}.db",
            std::process::id()
        ))
    }

    #[test]
    fn startup_inspection_rejects_newer_existing_schema_without_mutating_file() {
        let path = temp_db_path("future-schema-read-only-preflight");
        let result = (|| -> Result<(), String> {
            let conn = rusqlite::Connection::open(&path).map_err(|error| error.to_string())?;
            conn.execute_batch(&format!(
                "CREATE TABLE future_only (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO future_only (id, value) VALUES (1, 'unchanged');
                 PRAGMA user_version = {};",
                CURRENT_SCHEMA_VERSION + 1
            ))
            .map_err(|error| error.to_string())?;
            drop(conn);

            let bytes_before = std::fs::read(&path).map_err(|error| error.to_string())?;
            let error = inspect_existing_database_schema(&path)
                .expect_err("future schema should be rejected");
            let bytes_after = std::fs::read(&path).map_err(|error| error.to_string())?;

            assert!(error
                .to_string()
                .contains("newer than the supported version"));
            assert_eq!(bytes_after, bytes_before);
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn startup_inspection_rejects_corrupt_existing_database_without_mutating_file() {
        let path = temp_db_path("corrupt-schema-read-only-preflight");
        let result = (|| -> Result<(), String> {
            let corrupt_bytes = b"not a SQLite database";
            std::fs::write(&path, corrupt_bytes).map_err(|error| error.to_string())?;

            let bytes_before = std::fs::read(&path).map_err(|error| error.to_string())?;
            let error = inspect_existing_database_schema(&path)
                .expect_err("corrupt database should be rejected");
            let bytes_after = std::fs::read(&path).map_err(|error| error.to_string())?;

            assert!(error.to_string().contains("not a database"));
            assert_eq!(bytes_after, bytes_before);
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn regular_open_does_not_repeat_startup_schema_inspection() {
        let path = temp_db_path("regular-open-is-lightweight");
        let result = (|| -> Result<(), String> {
            let conn = rusqlite::Connection::open(&path).map_err(|error| error.to_string())?;
            conn.execute_batch(&format!(
                "CREATE TABLE future_only (id INTEGER PRIMARY KEY);
                 PRAGMA user_version = {};",
                CURRENT_SCHEMA_VERSION + 1
            ))
            .map_err(|error| error.to_string())?;
            drop(conn);

            let conn = open_connection(&path).map_err(|error| error.to_string())?;
            let version: i64 = conn
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(version, CURRENT_SCHEMA_VERSION + 1);
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
