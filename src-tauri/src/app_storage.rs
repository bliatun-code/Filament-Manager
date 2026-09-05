use crate::backend;
use crate::backend::database_settings::{
    CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY, CREDENTIAL_STORE_PROFILE_MIGRATION_SETTING_KEY,
};
use crate::backend::database_tables::FULL_BACKUP_TABLES;
use crate::backend::filament_database::FilamentDatabase;
use crate::sqlite_recovery::{
    online_backup, sanitize_legacy_database_credentials, RecoveryReason, RecoverySnapshot,
    SqliteWorkingCopy,
};
#[cfg(any(target_os = "windows", test))]
use rusqlite::OptionalExtension;
use std::ffi::OsString;
#[cfg(unix)]
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub(crate) const APP_DB_FILE_NAME: &str = "filament-manager.db";
pub(crate) const APP_DB_PATH_ENV_VAR: &str = "FILAMENT_MANAGER_DB_PATH";
pub(crate) const LEGACY_APP_DB_FILE_NAME: &str = "bambu.db";
pub(crate) const LEGACY_APP_DATA_DIR_NAME: &str = "com.bambu.filament.manager";
pub(crate) const LEGACY_APP_DB_PATH_ENV_VAR: &str = "BAMBU_DB_PATH";
const AUTO_GENERATED_LIBRARY_ID_SETTING_KEY: &str = "library_sync_library_id";
const RETIRED_LEGACY_DATABASE_SETTING_KEY: &str = "legacy_database_retired_v1";
const RETIRED_LEGACY_DATABASE_SETTING_VALUE: &str = "complete";
const RETIRED_LEGACY_DATABASE_SENTINEL_SUFFIX: &str =
    ".filament-manager-retired-legacy-database-v1";
const RETIRED_LEGACY_DATABASE_SENTINEL_CONTENTS: &[u8] =
    b"filament-manager-retired-legacy-database-v1\n";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY: &str = "windows_split_brain_merge_v1";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE: &str = "complete";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DatabaseUserDataState {
    DomainData,
    AncillaryData,
    NoData,
    Unreadable,
}

pub(crate) struct AppStorageResolution {
    pub(crate) app_dir: PathBuf,
    #[cfg(any(target_os = "windows", test))]
    pub(crate) windows_split_brain_source: Option<PathBuf>,
    #[cfg(any(target_os = "windows", test))]
    pub(crate) windows_retired_legacy_cleanup_sources: Vec<PathBuf>,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug)]
struct DatabaseMergePreflight {
    needs_merge: bool,
    conflict: Option<String>,
}

#[cfg(any(target_os = "windows", test))]
struct DatabaseTableMergeSchema {
    columns: Vec<String>,
    primary_key_indices: Vec<usize>,
}

pub(crate) fn ensure_db(app: &tauri::App) -> Result<PathBuf, String> {
    if let Some(path) = app_db_path_override_from_env() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let _db = open_database_and_apply_schema(&path)?;
        return Ok(path);
    }

    prepare_resolved_app_database(resolve_app_storage_dir_for_app(app)?)
}

pub(crate) fn prepare_resolved_app_database(
    resolution: AppStorageResolution,
) -> Result<PathBuf, String> {
    prepare_app_storage_dir(&resolution.app_dir)?;
    #[cfg(any(target_os = "windows", test))]
    sanitize_retired_legacy_database_sources(&resolution.windows_retired_legacy_cleanup_sources)?;
    let db_path = resolution.app_dir.join(APP_DB_FILE_NAME);
    let _db = open_database_and_apply_schema(&db_path)?;

    #[cfg(any(target_os = "windows", test))]
    if let Some(source_path) = resolution.windows_split_brain_source {
        drop(_db);
        merge_windows_split_brain_databases(&source_path, &db_path)?;
        retire_legacy_database_source(&source_path)?;
    }

    Ok(db_path)
}

pub(crate) fn open_database_and_apply_schema(path: &Path) -> Result<FilamentDatabase, String> {
    let schema_version = backend::database_connection::inspect_existing_database_schema(path)
        .map_err(|error| format!("DB inspect: {error:?}"))?;
    let recovery_snapshot = if schema_version
        .is_some_and(|version| version < backend::database_schema::CURRENT_SCHEMA_VERSION)
    {
        Some(
            RecoverySnapshot::create(path, RecoveryReason::SchemaUpgrade)
                .map_err(|error| format!("DB recovery snapshot: {error}"))?,
        )
    } else {
        None
    };

    let result = (|| {
        let db = FilamentDatabase::open(path).map_err(|error| format!("DB open: {error:?}"))?;
        db.apply_schema()
            .map_err(|error| format!("DB schema: {error:?}"))?;
        Ok(db)
    })();

    finish_recovery_operation(recovery_snapshot, result)
}

