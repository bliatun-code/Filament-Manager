use rusqlite::backup::{Backup, StepResult};
use rusqlite::{params, Connection, OpenFlags};
use serde_json::Value;
use std::collections::BTreeSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const SQLITE_BACKUP_RETRY_DELAY: Duration = Duration::from_millis(25);
const SQLITE_BACKUP_PAGES_PER_STEP: i32 = 128;
const MAX_SUCCESSFUL_RECOVERY_SNAPSHOTS_PER_REASON: usize = 3;
const MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON: usize = 3;
const SNAPSHOT_ID_LENGTH: usize = 25;
const CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY: &str = "secure_credential_snapshot_sanitized_v2";
const LEGACY_CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY: &str =
    "secure_credential_snapshot_sanitized_v1";

static SNAPSHOT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RecoveryReason {
    FullRestore,
    LegacyBundleMigration,
    SchemaUpgrade,
    #[cfg(any(target_os = "windows", test))]
    WindowsStorageMerge,
}

impl RecoveryReason {
    fn slug(self) -> &'static str {
        match self {
            Self::FullRestore => "full-restore",
            Self::LegacyBundleMigration => "legacy-bundle-migration",
            Self::SchemaUpgrade => "schema-upgrade",
            #[cfg(any(target_os = "windows", test))]
            Self::WindowsStorageMerge => "windows-storage-merge",
        }
    }
}

#[derive(Clone, Copy)]
enum RecoveryState {
    Pending,
    Successful,
    Failed,
}

impl RecoveryState {
    fn slug(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Successful => "successful",
            Self::Failed => "failed",
        }
    }
}

pub(crate) struct RecoverySnapshot {
    base_file_name: String,
    id: String,
    parent: PathBuf,
    path: PathBuf,
    reason: RecoveryReason,
}

impl RecoverySnapshot {
    pub(crate) fn create(source_path: &Path, reason: RecoveryReason) -> Result<Self, String> {
        let parent = source_path.parent().ok_or_else(|| {
            format!(
                "database path has no parent directory: {}",
                source_path.display()
            )
        })?;
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create recovery snapshot directory {}: {error}",
                parent.display()
            )
        })?;

        let base_file_name = portable_file_name_component(source_path);
        let id = unique_snapshot_id();
        let path =
            recovery_snapshot_path(parent, &base_file_name, reason, RecoveryState::Pending, &id);
        online_backup(source_path, &path)?;

        prune_incomplete_snapshots(
            parent,
            &base_file_name,
            reason,
            RecoveryState::Pending,
            &path,
        );

        Ok(Self {
            base_file_name,
            id,
            parent: parent.to_path_buf(),
            path,
            reason,
        })
    }

    #[cfg(test)]
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn mark_operation_succeeded(mut self) -> PathBuf {
        // Retention runs only after the guarded operation succeeds. A failed
        // rename leaves the snapshot pending, which is deliberately fail-safe.
        if self.transition_to(RecoveryState::Successful) {
            prune_successful_snapshots(&self.parent, &self.base_file_name, self.reason, &self.path);
        }
        self.path
    }

    pub(crate) fn mark_operation_failed(mut self) -> PathBuf {
        if self.transition_to(RecoveryState::Failed) {
            prune_incomplete_snapshots(
                &self.parent,
                &self.base_file_name,
                self.reason,
                RecoveryState::Failed,
                &self.path,
            );
        }
        self.path
    }

    fn transition_to(&mut self, state: RecoveryState) -> bool {
        let destination = recovery_snapshot_path(
            &self.parent,
            &self.base_file_name,
            self.reason,
            state,
            &self.id,
        );
        if std::fs::rename(&self.path, &destination).is_err() {
            return false;
        }
        self.path = destination;
        true
    }
}

pub(crate) struct SqliteWorkingCopy {
    path: PathBuf,
}

