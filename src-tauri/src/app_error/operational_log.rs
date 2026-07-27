use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

const LOG_FILE_NAME: &str = "operational-log.jsonl";
#[allow(dead_code)] // Activated from main when the startup integration seam is wired.
const DEFAULT_MAX_BYTES: u64 = 256 * 1024;
#[allow(dead_code)] // Activated from main when the startup integration seam is wired.
const DEFAULT_MAX_ARCHIVES: usize = 3;
const MAX_DIAGNOSTIC_ID_LENGTH: usize = 64;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperationalLogLevel {
    Info,
    Warning,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperationalLogContext {
    ApplicationStartup,
    DesktopCommandFailure,
    DocumentCommandFailure,
    CompanionApiFailure,
    DatabaseStartupFailure,
    DatabaseDiagnosticsFailure,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OperationalLogEntry {
    pub timestamp_ms: u64,
    pub level: OperationalLogLevel,
    pub context: OperationalLogContext,
    pub diagnostic_id: Option<String>,
}

pub(crate) struct OperationalLog {
    directory: PathBuf,
    max_bytes: u64,
    max_archives: usize,
    io_lock: Mutex<()>,
}

impl OperationalLog {
    fn initialize(directory: &Path, max_bytes: u64, max_archives: usize) -> io::Result<Self> {
        fs::create_dir_all(directory)?;
        restrict_directory_permissions(directory)?;
        let log = Self {
            directory: directory.to_path_buf(),
            max_bytes,
            max_archives,
            io_lock: Mutex::new(()),
        };
        log.open_current_file()?;
        Ok(log)
    }

    #[cfg(test)]
    fn with_limits(directory: &Path, max_bytes: u64, max_archives: usize) -> io::Result<Self> {
        Self::initialize(directory, max_bytes, max_archives)
    }

    fn record(
        &self,
        level: OperationalLogLevel,
        context: OperationalLogContext,
        diagnostic_id: Option<&str>,
    ) -> io::Result<()> {
        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| io::Error::other("operational log lock is unavailable"))?;
        let entry = OperationalLogEntry {
            timestamp_ms: current_timestamp_ms(),
            level,
            context,
            diagnostic_id: diagnostic_id.and_then(sanitize_diagnostic_id),
        };
        let mut encoded = serde_json::to_vec(&entry)
            .map_err(|_| io::Error::other("operational log serialization failed"))?;
        encoded.push(b'\n');

        let current_path = self.current_path();
        let current_size = fs::metadata(&current_path)
            .map(|value| value.len())
            .unwrap_or(0);
        if current_size > 0 && current_size.saturating_add(encoded.len() as u64) > self.max_bytes {
            self.rotate()?;
        }

        let mut file = self.open_current_file()?;
        file.write_all(&encoded)?;
        file.flush()?;
        Ok(())
    }

    fn read(&self) -> io::Result<Vec<OperationalLogEntry>> {
        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| io::Error::other("operational log lock is unavailable"))?;
        let mut entries = Vec::new();
        for archive_index in (1..=self.max_archives).rev() {
            self.read_file_entries(&self.archive_path(archive_index), &mut entries)?;
        }
        self.read_file_entries(&self.current_path(), &mut entries)?;
        Ok(entries)
    }

    fn read_file_entries(
        &self,
        path: &Path,
        entries: &mut Vec<OperationalLogEntry>,
    ) -> io::Result<()> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };
        let read_limit = self.max_bytes.saturating_add(4096);
        let reader = BufReader::new(file.take(read_limit));
        for line in reader.lines() {
            let Ok(line) = line else {
                continue;
            };
            let Ok(entry) = serde_json::from_str::<OperationalLogEntry>(&line) else {
                continue;
            };
            if entry
                .diagnostic_id
                .as_deref()
                .is_none_or(|value| sanitize_diagnostic_id(value).is_some())
            {
                entries.push(entry);
            }
        }
        Ok(())
    }

    fn rotate(&self) -> io::Result<()> {
        if self.max_archives == 0 {
            match fs::remove_file(self.current_path()) {
                Ok(()) => return Ok(()),
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
                Err(error) => return Err(error),
            }
        }

        let oldest = self.archive_path(self.max_archives);
        match fs::remove_file(oldest) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        for index in (1..self.max_archives).rev() {
            let source = self.archive_path(index);
            if source.exists() {
                fs::rename(source, self.archive_path(index + 1))?;
            }
        }
        let current = self.current_path();
        if current.exists() {
            fs::rename(current, self.archive_path(1))?;
        }
        Ok(())
    }

    fn open_current_file(&self) -> io::Result<File> {
        let path = self.current_path();
        let mut options = OpenOptions::new();
        options.create(true).append(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&path)?;
        restrict_file_permissions(&path)?;
        Ok(file)
    }

    fn current_path(&self) -> PathBuf {
        self.directory.join(LOG_FILE_NAME)
    }

    fn archive_path(&self, index: usize) -> PathBuf {
        self.directory
            .join(format!("operational-log.{index}.jsonl"))
    }
}

fn logger_slot() -> &'static RwLock<Option<OperationalLog>> {
    static LOGGER: OnceLock<RwLock<Option<OperationalLog>>> = OnceLock::new();
    LOGGER.get_or_init(|| RwLock::new(None))
}

#[allow(dead_code)] // Command registration and startup initialization are intentionally deferred.
pub(crate) fn initialize_operational_log(directory: &Path) -> io::Result<()> {
    let logger = OperationalLog::initialize(directory, DEFAULT_MAX_BYTES, DEFAULT_MAX_ARCHIVES)?;
    logger.record(
        OperationalLogLevel::Info,
        OperationalLogContext::ApplicationStartup,
        None,
    )?;
    let mut slot = logger_slot()
        .write()
        .map_err(|_| io::Error::other("operational log state is unavailable"))?;
    *slot = Some(logger);
    Ok(())
}