fn finish_recovery_operation<T>(
    recovery_snapshot: Option<RecoverySnapshot>,
    result: Result<T, String>,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            if let Some(snapshot) = recovery_snapshot {
                snapshot.mark_operation_succeeded();
            }
            Ok(value)
        }
        Err(error) => {
            if let Some(snapshot) = recovery_snapshot {
                snapshot.mark_operation_failed();
            }
            Err(error)
        }
    }
}

pub(crate) fn app_db_path_override_from_env() -> Option<PathBuf> {
    app_db_path_override(
        std::env::var_os(APP_DB_PATH_ENV_VAR),
        std::env::var_os(LEGACY_APP_DB_PATH_ENV_VAR),
    )
}

pub(crate) fn app_db_path_override(
    current: Option<OsString>,
    legacy: Option<OsString>,
) -> Option<PathBuf> {
    env_path(current).or_else(|| env_path(legacy))
}

fn env_path(value: Option<OsString>) -> Option<PathBuf> {
    value.filter(|value| !value.is_empty()).map(PathBuf::from)
}

fn resolve_app_storage_dir_for_app(app: &tauri::App) -> Result<AppStorageResolution, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let app_local_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(resolve_windows_storage_resolution(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AppStorageResolution {
            app_dir: app_data_dir,
            #[cfg(test)]
            windows_split_brain_source: None,
            #[cfg(test)]
            windows_retired_legacy_cleanup_sources: Vec::new(),
        })
    }
}

pub(crate) fn prepare_app_storage_dir(app_dir: &Path) -> Result<(), String> {
    migrate_legacy_app_storage_if_needed(app_dir)?;
    sanitize_known_legacy_database_sources(app_dir)?;
    std::fs::create_dir_all(app_dir).map_err(|error| error.to_string())
}

fn migrate_legacy_app_storage_if_needed(app_dir: &Path) -> Result<(), String> {
    let Some((legacy_db_path, legacy_dir)) = legacy_database_source(app_dir) else {
        return Ok(());
    };

    let current_db_path = app_dir.join(APP_DB_FILE_NAME);
    let current_db_exists = current_db_path.exists();
    let should_migrate = if current_db_exists {
        should_replace_current_database_with_legacy(
            database_user_data_state(&current_db_path),
            database_user_data_state(&legacy_db_path),
        )
    } else {
        true
    };
    if !should_migrate {
        return Ok(());
    }

    if let Some(legacy_dir) = legacy_dir {
        copy_dir_contents_without_overwrite(&legacy_dir, app_dir)?;
    } else {
        std::fs::create_dir_all(app_dir).map_err(|error| error.to_string())?;
    }
    let working_copy = SqliteWorkingCopy::create(
        &legacy_db_path,
        app_dir,
        RecoveryReason::LegacyBundleMigration,
    )?;
    let recovery_snapshot = if current_db_exists {
        Some(RecoverySnapshot::create(
            &current_db_path,
            RecoveryReason::LegacyBundleMigration,
        )?)
    } else {
        None
    };
    let migration_result = online_backup(working_copy.path(), &current_db_path);
    finish_recovery_operation(recovery_snapshot, migration_result)
}

fn should_replace_current_database_with_legacy(
    current: DatabaseUserDataState,
    legacy: DatabaseUserDataState,
) -> bool {
    matches!(
        (current, legacy),
        (
            DatabaseUserDataState::NoData,
            DatabaseUserDataState::DomainData | DatabaseUserDataState::AncillaryData
        ) | (
            DatabaseUserDataState::AncillaryData,
            DatabaseUserDataState::DomainData
        )
    )
}

pub(crate) fn legacy_database_source(app_dir: &Path) -> Option<(PathBuf, Option<PathBuf>)> {
    let mut ancillary_fallback = None;
    let mut empty_fallback = None;
    for candidate in known_legacy_database_sources(app_dir) {
        if legacy_database_is_retired(&candidate.0) {
            continue;
        }
        match database_user_data_state(&candidate.0) {
            DatabaseUserDataState::DomainData => return Some(candidate),
            DatabaseUserDataState::AncillaryData if ancillary_fallback.is_none() => {
                ancillary_fallback = Some(candidate);
            }
            DatabaseUserDataState::NoData if empty_fallback.is_none() => {
                empty_fallback = Some(candidate);
            }
            DatabaseUserDataState::AncillaryData
            | DatabaseUserDataState::NoData
            | DatabaseUserDataState::Unreadable => {}
        }
    }

    ancillary_fallback.or(empty_fallback)
}