impl SqliteWorkingCopy {
    pub(crate) fn create(
        source_path: &Path,
        destination_dir: &Path,
        reason: RecoveryReason,
    ) -> Result<Self, String> {
        std::fs::create_dir_all(destination_dir).map_err(|error| {
            format!(
                "failed to create SQLite working-copy directory {}: {error}",
                destination_dir.display()
            )
        })?;
        let base_file_name = portable_file_name_component(source_path);
        let path = destination_dir.join(format!(
            ".{base_file_name}.recovery-{}-working-{}.sqlite",
            reason.slug(),
            unique_snapshot_id()
        ));
        online_backup(source_path, &path)?;
        Ok(Self { path })
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for SqliteWorkingCopy {
    fn drop(&mut self) {
        remove_sqlite_artifacts(&self.path);
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct RecoveryCredentialSanitizeStats {
    pub(crate) snapshots_checked: usize,
    pub(crate) snapshots_sanitized: usize,
    pub(crate) invalid_pending_snapshots_removed: usize,
    pub(crate) invalid_or_unknown_snapshots_skipped: usize,
    pub(crate) snapshot_sanitization_failures: usize,
}

/// Removes obsolete plaintext credentials from app-owned recovery snapshots
/// created alongside this application's database.
///
/// Pending snapshots are included because this function only runs at startup or
/// after the guarded operation has ended; an interrupted pending snapshot must
/// not retain old plaintext secrets indefinitely. Working copies, symlinks,
/// nested paths and filenames that do not exactly match an app-owned recovery
/// name remain excluded. Valid files with an unknown schema and completed
/// snapshots that cannot be validated are left untouched; definitively invalid
/// app-owned pending artifacts are removed together with their sidecars.
pub(crate) fn sanitize_app_recovery_snapshot_credentials(
    database_path: &Path,
) -> Result<RecoveryCredentialSanitizeStats, String> {
    let parent = database_path.parent().ok_or_else(|| {
        format!(
            "database path has no parent directory: {}",
            database_path.display()
        )
    })?;
    let base_file_name = portable_file_name_component(database_path);
    let entries = std::fs::read_dir(parent).map_err(|error| {
        format!(
            "failed to inspect recovery snapshot directory {}: {error}",
            parent.display()
        )
    })?;
    let mut snapshot_paths = Vec::new();

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() || file_type.is_symlink() {
            continue;
        }
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        if !is_app_recovery_snapshot_name(file_name, &base_file_name) {
            continue;
        }
        snapshot_paths.push(entry.path());
    }

    // A stable order makes one corrupt snapshot demonstrably independent of
    // every later recovery point. Per-snapshot failures are counted without
    // retaining paths or database error text, which avoids leaking local
    // filesystem details into startup diagnostics.
    snapshot_paths.sort();
    let mut stats = RecoveryCredentialSanitizeStats::default();
    for snapshot_path in snapshot_paths {
        stats.snapshots_checked += 1;
        match sanitize_recovery_snapshot_credentials(&snapshot_path) {
            Ok(RecoverySnapshotSanitizeOutcome::Sanitized) => {
                stats.snapshots_sanitized += 1;
            }
            Ok(RecoverySnapshotSanitizeOutcome::Clean) => {}
            Ok(RecoverySnapshotSanitizeOutcome::InvalidOrUnknown) => {
                let is_invalid_pending = snapshot_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|file_name| {
                        is_app_pending_recovery_snapshot_name(file_name, &base_file_name)
                    })
                    && database_is_definitively_invalid(&snapshot_path);
                if is_invalid_pending {
                    match remove_sqlite_artifacts_checked(&snapshot_path) {
                        Ok(()) => stats.invalid_pending_snapshots_removed += 1,
                        Err(_) => stats.snapshot_sanitization_failures += 1,
                    }
                } else {
                    stats.invalid_or_unknown_snapshots_skipped += 1;
                }
            }
            Err(_) => stats.snapshot_sanitization_failures += 1,
        }
    }
    Ok(stats)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RecoverySnapshotSanitizeOutcome {
    Sanitized,
    Clean,
    InvalidOrUnknown,
}

fn is_app_recovery_snapshot_name(file_name: &str, base_file_name: &str) -> bool {
    is_app_recovery_snapshot_name_with_states(
        file_name,
        base_file_name,
        &["successful", "failed", "pending"],
    )
}

fn is_app_pending_recovery_snapshot_name(file_name: &str, base_file_name: &str) -> bool {
    is_app_recovery_snapshot_name_with_states(file_name, base_file_name, &["pending"])
}

fn is_app_recovery_snapshot_name_with_states(
    file_name: &str,
    base_file_name: &str,
    states: &[&str],
) -> bool {
    let Some(rest) = file_name
        .strip_prefix(&format!("{base_file_name}.recovery-"))
        .and_then(|value| value.strip_suffix(".sqlite"))
    else {
        return false;
    };
    const REASONS: [&str; 4] = [
        "full-restore",
        "legacy-bundle-migration",
        "schema-upgrade",
        "windows-storage-merge",
    ];

    REASONS.iter().any(|reason| {
        states.iter().any(|state| {
            rest.strip_prefix(&format!("{reason}-{state}-"))
                .is_some_and(valid_snapshot_id)
        })
    })
}

fn valid_snapshot_id(value: &str) -> bool {
    value.len() == SNAPSHOT_ID_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte.is_ascii_lowercase())
}

fn sanitize_recovery_snapshot_credentials(
    snapshot_path: &Path,
) -> Result<RecoverySnapshotSanitizeOutcome, String> {
    sanitize_database_credentials(snapshot_path, true, physically_erase_removed_credentials)
}

/// Scrubs a retired legacy database after its data has been copied or merged
/// into the active database. The source remains a usable recovery point for
/// domain data, but it can no longer reintroduce machine-local credentials on a
/// later first-run migration.
pub(crate) fn sanitize_legacy_database_credentials(database_path: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(database_path).map_err(|error| {
        format!(
            "failed to inspect legacy database {}: {error}",
            database_path.display()
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "legacy database is not a regular file: {}",
            database_path.display()
        ));
    }
    match sanitize_database_credentials(database_path, false, physically_erase_removed_credentials)?
    {
        RecoverySnapshotSanitizeOutcome::Sanitized
        | RecoverySnapshotSanitizeOutcome::Clean
        | RecoverySnapshotSanitizeOutcome::InvalidOrUnknown => Ok(()),
    }
}

fn sanitize_database_credentials<F>(
    database_path: &Path,
    invalid_database_is_unknown: bool,
    physical_cleanup: F,
) -> Result<RecoverySnapshotSanitizeOutcome, String>
where
    F: FnOnce(Connection, &Path) -> Result<(), String>,
{
    let connection = match Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(connection) => connection,
        Err(error) if invalid_database_is_unknown => {
            let _ = error;
            return Ok(RecoverySnapshotSanitizeOutcome::InvalidOrUnknown);
        }
        Err(error) => {
            return Err(format!(
                "failed to open legacy database {} for credential sanitization: {error}",
                database_path.display()
            ));
        }
    };
    if let Err(error) = connection.busy_timeout(SQLITE_BUSY_TIMEOUT) {
        if invalid_database_is_unknown {
            return Ok(RecoverySnapshotSanitizeOutcome::InvalidOrUnknown);
        }
        return Err(format!(
            "failed to configure credential sanitization timeout for {}: {error}",
            database_path.display()
        ));
    }
    if let Err(error) = validate_database_connection(&connection, database_path) {
        if invalid_database_is_unknown {
            return Ok(RecoverySnapshotSanitizeOutcome::InvalidOrUnknown);
        }
        return Err(error);
    }

    let settings_columns = table_columns(&connection, "settings").map_err(|error| {
        format!(
            "failed to inspect settings schema in {}: {error}",
            database_path.display()
        )
    })?;
    let printer_columns = table_columns(&connection, "printers").map_err(|error| {
        format!(
            "failed to inspect printer schema in {}: {error}",
            database_path.display()
        )
    })?;
    let has_settings = settings_columns
        .as_ref()
        .is_some_and(|columns| columns.contains("key") && columns.contains("value"));
    let has_legacy_printer_token = printer_columns
        .as_ref()
        .is_some_and(|columns| columns.contains("access_token"));
    if !has_settings && !has_legacy_printer_token {
        return Ok(RecoverySnapshotSanitizeOutcome::InvalidOrUnknown);
    }
    if has_settings
        && connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM settings WHERE key = ?1 AND value = 'complete'
                 )",
                [CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| {
                format!(
                    "failed to inspect credential sanitization marker in {}: {error}",
                    database_path.display()
                )
            })?
    {
        return Ok(RecoverySnapshotSanitizeOutcome::Clean);
    }

