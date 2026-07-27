use crate::backend::filament_database::{FilamentDatabase, TrustedLanSettingsRow};
use crate::trusted_lan_runtime_commands::load_trusted_lan_runtime;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static DB_PATH_ENV_LOCK: Mutex<()> = Mutex::new(());

struct EnvVarGuard {
    key: &'static str,
    original: Option<OsString>,
}

impl EnvVarGuard {
    fn set(key: &'static str, value: Option<&OsStr>) -> Self {
        let guard = Self {
            key,
            original: std::env::var_os(key),
        };
        match value {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
        guard
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        match &self.original {
            Some(value) => std::env::set_var(self.key, value),
            None => std::env::remove_var(self.key),
        }
    }
}

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-main-{test_name}-{nanos}.db"))
}

fn temp_dir_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-main-{test_name}-{nanos}"))
}

fn write_migration_probe_db(path: &Path, spool_count: usize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    for table in [
        "filament_spools",
        "printers",
        "spool_loans",
        "wishlist_items",
        "spool_history_events",
    ] {
        connection
            .execute(&format!("CREATE TABLE {table} (id TEXT PRIMARY KEY)"), [])
            .map_err(|error| error.to_string())?;
    }
    for index in 0..spool_count {
        connection
            .execute(
                "INSERT INTO filament_spools (id) VALUES (?1)",
                rusqlite::params![format!("spool-{index}")],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn open_wal_migration_probe_db(path: &Path) -> Result<rusqlite::Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;")
        .map_err(|error| error.to_string())?;
    for table in [
        "filament_spools",
        "printers",
        "spool_loans",
        "wishlist_items",
        "spool_history_events",
    ] {
        connection
            .execute(&format!("CREATE TABLE {table} (id TEXT PRIMARY KEY)"), [])
            .map_err(|error| error.to_string())?;
    }
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO filament_spools (id) VALUES ('spool-in-wal')",
            [],
        )
        .map_err(|error| error.to_string())?;

    let mut wal_path = path.as_os_str().to_os_string();
    wal_path.push("-wal");
    let wal_size = std::fs::metadata(PathBuf::from(wal_path))
        .map_err(|error| error.to_string())?
        .len();
    if wal_size == 0 {
        return Err("expected committed migration data in the WAL sidecar".to_string());
    }

    Ok(connection)
}

fn migration_probe_spool_count(path: &Path) -> Result<i64, String> {
    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .query_row("SELECT COUNT(*) FROM filament_spools", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())
}

fn write_ancillary_settings_db(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let db = FilamentDatabase::open(path).map_err(|error| error.to_string())?;
    db.apply_schema().map_err(|error| error.to_string())?;
    db.connection()
        .execute(
            "INSERT INTO settings (key, value) VALUES
                ('library_sync_mode', 'STANDALONE'),
                ('library_sync_device_name', 'Windows workstation')",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_split_brain_domain_db(
    path: &Path,
    identity: &str,
    color_name: &str,
    safe_setting: &str,
    library_mode: &str,
    trusted_lan_enabled: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let db = FilamentDatabase::open(path).map_err(|error| error.to_string())?;
    db.apply_schema().map_err(|error| error.to_string())?;
    db.connection()
        .execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, vendor,
                catalog_source, catalog_user_edited
             ) VALUES (?1, 'PLA', ?2, ?3, 'Merge test', 'manual', 1)",
            rusqlite::params![
                format!("merge-master-{identity}"),
                format!("Merge filament {identity}"),
                color_name,
            ],
        )
        .map_err(|error| error.to_string())?;
    db.connection()
        .execute(
            "INSERT INTO filament_spools (id, master_id, status, current_weight_g)
             VALUES (?1, ?2, 'IN_STOCK', 750)",
            rusqlite::params![
                format!("merge-spool-{identity}"),
                format!("merge-master-{identity}"),
            ],
        )
        .map_err(|error| error.to_string())?;
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES
                ('split_merge_safe_setting', ?1),
                ('library_sync_mode', ?2),
                ('trusted_lan_enabled', ?3)",
            rusqlite::params![safe_setting, library_mode, trusted_lan_enabled],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_split_brain_ancillary_db(
    path: &Path,
    safe_setting: &str,
    library_mode: &str,
    trusted_lan_enabled: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let db = FilamentDatabase::open(path).map_err(|error| error.to_string())?;
    db.apply_schema().map_err(|error| error.to_string())?;
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES
                ('split_merge_safe_setting', ?1),
                ('library_sync_mode', ?2),
                ('trusted_lan_enabled', ?3)",
            rusqlite::params![safe_setting, library_mode, trusted_lan_enabled],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn split_brain_setting(path: &Path, key: &str) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;

    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(|error| error.to_string())
}

fn split_brain_spool_exists(path: &Path, spool_id: &str) -> Result<bool, String> {
    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM filament_spools WHERE id = ?1)",
            [spool_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(|error| error.to_string())
}

fn split_brain_backup_count(app_dir: &Path) -> Result<usize, String> {
    recovery_snapshot_count(app_dir, "recovery-windows-storage-merge-")
}

fn recovery_snapshot_count(app_dir: &Path, name_fragment: &str) -> Result<usize, String> {
    Ok(std::fs::read_dir(app_dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(name_fragment))
        .count())
}

#[test]
#[cfg(debug_assertions)]
fn visual_qa_scenario_normalizer_accepts_stateful_settings_scenarios() {
    use super::normalize_visual_qa_scenario;

    assert_eq!(
        normalize_visual_qa_scenario("trusted-lan-details"),
        Some("settings-library-network-details")
    );
    assert_eq!(
        normalize_visual_qa_scenario("library-role-dialog"),
        Some("settings-library-role-change")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-library-role-change"),
        Some("settings-library-role-change")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-library-network-details"),
        Some("settings-library-network-details")
    );
    assert_eq!(
        normalize_visual_qa_scenario("trusted-lan-editor"),
        Some("settings-library-network-editor")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-library-network-editor"),
        Some("settings-library-network-editor")
    );
    assert_eq!(
        normalize_visual_qa_scenario("trusted-lan-pairing"),
        Some("settings-library-pairing")
    );
    assert_eq!(
        normalize_visual_qa_scenario("trusted-lan-browsers"),
        Some("settings-library-browsers")
    );
    assert_eq!(
        normalize_visual_qa_scenario("trusted-lan-browser-history"),
        Some("settings-library-browsers-history")
    );
    assert_eq!(
        normalize_visual_qa_scenario("missing-swatches"),
        Some("settings-catalog-swatch-review")
    );
    assert_eq!(
        normalize_visual_qa_scenario("wishlist-orders"),
        Some("wishlist-queue")
    );
    assert_eq!(
        normalize_visual_qa_scenario("add-printer-modal"),
        Some("add-printer")
    );
    assert_eq!(
        normalize_visual_qa_scenario("printers-static"),
        Some("printer-overview")
    );
    assert_eq!(
        normalize_visual_qa_scenario("roll-history"),
        Some("selected-roll-history")
    );
    assert_eq!(
        normalize_visual_qa_scenario("qr-label"),
        Some("selected-roll-label")
    );
    assert_eq!(
        normalize_visual_qa_scenario("inventory-label-sheet"),
        Some("settings-inventory-label-sheet")
    );
    assert_eq!(
        normalize_visual_qa_scenario("inventory-danger-zone"),
        Some("selected-roll-danger-zone")
    );
    assert_eq!(
        normalize_visual_qa_scenario("statistics-consumption"),
        Some("statistics-consumption")
    );
    assert_eq!(
        normalize_visual_qa_scenario("total-consumption"),
        Some("statistics-consumption")
    );
    assert_eq!(
        normalize_visual_qa_scenario("borrower-usage-breakdown"),
        Some("statistics-borrower")
    );
    assert_eq!(
        normalize_visual_qa_scenario("hand-back-borrowed-in"),
        Some("return-inbound-loan")
    );
    assert_eq!(
        normalize_visual_qa_scenario("statistics-loans"),
        Some("statistics-loans")
    );
    assert_eq!(
        normalize_visual_qa_scenario("loan-usage-statistics"),
        Some("statistics-loans")
    );
    assert_eq!(
        normalize_visual_qa_scenario("printer-editor"),
        Some("settings-printer-editor")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-printer-editor"),
        Some("settings-printer-editor")
    );
    assert_eq!(
        normalize_visual_qa_scenario("printer-editor-dirty"),
        Some("settings-printer-editor-dirty")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-printer-editor-dirty"),
        Some("settings-printer-editor-dirty")
    );
    assert_eq!(
        normalize_visual_qa_scenario("printer-editor-discard"),
        Some("settings-printer-editor-discard")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-printer-editor-discard"),
        Some("settings-printer-editor-discard")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-application-diagnostics"),
        Some("settings-application-diagnostics")
    );
    assert_eq!(
        normalize_visual_qa_scenario("settings-diagnostics"),
        Some("settings-application-diagnostics")
    );
    assert_eq!(
        normalize_visual_qa_scenario("application-diagnostics"),
        Some("settings-application-diagnostics")
    );
}

#[test]
fn visual_qa_window_origin_stays_inside_the_visible_screen() {
    assert_eq!(
        super::visual_qa_window_origin(0.0, 80.0, 1710.0, 993.0, 1200.0, 800.0),
        Some((24.0, 249.0))
    );
    assert_eq!(
        super::visual_qa_window_origin(0.0, 80.0, 1710.0, 993.0, 1710.0, 993.0),
        Some((0.0, 80.0))
    );
    assert_eq!(
        super::visual_qa_window_origin(0.0, 80.0, 1710.0, 993.0, 1711.0, 800.0),
        None
    );
}

#[test]
#[cfg(debug_assertions)]
fn visual_qa_locale_normalizer_defaults_to_english() {
    use super::normalize_visual_qa_locale;

    assert_eq!(normalize_visual_qa_locale("nb"), "nb");
    assert_eq!(normalize_visual_qa_locale("no"), "nb");
    assert_eq!(normalize_visual_qa_locale("nb-NO"), "nb");
    assert_eq!(normalize_visual_qa_locale("en"), "en");
    assert_eq!(normalize_visual_qa_locale("en-US"), "en");
    assert_eq!(normalize_visual_qa_locale("en-XA"), "en-XA");
    assert_eq!(normalize_visual_qa_locale("en_xa"), "en-XA");
    assert_eq!(normalize_visual_qa_locale("ar-XB"), "ar-XB");
    assert_eq!(normalize_visual_qa_locale("ar_xb"), "ar-XB");
    assert_eq!(normalize_visual_qa_locale("zh-XB"), "zh-XB");
    assert_eq!(normalize_visual_qa_locale("zh_xb"), "zh-XB");
    assert_eq!(normalize_visual_qa_locale("de"), "de");
    assert_eq!(normalize_visual_qa_locale("de-DE"), "de");
    assert_eq!(normalize_visual_qa_locale("fr"), "fr");
    assert_eq!(normalize_visual_qa_locale("fr-FR"), "fr");
    assert_eq!(normalize_visual_qa_locale("es"), "es");
    assert_eq!(normalize_visual_qa_locale("es-ES"), "es");
    assert_eq!(normalize_visual_qa_locale("pt-BR"), "pt-BR");
    assert_eq!(normalize_visual_qa_locale("pt_br"), "pt-BR");
    assert_eq!(normalize_visual_qa_locale("it"), "it-IT");
    assert_eq!(normalize_visual_qa_locale("it-IT"), "it-IT");
    assert_eq!(normalize_visual_qa_locale("it_it"), "it-IT");
    assert_eq!(normalize_visual_qa_locale("pl"), "pl-PL");
    assert_eq!(normalize_visual_qa_locale("pl-PL"), "pl-PL");
    assert_eq!(normalize_visual_qa_locale("pl_pl"), "pl-PL");
    assert_eq!(normalize_visual_qa_locale("nl"), "nl-NL");
    assert_eq!(normalize_visual_qa_locale("nl-NL"), "nl-NL");
    assert_eq!(normalize_visual_qa_locale("nl_nl"), "nl-NL");
    assert_eq!(normalize_visual_qa_locale("cs"), "cs-CZ");
    assert_eq!(normalize_visual_qa_locale("cs-CZ"), "cs-CZ");
    assert_eq!(normalize_visual_qa_locale("cs_cz"), "cs-CZ");
    assert_eq!(normalize_visual_qa_locale("zh"), "zh-CN");
    assert_eq!(normalize_visual_qa_locale("zh-CN"), "zh-CN");
    assert_eq!(normalize_visual_qa_locale("zh_cn"), "zh-CN");
    assert_eq!(normalize_visual_qa_locale("ja"), "ja-JP");
    assert_eq!(normalize_visual_qa_locale("ja-JP"), "ja-JP");
    assert_eq!(normalize_visual_qa_locale("ja_jp"), "ja-JP");
    assert_eq!(normalize_visual_qa_locale("ko"), "ko-KR");
    assert_eq!(normalize_visual_qa_locale("ko-KR"), "ko-KR");
    assert_eq!(normalize_visual_qa_locale("ko_kr"), "ko-KR");
    assert_eq!(normalize_visual_qa_locale("zh-TW"), "zh-TW");
    assert_eq!(normalize_visual_qa_locale("zh_tw"), "zh-TW");
    assert_eq!(normalize_visual_qa_locale("zh-Hant"), "zh-TW");
    assert_eq!(normalize_visual_qa_locale("tr"), "tr-TR");
    assert_eq!(normalize_visual_qa_locale("tr-TR"), "tr-TR");
    assert_eq!(normalize_visual_qa_locale("tr_tr"), "tr-TR");
    assert_eq!(normalize_visual_qa_locale("uk"), "uk-UA");
    assert_eq!(normalize_visual_qa_locale("uk-UA"), "uk-UA");
    assert_eq!(normalize_visual_qa_locale("uk_ua"), "uk-UA");
    assert_eq!(normalize_visual_qa_locale("ru"), "ru-RU");
    assert_eq!(normalize_visual_qa_locale("ru-RU"), "ru-RU");
    assert_eq!(normalize_visual_qa_locale("ru_ru"), "ru-RU");
    assert_eq!(normalize_visual_qa_locale("hu"), "hu-HU");
    assert_eq!(normalize_visual_qa_locale("hu-HU"), "hu-HU");
    assert_eq!(normalize_visual_qa_locale("hu_hu"), "hu-HU");
    assert_eq!(normalize_visual_qa_locale("sv"), "sv-SE");
    assert_eq!(normalize_visual_qa_locale("sv-SE"), "sv-SE");
    assert_eq!(normalize_visual_qa_locale("sv_se"), "sv-SE");
    assert_eq!(normalize_visual_qa_locale("da"), "da-DK");
    assert_eq!(normalize_visual_qa_locale("da-DK"), "da-DK");
    assert_eq!(normalize_visual_qa_locale("da_dk"), "da-DK");
    assert_eq!(normalize_visual_qa_locale("fi"), "fi-FI");
    assert_eq!(normalize_visual_qa_locale("fi-FI"), "fi-FI");
    assert_eq!(normalize_visual_qa_locale("fi_fi"), "fi-FI");
    assert_eq!(normalize_visual_qa_locale(""), "en");
    assert_eq!(normalize_visual_qa_locale("bad"), "en");
}

#[test]
#[cfg(debug_assertions)]
fn visual_qa_theme_normalizer_accepts_only_supported_modes() {
    use super::normalize_visual_qa_theme;

    assert_eq!(normalize_visual_qa_theme("light"), Some("light"));
    assert_eq!(normalize_visual_qa_theme(" DARK "), Some("dark"));
    assert_eq!(normalize_visual_qa_theme("Auto"), Some("auto"));
    assert_eq!(normalize_visual_qa_theme(""), None);
    assert_eq!(normalize_visual_qa_theme("sepia"), None);
}

#[test]
fn visual_qa_window_size_normalizer_accepts_bounded_outer_frames() {
    use super::normalize_visual_qa_window_size;

    assert_eq!(
        normalize_visual_qa_window_size(" 900×700 "),
        Some((900.0, 700.0))
    );
    assert_eq!(
        normalize_visual_qa_window_size("1500x900"),
        Some((1500.0, 900.0))
    );
    assert_eq!(normalize_visual_qa_window_size("319x900"), None);
    assert_eq!(normalize_visual_qa_window_size("900x8193"), None);
    assert_eq!(normalize_visual_qa_window_size("wide"), None);
}

#[test]
#[cfg(debug_assertions)]
fn visual_qa_readiness_normalizer_accepts_only_live_printer_telemetry() {
    use super::normalize_desktop_visual_qa_readiness_token;

    assert_eq!(
        normalize_desktop_visual_qa_readiness_token(" printer-live-telemetry "),
        Some("printer-live-telemetry")
    );
    assert_eq!(
        normalize_desktop_visual_qa_readiness_token("printer-board"),
        None
    );
    assert_eq!(normalize_desktop_visual_qa_readiness_token(""), None);
}

#[test]
fn app_db_path_override_prefers_current_env_var() {
    use super::{app_db_path_override_from_env, APP_DB_PATH_ENV_VAR, LEGACY_APP_DB_PATH_ENV_VAR};

    let _lock = DB_PATH_ENV_LOCK.lock().unwrap();
    let current = temp_db_path("current-db-env");
    let legacy = temp_db_path("legacy-db-env");
    let _current_guard = EnvVarGuard::set(APP_DB_PATH_ENV_VAR, Some(current.as_os_str()));
    let _legacy_guard = EnvVarGuard::set(LEGACY_APP_DB_PATH_ENV_VAR, Some(legacy.as_os_str()));

    assert_eq!(
        app_db_path_override_from_env().as_deref(),
        Some(current.as_path())
    );
}

#[test]
fn app_db_path_override_keeps_legacy_env_var_as_fallback() {
    use super::{app_db_path_override_from_env, APP_DB_PATH_ENV_VAR, LEGACY_APP_DB_PATH_ENV_VAR};

    let _lock = DB_PATH_ENV_LOCK.lock().unwrap();
    let legacy = temp_db_path("legacy-db-env-fallback");
    let _current_guard = EnvVarGuard::set(APP_DB_PATH_ENV_VAR, None);
    let _legacy_guard = EnvVarGuard::set(LEGACY_APP_DB_PATH_ENV_VAR, Some(legacy.as_os_str()));

    assert_eq!(
        app_db_path_override_from_env().as_deref(),
        Some(legacy.as_path())
    );
}

#[test]
fn app_db_path_override_ignores_empty_current_env_var() {
    use super::{app_db_path_override_from_env, APP_DB_PATH_ENV_VAR, LEGACY_APP_DB_PATH_ENV_VAR};

    let _lock = DB_PATH_ENV_LOCK.lock().unwrap();
    let legacy = temp_db_path("empty-current-db-env");
    let _current_guard = EnvVarGuard::set(APP_DB_PATH_ENV_VAR, Some(OsStr::new("")));
    let _legacy_guard = EnvVarGuard::set(LEGACY_APP_DB_PATH_ENV_VAR, Some(legacy.as_os_str()));

    assert_eq!(
        app_db_path_override_from_env().as_deref(),
        Some(legacy.as_path())
    );
}

#[test]
fn existing_unversioned_database_gets_recovery_snapshot_before_schema_upgrade() {
    use super::open_database_and_apply_schema;

    let base = temp_dir_path("schema-upgrade-recovery");
    let db_path = base.join("filament-manager.db");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
        let connection = rusqlite::Connection::open(&db_path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "CREATE TABLE recovery_probe (value TEXT NOT NULL);\n\
                 INSERT INTO recovery_probe (value) VALUES ('before schema upgrade');",
            )
            .map_err(|error| error.to_string())?;
        drop(connection);

        let db = open_database_and_apply_schema(&db_path)?;
        let schema_version: i64 = db
            .connection()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert!(schema_version > 0);
        drop(db);

        let snapshot_path = std::fs::read_dir(&base)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains("recovery-schema-upgrade-successful-")
            })
            .map(|entry| entry.path())
            .ok_or_else(|| "missing successful schema-upgrade snapshot".to_string())?;
        let snapshot =
            rusqlite::Connection::open(snapshot_path).map_err(|error| error.to_string())?;
        let snapshot_version: i64 = snapshot
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let preserved_value: String = snapshot
            .query_row("SELECT value FROM recovery_probe", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert_eq!(snapshot_version, 0);
        assert_eq!(preserved_value, "before schema upgrade");
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn existing_version_one_database_gets_recovery_snapshot_before_schema_upgrade() {
    use super::open_database_and_apply_schema;
    use crate::backend::database_schema::CURRENT_SCHEMA_VERSION;

    let base = temp_dir_path("version-one-schema-upgrade-recovery");
    let db_path = base.join("filament-manager.db");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
        let connection = rusqlite::Connection::open(&db_path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(include_str!("../../src/database/schema.sql"))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES (
                    'version-one-master', 'PLA', 'Snapshot probe', 'Blue', 1000, 'Generic'
                 );
                 PRAGMA user_version = 1;",
            )
            .map_err(|error| error.to_string())?;
        drop(connection);

        let db = open_database_and_apply_schema(&db_path)?;
        let upgraded_version: i64 = db
            .connection()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert_eq!(upgraded_version, CURRENT_SCHEMA_VERSION);
        drop(db);

        let snapshot_path = std::fs::read_dir(&base)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains("recovery-schema-upgrade-successful-")
            })
            .map(|entry| entry.path())
            .ok_or_else(|| "missing version-one schema-upgrade snapshot".to_string())?;
        let snapshot =
            rusqlite::Connection::open(snapshot_path).map_err(|error| error.to_string())?;
        let snapshot_version: i64 = snapshot
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let preserved_name: String = snapshot
            .query_row(
                "SELECT filament_name FROM filament_master_list
                 WHERE id = 'version-one-master'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(snapshot_version, 1);
        assert_eq!(preserved_name, "Snapshot probe");
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn new_database_does_not_create_schema_upgrade_recovery_snapshot() {
    use super::open_database_and_apply_schema;

    let base = temp_dir_path("new-schema-no-recovery");
    let db_path = base.join("filament-manager.db");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
        let db = open_database_and_apply_schema(&db_path)?;
        drop(db);
        assert_eq!(
            recovery_snapshot_count(&base, "recovery-schema-upgrade-")?,
            0
        );
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn failed_schema_upgrade_keeps_failed_recovery_snapshot() {
    use super::open_database_and_apply_schema;

    let base = temp_dir_path("failed-schema-recovery");
    let db_path = base.join("filament-manager.db");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
        let connection = rusqlite::Connection::open(&db_path).map_err(|error| error.to_string())?;
        connection
            .execute_batch("CREATE VIEW filament_spools AS SELECT 'spool-id' AS id;")
            .map_err(|error| error.to_string())?;
        drop(connection);

        let error = match open_database_and_apply_schema(&db_path) {
            Ok(_) => return Err("incompatible v0 schema unexpectedly migrated".to_string()),
            Err(error) => error,
        };
        assert!(error.contains("DB schema"));
        assert_eq!(
            recovery_snapshot_count(&base, "recovery-schema-upgrade-failed-")?,
            1
        );
        assert_eq!(
            recovery_snapshot_count(&base, "recovery-schema-upgrade-successful-")?,
            0
        );
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn trusted_lan_runtime_keeps_enabled_state_from_settings() {
    let db_path = temp_db_path("trusted-lan-dark-startup");
    let result = (|| -> Result<(), String> {
        {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            db.save_trusted_lan_settings(&TrustedLanSettingsRow {
                enabled: true,
                selected_interface_name: Some("Wi-Fi".to_string()),
                selected_interface_address: Some("192.168.1.50".to_string()),
                listen_port: 4278,
            })
            .map_err(|error| error.to_string())?;
        }

        let runtime = load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
        let snapshot = runtime.snapshot();
        assert!(snapshot.enabled);
        assert_eq!(snapshot.selected_interface_name.as_deref(), Some("Wi-Fi"));
        assert_eq!(
            snapshot.selected_interface_address.as_deref(),
            Some("192.168.1.50")
        );
        assert_eq!(snapshot.listen_port, 4278);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn app_storage_migration_copies_legacy_bundle_data_once() {
    use super::{
        prepare_app_storage_dir, APP_DB_FILE_NAME, LEGACY_APP_DATA_DIR_NAME,
        LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("legacy-app-storage");
    let legacy_dir = base.join(LEGACY_APP_DATA_DIR_NAME);
    let app_dir = base.join("Data med mellomrom æøå");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(legacy_dir.join("labels")).map_err(|error| error.to_string())?;
        write_migration_probe_db(&legacy_dir.join(LEGACY_APP_DB_FILE_NAME), 1)?;
        write_migration_probe_db(&app_dir.join(APP_DB_FILE_NAME), 0)?;
        std::fs::write(legacy_dir.join("labels").join("label.pdf"), b"legacy-label")
            .map_err(|error| error.to_string())?;

        prepare_app_storage_dir(&app_dir)?;
        let migrated_spool_count = migration_probe_spool_count(&app_dir.join(APP_DB_FILE_NAME))?;
        let migrated_label = std::fs::read(app_dir.join("labels").join("label.pdf"))
            .map_err(|error| error.to_string())?;
        let has_empty_backup = std::fs::read_dir(&app_dir)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("filament-manager.db.recovery-legacy-bundle-migration-")
            });
        assert_eq!(migrated_spool_count, 1);
        assert_eq!(migrated_label, b"legacy-label");
        assert!(has_empty_backup);

        write_migration_probe_db(&legacy_dir.join(LEGACY_APP_DB_FILE_NAME), 2)?;
        prepare_app_storage_dir(&app_dir)?;
        let current_spool_count = migration_probe_spool_count(&app_dir.join(APP_DB_FILE_NAME))?;
        assert_eq!(current_spool_count, 1);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn app_storage_migration_renames_same_dir_legacy_database() {
    use super::{prepare_app_storage_dir, APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME};

    let base = temp_dir_path("legacy-db-file-name");
    let app_dir = base.join("no.bliatun.filamentmanager");
    let result = (|| -> Result<(), String> {
        write_migration_probe_db(&app_dir.join(LEGACY_APP_DB_FILE_NAME), 1)?;

        prepare_app_storage_dir(&app_dir)?;

        assert!(app_dir.join(LEGACY_APP_DB_FILE_NAME).exists());
        assert_eq!(
            migration_probe_spool_count(&app_dir.join(APP_DB_FILE_NAME))?,
            1
        );

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn app_storage_migration_preserves_committed_wal_data() {
    use super::{prepare_app_storage_dir, APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME};

    let base = temp_dir_path("legacy-db-wal-data");
    let app_dir = base.join("no.bliatun.filamentmanager");
    let result = (|| -> Result<(), String> {
        let legacy_connection =
            open_wal_migration_probe_db(&app_dir.join(LEGACY_APP_DB_FILE_NAME))?;

        prepare_app_storage_dir(&app_dir)?;

        assert_eq!(
            migration_probe_spool_count(&app_dir.join(APP_DB_FILE_NAME))?,
            1
        );
        drop(legacy_connection);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn app_storage_migration_replaces_ancillary_current_data_with_legacy_domain_data() {
    use super::{
        database_user_data_state, prepare_app_storage_dir, DatabaseUserDataState, APP_DB_FILE_NAME,
        LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("ancillary-current-domain-legacy");
    let app_dir = base.join("no.bliatun.filamentmanager");
    let current_db_path = app_dir.join(APP_DB_FILE_NAME);
    let legacy_db_path = app_dir.join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_ancillary_settings_db(&current_db_path)?;
        write_migration_probe_db(&legacy_db_path, 1)?;
        assert_eq!(
            database_user_data_state(&current_db_path),
            DatabaseUserDataState::AncillaryData
        );
        assert_eq!(
            database_user_data_state(&legacy_db_path),
            DatabaseUserDataState::DomainData
        );

        prepare_app_storage_dir(&app_dir)?;

        assert_eq!(migration_probe_spool_count(&current_db_path)?, 1);
        let has_ancillary_backup = std::fs::read_dir(&app_dir)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("filament-manager.db.recovery-legacy-bundle-migration-")
            });
        assert!(has_ancillary_backup);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn app_storage_migration_does_not_overwrite_unreadable_current_database() {
    use super::{
        prepare_app_storage_dir, APP_DB_FILE_NAME, LEGACY_APP_DATA_DIR_NAME,
        LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("unreadable-current-db-file");
    let legacy_dir = base.join(LEGACY_APP_DATA_DIR_NAME);
    let app_dir = base.join("no.bliatun.filamentmanager");
    let result = (|| -> Result<(), String> {
        write_migration_probe_db(&legacy_dir.join(LEGACY_APP_DB_FILE_NAME), 1)?;
        std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
        std::fs::write(app_dir.join(APP_DB_FILE_NAME), b"not a sqlite database")
            .map_err(|error| error.to_string())?;

        prepare_app_storage_dir(&app_dir)?;

        let current_db_bytes =
            std::fs::read(app_dir.join(APP_DB_FILE_NAME)).map_err(|error| error.to_string())?;
        assert_eq!(current_db_bytes, b"not a sqlite database");

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_prefers_existing_db_location() {
    use super::{resolve_windows_storage_dir, APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME};
    use crate::document_commands::chrono_id;

    let base =
        std::env::temp_dir().join(format!("filament-manager-windows-storage-{}", chrono_id()));
    let roaming_dir = base.join("roaming");
    let local_dir = base.join("local");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&roaming_dir).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

        let selected_without_db =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_without_db, local_dir);

        std::fs::write(roaming_dir.join(LEGACY_APP_DB_FILE_NAME), b"roaming-db")
            .map_err(|error| error.to_string())?;
        let selected_with_roaming =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_with_roaming, roaming_dir);

        std::fs::write(local_dir.join(APP_DB_FILE_NAME), b"local-db")
            .map_err(|error| error.to_string())?;
        let selected_with_local =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_with_local, local_dir);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_migrates_first_legacy_roaming_domain_database_into_local() {
    use super::{
        prepare_resolved_app_database, resolve_windows_storage_resolution,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-legacy-roaming-storage");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let legacy_roaming_db_path = roaming_root
        .join(LEGACY_APP_DATA_DIR_NAME)
        .join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "legacy-first-start",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;

        let resolution = resolve_windows_storage_resolution(roaming_dir, local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        assert_eq!(
            resolution.windows_split_brain_source.as_deref(),
            Some(legacy_roaming_db_path.as_path())
        );
        let target_db_path = prepare_resolved_app_database(resolution)?;
        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-legacy-first-start"
        )?);
        assert!(legacy_roaming_db_path.exists());
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);
        assert_eq!(
            split_brain_setting(&target_db_path, "windows_split_brain_merge_v1")?.as_deref(),
            Some("complete")
        );

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_ignores_generated_local_library_id_when_legacy_roaming_has_inventory() {
    use super::{
        database_user_data_state, prepare_resolved_app_database,
        resolve_windows_storage_resolution, DatabaseUserDataState, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-generated-library-id-storage");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let local_db_path = local_dir.join(APP_DB_FILE_NAME);
    let legacy_roaming_db_path = roaming_root
        .join(LEGACY_APP_DATA_DIR_NAME)
        .join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "legacy-library-id",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;
        std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

        let generated_library_id = {
            let local_db =
                FilamentDatabase::open(&local_db_path).map_err(|error| error.to_string())?;
            local_db.apply_schema().map_err(|error| error.to_string())?;
            let settings = local_db
                .get_library_sync_settings()
                .map_err(|error| error.to_string())?;
            assert!(!settings.library_id.is_empty());
            assert_eq!(
                database_user_data_state(&local_db_path),
                DatabaseUserDataState::NoData
            );
            settings.library_id
        };

        let resolution = resolve_windows_storage_resolution(roaming_dir, local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        let target_db_path = prepare_resolved_app_database(resolution)?;
        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-legacy-library-id"
        )?);
        assert_eq!(
            split_brain_setting(&target_db_path, "library_sync_library_id")?.as_deref(),
            Some(generated_library_id.as_str())
        );

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_merges_legacy_roaming_domain_data_into_current_local_ancillary_data() {
    use super::{
        database_user_data_state, prepare_resolved_app_database,
        resolve_windows_storage_resolution, DatabaseUserDataState, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-ancillary-local-domain-roaming");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let local_db_path = local_dir.join(APP_DB_FILE_NAME);
    let legacy_roaming_dir = roaming_root.join(LEGACY_APP_DATA_DIR_NAME);
    let legacy_roaming_db_path = legacy_roaming_dir.join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_ancillary_settings_db(&local_db_path)?;
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "legacy-ancillary",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;
        assert_eq!(
            database_user_data_state(&local_db_path),
            DatabaseUserDataState::AncillaryData
        );
        assert_eq!(
            database_user_data_state(&legacy_roaming_db_path),
            DatabaseUserDataState::DomainData
        );

        let resolution = resolve_windows_storage_resolution(roaming_dir, local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        let target_db_path = prepare_resolved_app_database(resolution)?;
        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-legacy-ancillary"
        )?);
        assert_eq!(
            split_brain_setting(&target_db_path, "library_sync_mode")?.as_deref(),
            Some("STANDALONE")
        );
        assert!(legacy_roaming_db_path.exists());
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_split_brain_merge_preserves_current_local_and_legacy_roaming_domain_data() {
    use super::{
        prepare_resolved_app_database, resolve_windows_storage_resolution, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-domain-split-brain-merge");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let local_db_path = local_dir.join(APP_DB_FILE_NAME);
    let legacy_roaming_db_path = roaming_root
        .join(LEGACY_APP_DATA_DIR_NAME)
        .join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "legacy",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;
        write_split_brain_domain_db(
            &local_db_path,
            "local",
            "Local Red",
            "local-safe",
            "CLIENT",
            "1",
        )?;

        let resolution = resolve_windows_storage_resolution(roaming_dir.clone(), local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        assert_eq!(
            resolution.windows_split_brain_source.as_deref(),
            Some(legacy_roaming_db_path.as_path())
        );
        let target_db_path = prepare_resolved_app_database(resolution)?;

        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-legacy"
        )?);
        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-local"
        )?);
        assert_eq!(
            split_brain_setting(&target_db_path, "split_merge_safe_setting")?.as_deref(),
            Some("local-safe")
        );
        assert_eq!(
            split_brain_setting(&target_db_path, "library_sync_mode")?.as_deref(),
            Some("CLIENT")
        );
        assert_eq!(
            split_brain_setting(&target_db_path, "trusted_lan_enabled")?.as_deref(),
            Some("1")
        );
        assert!(legacy_roaming_db_path.exists());
        assert!(local_db_path.exists());
        assert!(split_brain_spool_exists(
            &legacy_roaming_db_path,
            "merge-spool-legacy"
        )?);
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);

        {
            let target =
                rusqlite::Connection::open(&target_db_path).map_err(|error| error.to_string())?;
            target
                .execute(
                    "DELETE FROM settings WHERE key = 'windows_split_brain_merge_v1'",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        let second_resolution =
            resolve_windows_storage_resolution(roaming_dir.clone(), local_dir.clone());
        let second_target = prepare_resolved_app_database(second_resolution)?;
        assert_eq!(second_target, target_db_path);
        assert_eq!(
            split_brain_setting(&target_db_path, "windows_split_brain_merge_v1")?.as_deref(),
            Some("complete")
        );
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);

        {
            let target =
                rusqlite::Connection::open(&target_db_path).map_err(|error| error.to_string())?;
            target
                .execute(
                    "UPDATE settings SET value = 'local-user-change'
                     WHERE key = 'split_merge_safe_setting'",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        let third_resolution =
            resolve_windows_storage_resolution(roaming_dir.clone(), local_dir.clone());
        prepare_resolved_app_database(third_resolution)?;
        assert_eq!(
            split_brain_setting(&target_db_path, "split_merge_safe_setting")?.as_deref(),
            Some("local-user-change")
        );
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_split_brain_merge_preserves_local_and_imports_only_missing_safe_legacy_settings() {
    use super::{
        prepare_resolved_app_database, resolve_windows_storage_resolution, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-ancillary-split-brain-merge");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let local_db_path = local_dir.join(APP_DB_FILE_NAME);
    let legacy_roaming_db_path = roaming_root
        .join(LEGACY_APP_DATA_DIR_NAME)
        .join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "legacy",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;
        {
            let legacy = rusqlite::Connection::open(&legacy_roaming_db_path)
                .map_err(|error| error.to_string())?;
            legacy
                .execute(
                    "INSERT INTO settings (key, value)
                     VALUES ('legacy_only_safe_setting', 'legacy-only')",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        write_split_brain_ancillary_db(&local_db_path, "local-safe", "CLIENT", "1")?;

        let resolution = resolve_windows_storage_resolution(roaming_dir.clone(), local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        assert_eq!(
            resolution.windows_split_brain_source.as_deref(),
            Some(legacy_roaming_db_path.as_path())
        );
        let target_db_path = prepare_resolved_app_database(resolution)?;

        assert!(split_brain_spool_exists(
            &target_db_path,
            "merge-spool-legacy"
        )?);
        assert_eq!(
            split_brain_setting(&target_db_path, "split_merge_safe_setting")?.as_deref(),
            Some("local-safe")
        );
        assert_eq!(
            split_brain_setting(&target_db_path, "library_sync_mode")?.as_deref(),
            Some("CLIENT")
        );
        assert_eq!(
            split_brain_setting(&target_db_path, "trusted_lan_enabled")?.as_deref(),
            Some("1")
        );
        assert_eq!(
            split_brain_setting(&target_db_path, "legacy_only_safe_setting")?.as_deref(),
            Some("legacy-only")
        );
        assert!(local_db_path.exists());
        assert_eq!(
            split_brain_setting(&local_db_path, "split_merge_safe_setting")?.as_deref(),
            Some("local-safe")
        );
        assert!(legacy_roaming_db_path.exists());
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_split_brain_merge_rolls_back_conflicting_primary_keys() {
    use super::{
        prepare_resolved_app_database, resolve_windows_storage_resolution, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-split-brain-conflict");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let local_db_path = local_dir.join(APP_DB_FILE_NAME);
    let legacy_roaming_db_path = roaming_root
        .join(LEGACY_APP_DATA_DIR_NAME)
        .join(LEGACY_APP_DB_FILE_NAME);
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &legacy_roaming_db_path,
            "shared",
            "Legacy Blue",
            "legacy-safe",
            "HOST",
            "0",
        )?;
        write_split_brain_domain_db(
            &local_db_path,
            "shared",
            "Local Red",
            "local-safe",
            "CLIENT",
            "1",
        )?;

        let resolution = resolve_windows_storage_resolution(roaming_dir.clone(), local_dir.clone());
        let error = prepare_resolved_app_database(resolution).unwrap_err();
        assert!(error.contains("conflicting primary key"));

        let target_db_path = local_dir.join(APP_DB_FILE_NAME);
        let target =
            rusqlite::Connection::open(&target_db_path).map_err(|error| error.to_string())?;
        let target_color: String = target
            .query_row(
                "SELECT color_name FROM filament_master_list WHERE id = 'merge-master-shared'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let source =
            rusqlite::Connection::open(&local_db_path).map_err(|error| error.to_string())?;
        let source_color: String = source
            .query_row(
                "SELECT color_name FROM filament_master_list WHERE id = 'merge-master-shared'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(target_color, "Local Red");
        assert_eq!(source_color, "Local Red");
        assert_eq!(
            split_brain_setting(&target_db_path, "split_merge_safe_setting")?.as_deref(),
            Some("local-safe")
        );
        let legacy = rusqlite::Connection::open(&legacy_roaming_db_path)
            .map_err(|error| error.to_string())?;
        let legacy_color: String = legacy
            .query_row(
                "SELECT color_name FROM filament_master_list WHERE id = 'merge-master-shared'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(legacy_color, "Legacy Blue");
        assert_eq!(split_brain_backup_count(&local_dir)?, 1);
        assert_eq!(
            recovery_snapshot_count(&local_dir, "recovery-windows-storage-merge-failed-")?,
            1
        );
        assert!(local_db_path.exists());
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_keeps_current_local_priority_without_legacy_roaming_domain_data() {
    use super::{resolve_windows_storage_dir, APP_DB_FILE_NAME};

    let base = temp_dir_path("windows-current-local-normal-priority");
    let roaming_dir = base.join("roaming").join("no.bliatun.filamentmanager");
    let local_dir = base.join("local").join("no.bliatun.filamentmanager");
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &roaming_dir.join(APP_DB_FILE_NAME),
            "roaming",
            "Roaming Blue",
            "roaming-safe",
            "HOST",
            "0",
        )?;
        write_split_brain_domain_db(
            &local_dir.join(APP_DB_FILE_NAME),
            "local",
            "Local Red",
            "local-safe",
            "STANDALONE",
            "0",
        )?;

        let selected = resolve_windows_storage_dir(roaming_dir, local_dir.clone());
        assert_eq!(selected, local_dir);
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_keeps_authoritative_current_roaming_database_over_legacy_roaming() {
    use super::{
        resolve_windows_storage_resolution, APP_DB_FILE_NAME, LEGACY_APP_DATA_DIR_NAME,
        LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-current-roaming-authoritative");
    let roaming_root = base.join("roaming");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = base.join("local").join("no.bliatun.filamentmanager");
    let result = (|| -> Result<(), String> {
        write_split_brain_domain_db(
            &roaming_dir.join(APP_DB_FILE_NAME),
            "current-roaming",
            "Current Blue",
            "current-safe",
            "HOST",
            "0",
        )?;
        write_split_brain_domain_db(
            &roaming_root
                .join(LEGACY_APP_DATA_DIR_NAME)
                .join(LEGACY_APP_DB_FILE_NAME),
            "legacy-roaming",
            "Legacy Red",
            "legacy-safe",
            "STANDALONE",
            "0",
        )?;

        let resolution = resolve_windows_storage_resolution(roaming_dir.clone(), local_dir);
        assert_eq!(resolution.app_dir, roaming_dir);
        assert!(resolution.windows_split_brain_source.is_none());
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn database_user_data_state_classifies_settings_beyond_generated_library_id_as_ancillary() {
    use super::{database_user_data_state, DatabaseUserDataState};

    let db_path = temp_db_path("generated-library-id-user-data-state");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::NoData
        );

        db.connection()
            .execute(
                "INSERT INTO settings (key, value) VALUES ('active_printer_id', 'printer-1')",
                [],
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::AncillaryData
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_preserves_legacy_roaming_inventory_locations() {
    use super::{
        prepare_resolved_app_database, resolve_windows_storage_resolution,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-legacy-roaming-inventory-locations");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let legacy_roaming_dir = roaming_root.join(LEGACY_APP_DATA_DIR_NAME);
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&legacy_roaming_dir).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

        {
            let legacy_db =
                FilamentDatabase::open(legacy_roaming_dir.join(LEGACY_APP_DB_FILE_NAME))
                    .map_err(|error| error.to_string())?;
            legacy_db
                .apply_schema()
                .map_err(|error| error.to_string())?;
            legacy_db
                .connection()
                .execute(
                    "INSERT INTO inventory_locations (id, name, type)
                     VALUES ('legacy-location', 'Legacy shelf', 'SHELF')",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        let resolution = resolve_windows_storage_resolution(roaming_dir, local_dir.clone());
        assert_eq!(resolution.app_dir, local_dir);
        let target_db_path = prepare_resolved_app_database(resolution)?;
        let migrated_db =
            rusqlite::Connection::open(target_db_path).map_err(|error| error.to_string())?;
        let location_count = migrated_db
            .query_row("SELECT COUNT(*) FROM inventory_locations", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(location_count, 1);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn database_user_data_state_distinguishes_seeded_and_custom_catalog_rows() {
    use super::{database_user_data_state, DatabaseUserDataState};

    let db_path = temp_db_path("catalog-user-data-state");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::NoData
        );

        db.connection()
            .execute(
                "UPDATE filament_master_list SET catalog_source = 'scraped'",
                [],
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::NoData
        );

        db.connection()
            .execute(
                "UPDATE filament_master_list
                 SET catalog_user_edited = 1
                 WHERE id = (SELECT id FROM filament_master_list LIMIT 1)",
                [],
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::DomainData
        );

        db.connection()
            .execute(
                "UPDATE filament_master_list SET catalog_user_edited = 0",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.connection()
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, vendor, catalog_source
                 ) VALUES (
                    'manual-catalog-entry', 'PLA', 'Manual entry', 'Purple', 'Manual', 'manual'
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            database_user_data_state(&db_path),
            DatabaseUserDataState::DomainData
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[test]
fn windows_storage_prefers_current_roaming_data_over_legacy_local_data() {
    use super::{
        prepare_app_storage_dir, resolve_windows_storage_dir, APP_DB_FILE_NAME,
        LEGACY_APP_DATA_DIR_NAME, LEGACY_APP_DB_FILE_NAME,
    };

    let base = temp_dir_path("windows-current-roaming-over-legacy-local");
    let roaming_root = base.join("roaming");
    let local_root = base.join("local");
    let roaming_dir = roaming_root.join("no.bliatun.filamentmanager");
    let local_dir = local_root.join("no.bliatun.filamentmanager");
    let legacy_local_dir = local_root.join(LEGACY_APP_DATA_DIR_NAME);
    let result = (|| -> Result<(), String> {
        write_migration_probe_db(&legacy_local_dir.join(LEGACY_APP_DB_FILE_NAME), 1)?;
        write_migration_probe_db(&roaming_dir.join(APP_DB_FILE_NAME), 2)?;

        let selected = resolve_windows_storage_dir(roaming_dir.clone(), local_dir);
        assert_eq!(selected, roaming_dir);

        prepare_app_storage_dir(&selected)?;
        assert_eq!(
            migration_probe_spool_count(&selected.join(APP_DB_FILE_NAME))?,
            2
        );

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}