fn known_legacy_database_sources(app_dir: &Path) -> Vec<(PathBuf, Option<PathBuf>)> {
    let mut candidates = Vec::new();
    let same_dir_legacy_db = app_dir.join(LEGACY_APP_DB_FILE_NAME);
    if same_dir_legacy_db.exists() {
        candidates.push((same_dir_legacy_db, None));
    }

    if let Some(parent_dir) = app_dir.parent() {
        let legacy_dir = parent_dir.join(LEGACY_APP_DATA_DIR_NAME);
        for file_name in [APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME] {
            let legacy_db_path = legacy_dir.join(file_name);
            if legacy_db_path.exists() {
                candidates.push((legacy_db_path, Some(legacy_dir.clone())));
            }
        }
    }
    let active_database_path = app_dir.join(APP_DB_FILE_NAME);
    candidates.retain(|(path, _)| path != &active_database_path);
    candidates.sort_by(|left, right| left.0.cmp(&right.0));
    candidates.dedup_by(|left, right| left.0 == right.0);
    candidates
}

pub(crate) fn sanitize_known_legacy_database_sources(app_dir: &Path) -> Result<(), String> {
    for (source_path, _) in known_legacy_database_sources(app_dir) {
        if database_user_data_state(&source_path) == DatabaseUserDataState::Unreadable {
            // An unreadable stale file is never a migration candidate. Leave
            // it untouched rather than blocking the active database; if it
            // becomes readable on a later start, retirement is retried then.
            continue;
        }
        retire_legacy_database_source(&source_path)?;
    }
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn sanitize_retired_legacy_database_sources(paths: &[PathBuf]) -> Result<(), String> {
    for source_path in paths {
        // These paths are discovered separately from migration eligibility.
        // Re-check retirement before touching one so this cleanup-only path can
        // never turn a newly-created database into a retired source.
        if !legacy_database_is_retired(source_path)
            || database_user_data_state(source_path) == DatabaseUserDataState::Unreadable
        {
            continue;
        }
        retire_legacy_database_source(source_path)?;
    }
    Ok(())
}

fn retire_legacy_database_source(path: &Path) -> Result<(), String> {
    ensure_legacy_database_retirement_sentinel(path)?;
    if legacy_database_has_retirement_marker(path) {
        return Ok(());
    }
    sanitize_legacy_database_credentials(path)?;
    mark_legacy_database_retired(path)
}

fn legacy_database_is_retired(path: &Path) -> bool {
    retirement_sentinel_path(path).symlink_metadata().is_ok()
        || legacy_database_has_retirement_marker(path)
}

fn legacy_database_has_retirement_marker(path: &Path) -> bool {
    use rusqlite::OptionalExtension;

    let Ok(connection) = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return false;
    };
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [RETIRED_LEGACY_DATABASE_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .is_ok_and(|value| value.as_deref() == Some(RETIRED_LEGACY_DATABASE_SETTING_VALUE))
}

pub(crate) fn ensure_legacy_database_retirement_sentinel(path: &Path) -> Result<(), String> {
    let sentinel_path = retirement_sentinel_path(path);
    match std::fs::symlink_metadata(&sentinel_path) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(format!(
                    "legacy database retirement sentinel is not a regular file: {}",
                    sentinel_path.display()
                ));
            }
            let contents = std::fs::read(&sentinel_path).map_err(|error| error.to_string())?;
            if contents != RETIRED_LEGACY_DATABASE_SENTINEL_CONTENTS {
                return Err(format!(
                    "legacy database retirement sentinel is invalid: {}",
                    sentinel_path.display()
                ));
            }
            return Ok(());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }

    let parent = sentinel_path
        .parent()
        .ok_or_else(|| "legacy database retirement sentinel has no parent".to_string())?;
    let temp_path = retirement_sentinel_temp_path(&sentinel_path);
    let write_result = (|| -> Result<(), String> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(RETIRED_LEGACY_DATABASE_SENTINEL_CONTENTS)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        std::fs::rename(&temp_path, &sentinel_path).map_err(|error| error.to_string())?;
        sync_retirement_sentinel_parent(parent)
    })();
    if write_result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    write_result
}

fn retirement_sentinel_path(path: &Path) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(RETIRED_LEGACY_DATABASE_SENTINEL_SUFFIX);
    PathBuf::from(value)
}

fn retirement_sentinel_temp_path(sentinel_path: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut value = OsString::from(sentinel_path.as_os_str());
    value.push(format!(".tmp-{}-{nonce}", std::process::id()));
    PathBuf::from(value)
}

#[cfg(unix)]
fn sync_retirement_sentinel_parent(parent: &Path) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn sync_retirement_sentinel_parent(_parent: &Path) -> Result<(), String> {
    Ok(())
}