    connection
        .execute_batch("PRAGMA secure_delete = ON; BEGIN IMMEDIATE;")
        .map_err(|error| {
            format!(
                "failed to begin credential sanitization for {}: {error}",
                database_path.display()
            )
        })?;
    let result = (|| -> Result<usize, String> {
        let mut changed = 0;
        if has_settings {
            let integrations = {
                let mut statement = connection
                    .prepare(
                        "SELECT key, value
                         FROM settings
                         WHERE key LIKE 'bambu_live_integration:%'",
                    )
                    .map_err(|error| error.to_string())?;
                let rows = statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(|error| error.to_string())?;
                rows.collect::<Result<Vec<_>, _>>()
                    .map_err(|error| error.to_string())?
            };

            for (key, payload) in integrations {
                match serde_json::from_str::<Value>(&payload) {
                    Ok(mut config) => {
                        let Some(object) = config.as_object_mut() else {
                            changed += connection
                                .execute("DELETE FROM settings WHERE key = ?1", [&key])
                                .map_err(|error| error.to_string())?;
                            continue;
                        };
                        let removed_secret = object.remove("access_code").is_some();
                        let removed_binding = object.remove("access_code_binding_id").is_some();
                        let removed_stale_bindings =
                            object.remove("access_code_stale_binding_ids").is_some();
                        // Pre-release revision fields are also scrubbed so local
                        // development snapshots cannot retain stale references.
                        let removed_revision = object.remove("access_code_revision").is_some();
                        let removed_stale_revisions =
                            object.remove("access_code_stale_revisions").is_some();
                        let was_configured = object
                            .get("access_code_configured")
                            .is_some_and(|value| value != &Value::Bool(false));
                        if removed_secret
                            || removed_revision
                            || removed_stale_revisions
                            || removed_binding
                            || removed_stale_bindings
                            || was_configured
                        {
                            object.insert("access_code_configured".to_string(), Value::Bool(false));
                            let sanitized = serde_json::to_string(&config)
                                .map_err(|error| error.to_string())?;
                            changed += connection
                                .execute(
                                    "UPDATE settings SET value = ?1 WHERE key = ?2",
                                    params![sanitized, key],
                                )
                                .map_err(|error| error.to_string())?;
                        }
                    }
                    Err(_) => {
                        // A malformed integration cannot be restored by the
                        // application, and its opaque payload may itself be an
                        // access code. Remove only that unusable setting while
                        // continuing to scrub every independent credential.
                        changed += connection
                            .execute("DELETE FROM settings WHERE key = ?1", [&key])
                            .map_err(|error| error.to_string())?;
                    }
                }
            }

            changed += connection
                .execute(
                    "DELETE FROM settings
                     WHERE key IN (
                        'library_sync_client_session_id',
                        'library_sync_client_device_token',
                        'library_sync_client_csrf_token'
                     )",
                    [],
                )
                .map_err(|error| error.to_string())?;
            // A marker from an interrupted/older sanitizer must not survive
            // until physical erasure has completed.
            changed += connection
                .execute(
                    "DELETE FROM settings WHERE key IN (?1, ?2)",
                    params![
                        CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY,
                        LEGACY_CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        if has_legacy_printer_token {
            changed += connection
                .execute(
                    "UPDATE printers
                     SET access_token = NULL
                     WHERE access_token IS NOT NULL",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(changed)
    })();

    match result {
        Ok(_) => {
            connection.execute_batch("COMMIT").map_err(|error| {
                format!(
                    "failed to commit credential sanitization for {}: {error}",
                    database_path.display()
                )
            })?;
        }
        Err(error) => {
            let _ = connection.execute_batch("ROLLBACK");
            return Err(format!(
                "failed to sanitize credentials in {}: {error}",
                database_path.display()
            ));
        }
    }

    // The completion marker is deliberately written only after VACUUM and all
    // disk sidecars have been removed successfully. A failed physical cleanup
    // therefore leaves the database marker-free and guarantees a retry.
    physical_cleanup(connection, database_path)?;
    if has_settings {
        mark_credential_sanitization_complete(database_path)?;
    }
    Ok(RecoverySnapshotSanitizeOutcome::Sanitized)
}

fn physically_erase_removed_credentials(
    connection: Connection,
    database_path: &Path,
) -> Result<(), String> {
    // VACUUM is required even when no live credential row remained: SQLite
    // freeblocks in a pre-migration database can still contain prior values.
    connection.execute_batch("VACUUM;").map_err(|error| {
        format!(
            "failed to compact sanitized database {}: {error}",
            database_path.display()
        )
    })?;
    validate_database_connection(&connection, database_path)?;
    drop(connection);
    remove_sqlite_sidecars(database_path)
}

fn mark_credential_sanitization_complete(database_path: &Path) -> Result<(), String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| {
        format!(
            "failed to reopen sanitized database {}: {error}",
            database_path.display()
        )
    })?;
    connection
        .busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO settings (key, value)
             VALUES (?1, 'complete')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY],
        )
        .map_err(|error| {
            format!(
                "failed to record credential sanitization completion for {}: {error}",
                database_path.display()
            )
        })?;
    validate_database_connection(&connection, database_path)?;
    Ok(())
}

fn table_columns(
    connection: &Connection,
    table_name: &str,
) -> Result<Option<BTreeSet<String>>, rusqlite::Error> {
    let table_exists = connection.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
         )",
        [table_name],
        |row| row.get::<_, bool>(0),
    )?;
    if !table_exists {
        return Ok(None);
    }

    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<BTreeSet<_>, _>>()?;
    Ok(Some(columns))
}

pub(crate) fn online_backup(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    if source_path == destination_path {
        return Err("SQLite backup source and destination must be different".to_string());
    }
    if let Some(parent) = destination_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create SQLite backup directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let destination_existed = destination_path.exists();
    let result = (|| -> Result<(), String> {
        let source = Connection::open_with_flags(source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| {
                format!(
                    "failed to open SQLite backup source {}: {error}",
                    source_path.display()
                )
            })?;
        source.busy_timeout(SQLITE_BUSY_TIMEOUT).map_err(|error| {
            format!(
                "failed to configure SQLite backup source timeout {}: {error}",
                source_path.display()
            )
        })?;
        validate_database_connection(&source, source_path)?;

        let mut destination = Connection::open(destination_path).map_err(|error| {
            format!(
                "failed to open SQLite backup destination {}: {error}",
                destination_path.display()
            )
        })?;
        destination
            .busy_timeout(SQLITE_BUSY_TIMEOUT)
            .map_err(|error| {
                format!(
                    "failed to configure SQLite backup destination timeout {}: {error}",
                    destination_path.display()
                )
            })?;
        if !destination_existed {
            let journal_mode = destination
                .query_row("PRAGMA journal_mode = MEMORY", [], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|error| {
                    format!(
                        "failed to configure temporary SQLite backup journal for {}: {error}",
                        destination_path.display()
                    )
                })?;
            if !journal_mode.eq_ignore_ascii_case("memory") {
                return Err(format!(
                    "SQLite backup destination {} retained unsupported temporary journal mode {journal_mode}",
                    destination_path.display()
                ));
            }
        }

        {
            let backup = Backup::new(&source, &mut destination).map_err(|error| {
                format!(
                    "failed to initialize SQLite backup from {} to {}: {error}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
            let deadline = Instant::now() + SQLITE_BUSY_TIMEOUT;
            loop {
                let step_result = backup.step(SQLITE_BACKUP_PAGES_PER_STEP).map_err(|error| {
                    format!(
                        "SQLite backup from {} to {} failed: {error}",
                        source_path.display(),
                        destination_path.display()
                    )
                })?;
                match step_result {
                    StepResult::Done => break,
                    StepResult::More => {}
                    StepResult::Busy | StepResult::Locked => {
                        if Instant::now() >= deadline {
                            return Err(format!(
                                "SQLite backup remained locked for {}",
                                source_path.display()
                            ));
                        }
                        std::thread::sleep(SQLITE_BACKUP_RETRY_DELAY);
                    }
                    _ => {
                        return Err("SQLite backup returned an unsupported state".to_string());
                    }
                }
            }
        }

        if !destination_existed {
            // Online Backup copies the source header and can therefore restore
            // WAL mode. MEMORY rewrites it to rollback mode without creating a
            // `-journal` path; after this connection closes, a reopen reports
            // DELETE. This keeps long Windows snapshot paths self-contained.
            let journal_mode = destination
                .query_row("PRAGMA journal_mode = MEMORY", [], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|error| {
                    format!(
                        "failed to make SQLite backup destination {} self-contained: {error}",
                        destination_path.display()
                    )
                })?;
            if !journal_mode.eq_ignore_ascii_case("memory") {
                return Err(format!(
                    "SQLite backup destination {} retained unsupported journal mode {journal_mode}",
                    destination_path.display()
                ));
            }
        }

        validate_database_connection(&destination, destination_path)
    })();

    let result = result
        .and_then(|()| secure_new_database_file(destination_path, destination_existed))
        .and_then(|()| {
            if destination_existed {
                Ok(())
            } else {
                remove_sqlite_sidecars(destination_path)
            }
        });
    // New targets are disposable until backup, validation and permissions all
    // succeed. Existing databases rely on SQLite's backup transaction rollback.
    if result.is_err() && !destination_existed {
        remove_sqlite_artifacts(destination_path);
    }
    result
}

fn validate_database_connection(connection: &Connection, path: &Path) -> Result<(), String> {
    let mut statement = connection.prepare("PRAGMA quick_check").map_err(|error| {
        format!(
            "failed to prepare SQLite quick_check for {}: {error}",
            path.display()
        )
    })?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| {
            format!(
                "failed to run SQLite quick_check for {}: {error}",
                path.display()
            )
        })?;
    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|error| {
            format!(
                "failed to read SQLite quick_check for {}: {error}",
                path.display()
            )
        })?);
    }
    if messages.len() == 1 && messages[0] == "ok" {
        return Ok(());
    }
    Err(format!(
        "SQLite quick_check failed for {}: {}",
        path.display(),
        messages.join("; ")
    ))
}

