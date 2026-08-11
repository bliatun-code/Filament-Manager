use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::operational_log::{
    operational_log_is_initialized, read_operational_log_entries, record_operational_event,
    OperationalLogContext, OperationalLogEntry, OperationalLogLevel,
};
use crate::backend::database_schema::{database_schema_version, CURRENT_SCHEMA_VERSION};
use crate::state::AppState;

const SUPPORT_BUNDLE_FORMAT: &str = "filament-manager-support-v2";
const DIAGNOSTICS_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticCheckStatus {
    Ok,
    IssuesFound,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) struct DatabaseDiagnostics {
    pub available: bool,
    pub schema_version: Option<i64>,
    pub supported_schema_version: i64,
    pub quick_check: DiagnosticCheckStatus,
    pub foreign_key_check: DiagnosticCheckStatus,
    pub journal_mode: Option<String>,
    pub size_bytes: Option<u64>,
    pub local_db_path: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) struct ApplicationDiagnostics {
    pub generated_at_ms: u64,
    pub app_version: String,
    pub database: DatabaseDiagnostics,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
struct SanitizedDatabaseDiagnostics {
    available: bool,
    schema_version: Option<i64>,
    supported_schema_version: i64,
    quick_check: DiagnosticCheckStatus,
    foreign_key_check: DiagnosticCheckStatus,
    journal_mode: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
struct SanitizedBuildMetadata {
    commit: &'static str,
    target: &'static str,
    distribution_channel: &'static str,
}

#[derive(Debug, Serialize)]
struct SanitizedSupportBundle {
    format: &'static str,
    generated_at_ms: u64,
    app_version: String,
    build: SanitizedBuildMetadata,
    database: SanitizedDatabaseDiagnostics,
    operational_log_available: bool,
    operational_log: Vec<OperationalLogEntry>,
}

pub(crate) fn collect_application_diagnostics(db_path: &Path) -> ApplicationDiagnostics {
    let size_bytes = std::fs::metadata(db_path)
        .ok()
        .map(|metadata| metadata.len());
    let connection = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    );

    let database = match connection {
        Ok(connection) => {
            let timeout_configured = connection.busy_timeout(DIAGNOSTICS_BUSY_TIMEOUT).is_ok();
            DatabaseDiagnostics {
                available: true,
                schema_version: if timeout_configured {
                    database_schema_version(&connection).ok()
                } else {
                    None
                },
                supported_schema_version: CURRENT_SCHEMA_VERSION,
                quick_check: if timeout_configured {
                    quick_check_status(&connection)
                } else {
                    DiagnosticCheckStatus::Unavailable
                },
                foreign_key_check: if timeout_configured {
                    foreign_key_check_status(&connection)
                } else {
                    DiagnosticCheckStatus::Unavailable
                },
                journal_mode: if timeout_configured {
                    journal_mode(&connection)
                } else {
                    None
                },
                size_bytes,
                local_db_path: db_path.to_string_lossy().into_owned(),
            }
        }
        Err(_) => {
            let _ = record_operational_event(
                OperationalLogLevel::Warning,
                OperationalLogContext::DatabaseDiagnosticsFailure,
                None,
            );
            DatabaseDiagnostics {
                available: false,
                schema_version: None,
                supported_schema_version: CURRENT_SCHEMA_VERSION,
                quick_check: DiagnosticCheckStatus::Unavailable,
                foreign_key_check: DiagnosticCheckStatus::Unavailable,
                journal_mode: None,
                size_bytes,
                local_db_path: db_path.to_string_lossy().into_owned(),
            }
        }
    };

    ApplicationDiagnostics {
        generated_at_ms: current_timestamp_ms(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        database,
    }
}

pub(crate) fn sanitized_support_bundle_json(db_path: &Path) -> Result<String, serde_json::Error> {
    let diagnostics = collect_application_diagnostics(db_path);
    let (operational_log_available, operational_log) = if operational_log_is_initialized() {
        match read_operational_log_entries() {
            Ok(entries) => (true, entries),
            Err(_) => (false, Vec::new()),
        }
    } else {
        (false, Vec::new())
    };
    let bundle = SanitizedSupportBundle {
        format: SUPPORT_BUNDLE_FORMAT,
        generated_at_ms: diagnostics.generated_at_ms,
        app_version: diagnostics.app_version,
        build: sanitized_build_metadata(),
        database: SanitizedDatabaseDiagnostics::from(&diagnostics.database),
        operational_log_available,
        operational_log,
    };
    serde_json::to_string_pretty(&bundle)
}

fn sanitized_build_metadata() -> SanitizedBuildMetadata {
    SanitizedBuildMetadata {
        commit: env!("FILAMENT_MANAGER_BUILD_COMMIT"),
        target: env!("FILAMENT_MANAGER_BUILD_TARGET"),
        distribution_channel: env!("FILAMENT_MANAGER_DISTRIBUTION_CHANNEL"),
    }
}

#[tauri::command]
pub(crate) async fn get_application_diagnostics(
    state: tauri::State<'_, AppState>,
) -> Result<ApplicationDiagnostics, String> {
    let db_path = std::path::PathBuf::from(state.db_path.clone());
    tauri::async_runtime::spawn_blocking(move || collect_application_diagnostics(&db_path))
        .await
        .map_err(|_| super::coded_command_error("common.internal"))
}

#[tauri::command]
pub(crate) async fn get_sanitized_support_bundle_json(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let db_path = std::path::PathBuf::from(state.db_path.clone());
    tauri::async_runtime::spawn_blocking(move || sanitized_support_bundle_json(&db_path))
        .await
        .map_err(|_| super::coded_command_error("diagnostics.support_bundle_failed"))?
        .map_err(|_| super::coded_command_error("diagnostics.support_bundle_failed"))
}

impl From<&DatabaseDiagnostics> for SanitizedDatabaseDiagnostics {
    fn from(value: &DatabaseDiagnostics) -> Self {
        Self {
            available: value.available,
            schema_version: value.schema_version,
            supported_schema_version: value.supported_schema_version,
            quick_check: value.quick_check,
            foreign_key_check: value.foreign_key_check,
            journal_mode: value.journal_mode.clone(),
            size_bytes: value.size_bytes,
        }
    }
}

fn quick_check_status(connection: &Connection) -> DiagnosticCheckStatus {
    match connection.query_row("PRAGMA quick_check(1)", [], |row| row.get::<_, String>(0)) {
        Ok(result) if result.eq_ignore_ascii_case("ok") => DiagnosticCheckStatus::Ok,
        Ok(_) => DiagnosticCheckStatus::IssuesFound,
        Err(_) => DiagnosticCheckStatus::Unavailable,
    }
}

fn foreign_key_check_status(connection: &Connection) -> DiagnosticCheckStatus {
    let mut statement = match connection.prepare("PRAGMA foreign_key_check") {
        Ok(statement) => statement,
        Err(_) => return DiagnosticCheckStatus::Unavailable,
    };
    let mut rows = match statement.query([]) {
        Ok(rows) => rows,
        Err(_) => return DiagnosticCheckStatus::Unavailable,
    };
    let status = match rows.next() {
        Ok(Some(_)) => DiagnosticCheckStatus::IssuesFound,
        Ok(None) => DiagnosticCheckStatus::Ok,
        Err(_) => DiagnosticCheckStatus::Unavailable,
    };
    drop(rows);
    drop(statement);
    status
}

fn journal_mode(connection: &Connection) -> Option<String> {
    let raw = connection
        .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
        .ok()?
        .to_ascii_lowercase();
    Some(match raw.as_str() {
        "delete" | "truncate" | "persist" | "memory" | "wal" | "off" => raw,
        _ => "other".to_string(),
    })
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{
        collect_application_diagnostics, sanitized_support_bundle_json, DiagnosticCheckStatus,
        SUPPORT_BUNDLE_FORMAT,
    };
    use crate::app_error::operational_log::{
        initialize_operational_log, operational_log_is_initialized, record_operational_event,
        OperationalLogContext, OperationalLogLevel,
    };
    use crate::backend::database_schema::CURRENT_SCHEMA_VERSION;
    use rusqlite::Connection;
    use std::collections::HashSet;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-{test_name}-{nanos}.db"))
    }

    #[test]
    fn application_diagnostics_report_database_health_and_local_path() {
        let db_path = temp_db_path("diagnostics-health");
        let connection = Connection::open(&db_path).expect("open fixture database");
        connection
            .execute_batch(&format!(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = OFF;
                 CREATE TABLE diagnostic_parent (id INTEGER PRIMARY KEY);
                 CREATE TABLE diagnostic_child (
                     id INTEGER PRIMARY KEY,
                     parent_id INTEGER REFERENCES diagnostic_parent(id)
                 );
                 INSERT INTO diagnostic_child (id, parent_id) VALUES (1, 99);
                 PRAGMA user_version = {CURRENT_SCHEMA_VERSION};"
            ))
            .expect("seed fixture database");
        drop(connection);

        let diagnostics = collect_application_diagnostics(&db_path);
        assert_eq!(diagnostics.app_version, env!("CARGO_PKG_VERSION"));
        assert!(diagnostics.database.available);
        assert_eq!(
            diagnostics.database.schema_version,
            Some(CURRENT_SCHEMA_VERSION)
        );
        assert_eq!(
            diagnostics.database.supported_schema_version,
            CURRENT_SCHEMA_VERSION
        );
        assert_eq!(diagnostics.database.quick_check, DiagnosticCheckStatus::Ok);
        assert_eq!(
            diagnostics.database.foreign_key_check,
            DiagnosticCheckStatus::IssuesFound
        );
        assert_eq!(diagnostics.database.journal_mode.as_deref(), Some("wal"));
        assert!(diagnostics.database.size_bytes.is_some_and(|size| size > 0));
        assert_eq!(
            diagnostics.database.local_db_path,
            db_path.to_string_lossy()
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn support_bundle_omits_database_path_and_user_or_device_data() {
        const PRIVATE_PATH_FIXTURE: &str = concat!("/", "Users/Alice/private.db");
        let db_path =
            temp_db_path("Alice-192.168.1.42-SERIAL-ABC-token-RFID-QR-private-diagnostics");
        let connection = Connection::open(&db_path).expect("open fixture database");
        connection
            .execute_batch(&format!(
                "CREATE TABLE private_fixture (value TEXT NOT NULL);
                 INSERT INTO private_fixture (value) VALUES
                    ('Alice'),
                    ('192.168.1.42'),
                    ('SERIAL-ABC'),
                    ('token-secret'),
                    ('RFID-secret'),
                    ('QR-secret'),
                    ('{PRIVATE_PATH_FIXTURE}');
                 PRAGMA user_version = {CURRENT_SCHEMA_VERSION};"
            ))
            .expect("seed private fixture database");
        drop(connection);

        let on_screen = collect_application_diagnostics(&db_path);
        assert_eq!(on_screen.database.local_db_path, db_path.to_string_lossy());

        let encoded = sanitized_support_bundle_json(&db_path).expect("serialize support bundle");
        let parsed: serde_json::Value = serde_json::from_str(&encoded).expect("valid JSON");
        assert_eq!(parsed["format"], SUPPORT_BUNDLE_FORMAT);
        assert_eq!(
            parsed["build"]["commit"],
            env!("FILAMENT_MANAGER_BUILD_COMMIT")
        );
        assert_eq!(
            parsed["build"]["target"],
            env!("FILAMENT_MANAGER_BUILD_TARGET")
        );
        assert_eq!(
            parsed["build"]["distribution_channel"],
            env!("FILAMENT_MANAGER_DISTRIBUTION_CHANNEL")
        );
        assert_eq!(
            parsed["build"]
                .as_object()
                .expect("build metadata object")
                .keys()
                .cloned()
                .collect::<HashSet<_>>(),
            HashSet::from([
                "commit".to_string(),
                "target".to_string(),
                "distribution_channel".to_string(),
            ])
        );
        assert!(parsed["database"].get("local_db_path").is_none());
        assert!(parsed.get("local_db_path").is_none());
        assert!(parsed.get("update_metadata_url").is_none());
        assert!(parsed["build"].get("update_metadata_url").is_none());
        for sensitive in [
            db_path.to_string_lossy().as_ref(),
            "Alice",
            "192.168.1.42",
            "SERIAL-ABC",
            "token-secret",
            "RFID-secret",
            "QR-secret",
            PRIVATE_PATH_FIXTURE,
        ] {
            assert!(
                !encoded.contains(sensitive),
                "support bundle leaked sensitive value: {sensitive}"
            );
        }

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn diagnostics_fail_closed_without_exposing_an_unavailable_database_path() {
        let db_path = temp_db_path("missing-Alice-192.168.1.42-token");
        let diagnostics = collect_application_diagnostics(&db_path);
        assert!(!diagnostics.database.available);
        assert_eq!(
            diagnostics.database.quick_check,
            DiagnosticCheckStatus::Unavailable
        );
        assert_eq!(
            diagnostics.database.foreign_key_check,
            DiagnosticCheckStatus::Unavailable
        );
        assert_eq!(
            diagnostics.database.local_db_path,
            db_path.to_string_lossy()
        );

        let encoded = sanitized_support_bundle_json(&db_path).expect("serialize support bundle");
        assert!(!encoded.contains(db_path.to_string_lossy().as_ref()));
        assert!(!encoded.contains("Alice"));
        assert!(!encoded.contains("192.168.1.42"));
        assert!(!encoded.contains("token"));
    }

    #[test]
    fn support_bundle_reports_log_initialization_and_keeps_log_entries_minimal() {
        assert!(!operational_log_is_initialized());
        let db_path = temp_db_path("support-log-contract");
        let connection = Connection::open(&db_path).expect("open fixture database");
        connection
            .execute_batch(&format!("PRAGMA user_version = {CURRENT_SCHEMA_VERSION};"))
            .expect("version fixture database");
        drop(connection);

        let before = sanitized_support_bundle_json(&db_path).expect("serialize support bundle");
        let before: serde_json::Value = serde_json::from_str(&before).expect("valid JSON");
        assert_eq!(before["operational_log_available"], false);
        assert_eq!(before["operational_log"], serde_json::json!([]));

        let log_directory = db_path.with_extension("logs");
        initialize_operational_log(&log_directory).expect("initialize global operational log");
        record_operational_event(
            OperationalLogLevel::Error,
            OperationalLogContext::DesktopCommandFailure,
            Some("fm-feed-1"),
        )
        .expect("record safe operational event");

        let after = sanitized_support_bundle_json(&db_path).expect("serialize support bundle");
        let after: serde_json::Value = serde_json::from_str(&after).expect("valid JSON");
        assert_eq!(after["operational_log_available"], true);
        let entries = after["operational_log"]
            .as_array()
            .expect("operational log array");
        assert!(entries.len() >= 2);
        for entry in entries {
            let keys = entry
                .as_object()
                .expect("operational log object")
                .keys()
                .cloned()
                .collect::<HashSet<_>>();
            assert_eq!(
                keys,
                HashSet::from([
                    "timestamp_ms".to_string(),
                    "level".to_string(),
                    "context".to_string(),
                    "diagnostic_id".to_string(),
                ])
            );
        }

        let _ = std::fs::remove_file(db_path);
        let _ = std::fs::remove_dir_all(log_directory);
    }
}