fn mark_legacy_database_retired(path: &Path) -> Result<(), String> {
    let connection = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| {
        format!(
            "failed to reopen migrated legacy database {}: {error}",
            path.display()
        )
    })?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );",
        )
        .map_err(|error| error.to_string())?;
    let retirement_result = connection
        .execute(
            "INSERT INTO settings (key, value)
             VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![
                RETIRED_LEGACY_DATABASE_SETTING_KEY,
                RETIRED_LEGACY_DATABASE_SETTING_VALUE
            ],
        )
        .map_err(|error| error.to_string());
    match retirement_result {
        Ok(_) => {
            connection
                .execute_batch("COMMIT")
                .map_err(|error| error.to_string())?;
            let retained = connection
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    [RETIRED_LEGACY_DATABASE_SETTING_KEY],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|error| error.to_string())?;
            if retained == RETIRED_LEGACY_DATABASE_SETTING_VALUE {
                Ok(())
            } else {
                Err(format!(
                    "legacy database retirement marker was not retained for {}",
                    path.display()
                ))
            }
        }
        Err(error) => {
            let _ = connection.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn copy_dir_contents_without_overwrite(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target_dir).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if target_path.exists() && !target_path.is_dir() {
                continue;
            }
            copy_dir_contents_without_overwrite(&source_path, &target_path)?;
        } else if file_type.is_file() && !target_path.exists() {
            std::fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn database_user_data_state(db_path: &Path) -> DatabaseUserDataState {
    let connection = match rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(connection) => connection,
        Err(_) => return DatabaseUserDataState::Unreadable,
    };

    for table in FULL_BACKUP_TABLES {
        if table == "filament_master_list" || database_table_is_ancillary(table) {
            continue;
        }
        let has_rows = match database_table_has_rows(&connection, table) {
            Ok(has_rows) => has_rows,
            Err(error) if error.to_string().contains("no such table") => false,
            Err(_) => return DatabaseUserDataState::Unreadable,
        };
        if has_rows {
            return DatabaseUserDataState::DomainData;
        }
    }

    match database_catalog_has_user_data(&connection) {
        Ok(true) => return DatabaseUserDataState::DomainData,
        Ok(false) => {}
        Err(_) => return DatabaseUserDataState::Unreadable,
    }

    for table in [
        "settings",
        "trusted_lan_pairings",
        "trusted_lan_paired_browsers",
        "sync_queue",
    ] {
        let has_rows_result = if table == "settings" {
            database_settings_have_user_data(&connection)
        } else {
            database_table_has_rows(&connection, table)
        };
        let has_rows = match has_rows_result {
            Ok(has_rows) => has_rows,
            Err(error) if error.to_string().contains("no such table") => false,
            Err(_) => return DatabaseUserDataState::Unreadable,
        };
        if has_rows {
            return DatabaseUserDataState::AncillaryData;
        }
    }

    DatabaseUserDataState::NoData
}

fn database_table_is_ancillary(table: &str) -> bool {
    matches!(
        table,
        "settings" | "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue"
    )
}

fn database_settings_have_user_data(connection: &rusqlite::Connection) -> rusqlite::Result<bool> {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM settings
                 WHERE key NOT IN (?1, ?2, ?3)
             )",
            rusqlite::params![
                AUTO_GENERATED_LIBRARY_ID_SETTING_KEY,
                CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY,
                CREDENTIAL_STORE_PROFILE_MIGRATION_SETTING_KEY
            ],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
}

fn database_table_has_rows(
    connection: &rusqlite::Connection,
    table: &str,
) -> rusqlite::Result<bool> {
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {table})");
    connection
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value != 0)
}

fn database_catalog_has_user_data(connection: &rusqlite::Connection) -> rusqlite::Result<bool> {
    let (catalog_table_exists, has_catalog_source, has_catalog_user_edited) = {
        let mut statement = connection.prepare("PRAGMA table_info(filament_master_list)")?;
        let mut rows = statement.query([])?;
        let mut catalog_table_exists = false;
        let mut has_catalog_source = false;
        let mut has_catalog_user_edited = false;
        while let Some(row) = rows.next()? {
            catalog_table_exists = true;
            let column_name = row.get::<_, String>(1)?;
            has_catalog_source |= column_name == "catalog_source";
            has_catalog_user_edited |= column_name == "catalog_user_edited";
        }
        (
            catalog_table_exists,
            has_catalog_source,
            has_catalog_user_edited,
        )
    };

    if !catalog_table_exists {
        return Ok(false);
    }

    let sql = match (has_catalog_source, has_catalog_user_edited) {
        (true, true) => {
            "SELECT EXISTS(
                SELECT 1 FROM filament_master_list
                WHERE COALESCE(catalog_source, 'unknown') NOT IN ('seeded', 'scraped')
                   OR catalog_user_edited != 0
            )"
        }
        (true, false) => {
            "SELECT EXISTS(
                SELECT 1 FROM filament_master_list
                WHERE COALESCE(catalog_source, 'unknown') NOT IN ('seeded', 'scraped')
            )"
        }
        (false, _) => "SELECT EXISTS(SELECT 1 FROM filament_master_list)",
    };
    connection
        .query_row(sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value != 0)
}

