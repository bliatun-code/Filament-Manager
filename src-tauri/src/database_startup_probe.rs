use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;

struct ProbeRequest {
    output_path: PathBuf,
    token: String,
    configured_database: PathBuf,
}

impl ProbeRequest {
    fn from_values(
        output: Option<OsString>,
        token: Option<OsString>,
        configured_database: Option<OsString>,
    ) -> io::Result<Option<Self>> {
        if output.is_none() && token.is_none() {
            return Ok(None);
        }

        let output = output.filter(|value| !value.is_empty()).ok_or_else(|| {
            invalid_input("Database startup probe requires FILAMENT_MANAGER_DATABASE_READY_FILE")
        })?;
        let token = token
            .and_then(|value| value.into_string().ok())
            .filter(|value| {
                value.len() == 64
                    && value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
            .ok_or_else(|| {
                invalid_input(
                    "Database startup probe token must be 64 lowercase hexadecimal characters",
                )
            })?;
        let configured_database = configured_database
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                invalid_input(
                    "Database startup probe requires an explicit FILAMENT_MANAGER_DB_PATH",
                )
            })?;

        Ok(Some(Self {
            output_path: output.into(),
            token,
            configured_database: configured_database.into(),
        }))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupAcknowledgment<'a> {
    token: &'a str,
    pid: u32,
    database_path: PathBuf,
}

fn invalid_input(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn write_acknowledgment(database_path: &Path, request: &ProbeRequest) -> io::Result<()> {
    let database_path = fs::canonicalize(database_path)?;
    if database_path != fs::canonicalize(&request.configured_database)? {
        return Err(invalid_input(
            "Database startup probe does not match FILAMENT_MANAGER_DB_PATH",
        ));
    }
    let acknowledgment = serde_json::to_vec(&StartupAcknowledgment {
        token: &request.token,
        pid: std::process::id(),
        database_path,
    })
    .map_err(io::Error::other)?;

    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut output = options.open(&request.output_path)?;
    output.write_all(&acknowledgment)?;
    output.flush()
}

// Called only after database initialization and desktop setup have succeeded.
// An explicit per-launch file works for Windows GUI builds without standard error.
pub fn emit_database_startup_probe(database_path: &Path) -> io::Result<()> {
    let request = ProbeRequest::from_values(
        std::env::var_os("FILAMENT_MANAGER_DATABASE_READY_FILE"),
        std::env::var_os("FILAMENT_MANAGER_DATABASE_READY_TOKEN"),
        std::env::var_os("FILAMENT_MANAGER_DB_PATH"),
    )?;
    if let Some(request) = request {
        write_acknowledgment(database_path, &request)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            static SEQUENCE: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "filament-database-startup-probe-{}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn request(&self) -> ProbeRequest {
            ProbeRequest::from_values(
                Some(self.0.join("ready.json").into_os_string()),
                Some(TOKEN.into()),
                Some(self.0.join("library.db").into_os_string()),
            )
            .unwrap()
            .unwrap()
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn absent_probe_options_leave_normal_startup_unchanged() {
        assert!(ProbeRequest::from_values(None, None, None)
            .unwrap()
            .is_none());
        assert!(
            ProbeRequest::from_values(None, None, Some("library.db".into()))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn configured_probe_requires_both_options_and_explicit_database() {
        for (output, token, database) in [
            (None, Some(TOKEN), Some("library.db")),
            (Some(""), Some(TOKEN), Some("library.db")),
            (Some("ready.json"), None, Some("library.db")),
            (Some("ready.json"), Some(TOKEN), None),
            (Some("ready.json"), Some(TOKEN), Some("")),
        ] {
            let error = ProbeRequest::from_values(
                output.map(OsString::from),
                token.map(OsString::from),
                database.map(OsString::from),
            )
            .err()
            .unwrap();
            assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        }
    }

    #[test]
    fn malformed_or_noncanonical_tokens_are_rejected() {
        for token in [
            "".to_string(),
            "a".repeat(63),
            "a".repeat(65),
            "A".repeat(64),
            "g".repeat(64),
        ] {
            assert!(ProbeRequest::from_values(
                Some("ready.json".into()),
                Some(token.into()),
                Some("library.db".into()),
            )
            .is_err());
        }
    }

    #[test]
    fn wrong_database_cannot_emit_acknowledgment() {
        let directory = TestDirectory::new();
        let request = directory.request();
        fs::write(&request.configured_database, []).unwrap();
        let other_database = directory.0.join("other.db");
        fs::write(&other_database, []).unwrap();
        let error = write_acknowledgment(&other_database, &request).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(!request.output_path.exists());
    }

    #[test]
    fn existing_acknowledgment_is_never_overwritten() {
        let directory = TestDirectory::new();
        let request = directory.request();
        fs::write(&request.configured_database, []).unwrap();
        fs::write(&request.output_path, "existing acknowledgment").unwrap();
        let error = write_acknowledgment(&request.configured_database, &request).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(
            fs::read_to_string(&request.output_path).unwrap(),
            "existing acknowledgment"
        );
    }

    #[test]
    fn acknowledgment_contains_canonical_database_process_and_token() {
        let directory = TestDirectory::new();
        let mut request = directory.request();
        fs::write(&request.configured_database, []).unwrap();
        let database = fs::canonicalize(&request.configured_database).unwrap();
        request.configured_database = directory.0.join(".").join("library.db");

        write_acknowledgment(&database, &request).unwrap();

        let actual: serde_json::Value =
            serde_json::from_slice(&fs::read(&request.output_path).unwrap()).unwrap();
        assert_eq!(
            actual,
            serde_json::json!({
                "token": TOKEN,
                "pid": std::process::id(),
                "databasePath": database,
            })
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&request.output_path)
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn missing_output_parent_is_not_created() {
        let directory = TestDirectory::new();
        let mut request = directory.request();
        fs::write(&request.configured_database, []).unwrap();
        request.output_path = directory.0.join("missing").join("ready.json");
        let error = write_acknowledgment(&request.configured_database, &request).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert!(!request.output_path.parent().unwrap().exists());
    }
}