fn database_is_usable(path: &Path) -> bool {
    let Ok(connection) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return false;
    };
    if connection.busy_timeout(SQLITE_BUSY_TIMEOUT).is_err() {
        return false;
    }
    validate_database_connection(&connection, path).is_ok()
}

fn database_is_definitively_invalid(path: &Path) -> bool {
    let connection = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(connection) => connection,
        Err(error) => return sqlite_error_is_definitively_invalid(&error),
    };
    if connection.busy_timeout(SQLITE_BUSY_TIMEOUT).is_err() {
        return false;
    }
    let mut statement = match connection.prepare("PRAGMA quick_check") {
        Ok(statement) => statement,
        Err(error) => return sqlite_error_is_definitively_invalid(&error),
    };
    let rows = match statement.query_map([], |row| row.get::<_, String>(0)) {
        Ok(rows) => rows,
        Err(error) => return sqlite_error_is_definitively_invalid(&error),
    };
    let mut messages = Vec::new();
    for row in rows {
        match row {
            Ok(message) => messages.push(message),
            Err(error) => return sqlite_error_is_definitively_invalid(&error),
        }
    }
    !(messages.len() == 1 && messages[0] == "ok")
}

fn sqlite_error_is_definitively_invalid(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(failure, _)
            if matches!(
                failure.code,
                rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
            )
    )
}

fn recovery_snapshot_path(
    parent: &Path,
    base_file_name: &str,
    reason: RecoveryReason,
    state: RecoveryState,
    id: &str,
) -> PathBuf {
    parent.join(format!(
        "{base_file_name}.recovery-{}-{}-{id}.sqlite",
        reason.slug(),
        state.slug()
    ))
}

fn prune_successful_snapshots(
    parent: &Path,
    base_file_name: &str,
    reason: RecoveryReason,
    protected_path: &Path,
) {
    // Failed and pending names never enter this candidate set. Unusable files
    // are also kept: inability to validate can be transient, and retention must
    // never delete the latest point that can still be proven usable.
    let prefix = format!("{base_file_name}.recovery-{}-successful-", reason.slug());
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    let mut candidates = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .filter_map(|entry| {
            let file_name = entry.file_name();
            let file_name = file_name.to_str()?;
            (file_name.starts_with(&prefix) && file_name.ends_with(".sqlite"))
                .then(|| (file_name.to_string(), entry.path()))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.0.cmp(&left.0));

    let mut usable_kept = usize::from(database_is_usable(protected_path));
    for (_, candidate_path) in candidates {
        if candidate_path == protected_path {
            continue;
        }
        if !database_is_usable(&candidate_path) {
            continue;
        }
        if usable_kept < MAX_SUCCESSFUL_RECOVERY_SNAPSHOTS_PER_REASON {
            usable_kept += 1;
            continue;
        }
        remove_sqlite_artifacts(&candidate_path);
    }
}

fn prune_incomplete_snapshots(
    parent: &Path,
    base_file_name: &str,
    reason: RecoveryReason,
    state: RecoveryState,
    protected_path: &Path,
) {
    // Pending and failed files are bounded independently. The snapshot created
    // or transitioned by the current operation is always retained; remaining
    // slots prefer the newest snapshots that still pass SQLite quick_check.
    // This keeps useful recovery points while preventing abandoned operation
    // states from growing without limit.
    let prefix = format!(
        "{base_file_name}.recovery-{}-{}-",
        reason.slug(),
        state.slug()
    );
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    let mut candidates = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .filter_map(|entry| {
            let file_name = entry.file_name();
            let file_name = file_name.to_str()?;
            (file_name.starts_with(&prefix) && file_name.ends_with(".sqlite"))
                .then(|| (file_name.to_string(), entry.path()))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.0.cmp(&left.0));

    let mut retained = Vec::with_capacity(MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON);
    if protected_path.exists() {
        retained.push(protected_path.to_path_buf());
    }

    for (_, candidate_path) in &candidates {
        if retained.len() >= MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON {
            break;
        }
        if candidate_path != protected_path && database_is_usable(candidate_path) {
            retained.push(candidate_path.clone());
        }
    }
    for (_, candidate_path) in &candidates {
        if retained.len() >= MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON {
            break;
        }
        if !retained.contains(candidate_path) {
            retained.push(candidate_path.clone());
        }
    }

    for (_, candidate_path) in candidates {
        if !retained.contains(&candidate_path) {
            remove_sqlite_artifacts(&candidate_path);
        }
    }
}

fn portable_file_name_component(path: &Path) -> String {
    let raw = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("filament-manager.db");
    let mut result = String::with_capacity(raw.len());
    let mut previous_was_separator = false;
    for character in raw.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            result.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            result.push('-');
            previous_was_separator = true;
        }
    }
    let normalized = result.trim_matches(['.', '-', '_']);
    if normalized.is_empty() {
        "filament-manager.db".to_string()
    } else {
        normalized.to_string()
    }
}

fn unique_snapshot_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let sequence = SNAPSHOT_SEQUENCE.fetch_add(1, Ordering::Relaxed) as u32;
    let value = ((nanos as u128) << 64) | ((std::process::id() as u128) << 32) | sequence as u128;
    fixed_base36(value)
}