#[cfg(test)]
pub(crate) fn resolve_windows_storage_dir(roaming_dir: PathBuf, local_dir: PathBuf) -> PathBuf {
    resolve_windows_storage_resolution(roaming_dir, local_dir).app_dir
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn resolve_windows_storage_resolution(
    roaming_dir: PathBuf,
    local_dir: PathBuf,
) -> AppStorageResolution {
    let split_brain_source = windows_legacy_roaming_merge_source(&roaming_dir, &local_dir);
    let windows_retired_legacy_cleanup_sources =
        windows_retired_legacy_cleanup_sources(&roaming_dir);
    if split_brain_source.is_some() {
        return AppStorageResolution {
            app_dir: local_dir,
            windows_split_brain_source: split_brain_source,
            windows_retired_legacy_cleanup_sources,
        };
    }

    AppStorageResolution {
        app_dir: resolve_windows_storage_dir_without_split_merge(roaming_dir, local_dir),
        windows_split_brain_source: None,
        windows_retired_legacy_cleanup_sources,
    }
}

#[cfg(any(target_os = "windows", test))]
fn windows_retired_legacy_cleanup_sources(roaming_dir: &Path) -> Vec<PathBuf> {
    storage_dir_legacy_database_candidates(roaming_dir)
        .into_iter()
        .filter(|path| path.exists() && legacy_database_is_retired(path))
        .collect()
}

#[cfg(any(target_os = "windows", test))]
fn windows_legacy_roaming_merge_source(roaming_dir: &Path, local_dir: &Path) -> Option<PathBuf> {
    let current_roaming_has_user_data = storage_dir_current_database_candidates(roaming_dir)
        .iter()
        .any(|path| {
            !legacy_database_is_retired(path)
                && matches!(
                    database_user_data_state(path),
                    DatabaseUserDataState::DomainData | DatabaseUserDataState::AncillaryData
                )
        });
    if current_roaming_has_user_data {
        return None;
    }

    let current_local_database = local_dir.join(APP_DB_FILE_NAME);
    if current_local_database.exists()
        && database_user_data_state(&current_local_database) == DatabaseUserDataState::Unreadable
    {
        return None;
    }

    storage_dir_legacy_database_candidates(roaming_dir)
        .into_iter()
        .find(|path| {
            !legacy_database_is_retired(path)
                && database_user_data_state(path) == DatabaseUserDataState::DomainData
        })
}

#[cfg(any(target_os = "windows", test))]
fn resolve_windows_storage_dir_without_split_merge(
    roaming_dir: PathBuf,
    local_dir: PathBuf,
) -> PathBuf {
    for state in [
        DatabaseUserDataState::DomainData,
        DatabaseUserDataState::AncillaryData,
    ] {
        if database_candidates_have_state(
            &storage_dir_current_database_candidates(&local_dir),
            state,
        ) {
            return local_dir;
        }
        if database_candidates_have_state(
            &storage_dir_current_database_candidates(&roaming_dir),
            state,
        ) {
            return roaming_dir;
        }
        if database_candidates_have_state(
            &storage_dir_legacy_database_candidates(&local_dir),
            state,
        ) {
            return local_dir;
        }
        if database_candidates_have_state(
            &storage_dir_legacy_database_candidates(&roaming_dir),
            state,
        ) {
            return roaming_dir;
        }
    }
    if database_candidates_exist(&storage_dir_current_database_candidates(&local_dir)) {
        return local_dir;
    }
    if database_candidates_exist(&storage_dir_current_database_candidates(&roaming_dir)) {
        return roaming_dir;
    }
    if database_candidates_exist(&storage_dir_legacy_database_candidates(&local_dir)) {
        return local_dir;
    }
    if database_candidates_exist(&storage_dir_legacy_database_candidates(&roaming_dir)) {
        return roaming_dir;
    }
    local_dir
}

#[cfg(any(target_os = "windows", test))]
fn database_candidates_have_state(candidates: &[PathBuf], state: DatabaseUserDataState) -> bool {
    candidates
        .iter()
        .any(|path| !legacy_database_is_retired(path) && database_user_data_state(path) == state)
}

#[cfg(any(target_os = "windows", test))]
fn database_candidates_exist(candidates: &[PathBuf]) -> bool {
    candidates
        .iter()
        .any(|path| path.exists() && !legacy_database_is_retired(path))
}

#[cfg(any(target_os = "windows", test))]
fn storage_dir_current_database_candidates(dir: &Path) -> [PathBuf; 2] {
    [
        dir.join(APP_DB_FILE_NAME),
        dir.join(LEGACY_APP_DB_FILE_NAME),
    ]
}

#[cfg(any(target_os = "windows", test))]
fn storage_dir_legacy_database_candidates(dir: &Path) -> Vec<PathBuf> {
    if let Some(parent_dir) = dir.parent() {
        let legacy_dir = parent_dir.join(LEGACY_APP_DATA_DIR_NAME);
        return vec![
            legacy_dir.join(APP_DB_FILE_NAME),
            legacy_dir.join(LEGACY_APP_DB_FILE_NAME),
        ];
    }
    Vec::new()
}

#[cfg(any(target_os = "windows", test))]
fn merge_windows_split_brain_databases(
    source_path: &Path,
    target_path: &Path,
) -> Result<Option<PathBuf>, String> {
    if source_path == target_path {
        return Err("Windows split-brain merge source and target must be different".to_string());
    }
    if windows_split_brain_merge_is_marked(target_path)? {
        return Ok(None);
    }

    let preflight = preflight_windows_split_brain_merge(source_path, target_path)?;
    if !preflight.needs_merge {
        write_windows_split_brain_merge_marker(target_path)?;
        return Ok(None);
    }

    let recovery_snapshot =
        RecoverySnapshot::create(target_path, RecoveryReason::WindowsStorageMerge)?;

    if let Some(conflict) = preflight.conflict {
        let backup_path = recovery_snapshot.mark_operation_failed();
        return Err(format!(
            "{conflict}. The target backup is {} and the source database was left unchanged",
            backup_path.display()
        ));
    }

    match apply_windows_split_brain_merge(source_path, target_path) {
        Ok(()) => Ok(Some(recovery_snapshot.mark_operation_succeeded())),
        Err(error) => {
            let backup_path = recovery_snapshot.mark_operation_failed();
            Err(format!(
                "{error}. The merge was rolled back, the target backup is {}, and the source database was left unchanged",
                backup_path.display()
            ))
        }
    }
}

#[cfg(any(target_os = "windows", test))]
fn preflight_windows_split_brain_merge(
    source_path: &Path,
    target_path: &Path,
) -> Result<DatabaseMergePreflight, String> {
    let source = rusqlite::Connection::open_with_flags(
        source_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| {
        format!(
            "failed to open Windows split-brain source {}: {error}",
            source_path.display()
        )
    })?;
    let target = rusqlite::Connection::open_with_flags(
        target_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
    )
    .map_err(|error| {
        format!(
            "failed to open Windows split-brain target {}: {error}",
            target_path.display()
        )
    })?;

    let mut needs_merge = false;
    for table in FULL_BACKUP_TABLES {
        if database_merge_skips_table(table) {
            continue;
        }
        if table == "settings" {
            for (key, _) in read_safe_merge_settings(&source)? {
                let target_value = target
                    .query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| {
                        row.get::<_, String>(0)
                    })
                    .optional()
                    .map_err(|error| error.to_string())?;
                if target_value.is_none() {
                    needs_merge = true;
                }
            }
            continue;
        }

        let Some(schema) = database_table_merge_schema(&source, &target, table)? else {
            continue;
        };
        for source_row in read_database_table_rows(&source, table, &schema.columns)? {
            match find_database_merge_target_row(&target, table, &schema, &source_row)? {
                Some(target_row) => {
                    if table == "filament_master_list"
                        && database_catalog_merge_row_is_automatic(&schema.columns, &source_row)
                    {
                        continue;
                    }
                    if target_row != source_row {
                        return Ok(DatabaseMergePreflight {
                            needs_merge: true,
                            conflict: Some(format!(
                                "Windows split-brain merge found a conflicting primary key in `{table}`"
                            )),
                        });
                    }
                }
                None => needs_merge = true,
            }
        }
    }

    Ok(DatabaseMergePreflight {
        needs_merge,
        conflict: None,
    })
}

