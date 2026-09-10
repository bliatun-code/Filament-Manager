use crate::app_storage::APP_DB_PATH_ENV_VAR;
use crate::backend::inventory_engine::{CatalogSpoolBatchInput, CatalogSpoolBatchReceipt};
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
const RESTORE_PERTURBED_WEIGHT_G: i64 = 123;
const MAXIMUM_RESULT_BYTES: u64 = 64 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct PackagedDesktopBatchEvidence {
    request: CatalogSpoolBatchInput,
    receipt: CatalogSpoolBatchReceipt,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct PackagedDesktopRestoreEvidence {
    backup_tables_sha256: String,
    perturbed_weight_g: i64,
}

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
    batch_evidence: Option<PackagedDesktopBatchEvidence>,
    restore_evidence: Option<PackagedDesktopRestoreEvidence>,
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
    batch_evidence: PackagedDesktopBatchEvidence,
    #[serde(default)]
    restore_evidence: Option<PackagedDesktopRestoreEvidence>,
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
    if !matches!(
        phase.as_str(),
        "mutate" | "verify" | "restore" | "verify-restored"
    ) {
        return Err(format!(
            "{PHASE_ENV_VAR} must be mutate, verify, restore or verify-restored"
        ));
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
            batch_evidence: None,
            restore_evidence: None,
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
    bind_restarted_batch_evidence(config)
}

fn bind_restarted_batch_evidence(
    mut config: ResolvedConfiguration,
) -> Result<ResolvedConfiguration, String> {
    if config.public.phase == "mutate" {
        return Ok(config);
    }
    let mutation = read_phase_completion(&config, "mutate")?;
    config.public.batch_evidence = Some(mutation.batch_evidence);
    if config.public.phase == "verify-restored" {
        let restoration = read_phase_completion(&config, "restore")?;
        if restoration.loan_id != mutation.loan_id {
            return Err("Restoration must retain the original loan identity".to_string());
        }
        config.public.restore_evidence = restoration.restore_evidence;
    }
    Ok(config)
}

fn read_phase_completion(
    config: &ResolvedConfiguration,
    phase: &str,
) -> Result<PackagedDesktopE2eCompletion, String> {
    let original_path = config
        .result_path
        .with_file_name(format!("{phase}-result.json"));
    let label = format!("Packaged desktop {phase} evidence");
    require_regular_file(&original_path, &label)?;
    require_private_permissions(&original_path, false, &label)?;
    let size = symlink_metadata(&original_path)
        .map_err(|_| format!("Cannot inspect {label}"))?
        .len();
    if size == 0 || size > MAXIMUM_RESULT_BYTES {
        return Err(format!("{label} has an invalid size"));
    }
    let content =
        std::fs::read_to_string(&original_path).map_err(|_| format!("Cannot read {label}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&content).map_err(|_| format!("{label} is invalid JSON"))?;
    if value["format"] != RESULT_FORMAT
        || value["status"] != "pass"
        || value["phase"] != phase
        || value["run_id"] != config.public.run_id
    {
        return Err(format!("{label} identity mismatch"));
    }
    let completion: PackagedDesktopE2eCompletion =
        serde_json::from_value(value["completion"].clone())
            .map_err(|_| format!("{label} is incomplete"))?;
    let mut phase_config = config.clone();
    phase_config.public.phase = phase.to_string();
    validate_completion(&phase_config, &completion)?;
    Ok(completion)
}

fn validate_batch_evidence(
    evidence: &PackagedDesktopBatchEvidence,
    run_id: &str,
) -> Result<(), String> {
    let request = &evidence.request;
    let receipt = &evidence.receipt;
    if request.batch_id != format!("{run_id}-catalog-batch")
        || request.master_ids.len() != 2
        || request.master_ids[0].trim().is_empty()
        || request.master_ids[0] != request.master_ids[1]
        || request.initial_weight_g != 640
        || request.ownership_type != "BORROWED_IN"
        || request.owner_name.as_deref() != Some("Packaged desktop E2E lender")
        || request.owner_contact.as_deref() != Some("desktop-batch@example.invalid")
        || request.ownership_note.as_deref() != Some("Isolated packaged desktop batch fixture")
        || request.location.as_deref() != Some("Private packaged desktop QA")
        || receipt.batch_id != request.batch_id
        || receipt.spool_ids.len() != 2
        || receipt.spool_ids[0] == receipt.spool_ids[1]
        || receipt.spool_ids.iter().any(|id| {
            id.strip_prefix("spool_").is_none_or(|suffix| {
                suffix.len() != 32
                    || !suffix
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            })
        })
    {
        return Err("Packaged desktop catalog batch evidence is invalid".to_string());
    }
    Ok(())
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
    validate_batch_evidence(&completion.batch_evidence, &config.public.run_id)?;
    match config.public.phase.as_str() {
        "restore" | "verify-restored" => {
            let evidence = completion
                .restore_evidence
                .as_ref()
                .ok_or_else(|| "Restoration evidence is required".to_string())?;
            if !valid_sha256(&evidence.backup_tables_sha256)
                || evidence.perturbed_weight_g != RESTORE_PERTURBED_WEIGHT_G
            {
                return Err("Restoration evidence is invalid".to_string());
            }
            if config.public.phase == "verify-restored"
                && config.public.restore_evidence.as_ref() != Some(evidence)
            {
                return Err("Restart must verify the original restoration evidence".to_string());
            }
        }
        _ if completion.restore_evidence.is_some() => {
            return Err("This phase must not claim restoration evidence".to_string());
        }
        _ => {}
    }
    match config.public.phase.as_str() {
        "mutate" => {
            if completion.backup_sha256.is_some() || completion.backup_total_rows.is_some() {
                return Err("Mutation phase must not claim backup verification".to_string());
            }
        }
        "verify" | "restore" | "verify-restored" => {
            if config.public.batch_evidence.as_ref() != Some(&completion.batch_evidence) {
                return Err(
                    "Verification must replay the original catalog batch evidence".to_string(),
                );
            }
            let backup_sha256 = completion
                .backup_sha256
                .as_deref()
                .ok_or_else(|| "Verification phase must include a backup SHA-256".to_string())?;
            if !valid_sha256(backup_sha256) || completion.backup_total_rows.unwrap_or(0) == 0 {
                return Err("Verification phase backup evidence is invalid".to_string());
            }
        }
        _ => return Err("Packaged desktop E2E phase is invalid".to_string()),
    }
    Ok(())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
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

    fn batch_evidence(run_id: &str) -> PackagedDesktopBatchEvidence {
        let batch_id = format!("{run_id}-catalog-batch");
        PackagedDesktopBatchEvidence {
            request: CatalogSpoolBatchInput {
                batch_id: batch_id.clone(),
                master_ids: vec!["qa-master".to_string(); 2],
                initial_weight_g: 640,
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Packaged desktop E2E lender".to_string()),
                owner_contact: Some("desktop-batch@example.invalid".to_string()),
                ownership_note: Some("Isolated packaged desktop batch fixture".to_string()),
                location: Some("Private packaged desktop QA".to_string()),
            },
            receipt: CatalogSpoolBatchReceipt {
                batch_id,
                spool_ids: vec![
                    format!("spool_{}", "1".repeat(32)),
                    format!("spool_{}", "2".repeat(32)),
                ],
            },
        }
    }

    fn completion(phase: &str, run_id: &str) -> PackagedDesktopE2eCompletion {
        PackagedDesktopE2eCompletion {
            phase: phase.to_string(),
            run_id: run_id.to_string(),
            spool_id: SPOOL_ID.to_string(),
            printer_id: PRINTER_ID.to_string(),
            slot_id: SLOT_ID.to_string(),
            loan_id: "loan-id".to_string(),
            final_weight_g: RETURNED_WEIGHT_G,
            loan_status: "RETURNED".to_string(),
            backup_sha256: None,
            backup_total_rows: None,
            batch_evidence: batch_evidence(run_id),
            restore_evidence: None,
        }
    }

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
            let mut config = resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("verify".to_string()),
                run_id: Some(run_id.clone()),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })?
            .expect("active config");
            config.public.batch_evidence = Some(batch_evidence(&run_id));
            let mut completion = completion("verify", &run_id);
            assert!(validate_completion(&config, &completion)
                .expect_err("backup evidence required")
                .contains("backup SHA-256"));
            completion.backup_sha256 = Some("a".repeat(64));
            completion.backup_total_rows = Some(12);
            validate_completion(&config, &completion)?;
            completion.batch_evidence.receipt.spool_ids.reverse();
            assert!(validate_completion(&config, &completion)
                .expect_err("same IDs in changed order fail")
                .contains("original catalog batch evidence"));
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(&directory);
        result.expect("validate completion evidence");
    }

    #[test]
    fn restarted_configuration_requires_private_original_batch_evidence() {
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
            assert!(bind_restarted_batch_evidence(config.clone()).is_err());
            let mutation = completion("mutate", &run_id);
            let path = directory.join("mutate-result.json");
            let original = SuccessResult {
                format: RESULT_FORMAT,
                status: "pass",
                phase: "mutate",
                run_id: &run_id,
                completion: &mutation,
            };
            write_private_result(&path, &original)?;
            let restored = bind_restarted_batch_evidence(config.clone())?;
            assert_eq!(
                restored.public.batch_evidence,
                Some(mutation.batch_evidence.clone())
            );
            for change in ["missing-batch", "wrong-run", "duplicate-spool"] {
                let mut value =
                    serde_json::to_value(&original).map_err(|error| error.to_string())?;
                match change {
                    "missing-batch" => {
                        value["completion"]
                            .as_object_mut()
                            .unwrap()
                            .remove("batch_evidence");
                    }
                    "wrong-run" => value["run_id"] = serde_json::json!("other-run"),
                    _ => {
                        value["completion"]["batch_evidence"]["receipt"]["spool_ids"][1] =
                            value["completion"]["batch_evidence"]["receipt"]["spool_ids"][0].clone()
                    }
                }
                std::fs::write(&path, serde_json::to_vec(&value).unwrap())
                    .map_err(|error| error.to_string())?;
                assert!(
                    bind_restarted_batch_evidence(config.clone()).is_err(),
                    "{change} must fail closed"
                );
            }
            std::fs::write(&path, vec![b' '; MAXIMUM_RESULT_BYTES as usize + 1])
                .map_err(|error| error.to_string())?;
            assert!(bind_restarted_batch_evidence(config)
                .expect_err("oversized evidence rejected")
                .contains("invalid size"));
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(directory);
        result.expect("verify original evidence is mandatory");
    }

    #[test]
    fn restoration_requires_distinct_perturbation_and_bound_backup_tables() {
        let (directory, run_id) = private_fixture();
        let result = (|| {
            let mut config = resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("restore".to_string()),
                run_id: Some(run_id.clone()),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })?
            .expect("active config");
            config.public.batch_evidence = Some(batch_evidence(&run_id));
            let mut input = completion("restore", &run_id);
            input.backup_sha256 = Some("a".repeat(64));
            input.backup_total_rows = Some(12);
            assert!(validate_completion(&config, &input).is_err());
            let evidence = PackagedDesktopRestoreEvidence {
                backup_tables_sha256: "b".repeat(64),
                perturbed_weight_g: RESTORE_PERTURBED_WEIGHT_G,
            };
            input.restore_evidence = Some(evidence.clone());
            validate_completion(&config, &input)?;
            for bad_evidence in [
                PackagedDesktopRestoreEvidence {
                    perturbed_weight_g: RETURNED_WEIGHT_G,
                    ..evidence.clone()
                },
                PackagedDesktopRestoreEvidence {
                    backup_tables_sha256: "B".repeat(64),
                    ..evidence.clone()
                },
                PackagedDesktopRestoreEvidence {
                    backup_tables_sha256: "b".repeat(63),
                    ..evidence.clone()
                },
            ] {
                input.restore_evidence = Some(bad_evidence);
                assert!(validate_completion(&config, &input).is_err());
            }
            input.restore_evidence = Some(evidence.clone());
            config.public.phase = "verify-restored".to_string();
            input.phase = config.public.phase.clone();
            assert!(
                validate_completion(&config, &input).is_err(),
                "restart needs original evidence"
            );
            config.public.restore_evidence = Some(evidence);
            validate_completion(&config, &input)?;
            input
                .restore_evidence
                .as_mut()
                .unwrap()
                .backup_tables_sha256 = "c".repeat(64);
            assert!(
                validate_completion(&config, &input).is_err(),
                "different backup must fail"
            );
            for phase in ["mutate", "verify"] {
                config.public.phase = phase.to_string();
                input.phase = phase.to_string();
                assert!(
                    validate_completion(&config, &input).is_err(),
                    "early phases cannot claim restore"
                );
            }
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(directory);
        result.expect("validate restore protocol");
    }

    #[test]
    fn restored_restart_loads_only_matching_private_restore_receipt() {
        let (directory, run_id) = private_fixture();
        let result = (|| {
            let config = resolve_configuration(RawConfiguration {
                enabled: Some("1".to_string()),
                phase: Some("verify-restored".to_string()),
                run_id: Some(run_id.clone()),
                work_directory: Some(directory.to_string_lossy().into_owned()),
                database_path: Some(directory.join(DATABASE_FILE_NAME)),
            })?
            .expect("active config");
            let mutation = completion("mutate", &run_id);
            write_private_result(
                &directory.join("mutate-result.json"),
                &SuccessResult {
                    format: RESULT_FORMAT,
                    status: "pass",
                    phase: "mutate",
                    run_id: &run_id,
                    completion: &mutation,
                },
            )?;
            assert!(
                bind_restarted_batch_evidence(config.clone()).is_err(),
                "missing restore cannot pass"
            );
            let mut restore = completion("restore", &run_id);
            restore.backup_sha256 = Some("a".repeat(64));
            restore.backup_total_rows = Some(12);
            restore.restore_evidence = Some(PackagedDesktopRestoreEvidence {
                backup_tables_sha256: "b".repeat(64),
                perturbed_weight_g: RESTORE_PERTURBED_WEIGHT_G,
            });
            let original = serde_json::to_value(SuccessResult {
                format: RESULT_FORMAT,
                status: "pass",
                phase: "restore",
                run_id: &run_id,
                completion: &restore,
            })
            .map_err(|error| error.to_string())?;
            let path = directory.join("restore-result.json");
            write_private_result(&path, &original)?;
            let bound = bind_restarted_batch_evidence(config.clone())?;
            assert_eq!(bound.public.restore_evidence, restore.restore_evidence);
            for field in ["run_id", "phase", "loan_id", "restore_evidence"] {
                let mut invalid = original.clone();
                if field == "restore_evidence" {
                    invalid["completion"][field] = serde_json::Value::Null;
                } else if field == "loan_id" {
                    invalid["completion"][field] = serde_json::json!("other-loan");
                } else {
                    invalid[field] = serde_json::json!("other-run-or-phase");
                }
                std::fs::write(&path, serde_json::to_vec(&invalid).unwrap())
                    .map_err(|error| error.to_string())?;
                assert!(
                    bind_restarted_batch_evidence(config.clone()).is_err(),
                    "{field} must fail closed"
                );
            }
            #[cfg(unix)]
            {
                std::fs::remove_file(&path).map_err(|error| error.to_string())?;
                std::os::unix::fs::symlink(directory.join("mutate-result.json"), &path)
                    .map_err(|error| error.to_string())?;
                assert!(
                    bind_restarted_batch_evidence(config).is_err(),
                    "symlink receipt must fail closed"
                );
            }
            Ok::<(), String>(())
        })();
        let _ = std::fs::remove_dir_all(directory);
        result.expect("bind the original restoration receipt");
    }
}
