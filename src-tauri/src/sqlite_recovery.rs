use rusqlite::backup::{Backup, StepResult};
use rusqlite::{Connection, OpenFlags};
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
            destination
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|error| {
                    format!(
                        "failed to checkpoint SQLite backup destination {}: {error}",
                        destination_path.display()
                    )
                })?;
            let journal_mode = destination
                .query_row("PRAGMA journal_mode = DELETE", [], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|error| {
                    format!(
                        "failed to make SQLite backup destination {} self-contained: {error}",
                        destination_path.display()
                    )
                })?;
            if !journal_mode.eq_ignore_ascii_case("delete") {
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

fn sqlite_artifact_paths(path: &Path) -> [PathBuf; 3] {
    let [wal_path, shm_path] = sqlite_sidecar_paths(path);
    [path.to_path_buf(), wal_path, shm_path]
}

fn sqlite_sidecar_paths(path: &Path) -> [PathBuf; 2] {
    let mut wal_path = OsString::from(path.as_os_str());
    wal_path.push("-wal");
    let mut shm_path = OsString::from(path.as_os_str());
    shm_path.push("-shm");
    [PathBuf::from(wal_path), PathBuf::from(shm_path)]
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
            drop(working_copy);
            assert!(!working_path.exists());
            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