#[cfg(any(target_os = "windows", test))]
fn apply_windows_split_brain_merge(source_path: &Path, target_path: &Path) -> Result<(), String> {
    let source = rusqlite::Connection::open_with_flags(
        source_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| error.to_string())?;
    let mut target = rusqlite::Connection::open(target_path).map_err(|error| error.to_string())?;
    target
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    let transaction = target
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|error| error.to_string())?;

    let merge_result = (|| -> Result<(), String> {
        for table in FULL_BACKUP_TABLES {
            if database_merge_skips_table(table) || table == "settings" {
                continue;
            }
            let Some(schema) = database_table_merge_schema(&source, &transaction, table)? else {
                continue;
            };
            for source_row in read_database_table_rows(&source, table, &schema.columns)? {
                if let Some(target_row) =
                    find_database_merge_target_row(&transaction, table, &schema, &source_row)?
                {
                    if table == "filament_master_list"
                        && database_catalog_merge_row_is_automatic(&schema.columns, &source_row)
                    {
                        continue;
                    }
                    if target_row != source_row {
                        return Err(format!(
                            "Windows split-brain merge found a conflicting primary key in `{table}`"
                        ));
                    }
                    continue;
                }
                insert_database_merge_row(&transaction, table, &schema.columns, &source_row)?;
            }
        }

        for (key, value) in read_safe_merge_settings(&source)? {
            transaction
                .execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO NOTHING",
                    rusqlite::params![key, value],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![
                    WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY,
                    WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE
                ],
            )
            .map_err(|error| error.to_string())?;

        let mut statement = transaction
            .prepare("PRAGMA foreign_key_check")
            .map_err(|error| error.to_string())?;
        let mut rows = statement.query([]).map_err(|error| error.to_string())?;
        if let Some(row) = rows.next().map_err(|error| error.to_string())? {
            let table: String = row.get(0).map_err(|error| error.to_string())?;
            let parent: String = row.get(2).map_err(|error| error.to_string())?;
            return Err(format!(
                "Windows split-brain merge would leave `{table}` referencing missing `{parent}` data"
            ));
        }
        drop(rows);
        drop(statement);
        Ok(())
    })();

    match merge_result {
        Ok(()) => transaction.commit().map_err(|error| error.to_string()),
        Err(error) => {
            let _ = transaction.rollback();
            Err(error)
        }
    }
}

