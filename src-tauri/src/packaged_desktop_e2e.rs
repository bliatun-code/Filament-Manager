use crate::app_storage::APP_DB_PATH_ENV_VAR;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs::{symlink_metadata, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const ENABLED_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E";
const PHASE_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_PHASE";
const RUN_ID_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_RUN_ID";
const WORK_DIRECTORY_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_DIR";
const MARKER_FILE_NAME: &str = ".filament-manager-packaged-desktop-e2e";
const MARKER_FORMAT: &str = "filament-manager-packaged-desktop-e2e-v1";
const RESULT_FORMAT: &str = "filament-manager-packaged-desktop-e2e-result-v1";
const DATABASE_FILE_NAME: &str = "qa.db";
const SPOOL_ID: &str = "packaged_e2e_spool";
const PRINTER_ID: &str = "packaged_e2e_printer";
const SLOT_ID: &str = "packaged_e2e_printer_ams_1_slot_1";
const INITIAL_WEIGHT_G: i64 = 1_000;
const UPDATED_WEIGHT_G: i64 = 875;
const RETURNED_WEIGHT_G: i64 = 760;

#[derive(Clone, Debug, Serialize)]
pub(crate) struct PackagedDesktopE2eConfiguration {
    phase: String,
    run_id: String,
    spool_id: String,
    printer_id: String,
    slot_id: String,
    initial_weight_g: i64,
    updated_weight_g: i64,
    returned_weight_g: i64,
}

#[derive(Clone, Debug)]
struct ResolvedConfiguration {
    public: PackagedDesktopE2eConfiguration,
    result_path: PathBuf,
}

#[derive(Clone, Debug, Default)]
struct RawConfiguration {
    enabled: Option<String>,
    phase: Option<String>,
    run_id: Option<String>,
    work_directory: Option<String>,
    database_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct PackagedDesktopE2eCompletion {
    phase: String,
    run_id: String,
    spool_id: String,
    printer_id: String,
    slot_id: String,
    loan_id: String,
    final_weight_g: i64,
    loan_status: String,
    backup_sha256: Option<String>,
    backup_total_rows: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PackagedDesktopE2eFailure {
    phase: String,
    run_id: String,
    step: String,
    message: String,
}

#[derive(Serialize)]
struct SuccessResult<'a> {
    format: &'static str,
    status: &'static str,
    phase: &'a str,
    run_id: &'a str,
    completion: &'a PackagedDesktopE2eCompletion,
}

#[derive(Serialize)]
struct FailureResult<'a> {
    format: &'static str,
    status: &'static str,
    phase: &'a str,
    run_id: &'a str,
    step: &'a str,
    message: &'a str,
}

fn read_utf8_environment(name: &str) -> Result<Option<String>, String> {
    std::env::var_os(name)
        .map(|value| {
            value
                .into_string()
                .map_err(|_| format!("{name} must contain valid UTF-8"))
        })
        .transpose()
}

fn raw_configuration_from_process() -> Result<RawConfiguration, String> {
    Ok(RawConfiguration {
        enabled: read_utf8_environment(ENABLED_ENV_VAR)?,
        phase: read_utf8_environment(PHASE_ENV_VAR)?,
        run_id: read_utf8_environment(RUN_ID_ENV_VAR)?,
        work_directory: read_utf8_environment(WORK_DIRECTORY_ENV_VAR)?,
        database_path: std::env::var_os(APP_DB_PATH_ENV_VAR).map(PathBuf::from),
    })
}

fn require_regular_file(path: &Path, label: &str) -> Result<(), String> {
    let metadata = symlink_metadata(path).map_err(|error| format!("{label}: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("{label} must be a regular non-symbolic-link file"));
    }
    Ok(())
}

fn require_private_permissions(path: &Path, directory: bool, label: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = symlink_metadata(path)
            .map_err(|error| format!("{label}: {error}"))?
            .permissions()
            .mode()
            & 0o777;
        let expected = if directory { 0o700 } else { 0o600 };
        if mode != expected {
            return Err(format!(
                "{label} must use mode {expected:04o}, found {mode:04o}"
            ));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (path, directory, label);
    }
    Ok(())
}

fn valid_run_id(value: &str) -> bool {
    (16..=80).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn resolve_configuration(raw: RawConfiguration) -> Result<Option<ResolvedConfiguration>, String> {
    let Some(enabled) = raw.enabled else {
        return Ok(None);
    };
    if enabled != "1" {
        return Err(format!("{ENABLED_ENV_VAR} must be exactly 1 when present"));
    }
    let phase = raw
        .phase
        .ok_or_else(|| format!("{PHASE_ENV_VAR} is required"))?;
    if !matches!(phase.as_str(), "mutate" | "verify") {
        return Err(format!("{PHASE_ENV_VAR} must be mutate or verify"));
    }
    let run_id = raw
        .run_id
        .ok_or_else(|| format!("{RUN_ID_ENV_VAR} is required"))?;
    if !valid_run_id(&run_id) {
        return Err(format!("{RUN_ID_ENV_VAR} is invalid"));
    }
    let work_directory = PathBuf::from(
        raw.work_directory
            .ok_or_else(|| format!("{WORK_DIRECTORY_ENV_VAR} is required"))?,
    );
    if !work_directory.is_absolute() {
        return Err(format!("{WORK_DIRECTORY_ENV_VAR} must be absolute"));
    }
    let directory_metadata = symlink_metadata(&work_directory)
        .map_err(|error| format!("Packaged desktop E2E directory: {error}"))?;
    if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
        return Err("Packaged desktop E2E directory must be a real private directory".to_string());
    }
    require_private_permissions(&work_directory, true, "Packaged desktop E2E directory")?;

    let marker_path = work_directory.join(MARKER_FILE_NAME);
    require_regular_file(&marker_path, "Packaged desktop E2E marker")?;
    require_private_permissions(&marker_path, false, "Packaged desktop E2E marker")?;
    let expected_marker = format!("{MARKER_FORMAT}\n{run_id}\n");
    let actual_marker = std::fs::read_to_string(&marker_path)
        .map_err(|error| format!("Packaged desktop E2E marker: {error}"))?;
    if actual_marker != expected_marker {
        return Err("Packaged desktop E2E marker does not match this run".to_string());
    }

    let database_path = raw
        .database_path
        .ok_or_else(|| format!("{APP_DB_PATH_ENV_VAR} is required"))?;
    if !database_path.is_absolute() {
        return Err(format!("{APP_DB_PATH_ENV_VAR} must be absolute"));
    }
    let expected_database_path = work_directory.join(DATABASE_FILE_NAME);
    require_regular_file(&database_path, "Packaged desktop E2E database")?;
    require_private_permissions(&database_path, false, "Packaged desktop E2E database")?;
    let actual_database_path = std::fs::canonicalize(&database_path)
        .map_err(|error| format!("Packaged desktop E2E database: {error}"))?;
    let expected_database_path = std::fs::canonicalize(&expected_database_path)
        .map_err(|error| format!("Packaged desktop E2E expected database: {error}"))?;
    if actual_database_path != expected_database_path {
        return Err("Packaged desktop E2E database is outside its private directory".to_string());
    }

    Ok(Some(ResolvedConfiguration {
        result_path: work_directory.join(format!("{phase}-result.json")),
        public: PackagedDesktopE2eConfiguration {
            phase,
            run_id,
            spool_id: SPOOL_ID.to_string(),
            printer_id: PRINTER_ID.to_string(),
            slot_id: SLOT_ID.to_string(),
            initial_weight_g: INITIAL_WEIGHT_G,
            updated_weight_g: UPDATED_WEIGHT_G,
            returned_weight_g: RETURNED_WEIGHT_G,
        },
    }))
}

fn active_configuration() -> Result<Option<ResolvedConfiguration>, String> {
    resolve_configuration(raw_configuration_from_process()?)
}

fn require_active_configuration() -> Result<ResolvedConfiguration, String> {
    active_configuration()?.ok_or_else(|| {
        "Packaged desktop E2E commands are unavailable during normal application use".to_string()
    })
}

fn require_active_configuration_for_state(
    state: &AppState,
) -> Result<ResolvedConfiguration, String> {
    let config = require_active_configuration()?;
    let configured_database = std::fs::canonicalize(
        std::env::var_os(APP_DB_PATH_ENV_VAR)
            .map(PathBuf::from)
            .ok_or_else(|| format!("{APP_DB_PATH_ENV_VAR} is required"))?,
    )
    .map_err(|error| format!("Packaged desktop E2E database: {error}"))?;
    let state_database = std::fs::canonicalize(Path::new(&state.db_path))
        .map_err(|error| format!("Application database: {error}"))?;
    if configured_database != state_database {
        return Err(
            "Packaged desktop E2E is not using the managed application database".to_string(),
        );
    }
    Ok(config)
}

fn validate_completion(
    config: &ResolvedConfiguration,
    completion: &PackagedDesktopE2eCompletion,
) -> Result<(), String> {
    if completion.phase != config.public.phase || completion.run_id != config.public.run_id {
        return Err("Packaged desktop E2E completion identity mismatch".to_string());
    }
    if completion.spool_id != SPOOL_ID
        || completion.printer_id != PRINTER_ID
        || completion.slot_id != SLOT_ID
        || completion.final_weight_g != RETURNED_WEIGHT_G
        || completion.loan_status != "RETURNED"
        || completion.loan_id.trim().is_empty()
        || completion.loan_id.len() > 100
    {
        return Err("Packaged desktop E2E completion data mismatch".to_string());
    }
    match config.public.phase.as_str() {
        "mutate" => {
            if completion.backup_sha256.is_some() || completion.backup_total_rows.is_some() {
                return Err("Mutation phase must not claim backup verification".to_string());
            }
        }
        "verify" => {
            let backup_sha256 = completion
                .backup_sha256
                .as_deref()
                .ok_or_else(|| "Verification phase must include a backup SHA-256".to_string())?;
            if backup_sha256.len() != 64
                || !backup_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
                || !backup_sha256.bytes().all(|byte| !byte.is_ascii_uppercase())
                || completion.backup_total_rows.unwrap_or(0) == 0
            {
                return Err("Verification phase backup evidence is invalid".to_string());
            }
        }
        _ => return Err("Packaged desktop E2E phase is invalid".to_string()),
    }
    Ok(())
}

fn write_private_result(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if path.symlink_metadata().is_ok() {
        return Err("Packaged desktop E2E result already exists".to_string());
    }
    let temporary_path = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("Create packaged desktop E2E result: {error}"))?;
    let mut contents = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Serialize packaged desktop E2E result: {error}"))?;
    contents.push(b'\n');
    file.write_all(&contents)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Write packaged desktop E2E result: {error}"))?;
    drop(file);
    std::fs::rename(&temporary_path, path)
        .map_err(|error| format!("Publish packaged desktop E2E result: {error}"))?;
    require_private_permissions(path, false, "Packaged desktop E2E result")
}

fn sanitized_failure_field(value: &str, maximum_length: usize, fallback: &str) -> String {
    let sanitized = value
        .chars()
        .filter(|character| !character.is_control())
        .take(maximum_length)
        .collect::<String>();
    if sanitized.trim().is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

#[tauri::command]
pub(crate) fn get_packaged_desktop_e2e_configuration(
    state: tauri::State<'_, AppState>,
) -> Result<Option<PackagedDesktopE2eConfiguration>, String> {
    if active_configuration()?.is_none() {
        return Ok(None);
    }
    let config = require_active_configuration_for_state(&state)?;
    Ok(Some(config.public))
}

#[tauri::command]
pub(crate) fn complete_packaged_desktop_e2e(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PackagedDesktopE2eCompletion,
) -> Result<(), String> {
    let config = require_active_configuration_for_state(&state)?;
    validate_completion(&config, &input)?;
    write_private_result(
        &config.result_path,
        &SuccessResult {
            format: RESULT_FORMAT,
            status: "pass",
            phase: &config.public.phase,
            run_id: &config.public.run_id,
            completion: &input,
        },
    )?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub(crate) fn fail_packaged_desktop_e2e(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PackagedDesktopE2eFailure,
) -> Result<(), String> {
    let config = require_active_configuration_for_state(&state)?;
    if input.phase != config.public.phase || input.run_id != config.public.run_id {
        return Err("Packaged desktop E2E failure identity mismatch".to_string());
    }
    let step = sanitized_failure_field(&input.step, 120, "unknown");
    let message = sanitized_failure_field(&input.message, 500, "Unknown packaged E2E failure");
    write_private_result(
        &config.result_path,
        &FailureResult {
            format: RESULT_FORMAT,
            status: "fail",
            phase: &config.public.phase,
            run_id: &config.public.run_id,
            step: &step,
            message: &message,
        },
    )?;
    app.exit(1);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn private_fixture() -> (PathBuf, String) {
        let run_id = format!(
            "packaged-e2e-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(&run_id);
        std::fs::create_dir(&directory).expect("create private fixture directory");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
                .expect("secure fixture directory");
        }
        let marker_path = directory.join(MARKER_FILE_NAME);
        std::fs::write(&marker_path, format!("{MARKER_FORMAT}\n{run_id}\n")).expect("write marker");
        let database_path = directory.join(DATABASE_FILE_NAME);
        std::fs::write(&database_path, b"sqlite-placeholder").expect("write database");
        #[cfg(unix)]
        for path in [&marker_path, &database_path] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .expect("secure fixture file");
        }
        (directory, run_id)
    }

    #[test]
    fn harness_is_unavailable_without_the_explicit_gate() {
        assert!(resolve_configuration(RawConfiguration::default())
            .expect("resolve absent gate")
            .is_none());
        assert!(resolve_configuration(RawConfiguration {
            enabled: Some("true".to_string()),
            ..RawConfiguration::default()
        })
        .expect_err("reject non-exact gate")
        .contains("must be exactly 1"));
    }

    #[test]
    fn harness_requires_a_private_marked_database_directory() {
        let (directory, run_id) = private_fixture();
        let result = (|| {
            let resolved = resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("mutate".to_string()),
                run_id: Some(run_id.clone()),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })?
            .expect("active config");
            assert_eq!(resolved.public.phase, "mutate");
            assert_eq!(resolved.public.run_id, run_id);
            assert_eq!(resolved.public.returned_weight_g, RETURNED_WEIGHT_G);

            std::fs::write(
                directory.join(MARKER_FILE_NAME),
                format!("{MARKER_FORMAT}\nwrong-run\n"),
            )
            .map_err(|error| error.to_string())?;
            assert!(resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("verify".to_string()),
                run_id: Some(run_id),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })
            .expect_err("reject marker mismatch")
            .contains("marker does not match"));
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(&directory);
        result.expect("exercise private gate");
    }

    #[test]
    fn completion_requires_post_restart_backup_evidence() {
        let (directory, run_id) = private_fixture();
        let result = (|| {
            let config = resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("verify".to_string()),
                run_id: Some(run_id.clone()),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })?
            .expect("active config");
            let mut completion = PackagedDesktopE2eCompletion {
                phase: "verify".to_string(),
                run_id,
                spool_id: SPOOL_ID.to_string(),
                printer_id: PRINTER_ID.to_string(),
                slot_id: SLOT_ID.to_string(),
                loan_id: "loan-id".to_string(),
                final_weight_g: RETURNED_WEIGHT_G,
                loan_status: "RETURNED".to_string(),
                backup_sha256: None,
                backup_total_rows: None,
            };
            assert!(validate_completion(&config, &completion)
                .expect_err("backup evidence required")
                .contains("backup SHA-256"));
            completion.backup_sha256 = Some("a".repeat(64));
            completion.backup_total_rows = Some(12);
            validate_completion(&config, &completion)?;
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(&directory);
        result.expect("validate completion evidence");
    }
}