pub(crate) fn record_operational_event(
    level: OperationalLogLevel,
    context: OperationalLogContext,
    diagnostic_id: Option<&str>,
) -> io::Result<()> {
    let slot = logger_slot()
        .read()
        .map_err(|_| io::Error::other("operational log state is unavailable"))?;
    let Some(logger) = slot.as_ref() else {
        return Ok(());
    };
    logger.record(level, context, diagnostic_id)
}

pub(crate) fn read_operational_log_entries() -> io::Result<Vec<OperationalLogEntry>> {
    let slot = logger_slot()
        .read()
        .map_err(|_| io::Error::other("operational log state is unavailable"))?;
    let Some(logger) = slot.as_ref() else {
        return Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "operational log is not initialized",
        ));
    };
    logger.read()
}

pub(crate) fn operational_log_is_initialized() -> bool {
    logger_slot()
        .read()
        .map(|slot| slot.is_some())
        .unwrap_or(false)
}

#[tauri::command]
#[allow(dead_code)] // Ready for the next main.rs command-registration pass.
pub(crate) fn read_operational_log_entries_command() -> Result<Vec<OperationalLogEntry>, String> {
    read_operational_log_entries()
        .map_err(|_| super::coded_command_error("diagnostics.operational_log_read_failed"))
}

fn sanitize_diagnostic_id(value: &str) -> Option<String> {
    if value.len() > MAX_DIAGNOSTIC_ID_LENGTH {
        return None;
    }
    let remainder = value.strip_prefix("fm-")?;
    let mut components = remainder.split('-');
    let timestamp = components.next()?;
    let sequence = components.next()?;
    if components.next().is_some()
        || timestamp.is_empty()
        || sequence.is_empty()
        || !timestamp.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !sequence.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return None;
    }
    Some(value.to_ascii_lowercase())
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn restrict_directory_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn restrict_directory_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{OperationalLog, OperationalLogContext, OperationalLogLevel, LOG_FILE_NAME};
    use std::collections::HashSet;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_log_dir(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-{test_name}-{nanos}"))
    }

    #[test]
    fn persistent_log_contains_only_the_privacy_contract_fields() {
        const PRIVATE_PATH_FIXTURE: &str = concat!("/", "Users/Alice/secret.db");
        let directory = temp_log_dir("operational-log-privacy");
        let logger = OperationalLog::with_limits(&directory, 4096, 1).expect("initialize log");
        logger
            .record(
                OperationalLogLevel::Error,
                OperationalLogContext::DesktopCommandFailure,
                Some("fm-abc123-4"),
            )
            .expect("record safe event");
        logger
            .record(
                OperationalLogLevel::Error,
                OperationalLogContext::CompanionApiFailure,
                Some(&format!("fm-bad-{PRIVATE_PATH_FIXTURE}-192.168.1.4")),
            )
            .expect("record event with rejected diagnostic id");

        let raw = std::fs::read_to_string(directory.join(LOG_FILE_NAME)).expect("read log");
        assert!(!raw.contains(PRIVATE_PATH_FIXTURE));
        assert!(!raw.contains("192.168.1.4"));
        assert!(!raw.contains("secret.db"));

        let lines = raw.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        for line in lines {
            let object = serde_json::from_str::<serde_json::Value>(line)
                .expect("valid JSON")
                .as_object()
                .expect("log entry object")
                .keys()
                .cloned()
                .collect::<HashSet<_>>();
            assert_eq!(
                object,
                HashSet::from([
                    "timestamp_ms".to_string(),
                    "level".to_string(),
                    "context".to_string(),
                    "diagnostic_id".to_string(),
                ])
            );
        }
        assert_eq!(logger.read().expect("read entries")[1].diagnostic_id, None);

        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn persistent_log_rotation_is_bounded_and_readable() {
        let directory = temp_log_dir("operational-log-rotation");
        let logger = OperationalLog::with_limits(&directory, 180, 2).expect("initialize log");
        for sequence in 0..20 {
            logger
                .record(
                    OperationalLogLevel::Warning,
                    OperationalLogContext::DatabaseDiagnosticsFailure,
                    Some(&format!("fm-abc-{sequence:x}")),
                )
                .expect("record rotating event");
        }

        assert!(directory.join(LOG_FILE_NAME).is_file());
        assert!(directory.join("operational-log.1.jsonl").is_file());
        assert!(directory.join("operational-log.2.jsonl").is_file());
        assert!(!directory.join("operational-log.3.jsonl").exists());
        let entries = logger.read().expect("read rotated entries");
        assert!(!entries.is_empty());
        assert!(entries.len() < 20);
        assert_eq!(
            entries
                .last()
                .and_then(|entry| entry.diagnostic_id.as_deref()),
            Some("fm-abc-13")
        );

        let _ = std::fs::remove_dir_all(directory);
    }

    #[cfg(unix)]
    #[test]
    fn persistent_log_uses_private_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let directory = temp_log_dir("operational-log-permissions");
        let logger = OperationalLog::with_limits(&directory, 4096, 1).expect("initialize log");
        logger
            .record(
                OperationalLogLevel::Info,
                OperationalLogContext::ApplicationStartup,
                None,
            )
            .expect("record event");

        let file_mode = std::fs::metadata(directory.join(LOG_FILE_NAME))
            .expect("log metadata")
            .permissions()
            .mode()
            & 0o777;
        let directory_mode = std::fs::metadata(&directory)
            .expect("directory metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(file_mode, 0o600);
        assert_eq!(directory_mode, 0o700);

        let _ = std::fs::remove_dir_all(directory);
    }
}
