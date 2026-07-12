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

fn migration_probe_spool_count(path: &Path) -> Result<i64, String> {
    let connection = rusqlite::Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .query_row("SELECT COUNT(*) FROM filament_spools", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())
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
    let app_dir = base.join("no.bliatun.filamentmanager");
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
                    .starts_with("filament-manager.db.backup-empty-before-legacy-migration-")
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

#[cfg(target_os = "windows")]
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