fn fixed_base36(mut value: u128) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut encoded = [b'0'; SNAPSHOT_ID_LENGTH];
    for position in (0..SNAPSHOT_ID_LENGTH).rev() {
        encoded[position] = DIGITS[(value % 36) as usize];
        value /= 36;
    }
    String::from_utf8(encoded.to_vec()).expect("base36 snapshot IDs are valid UTF-8")
}

fn remove_sqlite_artifacts(path: &Path) {
    for artifact_path in sqlite_artifact_paths(path) {
        match std::fs::remove_file(&artifact_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {}
        }
    }
}

fn remove_sqlite_artifacts_checked(path: &Path) -> Result<(), String> {
    // Keep the main app-owned pending file until every sidecar is gone. If one
    // deletion fails, the recognizable main path remains for a later retry.
    let mut first_error = None;
    for sidecar_path in sqlite_sidecar_paths(path) {
        match std::fs::remove_file(&sidecar_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) if first_error.is_none() => {
                first_error = Some(format!(
                    "failed to remove invalid pending SQLite sidecar {}: {error}",
                    sidecar_path.display()
                ));
            }
            Err(_) => {}
        }
    }
    if let Some(error) = first_error {
        return Err(error);
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "failed to remove invalid pending SQLite snapshot {}: {error}",
            path.display()
        )),
    }
}

fn sqlite_artifact_paths(path: &Path) -> [PathBuf; 4] {
    let [wal_path, shm_path, journal_path] = sqlite_sidecar_paths(path);
    [path.to_path_buf(), wal_path, shm_path, journal_path]
}

fn sqlite_sidecar_paths(path: &Path) -> [PathBuf; 3] {
    let mut wal_path = OsString::from(path.as_os_str());
    wal_path.push("-wal");
    let mut shm_path = OsString::from(path.as_os_str());
    shm_path.push("-shm");
    let mut journal_path = OsString::from(path.as_os_str());
    journal_path.push("-journal");
    [
        PathBuf::from(wal_path),
        PathBuf::from(shm_path),
        PathBuf::from(journal_path),
    ]
}

fn remove_sqlite_sidecars(path: &Path) -> Result<(), String> {
    for sidecar_path in sqlite_sidecar_paths(path) {
        match std::fs::remove_file(&sidecar_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "failed to remove SQLite backup sidecar {}: {error}",
                    sidecar_path.display()
                ));
            }
        }
    }
    Ok(())
}