#[cfg(any(target_os = "windows", test))]
fn database_merge_skips_table(table: &str) -> bool {
    matches!(
        table,
        "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue"
    )
}

#[cfg(any(target_os = "windows", test))]
fn database_table_merge_schema(
    source: &rusqlite::Connection,
    target: &rusqlite::Connection,
    table: &str,
) -> Result<Option<DatabaseTableMergeSchema>, String> {
    let (source_columns, _) = database_table_columns_and_primary_key(source, table)?;
    if source_columns.is_empty() {
        return Ok(None);
    }
    let (target_columns, target_primary_key) =
        database_table_columns_and_primary_key(target, table)?;
    if target_columns.is_empty() {
        return Err(format!(
            "Windows split-brain target is missing the `{table}` table"
        ));
    }

    let source_column_set = source_columns
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let columns = target_columns
        .into_iter()
        .filter(|column| source_column_set.contains(column))
        .collect::<Vec<_>>();
    let primary_key_indices = target_primary_key
        .iter()
        .map(|column| {
            columns.iter().position(|candidate| candidate == column).ok_or_else(|| {
                format!(
                    "Windows split-brain source is missing primary-key column `{column}` for `{table}`"
                )
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if primary_key_indices.is_empty() {
        return Err(format!(
            "Windows split-brain merge requires a primary key for `{table}`"
        ));
    }

    Ok(Some(DatabaseTableMergeSchema {
        columns,
        primary_key_indices,
    }))
}

#[cfg(any(target_os = "windows", test))]
fn database_table_columns_and_primary_key(
    connection: &rusqlite::Connection,
    table: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    let mut statement = connection
        .prepare(&format!(
            "PRAGMA table_info({})",
            quote_sql_identifier(table)
        ))
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut columns = Vec::new();
    let mut primary_key = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let column_name: String = row.get(1).map_err(|error| error.to_string())?;
        let primary_key_order: i64 = row.get(5).map_err(|error| error.to_string())?;
        columns.push(column_name.clone());
        if primary_key_order > 0 {
            primary_key.push((primary_key_order, column_name));
        }
    }
    primary_key.sort_by_key(|(order, _)| *order);
    Ok((
        columns,
        primary_key.into_iter().map(|(_, column)| column).collect(),
    ))
}

#[cfg(any(target_os = "windows", test))]
fn read_database_table_rows(
    connection: &rusqlite::Connection,
    table: &str,
    columns: &[String],
) -> Result<Vec<Vec<rusqlite::types::Value>>, String> {
    let column_list = columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let mut statement = connection
        .prepare(&format!(
            "SELECT {column_list} FROM {}",
            quote_sql_identifier(table)
        ))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            (0..columns.len())
                .map(|index| row.get::<_, rusqlite::types::Value>(index))
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn find_database_merge_target_row(
    target: &rusqlite::Connection,
    table: &str,
    schema: &DatabaseTableMergeSchema,
    source_row: &[rusqlite::types::Value],
) -> Result<Option<Vec<rusqlite::types::Value>>, String> {
    let column_list = schema
        .columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let predicate = schema
        .primary_key_indices
        .iter()
        .enumerate()
        .map(|(parameter_index, column_index)| {
            format!(
                "{} IS ?{}",
                quote_sql_identifier(&schema.columns[*column_index]),
                parameter_index + 1
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!(
        "SELECT {column_list} FROM {} WHERE {predicate}",
        quote_sql_identifier(table)
    );
    target
        .query_row(
            &sql,
            rusqlite::params_from_iter(
                schema
                    .primary_key_indices
                    .iter()
                    .map(|index| &source_row[*index]),
            ),
            |row| {
                (0..schema.columns.len())
                    .map(|index| row.get::<_, rusqlite::types::Value>(index))
                    .collect::<rusqlite::Result<Vec<_>>>()
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn insert_database_merge_row(
    target: &rusqlite::Connection,
    table: &str,
    columns: &[String],
    row: &[rusqlite::types::Value],
) -> Result<(), String> {
    let column_list = columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = vec!["?"; columns.len()].join(", ");
    target
        .execute(
            &format!(
                "INSERT INTO {} ({column_list}) VALUES ({placeholders})",
                quote_sql_identifier(table)
            ),
            rusqlite::params_from_iter(row.iter()),
        )
        .map_err(|error| format!("failed to merge `{table}`: {error}"))?;
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn database_catalog_merge_row_is_automatic(
    columns: &[String],
    row: &[rusqlite::types::Value],
) -> bool {
    let Some(source_index) = columns.iter().position(|column| column == "catalog_source") else {
        return false;
    };
    let source_is_automatic = matches!(
        row.get(source_index),
        Some(rusqlite::types::Value::Text(source)) if source == "seeded" || source == "scraped"
    );
    let user_edited = columns
        .iter()
        .position(|column| column == "catalog_user_edited")
        .and_then(|index| row.get(index))
        .is_some_and(|value| match value {
            rusqlite::types::Value::Integer(value) => *value != 0,
            rusqlite::types::Value::Real(value) => *value != 0.0,
            rusqlite::types::Value::Text(value) => value != "0" && !value.is_empty(),
            rusqlite::types::Value::Null | rusqlite::types::Value::Blob(_) => false,
        });
    source_is_automatic && !user_edited
}

#[cfg(any(target_os = "windows", test))]
fn read_safe_merge_settings(
    connection: &rusqlite::Connection,
) -> Result<Vec<(String, String)>, String> {
    let (columns, _) = database_table_columns_and_primary_key(connection, "settings")?;
    if !columns.iter().any(|column| column == "key")
        || !columns.iter().any(|column| column == "value")
    {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut settings = Vec::new();
    for row in rows {
        let (key, value) = row.map_err(|error| error.to_string())?;
        let normalized_key = key.to_ascii_lowercase();
        if normalized_key == WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY
            || normalized_key.starts_with("library_sync_")
            || normalized_key.starts_with("credential_store_")
            || normalized_key.starts_with("trusted_lan_")
        {
            continue;
        }
        settings.push((key, value));
    }
    Ok(settings)
}

#[cfg(any(target_os = "windows", test))]
fn windows_split_brain_merge_is_marked(target_path: &Path) -> Result<bool, String> {
    let connection = rusqlite::Connection::open_with_flags(
        target_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| error.to_string())?;
    let marker = connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(marker.as_deref() == Some(WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE))
}

#[cfg(any(target_os = "windows", test))]
fn write_windows_split_brain_merge_marker(target_path: &Path) -> Result<(), String> {
    let mut connection =
        rusqlite::Connection::open(target_path).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![
                WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY,
                WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn quote_sql_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

#[cfg(test)]
mod architecture_tests {
    const MAIN_SOURCE: &str = include_str!("main.rs");
    const APP_STORAGE_SOURCE: &str = include_str!("app_storage.rs");

    #[test]
    fn main_only_orchestrates_app_storage_startup() {
        assert!(MAIN_SOURCE.contains("mod app_storage;"));
        assert!(MAIN_SOURCE.contains("app_storage::ensure_db(app)"));
        for implementation in [
            "fn ensure_db(",
            "fn migrate_legacy_app_storage_if_needed(",
            "fn resolve_windows_storage_resolution(",
            "fn merge_windows_split_brain_databases(",
        ] {
            assert!(
                !MAIN_SOURCE.contains(implementation),
                "main.rs should not own `{implementation}`"
            );
            assert!(
                APP_STORAGE_SOURCE.contains(implementation),
                "app_storage.rs should own `{implementation}`"
            );
        }
        // The allowance includes the dedicated packaged Host-Client module and
        // its four invoke registrations, plus the catalog jobs' three modules and
        // four invoke registrations; production logic still lives outside main.rs.
        assert!(
            MAIN_SOURCE.lines().count() <= 862,
            "main.rs should stay focused on application wiring"
        );
    }
}