fn secure_new_database_file(path: &Path, destination_existed: bool) -> Result<(), String> {
    if destination_existed {
        return Ok(());
    }

    #[cfg(not(unix))]
    let _ = path;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(
            |error| {
                format!(
                    "failed to secure SQLite backup permissions for {}: {error}",
                    path.display()
                )
            },
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(test_name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "filament-manager-sqlite-recovery-{test_name}-{}",
            unique_snapshot_id()
        ))
    }

    fn write_probe_database(path: &Path, value: &str) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS recovery_probe (value TEXT NOT NULL);\
                 DELETE FROM recovery_probe;",
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute("INSERT INTO recovery_probe (value) VALUES (?1)", [value])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn read_probe_value(path: &Path) -> Result<String, String> {
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .query_row("SELECT value FROM recovery_probe", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }

    fn write_legacy_credential_database(path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                 );
                 CREATE TABLE printers (
                    id TEXT PRIMARY KEY,
                    access_token TEXT
                 );
                 INSERT INTO settings (key, value) VALUES
                    (
                        'bambu_live_integration:printer_1',
                        '{\"enabled\":true,\"access_code\":\"snapshot-bambu-secret\",\"access_code_configured\":true,\"access_code_binding_id\":\"77777777777777777777777777777777\",\"access_code_stale_binding_ids\":[\"11111111111111111111111111111111\",\"66666666666666666666666666666666\"]}'
                    ),
                    ('library_sync_client_session_id', 'snapshot-session-secret'),
                    ('library_sync_client_device_token', 'snapshot-device-secret'),
                    ('library_sync_client_csrf_token', 'snapshot-csrf-secret'),
                    ('trusted_lan_host_token_hash', 'hash-must-remain');
                 INSERT INTO printers (id, access_token)
                 VALUES ('printer_1', 'snapshot-legacy-printer-secret');",
            )
            .map_err(|error| error.to_string())
    }

    fn snapshot_count(parent: &Path, fragment: &str) -> usize {
        std::fs::read_dir(parent)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
            .filter(|entry| {
                let file_name = entry.file_name();
                let file_name = file_name.to_string_lossy();
                file_name.contains(fragment) && file_name.ends_with(".sqlite")
            })
            .count()
    }

    #[test]
    fn recovery_snapshot_uses_online_backup_for_committed_wal_data() {
        let base = temp_dir("wal");
        let source_path = base.join("filament manager æøå.db");
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
            let source = Connection::open(&source_path).map_err(|error| error.to_string())?;
            source
                .execute_batch(
                    "PRAGMA journal_mode = WAL;\
                     PRAGMA wal_autocheckpoint = 0;\
                     CREATE TABLE recovery_probe (value TEXT NOT NULL);\
                     PRAGMA wal_checkpoint(TRUNCATE);\
                     INSERT INTO recovery_probe (value) VALUES ('committed in wal');",
                )
                .map_err(|error| error.to_string())?;

            let snapshot = RecoverySnapshot::create(&source_path, RecoveryReason::FullRestore)?;
            let snapshot_path = snapshot.mark_operation_succeeded();
            assert_eq!(read_probe_value(&snapshot_path)?, "committed in wal");
            let snapshot_journal_mode = Connection::open(&snapshot_path)
                .map_err(|error| error.to_string())?
                .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(snapshot_journal_mode, "delete");
            for sidecar_path in sqlite_sidecar_paths(&snapshot_path) {
                assert!(
                    !sidecar_path.exists(),
                    "self-contained snapshot retained {}",
                    sidecar_path.display()
                );
            }
            assert!(snapshot_path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| {
                    value.chars().all(|character| {
                        character.is_ascii_alphanumeric() || ".-_".contains(character)
                    })
                }));

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = std::fs::metadata(&snapshot_path)
                    .map_err(|error| error.to_string())?
                    .permissions()
                    .mode()
                    & 0o777;
                assert_eq!(mode, 0o600);
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn app_snapshots_are_sanitized_without_touching_token_hashes() {
        let base = temp_dir("credential-sanitize");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_legacy_credential_database(&source_path)?;
            let successful = RecoverySnapshot::create(&source_path, RecoveryReason::FullRestore)?
                .mark_operation_succeeded();
            let failed = RecoverySnapshot::create(&source_path, RecoveryReason::SchemaUpgrade)?
                .mark_operation_failed();
            let rollback_journal = sqlite_sidecar_paths(&successful)[2].clone();
            std::fs::write(&rollback_journal, b"snapshot-bambu-secret")
                .map_err(|error| error.to_string())?;

            let stats = sanitize_app_recovery_snapshot_credentials(&source_path)?;
            assert_eq!(
                stats,
                RecoveryCredentialSanitizeStats {
                    snapshots_checked: 2,
                    snapshots_sanitized: 2,
                    invalid_pending_snapshots_removed: 0,
                    invalid_or_unknown_snapshots_skipped: 0,
                    snapshot_sanitization_failures: 0,
                }
            );

            for snapshot_path in [&successful, &failed] {
                let connection =
                    Connection::open(snapshot_path).map_err(|error| error.to_string())?;
                let payload: String = connection
                    .query_row(
                        "SELECT value FROM settings
                         WHERE key = 'bambu_live_integration:printer_1'",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                let payload: Value =
                    serde_json::from_str(&payload).map_err(|error| error.to_string())?;
                assert!(payload["access_code"].is_null());
                assert_eq!(payload["access_code_configured"], false);
                assert!(payload["access_code_binding_id"].is_null());
                assert!(payload["access_code_stale_binding_ids"].is_null());

                let removed_library_secrets: i64 = connection
                    .query_row(
                        "SELECT COUNT(*) FROM settings
                         WHERE key IN (
                            'library_sync_client_session_id',
                            'library_sync_client_device_token',
                            'library_sync_client_csrf_token'
                         )",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                assert_eq!(removed_library_secrets, 0);
                let retained_hash: String = connection
                    .query_row(
                        "SELECT value FROM settings
                         WHERE key = 'trusted_lan_host_token_hash'",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                assert_eq!(retained_hash, "hash-must-remain");
                let legacy_printer_token: Option<String> = connection
                    .query_row(
                        "SELECT access_token FROM printers WHERE id = 'printer_1'",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                assert!(legacy_printer_token.is_none());
                drop(connection);

                for artifact_path in sqlite_artifact_paths(snapshot_path) {
                    if !artifact_path.exists() {
                        continue;
                    }
                    let raw = std::fs::read(&artifact_path).map_err(|error| error.to_string())?;
                    for (credential_kind, marker) in [
                        ("Bambu access code", "snapshot-bambu-secret"),
                        ("library session identifier", "snapshot-session-secret"),
                        ("library device token", "snapshot-device-secret"),
                        ("library CSRF token", "snapshot-csrf-secret"),
                        (
                            "legacy printer access token",
                            "snapshot-legacy-printer-secret",
                        ),
                    ] {
                        assert!(
                            !raw.windows(marker.len())
                                .any(|window| window == marker.as_bytes()),
                            "recovery snapshot retained {credential_kind} in SQLite artifact {}",
                            artifact_path.display()
                        );
                    }
                }
                for sidecar_path in sqlite_sidecar_paths(snapshot_path) {
                    assert!(
                        !sidecar_path.exists(),
                        "sanitized snapshot retained {}",
                        sidecar_path.display()
                    );
                }
            }
            assert!(
                !rollback_journal.exists(),
                "sanitization retained rollback journal {}",
                rollback_journal.display()
            );
            assert_eq!(
                sanitize_app_recovery_snapshot_credentials(&source_path)?,
                RecoveryCredentialSanitizeStats {
                    snapshots_checked: 2,
                    snapshots_sanitized: 0,
                    invalid_pending_snapshots_removed: 0,
                    invalid_or_unknown_snapshots_skipped: 0,
                    snapshot_sanitization_failures: 0,
                }
            );
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn snapshot_sanitizer_removes_secure_store_references_without_plaintext() {
        let base = temp_dir("credential-reference-sanitize");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_legacy_credential_database(&source_path)?;
            Connection::open(&source_path)
                .map_err(|error| error.to_string())?
                .execute(
                    "UPDATE settings SET value = ?1
                     WHERE key = 'bambu_live_integration:printer_1'",
                    ["{\"enabled\":true,\"access_code_configured\":true,\
                         \"access_code_binding_id\":\"99999999999999999999999999999999\",\
                         \"access_code_stale_binding_ids\":[\
                           \"33333333333333333333333333333333\",\
                           \"88888888888888888888888888888888\"]}"],
                )
                .map_err(|error| error.to_string())?;
            let snapshot = RecoverySnapshot::create(&source_path, RecoveryReason::FullRestore)?
                .mark_operation_succeeded();

            let stats = sanitize_app_recovery_snapshot_credentials(&source_path)?;
            assert_eq!(stats.snapshots_sanitized, 1);
            let payload: String = Connection::open(&snapshot)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT value FROM settings
                     WHERE key = 'bambu_live_integration:printer_1'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let payload: Value =
                serde_json::from_str(&payload).map_err(|error| error.to_string())?;
            assert_eq!(payload["access_code_configured"], false);
            assert!(payload["access_code_binding_id"].is_null());
            assert!(payload["access_code_stale_binding_ids"].is_null());
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn malformed_bambu_setting_does_not_block_independent_secret_scrubbing() {
        let base = temp_dir("credential-sanitize-malformed-bambu");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "source")?;
            let malformed_path = base.join(format!(
                "filament-manager.db.recovery-full-restore-failed-{}.sqlite",
                "4".repeat(SNAPSHOT_ID_LENGTH)
            ));
            write_legacy_credential_database(&malformed_path)?;
            Connection::open(&malformed_path)
                .map_err(|error| error.to_string())?
                .execute(
                    "UPDATE settings SET value = ?1
                     WHERE key = 'bambu_live_integration:printer_1'",
                    ["malformed-json-with-snapshot-secret"],
                )
                .map_err(|error| error.to_string())?;

            let later_path = base.join(format!(
                "filament-manager.db.recovery-full-restore-successful-{}.sqlite",
                "5".repeat(SNAPSHOT_ID_LENGTH)
            ));
            write_legacy_credential_database(&later_path)?;

            assert_eq!(
                sanitize_app_recovery_snapshot_credentials(&source_path)?,
                RecoveryCredentialSanitizeStats {
                    snapshots_checked: 2,
                    snapshots_sanitized: 2,
                    invalid_pending_snapshots_removed: 0,
                    invalid_or_unknown_snapshots_skipped: 0,
                    snapshot_sanitization_failures: 0,
                }
            );

            let later_payload: String = Connection::open(&later_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT value FROM settings
                     WHERE key = 'bambu_live_integration:printer_1'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let later_payload: Value =
                serde_json::from_str(&later_payload).map_err(|error| error.to_string())?;
            assert!(later_payload["access_code"].is_null());
            assert_eq!(later_payload["access_code_configured"], false);

            let malformed = Connection::open(&malformed_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT COUNT(*) FROM settings
                     WHERE key = 'bambu_live_integration:printer_1'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(malformed, 0);
            let remaining_independent_secrets: i64 = Connection::open(&malformed_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT COUNT(*) FROM settings
                     WHERE key IN (
                        'library_sync_client_session_id',
                        'library_sync_client_device_token',
                        'library_sync_client_csrf_token'
                     )",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(remaining_independent_secrets, 0);
            for artifact_path in sqlite_artifact_paths(&malformed_path) {
                if !artifact_path.exists() {
                    continue;
                }
                let raw = std::fs::read(&artifact_path).map_err(|error| error.to_string())?;
                assert!(
                    !raw.windows("malformed-json-with-snapshot-secret".len())
                        .any(|window| window == b"malformed-json-with-snapshot-secret"),
                    "malformed credential payload remained in {}",
                    artifact_path.display()
                );
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn physical_cleanup_failure_leaves_no_completion_marker_and_retries() {
        let base = temp_dir("credential-sanitize-physical-retry");
        let snapshot_path = base.join(format!(
            "filament-manager.db.recovery-full-restore-successful-{}.sqlite",
            "6".repeat(SNAPSHOT_ID_LENGTH)
        ));
        let result = (|| -> Result<(), String> {
            write_legacy_credential_database(&snapshot_path)?;
            let journal_path = sqlite_sidecar_paths(&snapshot_path)[2].clone();
            let error = sanitize_database_credentials(&snapshot_path, true, |connection, _| {
                connection
                    .execute_batch("VACUUM")
                    .map_err(|error| error.to_string())?;
                drop(connection);
                std::fs::write(&journal_path, b"snapshot-bambu-secret")
                    .map_err(|error| error.to_string())?;
                Err("injected physical cleanup failure".to_string())
            })
            .unwrap_err();
            assert!(error.contains("injected physical cleanup failure"));
            assert!(journal_path.exists());

            let marker_count: i64 = Connection::open(&snapshot_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT COUNT(*) FROM settings WHERE key = ?1",
                    [CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(marker_count, 0);

            assert_eq!(
                sanitize_recovery_snapshot_credentials(&snapshot_path)?,
                RecoverySnapshotSanitizeOutcome::Sanitized
            );
            let marker: String = Connection::open(&snapshot_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    [CREDENTIAL_SNAPSHOT_SANITIZE_MARKER_KEY],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(marker, "complete");
            for artifact_path in sqlite_artifact_paths(&snapshot_path) {
                if !artifact_path.exists() {
                    continue;
                }
                let raw = std::fs::read(&artifact_path).map_err(|error| error.to_string())?;
                assert!(
                    !raw.windows("snapshot-bambu-secret".len())
                        .any(|window| window == b"snapshot-bambu-secret"),
                    "credential remained in {} after retry",
                    artifact_path.display()
                );
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn snapshot_sanitizer_cleans_pending_and_skips_invalid_and_unknown_files() {
        let base = temp_dir("credential-sanitize-scope");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_legacy_credential_database(&source_path)?;
            let pending = RecoverySnapshot::create(&source_path, RecoveryReason::FullRestore)?;
            let pending_path = pending.path().to_path_buf();
            drop(pending);

            let invalid_path = base.join(format!(
                "filament-manager.db.recovery-full-restore-successful-{}.sqlite",
                "0".repeat(SNAPSHOT_ID_LENGTH)
            ));
            std::fs::write(&invalid_path, b"not sqlite").map_err(|error| error.to_string())?;
            let invalid_pending_path = base.join(format!(
                "filament-manager.db.recovery-schema-upgrade-pending-{}.sqlite",
                "3".repeat(SNAPSHOT_ID_LENGTH)
            ));
            std::fs::write(
                &invalid_pending_path,
                b"partial SQLite pages with snapshot-plaintext-secret",
            )
            .map_err(|error| error.to_string())?;
            for sidecar_path in sqlite_sidecar_paths(&invalid_pending_path) {
                std::fs::write(&sidecar_path, b"snapshot-plaintext-secret")
                    .map_err(|error| error.to_string())?;
            }
            let unknown_path = base.join(format!(
                "filament-manager.db.recovery-schema-upgrade-failed-{}.sqlite",
                "1".repeat(SNAPSHOT_ID_LENGTH)
            ));
            write_probe_database(&unknown_path, "not an app schema")?;
            std::fs::write(
                base.join(format!(
                    "other.db.recovery-full-restore-successful-{}.sqlite",
                    "2".repeat(SNAPSHOT_ID_LENGTH)
                )),
                b"foreign file",
            )
            .map_err(|error| error.to_string())?;

            let stats = sanitize_app_recovery_snapshot_credentials(&source_path)?;
            assert_eq!(
                stats,
                RecoveryCredentialSanitizeStats {
                    snapshots_checked: 4,
                    snapshots_sanitized: 1,
                    invalid_pending_snapshots_removed: 1,
                    invalid_or_unknown_snapshots_skipped: 2,
                    snapshot_sanitization_failures: 0,
                }
            );
            for artifact_path in sqlite_artifact_paths(&invalid_pending_path) {
                assert!(
                    !artifact_path.exists(),
                    "invalid app-owned pending artifact was retained: {}",
                    artifact_path.display()
                );
            }
            assert!(
                invalid_path.exists(),
                "completed invalid snapshot must be handled conservatively"
            );
            assert!(
                unknown_path.exists(),
                "valid snapshot with an unknown schema must be retained"
            );
            let pending_payload: String = Connection::open(&pending_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT value FROM settings
                     WHERE key = 'bambu_live_integration:printer_1'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let pending_payload: Value =
                serde_json::from_str(&pending_payload).map_err(|error| error.to_string())?;
            assert!(pending_payload["access_code"].is_null());
            assert_eq!(pending_payload["access_code_configured"], false);
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn snapshot_sanitizer_never_follows_terminal_name_symlinks() {
        use std::os::unix::fs::symlink;

        let base = temp_dir("credential-sanitize-symlink");
        let source_path = base.join("filament-manager.db");
        let outside_path = base.join("outside.sqlite");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "source")?;
            write_legacy_credential_database(&outside_path)?;
            let link_path = base.join(format!(
                "filament-manager.db.recovery-full-restore-successful-{}.sqlite",
                "3".repeat(SNAPSHOT_ID_LENGTH)
            ));
            symlink(&outside_path, &link_path).map_err(|error| error.to_string())?;

            assert_eq!(
                sanitize_app_recovery_snapshot_credentials(&source_path)?,
                RecoveryCredentialSanitizeStats::default()
            );
            let payload: String = Connection::open(&outside_path)
                .map_err(|error| error.to_string())?
                .query_row(
                    "SELECT value FROM settings
                     WHERE key = 'bambu_live_integration:printer_1'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert!(payload.contains("snapshot-bambu-secret"));
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn snapshot_ids_are_compact_portable_and_ordered() {
        let first = fixed_base36(
            ((1_783_729_194_916_541_000_u64 as u128) << 64) | ((4_294_967_295_u128) << 32) | 41,
        );
        let second = fixed_base36(
            ((1_783_729_194_916_541_000_u64 as u128) << 64) | ((4_294_967_295_u128) << 32) | 42,
        );

        assert_eq!(first.len(), SNAPSHOT_ID_LENGTH);
        assert!(first
            .bytes()
            .all(|value| value.is_ascii_digit() || value.is_ascii_lowercase()));
        assert!(first < second);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn new_backup_avoids_disk_journal_at_the_windows_path_limit() {
        use std::os::windows::ffi::OsStrExt;

        let base = temp_dir("windows-path-limit");
        let source_path = base.join("source.db");
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
            let source = Connection::open(&source_path).map_err(|error| error.to_string())?;
            source
                .execute_batch(
                    "PRAGMA journal_mode = WAL;\
                     CREATE TABLE recovery_probe (value TEXT NOT NULL);\
                     INSERT INTO recovery_probe (value) VALUES ('long path');",
                )
                .map_err(|error| error.to_string())?;

            const DESTINATION_PATH_LENGTH: usize = 252;
            const EXTENSION: &str = ".sqlite";
            let base_length = base.as_os_str().encode_wide().count();
            let stem_length = DESTINATION_PATH_LENGTH
                .checked_sub(base_length + 1 + EXTENSION.len())
                .ok_or_else(|| "Windows temporary path is too long for the test".to_string())?;
            let destination_path = base.join(format!("{}{EXTENSION}", "s".repeat(stem_length)));
            assert_eq!(
                destination_path.as_os_str().encode_wide().count(),
                DESTINATION_PATH_LENGTH
            );

            online_backup(&source_path, &destination_path)?;
            assert_eq!(read_probe_value(&destination_path)?, "long path");
            let destination_journal_mode = Connection::open(&destination_path)
                .map_err(|error| error.to_string())?
                .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(destination_journal_mode, "delete");
            for sidecar_path in sqlite_sidecar_paths(&destination_path) {
                assert!(
                    !sidecar_path.exists(),
                    "long-path backup retained {}",
                    sidecar_path.display()
                );
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn incomplete_new_backup_target_is_removed() {
        let base = temp_dir("incomplete-target");
        let source_path = base.join("invalid.db");
        let destination_path = base.join("snapshot.sqlite");
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
            std::fs::write(&source_path, b"not a sqlite database")
                .map_err(|error| error.to_string())?;

            let error = online_backup(&source_path, &destination_path).unwrap_err();
            assert!(error.contains("quick_check") || error.contains("database disk image"));
            assert!(!destination_path.exists());
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn successful_retention_does_not_remove_current_failed_and_pending_snapshots() {
        let base = temp_dir("retention");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "initial")?;

            let failed_path =
                RecoverySnapshot::create(&source_path, RecoveryReason::WindowsStorageMerge)?
                    .mark_operation_failed();
            let pending =
                RecoverySnapshot::create(&source_path, RecoveryReason::WindowsStorageMerge)?;
            let pending_path = pending.path().to_path_buf();
            drop(pending);

            let mut latest_successful = None;
            for index in 0..(MAX_SUCCESSFUL_RECOVERY_SNAPSHOTS_PER_REASON + 4) {
                write_probe_database(&source_path, &format!("value-{index}"))?;
                latest_successful = Some(
                    RecoverySnapshot::create(&source_path, RecoveryReason::WindowsStorageMerge)?
                        .mark_operation_succeeded(),
                );
            }

            assert!(failed_path.exists());
            assert!(pending_path.exists());
            let latest_successful = latest_successful.expect("at least one successful snapshot");
            assert!(latest_successful.exists());
            assert_eq!(
                snapshot_count(&base, "recovery-windows-storage-merge-successful-"),
                MAX_SUCCESSFUL_RECOVERY_SNAPSHOTS_PER_REASON
            );
            assert_eq!(
                snapshot_count(&base, "recovery-windows-storage-merge-failed-"),
                1
            );
            assert_eq!(
                snapshot_count(&base, "recovery-windows-storage-merge-pending-"),
                1
            );
            assert_eq!(
                read_probe_value(&latest_successful)?,
                format!("value-{}", MAX_SUCCESSFUL_RECOVERY_SNAPSHOTS_PER_REASON + 3)
            );
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn retention_bounds_failed_snapshots_and_keeps_the_newest_usable_points() {
        let base = temp_dir("failed-retention");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "initial")?;
            let mut snapshots = Vec::new();

            for index in 0..(MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON + 3) {
                let value = format!("failed-{index}");
                write_probe_database(&source_path, &value)?;
                let path =
                    RecoverySnapshot::create(&source_path, RecoveryReason::WindowsStorageMerge)?
                        .mark_operation_failed();
                snapshots.push((path, value));
            }

            assert_eq!(
                snapshot_count(&base, "recovery-windows-storage-merge-failed-"),
                MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON
            );
            let retained_from =
                snapshots.len() - MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON;
            for (path, _) in &snapshots[..retained_from] {
                assert!(!path.exists(), "superseded failed snapshot was retained");
            }
            for (path, value) in &snapshots[retained_from..] {
                assert!(path.exists(), "new failed snapshot was pruned");
                assert_eq!(read_probe_value(path)?, *value);
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn retention_bounds_pending_snapshots_and_keeps_the_newest_usable_points() {
        let base = temp_dir("pending-retention");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "initial")?;
            let mut snapshots = Vec::new();

            for index in 0..(MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON + 3) {
                let value = format!("pending-{index}");
                write_probe_database(&source_path, &value)?;
                let snapshot =
                    RecoverySnapshot::create(&source_path, RecoveryReason::WindowsStorageMerge)?;
                snapshots.push((snapshot.path().to_path_buf(), value));
                drop(snapshot);
            }

            assert_eq!(
                snapshot_count(&base, "recovery-windows-storage-merge-pending-"),
                MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON
            );
            let retained_from =
                snapshots.len() - MAX_INCOMPLETE_RECOVERY_SNAPSHOTS_PER_STATE_PER_REASON;
            for (path, _) in &snapshots[..retained_from] {
                assert!(!path.exists(), "superseded pending snapshot was retained");
            }
            for (path, value) in &snapshots[retained_from..] {
                assert!(path.exists(), "new pending snapshot was pruned");
                assert_eq!(read_probe_value(path)?, *value);
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn working_copy_is_reason_named_and_removed_on_drop() {
        let base = temp_dir("working-copy");
        let source_path = base.join("filament-manager.db");
        let result = (|| -> Result<(), String> {
            write_probe_database(&source_path, "working")?;
            let working_copy = SqliteWorkingCopy::create(
                &source_path,
                &base,
                RecoveryReason::LegacyBundleMigration,
            )?;
            let working_path = working_copy.path().to_path_buf();
            assert!(working_path.exists());
            assert!(working_path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.contains("legacy-bundle-migration-working")));
            for sidecar_path in sqlite_sidecar_paths(&working_path) {
                std::fs::write(&sidecar_path, b"stale sqlite sidecar")
                    .map_err(|error| error.to_string())?;
            }
            drop(working_copy);
            for artifact_path in sqlite_artifact_paths(&working_path) {
                assert!(
                    !artifact_path.exists(),
                    "working-copy cleanup retained {}",
                    artifact_path.display()
                );
            }
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
