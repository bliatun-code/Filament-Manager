use crate::app_storage::APP_DB_PATH_ENV_VAR;
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_host_client::load_library_sync_device_token_bytes_optional;
use crate::state::AppState;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs::{symlink_metadata, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[path = "packaged_host_client_catalog_jobs.rs"]
mod catalog_jobs;
pub(crate) use catalog_jobs::{catalog_job_summary, run_catalog_job};

const ENABLED_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E";
const ROLE_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_ROLE";
const PHASE_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PHASE";
const RUN_ID_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_RUN_ID";
const WORK_DIRECTORY_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_DIR";
const PORT_ENV_VAR: &str = "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PORT";
const MARKER_FILE_NAME: &str = ".filament-manager-packaged-host-client-e2e";
const MARKER_FORMAT: &str = "filament-manager-packaged-host-client-e2e-v1";
const READY_FORMAT: &str = "filament-manager-packaged-host-client-e2e-host-ready-v1";
const STOP_FORMAT: &str = "filament-manager-packaged-host-client-e2e-stop-v1";
const RESULT_FORMAT: &str = "filament-manager-packaged-host-client-e2e-result-v1";
const HOST_DATABASE_FILE_NAME: &str = "host.db";
const CLIENT_DATABASE_FILE_NAME: &str = "client.db";
const MAX_COORDINATION_FILE_BYTES: u64 = 64 * 1024;
const HOST_ROLE: &str = "host";
const CLIENT_ROLE: &str = "client";
const HOST_GENERATION_1_PHASE: &str = "generation-1";
const HOST_GENERATION_2_PHASE: &str = "generation-2";
const CLIENT_PAIR_PHASE: &str = "pair";
const CLIENT_OFFLINE_PHASE: &str = "offline";
const CLIENT_RECOVER_PHASE: &str = "recover";
const CLIENT_CLEANUP_PHASE: &str = "cleanup";
const LIBRARY_ID: &str = "packaged_host_client_e2e_library";
const SPOOL_ID: &str = "packaged_host_client_e2e_spool";
const HOST_INITIAL_WEIGHT_G: i64 = 1_000;
const PAIRED_WEIGHT_G: i64 = 875;
const RECOVERED_WEIGHT_G: i64 = 760;
const CLIENT_SHADOW_WEIGHT_G: i64 = 333;
const LOOPBACK_ADDRESS: &str = "127.0.0.1";
pub(crate) const HOST_LOOPBACK_INTERFACE_NAME: &str = "Packaged Host-Client E2E";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum PackagedHostClientE2eFailureKind {
    Scenario,
    PortInUse,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct PackagedHostClientE2eConfiguration {
    role: String,
    phase: String,
    run_id: String,
    listen_port: u16,
    library_id: String,
    spool_id: String,
    host_initial_weight_g: i64,
    paired_weight_g: i64,
    recovered_weight_g: i64,
    client_shadow_weight_g: i64,
    base_url: Option<String>,
    pairing_url: Option<String>,
    target_generation: Option<u64>,
}

#[derive(Clone, Debug)]
struct ResolvedConfiguration {
    public: PackagedHostClientE2eConfiguration,
    work_directory: PathBuf,
    result_path: PathBuf,
    database_path: PathBuf,
}

#[derive(Clone, Debug)]
struct ValidatedActivation {
    role: String,
    phase: String,
    run_id: String,
    work_directory: PathBuf,
    result_path: PathBuf,
}

#[derive(Clone, Debug, Default)]
struct RawConfiguration {
    enabled: Option<String>,
    role: Option<String>,
    phase: Option<String>,
    run_id: Option<String>,
    work_directory: Option<String>,
    port: Option<String>,
    database_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PackagedHostClientE2eHostWaitInput {
    role: String,
    phase: String,
    run_id: String,
    library_id: String,
    base_url: String,
    pairing_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PackagedHostClientE2eClientCompletion {
    role: String,
    phase: String,
    run_id: String,
    library_id: String,
    spool_id: String,
    local_weight_g: i64,
    host_weight_g: Option<i64>,
    cache_weight_g: i64,
    target_generation: u64,
    live_read_failed: bool,
    live_write_failed: bool,
    paired_before_cleanup: bool,
    auth_cleared: bool,
    session_renewed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PackagedHostClientE2eCleanupCompletion {
    role: String,
    phase: String,
    run_id: String,
    auth_cleared: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub(crate) enum PackagedHostClientE2eCompletion {
    Client(PackagedHostClientE2eClientCompletion),
    Cleanup(PackagedHostClientE2eCleanupCompletion),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ClientCompletionEvidence {
    library_id: String,
    spool_id: String,
    local_weight_g: i64,
    host_weight_g: Option<i64>,
    cache_weight_g: i64,
    target_generation: u64,
    live_read_failed: bool,
    live_write_failed: bool,
    paired_before_cleanup: bool,
    auth_cleared: bool,
    session_renewed: bool,
}

impl From<&PackagedHostClientE2eClientCompletion> for ClientCompletionEvidence {
    fn from(value: &PackagedHostClientE2eClientCompletion) -> Self {
        Self {
            library_id: value.library_id.clone(),
            spool_id: value.spool_id.clone(),
            local_weight_g: value.local_weight_g,
            host_weight_g: value.host_weight_g,
            cache_weight_g: value.cache_weight_g,
            target_generation: value.target_generation,
            live_read_failed: value.live_read_failed,
            live_write_failed: value.live_write_failed,
            paired_before_cleanup: value.paired_before_cleanup,
            auth_cleared: value.auth_cleared,
            session_renewed: value.session_renewed,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
struct CleanupCompletionEvidence {
    auth_cleared: bool,
}

#[derive(Serialize)]
#[serde(untagged)]
enum CompletionEvidence {
    Client(ClientCompletionEvidence),
    Cleanup(CleanupCompletionEvidence),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PackagedHostClientE2eFailure {
    role: String,
    phase: String,
    run_id: String,
    step: String,
    message: String,
    failure_kind: PackagedHostClientE2eFailureKind,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HostReadyFile {
    format: String,
    role: String,
    phase: String,
    run_id: String,
    library_id: String,
    spool_id: String,
    listen_port: u16,
    base_url: String,
    pairing_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HostStopFile {
    format: String,
    role: String,
    phase: String,
    run_id: String,
}

#[derive(Clone, Debug, Serialize)]
struct HostCompletion {
    library_id: String,
    spool_id: String,
    listen_port: u16,
    pairing_issued: bool,
}

#[derive(Serialize)]
struct SuccessResult<'a, Completion: Serialize> {
    format: &'static str,
    status: &'static str,
    role: &'a str,
    phase: &'a str,
    run_id: &'a str,
    completion: &'a Completion,
}

#[derive(Serialize)]
struct FailureResult<'a> {
    format: &'static str,
    status: &'static str,
    role: &'a str,
    phase: &'a str,
    run_id: &'a str,
    step: &'a str,
    message: &'static str,
    failure_kind: PackagedHostClientE2eFailureKind,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PairSuccessResult {
    format: String,
    status: String,
    role: String,
    phase: String,
    run_id: String,
    completion: ClientCompletionEvidence,
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
        role: read_utf8_environment(ROLE_ENV_VAR)?,
        phase: read_utf8_environment(PHASE_ENV_VAR)?,
        run_id: read_utf8_environment(RUN_ID_ENV_VAR)?,
        work_directory: read_utf8_environment(WORK_DIRECTORY_ENV_VAR)?,
        port: read_utf8_environment(PORT_ENV_VAR)?,
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

fn valid_role_phase(role: &str, phase: &str) -> bool {
    match role {
        HOST_ROLE => matches!(phase, HOST_GENERATION_1_PHASE | HOST_GENERATION_2_PHASE),
        CLIENT_ROLE => matches!(
            phase,
            CLIENT_PAIR_PHASE | CLIENT_OFFLINE_PHASE | CLIENT_RECOVER_PHASE | CLIENT_CLEANUP_PHASE
        ),
        _ => false,
    }
}

fn database_file_name(role: &str) -> Option<&'static str> {
    match role {
        HOST_ROLE => Some(HOST_DATABASE_FILE_NAME),
        CLIENT_ROLE => Some(CLIENT_DATABASE_FILE_NAME),
        _ => None,
    }
}

fn result_file_name(role: &str, phase: &str) -> String {
    format!("{role}-{phase}-result.json")
}

fn host_ready_file_name(phase: &str) -> Option<&'static str> {
    match phase {
        HOST_GENERATION_1_PHASE => Some("host-generation-1-ready.json"),
        HOST_GENERATION_2_PHASE => Some("host-generation-2-ready.json"),
        _ => None,
    }
}

fn host_stop_file_name(phase: &str) -> Option<&'static str> {
    match phase {
        HOST_GENERATION_1_PHASE => Some("host-generation-1.stop"),
        HOST_GENERATION_2_PHASE => Some("host-generation-2.stop"),
        _ => None,
    }
}

fn direct_base_url(port: u16) -> String {
    format!("http://{LOOPBACK_ADDRESS}:{port}")
}

fn validate_activation(raw: &RawConfiguration) -> Result<Option<ValidatedActivation>, String> {
    let Some(enabled) = raw.enabled.as_deref() else {
        return Ok(None);
    };
    if enabled != "1" {
        return Err(format!("{ENABLED_ENV_VAR} must be exactly 1 when present"));
    }
    let role = raw
        .role
        .as_deref()
        .ok_or_else(|| format!("{ROLE_ENV_VAR} is required"))?;
    let phase = raw
        .phase
        .as_deref()
        .ok_or_else(|| format!("{PHASE_ENV_VAR} is required"))?;
    if !valid_role_phase(role, phase) {
        return Err(format!(
            "{ROLE_ENV_VAR} and {PHASE_ENV_VAR} are incompatible"
        ));
    }
    let run_id = raw
        .run_id
        .as_deref()
        .ok_or_else(|| format!("{RUN_ID_ENV_VAR} is required"))?;
    if !valid_run_id(run_id) {
        return Err(format!("{RUN_ID_ENV_VAR} is invalid"));
    }

    let work_directory = PathBuf::from(
        raw.work_directory
            .as_deref()
            .ok_or_else(|| format!("{WORK_DIRECTORY_ENV_VAR} is required"))?,
    );
    if !work_directory.is_absolute() {
        return Err(format!("{WORK_DIRECTORY_ENV_VAR} must be absolute"));
    }
    let directory_metadata = symlink_metadata(&work_directory)
        .map_err(|error| format!("Packaged Host-Client E2E directory: {error}"))?;
    if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
        return Err(
            "Packaged Host-Client E2E directory must be a real private directory".to_string(),
        );
    }
    require_private_permissions(&work_directory, true, "Packaged Host-Client E2E directory")?;

    let marker_path = work_directory.join(MARKER_FILE_NAME);
    require_regular_file(&marker_path, "Packaged Host-Client E2E marker")?;
    require_private_permissions(&marker_path, false, "Packaged Host-Client E2E marker")?;
    let expected_marker = format!("{MARKER_FORMAT}\n{run_id}\n");
    let actual_marker = std::fs::read_to_string(&marker_path)
        .map_err(|error| format!("Packaged Host-Client E2E marker: {error}"))?;
    if actual_marker != expected_marker {
        return Err("Packaged Host-Client E2E marker does not match this run".to_string());
    }

    Ok(Some(ValidatedActivation {
        role: role.to_string(),
        phase: phase.to_string(),
        run_id: run_id.to_string(),
        result_path: work_directory.join(result_file_name(role, phase)),
        work_directory,
    }))
}

fn resolve_configuration(raw: RawConfiguration) -> Result<Option<ResolvedConfiguration>, String> {
    let Some(activation) = validate_activation(&raw)? else {
        return Ok(None);
    };
    let raw_port = raw
        .port
        .ok_or_else(|| format!("{PORT_ENV_VAR} is required"))?;
    let port = raw_port
        .parse::<u16>()
        .map_err(|_| format!("{PORT_ENV_VAR} must be a canonical TCP port"))?;
    if port < 1_024 || raw_port != port.to_string() {
        return Err(format!(
            "{PORT_ENV_VAR} must be a canonical port from 1024 to 65535"
        ));
    }

    let ValidatedActivation {
        role,
        phase,
        run_id,
        work_directory,
        result_path,
    } = activation;

    for file_name in [HOST_DATABASE_FILE_NAME, CLIENT_DATABASE_FILE_NAME] {
        let path = work_directory.join(file_name);
        require_regular_file(&path, "Packaged Host-Client E2E database")?;
        require_private_permissions(&path, false, "Packaged Host-Client E2E database")?;
    }

    let database_path = raw
        .database_path
        .ok_or_else(|| format!("{APP_DB_PATH_ENV_VAR} is required"))?;
    if !database_path.is_absolute() {
        return Err(format!("{APP_DB_PATH_ENV_VAR} must be absolute"));
    }
    let expected_database_path = work_directory.join(
        database_file_name(&role)
            .ok_or_else(|| "Packaged Host-Client E2E role is invalid".to_string())?,
    );
    require_regular_file(&database_path, "Packaged Host-Client E2E active database")?;
    require_private_permissions(
        &database_path,
        false,
        "Packaged Host-Client E2E active database",
    )?;
    let actual_database_path = std::fs::canonicalize(&database_path)
        .map_err(|error| format!("Packaged Host-Client E2E active database: {error}"))?;
    let expected_database_path = std::fs::canonicalize(&expected_database_path)
        .map_err(|error| format!("Packaged Host-Client E2E expected database: {error}"))?;
    if actual_database_path != expected_database_path {
        return Err(
            "Packaged Host-Client E2E database does not match the validated role".to_string(),
        );
    }

    Ok(Some(ResolvedConfiguration {
        result_path,
        database_path: actual_database_path,
        work_directory,
        public: PackagedHostClientE2eConfiguration {
            role,
            phase,
            run_id,
            listen_port: port,
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            host_initial_weight_g: HOST_INITIAL_WEIGHT_G,
            paired_weight_g: PAIRED_WEIGHT_G,
            recovered_weight_g: RECOVERED_WEIGHT_G,
            client_shadow_weight_g: CLIENT_SHADOW_WEIGHT_G,
            base_url: None,
            pairing_url: None,
            target_generation: None,
        },
    }))
}

fn active_configuration() -> Result<Option<ResolvedConfiguration>, String> {
    resolve_configuration(raw_configuration_from_process()?)
}

fn require_active_configuration() -> Result<ResolvedConfiguration, String> {
    active_configuration()?.ok_or_else(|| {
        "Packaged Host-Client E2E commands are unavailable during normal application use"
            .to_string()
    })
}

fn require_active_configuration_for_state(
    state: &AppState,
) -> Result<ResolvedConfiguration, String> {
    let config = require_active_configuration()?;
    let state_database = std::fs::canonicalize(Path::new(&state.db_path))
        .map_err(|error| format!("Application database: {error}"))?;
    if config.database_path != state_database {
        return Err("Packaged Host-Client E2E is not using the managed role database".to_string());
    }
    Ok(config)
}

fn read_private_json<T: DeserializeOwned>(path: &Path, label: &str) -> Result<T, String> {
    require_regular_file(path, label)?;
    require_private_permissions(path, false, label)?;
    let metadata = symlink_metadata(path).map_err(|error| format!("{label}: {error}"))?;
    if metadata.len() > MAX_COORDINATION_FILE_BYTES {
        return Err(format!(
            "{label} exceeds the bounded coordination-file size"
        ));
    }
    let bytes = std::fs::read(path).map_err(|error| format!("Read {label}: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("Parse {label}: {error}"))
}

fn write_private_json(path: &Path, value: &impl Serialize, label: &str) -> Result<(), String> {
    if path.symlink_metadata().is_ok() {
        return Err(format!("{label} already exists"));
    }
    let temporary_path = path.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary_path)
            .map_err(|error| format!("Create {label}: {error}"))?;
        let mut contents = serde_json::to_vec_pretty(value)
            .map_err(|error| format!("Serialize {label}: {error}"))?;
        contents.push(b'\n');
        if contents.len() as u64 > MAX_COORDINATION_FILE_BYTES {
            return Err(format!(
                "{label} exceeds the bounded coordination-file size"
            ));
        }
        file.write_all(&contents)
            .and_then(|()| file.sync_all())
            .map_err(|error| format!("Write {label}: {error}"))?;
        drop(file);
        std::fs::rename(&temporary_path, path)
            .map_err(|error| format!("Publish {label}: {error}"))?;
        require_private_permissions(path, false, label)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

fn validate_identity(
    config: &ResolvedConfiguration,
    role: &str,
    phase: &str,
    run_id: &str,
) -> Result<(), String> {
    if role != config.public.role || phase != config.public.phase || run_id != config.public.run_id
    {
        return Err("Packaged Host-Client E2E identity mismatch".to_string());
    }
    Ok(())
}

fn pairing_url_is_valid(value: &str, port: u16) -> bool {
    let Ok(parsed) = url::Url::parse(value) else {
        return false;
    };
    if parsed.scheme() != "http"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port_or_known_default() != Some(port)
        || parsed.path() != "/companion"
        || parsed.fragment().is_some()
    {
        return false;
    }
    let Some(host) = parsed.host_str().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };
    if host != LOOPBACK_ADDRESS && !host.ends_with(".local") {
        return false;
    }
    let query = parsed.query_pairs().collect::<Vec<_>>();
    query.len() == 1
        && query[0].0 == "pairing"
        && query[0].1.len() == 48
        && query[0]
            .1
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn validate_host_wait_input(
    config: &ResolvedConfiguration,
    input: &PackagedHostClientE2eHostWaitInput,
) -> Result<(), String> {
    validate_identity(config, &input.role, &input.phase, &input.run_id)?;
    if config.public.role != HOST_ROLE
        || input.library_id != LIBRARY_ID
        || input.base_url != direct_base_url(config.public.listen_port)
    {
        return Err("Packaged Host-Client E2E Host readiness data mismatch".to_string());
    }
    match config.public.phase.as_str() {
        HOST_GENERATION_1_PHASE => {
            if !input
                .pairing_url
                .as_deref()
                .is_some_and(|value| pairing_url_is_valid(value, config.public.listen_port))
            {
                return Err(
                    "Packaged Host-Client E2E first Host generation requires a valid pairing URL"
                        .to_string(),
                );
            }
        }
        HOST_GENERATION_2_PHASE if input.pairing_url.is_none() => {}
        HOST_GENERATION_2_PHASE => {
            return Err(
                "Packaged Host-Client E2E recovery Host must not issue a pairing URL".to_string(),
            );
        }
        _ => return Err("Packaged Host-Client E2E Host phase is invalid".to_string()),
    }
    Ok(())
}

fn validate_host_ready_file(
    config: &ResolvedConfiguration,
    ready: &HostReadyFile,
    expected_phase: &str,
) -> Result<(), String> {
    if ready.format != READY_FORMAT
        || ready.role != HOST_ROLE
        || ready.phase != expected_phase
        || ready.run_id != config.public.run_id
        || ready.library_id != LIBRARY_ID
        || ready.spool_id != SPOOL_ID
        || ready.listen_port != config.public.listen_port
        || ready.base_url != direct_base_url(config.public.listen_port)
    {
        return Err("Packaged Host-Client E2E Host-ready identity mismatch".to_string());
    }
    match expected_phase {
        HOST_GENERATION_1_PHASE
            if ready
                .pairing_url
                .as_deref()
                .is_some_and(|value| pairing_url_is_valid(value, config.public.listen_port)) =>
        {
            Ok(())
        }
        HOST_GENERATION_2_PHASE if ready.pairing_url.is_none() => Ok(()),
        _ => Err("Packaged Host-Client E2E Host-ready pairing data mismatch".to_string()),
    }
}

fn client_ready_phase(phase: &str) -> Option<&'static str> {
    match phase {
        CLIENT_PAIR_PHASE | CLIENT_OFFLINE_PHASE => Some(HOST_GENERATION_1_PHASE),
        CLIENT_RECOVER_PHASE => Some(HOST_GENERATION_2_PHASE),
        _ => None,
    }
}

fn read_host_ready_for_client(
    config: &ResolvedConfiguration,
) -> Result<Option<HostReadyFile>, String> {
    let Some(host_phase) = client_ready_phase(&config.public.phase) else {
        return Ok(None);
    };
    let path = config.work_directory.join(
        host_ready_file_name(host_phase)
            .ok_or_else(|| "Packaged Host-Client E2E Host phase is invalid".to_string())?,
    );
    let ready = read_private_json(&path, "Packaged Host-Client E2E Host-ready file")?;
    validate_host_ready_file(config, &ready, host_phase)?;
    Ok(Some(ready))
}

fn read_pair_target_generation(config: &ResolvedConfiguration) -> Result<u64, String> {
    let path = config
        .work_directory
        .join(result_file_name(CLIENT_ROLE, CLIENT_PAIR_PHASE));
    let result: PairSuccessResult =
        read_private_json(&path, "Packaged Host-Client E2E pair result")?;
    if result.format != RESULT_FORMAT
        || result.status != "pass"
        || result.role != CLIENT_ROLE
        || result.phase != CLIENT_PAIR_PHASE
        || result.run_id != config.public.run_id
    {
        return Err("Packaged Host-Client E2E pair-result identity mismatch".to_string());
    }
    let completion = PackagedHostClientE2eClientCompletion {
        role: result.role.clone(),
        phase: result.phase.clone(),
        run_id: result.run_id.clone(),
        library_id: result.completion.library_id.clone(),
        spool_id: result.completion.spool_id.clone(),
        local_weight_g: result.completion.local_weight_g,
        host_weight_g: result.completion.host_weight_g,
        cache_weight_g: result.completion.cache_weight_g,
        target_generation: result.completion.target_generation,
        live_read_failed: result.completion.live_read_failed,
        live_write_failed: result.completion.live_write_failed,
        paired_before_cleanup: result.completion.paired_before_cleanup,
        auth_cleared: result.completion.auth_cleared,
        session_renewed: result.completion.session_renewed,
    };
    validate_client_completion_for_phase(config, &completion, CLIENT_PAIR_PHASE, None)?;
    Ok(completion.target_generation)
}

fn public_configuration(
    config: &ResolvedConfiguration,
) -> Result<PackagedHostClientE2eConfiguration, String> {
    let mut public = config.public.clone();
    if public.role == CLIENT_ROLE && public.phase != CLIENT_CLEANUP_PHASE {
        let ready = read_host_ready_for_client(config)?
            .ok_or_else(|| "Packaged Host-Client E2E Host-ready file is required".to_string())?;
        public.base_url = Some(ready.base_url);
        if public.phase == CLIENT_PAIR_PHASE {
            public.pairing_url = ready.pairing_url;
        } else {
            public.target_generation = Some(read_pair_target_generation(config)?);
        }
    } else if public.role == HOST_ROLE {
        public.base_url = Some(direct_base_url(public.listen_port));
    }
    Ok(public)
}

fn validate_client_completion(
    config: &ResolvedConfiguration,
    completion: &PackagedHostClientE2eClientCompletion,
    expected_target_generation: Option<u64>,
) -> Result<(), String> {
    validate_client_completion_for_phase(
        config,
        completion,
        &config.public.phase,
        expected_target_generation,
    )
}

fn validate_client_completion_for_phase(
    config: &ResolvedConfiguration,
    completion: &PackagedHostClientE2eClientCompletion,
    expected_phase: &str,
    expected_target_generation: Option<u64>,
) -> Result<(), String> {
    if config.public.role != CLIENT_ROLE
        || completion.role != CLIENT_ROLE
        || completion.phase != expected_phase
        || completion.run_id != config.public.run_id
        || completion.library_id != LIBRARY_ID
        || completion.spool_id != SPOOL_ID
        || completion.local_weight_g != CLIENT_SHADOW_WEIGHT_G
        || completion.target_generation == 0
        || expected_target_generation
            .is_some_and(|expected| completion.target_generation != expected)
        || !completion.paired_before_cleanup
    {
        return Err("Packaged Host-Client E2E Client completion data mismatch".to_string());
    }

    let phase_matches = match completion.phase.as_str() {
        CLIENT_PAIR_PHASE => {
            completion.host_weight_g == Some(PAIRED_WEIGHT_G)
                && completion.cache_weight_g == PAIRED_WEIGHT_G
                && !completion.live_read_failed
                && !completion.live_write_failed
                && !completion.auth_cleared
                && !completion.session_renewed
        }
        CLIENT_OFFLINE_PHASE => {
            completion.host_weight_g.is_none()
                && completion.cache_weight_g == PAIRED_WEIGHT_G
                && completion.live_read_failed
                && completion.live_write_failed
                && !completion.auth_cleared
                && !completion.session_renewed
        }
        CLIENT_RECOVER_PHASE => {
            completion.host_weight_g == Some(RECOVERED_WEIGHT_G)
                && completion.cache_weight_g == RECOVERED_WEIGHT_G
                && !completion.live_read_failed
                && !completion.live_write_failed
                && completion.auth_cleared
                && completion.session_renewed
        }
        _ => false,
    };
    if !phase_matches {
        return Err("Packaged Host-Client E2E phase evidence mismatch".to_string());
    }
    Ok(())
}

fn validate_cleanup_completion(
    config: &ResolvedConfiguration,
    completion: &PackagedHostClientE2eCleanupCompletion,
) -> Result<(), String> {
    validate_identity(
        config,
        &completion.role,
        &completion.phase,
        &completion.run_id,
    )?;
    if completion.role != CLIENT_ROLE
        || completion.phase != CLIENT_CLEANUP_PHASE
        || !completion.auth_cleared
    {
        return Err("Packaged Host-Client E2E cleanup evidence mismatch".to_string());
    }
    Ok(())
}

fn verify_cleanup_auth_absent(
    state: &AppState,
    config: &ResolvedConfiguration,
) -> Result<(), String> {
    let settings = crate::with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let expected_host = direct_base_url(config.public.listen_port);
    let target_is_exact_client = if settings.mode == "CLIENT" {
        settings.library_id == LIBRARY_ID
            && settings
                .host_base_url
                .as_deref()
                .map(normalize_library_sync_base_url)
                .transpose()?
                .as_deref()
                == Some(expected_host.as_str())
    } else {
        false
    };
    let target_is_fresh_standalone =
        settings.mode == "STANDALONE" && settings.host_base_url.is_none();
    if (!target_is_exact_client && !target_is_fresh_standalone)
        || settings.client_auth_paired
        || settings.client_auth_paired_at.is_some()
        || settings.client_auth_expires_at.is_some()
    {
        return Err(
            "Packaged Host-Client E2E cleanup retained authentication metadata".to_string(),
        );
    }
    if state.library_sync_auth.current()?.is_some() {
        return Err("Packaged Host-Client E2E cleanup retained runtime authentication".to_string());
    }
    match load_library_sync_device_token_bytes_optional(state, &expected_host) {
        Ok(None) => Ok(()),
        Ok(Some(_)) => {
            Err("Packaged Host-Client E2E cleanup retained its platform credential".to_string())
        }
        Err(_) => Err(
            "Packaged Host-Client E2E cleanup could not verify platform credential deletion"
                .to_string(),
        ),
    }
}

fn validate_stop_file(config: &ResolvedConfiguration, stop: &HostStopFile) -> Result<(), String> {
    if stop.format != STOP_FORMAT {
        return Err("Packaged Host-Client E2E stop format mismatch".to_string());
    }
    validate_identity(config, &stop.role, &stop.phase, &stop.run_id)
}

fn safe_failure_step(value: &str) -> String {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        "unknown".to_string()
    } else {
        value.to_string()
    }
}

pub(crate) fn allows_packaged_host_client_multi_instance() -> bool {
    active_configuration().is_ok_and(|config| config.is_some())
}

pub(crate) fn allows_packaged_host_client_host_loopback() -> bool {
    active_configuration()
        .is_ok_and(|config| config.is_some_and(|config| config.public.role == HOST_ROLE))
}

pub(crate) fn allows_packaged_host_client_host_loopback_selection(
    state: &AppState,
    interface_name: &str,
    interface_address: &str,
    port: u16,
) -> bool {
    require_active_configuration_for_state(state).is_ok_and(|config| {
        config.public.role == HOST_ROLE
            && interface_name == HOST_LOOPBACK_INTERFACE_NAME
            && interface_address == LOOPBACK_ADDRESS
            && port == config.public.listen_port
    })
}

fn allows_client_loopback_base_url_for_config(
    config: &ResolvedConfiguration,
    base_url: &str,
    pairing_only: bool,
) -> bool {
    config.public.role == CLIENT_ROLE
        && config.public.phase != CLIENT_CLEANUP_PHASE
        && (!pairing_only || config.public.phase == CLIENT_PAIR_PHASE)
        && base_url == direct_base_url(config.public.listen_port)
}

pub(crate) fn allows_packaged_host_client_pairing_loopback_base_url(base_url: &str) -> bool {
    active_configuration().is_ok_and(|config| {
        config.is_some_and(|config| {
            allows_client_loopback_base_url_for_config(&config, base_url, true)
        })
    })
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) fn allows_packaged_host_client_credential_loopback_base_url(base_url: &str) -> bool {
    active_configuration().is_ok_and(|config| {
        config.is_some_and(|config| {
            allows_client_loopback_base_url_for_config(&config, base_url, false)
        })
    })
}

#[tauri::command]
pub(crate) fn get_packaged_host_client_e2e_configuration(
    state: tauri::State<'_, AppState>,
) -> Result<Option<PackagedHostClientE2eConfiguration>, String> {
    if active_configuration()?.is_none() {
        return Ok(None);
    }
    let config = require_active_configuration_for_state(&state)?;
    public_configuration(&config).map(Some)
}

#[tauri::command]
pub(crate) async fn host_packaged_host_client_e2e_ready_and_wait_for_stop(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PackagedHostClientE2eHostWaitInput,
) -> Result<(), String> {
    let config = require_active_configuration_for_state(&state)?;
    validate_host_wait_input(&config, &input)?;
    let ready_path = config.work_directory.join(
        host_ready_file_name(&config.public.phase)
            .ok_or_else(|| "Packaged Host-Client E2E Host phase is invalid".to_string())?,
    );
    let ready = HostReadyFile {
        format: READY_FORMAT.to_string(),
        role: HOST_ROLE.to_string(),
        phase: config.public.phase.clone(),
        run_id: config.public.run_id.clone(),
        library_id: LIBRARY_ID.to_string(),
        spool_id: SPOOL_ID.to_string(),
        listen_port: config.public.listen_port,
        base_url: input.base_url,
        pairing_url: input.pairing_url,
    };
    write_private_json(
        &ready_path,
        &ready,
        "Packaged Host-Client E2E Host-ready file",
    )?;

    let stop_path = config.work_directory.join(
        host_stop_file_name(&config.public.phase)
            .ok_or_else(|| "Packaged Host-Client E2E Host phase is invalid".to_string())?,
    );
    loop {
        match stop_path.symlink_metadata() {
            Ok(_) => {
                let stop: HostStopFile =
                    read_private_json(&stop_path, "Packaged Host-Client E2E Host-stop file")?;
                validate_stop_file(&config, &stop)?;
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(error) => {
                return Err(format!(
                    "Inspect Packaged Host-Client E2E Host-stop file: {error}"
                ));
            }
        }
    }

    let completion = HostCompletion {
        library_id: LIBRARY_ID.to_string(),
        spool_id: SPOOL_ID.to_string(),
        listen_port: config.public.listen_port,
        pairing_issued: config.public.phase == HOST_GENERATION_1_PHASE,
    };
    write_private_json(
        &config.result_path,
        &SuccessResult {
            format: RESULT_FORMAT,
            status: "pass",
            role: &config.public.role,
            phase: &config.public.phase,
            run_id: &config.public.run_id,
            completion: &completion,
        },
        "Packaged Host-Client E2E Host result",
    )?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub(crate) fn complete_packaged_host_client_e2e(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PackagedHostClientE2eCompletion,
) -> Result<(), String> {
    let config = require_active_configuration_for_state(&state)?;
    let completion = match &input {
        PackagedHostClientE2eCompletion::Client(completion) => {
            let expected_target_generation = match config.public.phase.as_str() {
                CLIENT_PAIR_PHASE => None,
                CLIENT_OFFLINE_PHASE | CLIENT_RECOVER_PHASE => {
                    Some(read_pair_target_generation(&config)?)
                }
                _ => {
                    return Err(
                        "Packaged Host-Client E2E Client completion phase mismatch".to_string()
                    );
                }
            };
            validate_client_completion(&config, completion, expected_target_generation)?;
            CompletionEvidence::Client(ClientCompletionEvidence::from(completion))
        }
        PackagedHostClientE2eCompletion::Cleanup(completion) => {
            validate_cleanup_completion(&config, completion)?;
            verify_cleanup_auth_absent(&state, &config)?;
            CompletionEvidence::Cleanup(CleanupCompletionEvidence {
                auth_cleared: completion.auth_cleared,
            })
        }
    };
    write_private_json(
        &config.result_path,
        &SuccessResult {
            format: RESULT_FORMAT,
            status: "pass",
            role: &config.public.role,
            phase: &config.public.phase,
            run_id: &config.public.run_id,
            completion: &completion,
        },
        "Packaged Host-Client E2E Client result",
    )?;
    app.exit(0);
    Ok(())
}

fn validated_failure_kind(
    config: &ResolvedConfiguration,
    step: &str,
    failure_kind: PackagedHostClientE2eFailureKind,
) -> Result<PackagedHostClientE2eFailureKind, String> {
    match failure_kind {
        PackagedHostClientE2eFailureKind::Scenario => {
            Ok(PackagedHostClientE2eFailureKind::Scenario)
        }
        PackagedHostClientE2eFailureKind::PortInUse
            if config.public.role == HOST_ROLE
                && matches!(step, "enable-host-runtime" | "wait-host-ready") =>
        {
            Ok(PackagedHostClientE2eFailureKind::PortInUse)
        }
        PackagedHostClientE2eFailureKind::PortInUse => {
            Err("Packaged Host-Client E2E failure kind is invalid".to_string())
        }
    }
}

fn write_failure_result(
    config: &ResolvedConfiguration,
    step: &str,
    failure_kind: PackagedHostClientE2eFailureKind,
) -> Result<(), String> {
    let failure_kind = validated_failure_kind(config, step, failure_kind)?;
    let step = safe_failure_step(step);
    write_private_json(
        &config.result_path,
        &FailureResult {
            format: RESULT_FORMAT,
            status: "fail",
            role: &config.public.role,
            phase: &config.public.phase,
            run_id: &config.public.run_id,
            step: &step,
            // Never persist arbitrary command errors here. They may contain the
            // one-use pairing URL or platform credential-store diagnostics.
            message: "Packaged Host-Client E2E scenario failed.",
            failure_kind,
        },
        "Packaged Host-Client E2E failure result",
    )
}

fn exit_after_failure_result(
    result: Result<(), String>,
    exit: impl FnOnce(i32),
) -> Result<(), String> {
    exit(1);
    result
}

fn fail_bootstrap_for_raw_configuration(
    raw: RawConfiguration,
    exit: impl FnOnce(i32),
) -> Result<(), String> {
    let activation = validate_activation(&raw)?
        .ok_or_else(|| "Packaged Host-Client E2E bootstrap failure is not active".to_string())?;
    let result = write_private_json(
        &activation.result_path,
        &FailureResult {
            format: RESULT_FORMAT,
            status: "fail",
            role: &activation.role,
            phase: &activation.phase,
            run_id: &activation.run_id,
            step: "bootstrap",
            message: "Packaged Host-Client E2E scenario failed.",
            failure_kind: PackagedHostClientE2eFailureKind::Scenario,
        },
        "Packaged Host-Client E2E bootstrap failure result",
    );
    exit_after_failure_result(result, exit)
}

#[tauri::command]
pub(crate) fn fail_packaged_host_client_e2e(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PackagedHostClientE2eFailure,
) -> Result<(), String> {
    let config = require_active_configuration_for_state(&state)?;
    validate_identity(&config, &input.role, &input.phase, &input.run_id)?;
    let _ = input.message;
    let result = write_failure_result(&config, &input.step, input.failure_kind);
    exit_after_failure_result(result, |code| app.exit(code))
}

#[tauri::command]
pub(crate) fn fail_packaged_host_client_e2e_bootstrap(app: tauri::AppHandle) -> Result<(), String> {
    // A normal IPC invoke, absent gate, or stale/malformed environment must
    // never terminate the desktop app. Once the exact private marker and
    // role/phase/run identity are independently validated, however, publish a
    // safe failure and terminate even if later configuration (port/database)
    // is invalid so the outer runner cannot sit on its full launch timeout.
    let raw = raw_configuration_from_process()?;
    fail_bootstrap_for_raw_configuration(raw, |code| app.exit(code))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use filament_manager_core::backend::filament_database::FilamentDatabase;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static FIXTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

    pub(super) fn private_fixture(role: &str, phase: &str) -> (PathBuf, String, RawConfiguration) {
        let fixture_sequence = FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let run_id = format!(
            "host-client-e2e-{}-{}-{fixture_sequence}",
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
        for file_name in [HOST_DATABASE_FILE_NAME, CLIENT_DATABASE_FILE_NAME] {
            std::fs::write(directory.join(file_name), b"sqlite-placeholder")
                .expect("write database");
        }
        #[cfg(unix)]
        for path in [
            marker_path,
            directory.join(HOST_DATABASE_FILE_NAME),
            directory.join(CLIENT_DATABASE_FILE_NAME),
        ] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .expect("secure fixture file");
        }
        let raw = RawConfiguration {
            enabled: Some("1".to_string()),
            role: Some(role.to_string()),
            phase: Some(phase.to_string()),
            run_id: Some(run_id.clone()),
            work_directory: Some(directory.to_string_lossy().into_owned()),
            port: Some("43871".to_string()),
            database_path: Some(
                directory.join(database_file_name(role).expect("fixture role database")),
            ),
        };
        (directory, run_id, raw)
    }

    fn resolved_fixture(role: &str, phase: &str) -> (PathBuf, ResolvedConfiguration) {
        let (directory, _, raw) = private_fixture(role, phase);
        let config = resolve_configuration(raw)
            .expect("resolve fixture")
            .expect("active fixture");
        (directory, config)
    }

    fn cleanup_verification_fixture(
        credential_store: CredentialStore,
        configure_client_target: bool,
    ) -> (PathBuf, ResolvedConfiguration, AppState) {
        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_CLEANUP_PHASE);
        std::fs::remove_file(&config.database_path).expect("remove placeholder Client database");
        let db = FilamentDatabase::open(&config.database_path).expect("create Client database");
        db.apply_schema().expect("apply Client schema");
        let profile_id = db
            .initialize_fresh_credential_store_profile()
            .expect("initialize Client credential profile");
        if configure_client_target {
            let mut settings = db
                .get_library_sync_settings()
                .expect("read Client settings");
            settings.mode = "CLIENT".to_string();
            settings.library_id = LIBRARY_ID.to_string();
            settings.host_base_url = Some(direct_base_url(config.public.listen_port));
            db.save_library_sync_settings(&settings)
                .expect("save Client settings");
        }
        drop(db);
        let state = AppState {
            db_path: config.database_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: credential_store
                .scoped_to_profile_id(&profile_id)
                .expect("scope Client credential store"),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        (directory, config, state)
    }

    fn pair_completion(config: &ResolvedConfiguration) -> PackagedHostClientE2eClientCompletion {
        PackagedHostClientE2eClientCompletion {
            role: CLIENT_ROLE.to_string(),
            phase: CLIENT_PAIR_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            local_weight_g: CLIENT_SHADOW_WEIGHT_G,
            host_weight_g: Some(PAIRED_WEIGHT_G),
            cache_weight_g: PAIRED_WEIGHT_G,
            target_generation: 7,
            live_read_failed: false,
            live_write_failed: false,
            paired_before_cleanup: true,
            auth_cleared: false,
            session_renewed: false,
        }
    }

    fn write_ready_and_pair_result(
        config: &ResolvedConfiguration,
        host_phase: &str,
        target_generation: u64,
    ) {
        let pairing_url = (host_phase == HOST_GENERATION_1_PHASE).then(|| {
            format!(
                "http://fm-test.local:{}/companion?pairing={}",
                config.public.listen_port,
                "a".repeat(48)
            )
        });
        let ready = HostReadyFile {
            format: READY_FORMAT.to_string(),
            role: HOST_ROLE.to_string(),
            phase: host_phase.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            listen_port: config.public.listen_port,
            base_url: direct_base_url(config.public.listen_port),
            pairing_url,
        };
        write_private_json(
            &config
                .work_directory
                .join(host_ready_file_name(host_phase).expect("fixture Host-ready file name")),
            &ready,
            "fixture Host-ready file",
        )
        .expect("write Host-ready fixture");

        let mut completion = pair_completion(config);
        completion.target_generation = target_generation;
        let evidence = ClientCompletionEvidence::from(&completion);
        write_private_json(
            &config
                .work_directory
                .join(result_file_name(CLIENT_ROLE, CLIENT_PAIR_PHASE)),
            &SuccessResult {
                format: RESULT_FORMAT,
                status: "pass",
                role: CLIENT_ROLE,
                phase: CLIENT_PAIR_PHASE,
                run_id: &config.public.run_id,
                completion: &evidence,
            },
            "fixture pair result",
        )
        .expect("write pair-result fixture");
    }

    #[test]
    fn gate_is_absent_or_fail_closed_until_every_field_is_valid() {
        assert!(resolve_configuration(RawConfiguration::default())
            .expect("resolve absent gate")
            .is_none());
        assert!(resolve_configuration(RawConfiguration {
            enabled: Some("true".to_string()),
            ..RawConfiguration::default()
        })
        .expect_err("reject non-exact gate")
        .contains("must be exactly 1"));

        let (directory, _, mut raw) = private_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        raw.phase = Some(CLIENT_PAIR_PHASE.to_string());
        assert!(resolve_configuration(raw)
            .expect_err("reject role-phase mismatch")
            .contains("incompatible"));
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn gate_requires_the_exact_role_database_and_canonical_port() {
        let (directory, _, mut raw) = private_fixture(CLIENT_ROLE, CLIENT_PAIR_PHASE);
        raw.database_path = Some(directory.join(HOST_DATABASE_FILE_NAME));
        assert!(resolve_configuration(raw.clone())
            .expect_err("reject other role database")
            .contains("validated role"));
        raw.database_path = Some(directory.join(CLIENT_DATABASE_FILE_NAME));
        raw.port = Some("043871".to_string());
        assert!(resolve_configuration(raw)
            .expect_err("reject non-canonical port")
            .contains("canonical port"));
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn gate_rejects_marker_reuse_and_missing_sibling_database() {
        let (directory, _, raw) = private_fixture(HOST_ROLE, HOST_GENERATION_2_PHASE);
        std::fs::write(
            directory.join(MARKER_FILE_NAME),
            format!("{MARKER_FORMAT}\nwrong-run-id-value\n"),
        )
        .expect("replace marker");
        assert!(resolve_configuration(raw.clone())
            .expect_err("reject marker mismatch")
            .contains("does not match"));

        let (_, run_id, mut raw) = private_fixture(HOST_ROLE, HOST_GENERATION_2_PHASE);
        let second_directory = PathBuf::from(raw.work_directory.as_ref().expect("work dir"));
        std::fs::remove_file(second_directory.join(CLIENT_DATABASE_FILE_NAME))
            .expect("remove client database");
        assert!(resolve_configuration(raw.clone())
            .expect_err("reject missing isolated database")
            .contains("database"));
        raw.run_id = Some(run_id);
        let _ = std::fs::remove_dir_all(directory);
        let _ = std::fs::remove_dir_all(second_directory);
    }

    #[test]
    fn client_loopback_allowance_is_role_phase_and_url_exact() {
        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_PAIR_PHASE);
        let base_url = direct_base_url(config.public.listen_port);
        assert!(allows_client_loopback_base_url_for_config(
            &config, &base_url, true
        ));
        assert!(!allows_client_loopback_base_url_for_config(
            &config,
            "http://localhost:43871",
            true
        ));

        let (host_directory, host) = resolved_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        assert!(!allows_client_loopback_base_url_for_config(
            &host, &base_url, false
        ));
        let _ = std::fs::remove_dir_all(directory);
        let _ = std::fs::remove_dir_all(host_directory);
    }

    #[test]
    fn host_readiness_requires_a_one_use_pairing_url_only_for_generation_one() {
        let (directory, config) = resolved_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        let input = PackagedHostClientE2eHostWaitInput {
            role: HOST_ROLE.to_string(),
            phase: HOST_GENERATION_1_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            base_url: direct_base_url(config.public.listen_port),
            pairing_url: Some(format!(
                "http://fm-test.local:{}/companion?pairing={}",
                config.public.listen_port,
                "a".repeat(48)
            )),
        };
        validate_host_wait_input(&config, &input).expect("valid first generation readiness");
        let mut invalid = input.clone();
        invalid.pairing_url = Some(format!(
            "http://fm-test.local:{}/companion?pairing={}&leak=1",
            config.public.listen_port,
            "a".repeat(48)
        ));
        assert!(validate_host_wait_input(&config, &invalid).is_err());
        let _ = std::fs::remove_dir_all(directory);

        let (directory, config) = resolved_fixture(HOST_ROLE, HOST_GENERATION_2_PHASE);
        let input = PackagedHostClientE2eHostWaitInput {
            role: HOST_ROLE.to_string(),
            phase: HOST_GENERATION_2_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            base_url: direct_base_url(config.public.listen_port),
            pairing_url: None,
        };
        validate_host_wait_input(&config, &input).expect("valid recovery readiness");
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn client_rejects_host_readiness_for_a_different_spool() {
        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_PAIR_PHASE);
        let mut ready = HostReadyFile {
            format: READY_FORMAT.to_string(),
            role: HOST_ROLE.to_string(),
            phase: HOST_GENERATION_1_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            listen_port: config.public.listen_port,
            base_url: direct_base_url(config.public.listen_port),
            pairing_url: Some(format!(
                "http://fm-test.local:{}/companion?pairing={}",
                config.public.listen_port,
                "a".repeat(48)
            )),
        };
        validate_host_ready_file(&config, &ready, HOST_GENERATION_1_PHASE)
            .expect("valid Host-ready spool identity");
        ready.spool_id = "packaged_host_client_wrong_spool".to_string();
        assert!(validate_host_ready_file(&config, &ready, HOST_GENERATION_1_PHASE).is_err());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn client_completion_requires_exact_phase_evidence_and_generation() {
        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_PAIR_PHASE);
        let completion = pair_completion(&config);
        validate_client_completion(&config, &completion, None).expect("valid pair evidence");
        let mut invalid = completion;
        invalid.cache_weight_g = RECOVERED_WEIGHT_G;
        assert!(validate_client_completion(&config, &invalid, None).is_err());
        let _ = std::fs::remove_dir_all(directory);

        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_OFFLINE_PHASE);
        let completion = PackagedHostClientE2eClientCompletion {
            role: CLIENT_ROLE.to_string(),
            phase: CLIENT_OFFLINE_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            local_weight_g: CLIENT_SHADOW_WEIGHT_G,
            host_weight_g: None,
            cache_weight_g: PAIRED_WEIGHT_G,
            target_generation: 7,
            live_read_failed: true,
            live_write_failed: true,
            paired_before_cleanup: true,
            auth_cleared: false,
            session_renewed: false,
        };
        validate_client_completion(&config, &completion, Some(7)).expect("valid offline evidence");
        assert!(validate_client_completion(&config, &completion, Some(8)).is_err());
        let _ = std::fs::remove_dir_all(directory);

        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_RECOVER_PHASE);
        let mut completion = PackagedHostClientE2eClientCompletion {
            role: CLIENT_ROLE.to_string(),
            phase: CLIENT_RECOVER_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            library_id: LIBRARY_ID.to_string(),
            spool_id: SPOOL_ID.to_string(),
            local_weight_g: CLIENT_SHADOW_WEIGHT_G,
            host_weight_g: Some(RECOVERED_WEIGHT_G),
            cache_weight_g: RECOVERED_WEIGHT_G,
            target_generation: 7,
            live_read_failed: false,
            live_write_failed: false,
            paired_before_cleanup: true,
            auth_cleared: true,
            session_renewed: true,
        };
        validate_client_completion(&config, &completion, Some(7))
            .expect("valid recovery and credential cleanup evidence");
        completion.auth_cleared = false;
        assert!(validate_client_completion(&config, &completion, Some(7)).is_err());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn offline_and_recover_configuration_reuse_the_validated_pair_generation() {
        for (client_phase, host_phase) in [
            (CLIENT_OFFLINE_PHASE, HOST_GENERATION_1_PHASE),
            (CLIENT_RECOVER_PHASE, HOST_GENERATION_2_PHASE),
        ] {
            let (directory, config) = resolved_fixture(CLIENT_ROLE, client_phase);
            write_ready_and_pair_result(&config, host_phase, 11);
            let public = public_configuration(&config).expect("resolve cross-phase configuration");
            assert_eq!(
                public.base_url.as_deref(),
                Some(direct_base_url(config.public.listen_port).as_str())
            );
            assert_eq!(public.target_generation, Some(11));
            assert!(public.pairing_url.is_none());
            let _ = std::fs::remove_dir_all(directory);
        }
    }

    #[test]
    fn cleanup_is_independent_of_host_coordination_files() {
        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_CLEANUP_PHASE);
        let completion = PackagedHostClientE2eCleanupCompletion {
            role: CLIENT_ROLE.to_string(),
            phase: CLIENT_CLEANUP_PHASE.to_string(),
            run_id: config.public.run_id.clone(),
            auth_cleared: true,
        };
        validate_cleanup_completion(&config, &completion).expect("valid cleanup evidence");
        let public = public_configuration(&config).expect("cleanup config without Host files");
        assert!(public.base_url.is_none());
        assert!(public.pairing_url.is_none());
        assert!(public.target_generation.is_none());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn cleanup_verification_accepts_absent_platform_credentials() {
        for configure_client_target in [false, true] {
            let (directory, config, state) =
                cleanup_verification_fixture(CredentialStore::in_memory(), configure_client_target);
            verify_cleanup_auth_absent(&state, &config)
                .expect("verify empty profile-scoped credential store");
            drop(state);
            let _ = std::fs::remove_dir_all(directory);
        }
    }

    #[test]
    fn cleanup_verification_rejects_retained_platform_credential() {
        let (directory, config, state) =
            cleanup_verification_fixture(CredentialStore::in_memory(), true);
        crate::library_sync_host_client::store_library_sync_device_token(
            &state,
            &direct_base_url(config.public.listen_port),
            "packaged-host-client-test-token",
        )
        .expect("store retained Client token");
        assert!(verify_cleanup_auth_absent(&state, &config)
            .expect_err("reject retained platform credential")
            .contains("retained its platform credential"));
        drop(state);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn cleanup_verification_fails_closed_on_platform_credential_read_error() {
        let (directory, config, state) =
            cleanup_verification_fixture(CredentialStore::in_memory_with_read_failures(1), true);
        assert!(verify_cleanup_auth_absent(&state, &config)
            .expect_err("reject unavailable platform credential verification")
            .contains("could not verify platform credential deletion"));
        drop(state);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn cleanup_verification_rejects_retained_runtime_authentication() {
        let (directory, config, state) =
            cleanup_verification_fixture(CredentialStore::in_memory(), true);
        state
            .library_sync_auth
            .replace(
                direct_base_url(config.public.listen_port),
                "session-id",
                "csrf-token",
            )
            .expect("seed runtime authentication");
        assert!(verify_cleanup_auth_absent(&state, &config)
            .expect_err("reject retained runtime authentication")
            .contains("retained runtime authentication"));
        drop(state);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn bootstrap_failure_result_uses_validated_identity_and_static_copy() {
        let (directory, config) = resolved_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        write_failure_result(
            &config,
            "bootstrap",
            PackagedHostClientE2eFailureKind::Scenario,
        )
        .expect("write safe bootstrap failure");
        let value: serde_json::Value = read_private_json(
            &config.result_path,
            "Packaged Host-Client E2E bootstrap failure fixture",
        )
        .expect("read safe bootstrap failure");
        assert_eq!(value["format"], RESULT_FORMAT);
        assert_eq!(value["status"], "fail");
        assert_eq!(value["role"], HOST_ROLE);
        assert_eq!(value["phase"], HOST_GENERATION_1_PHASE);
        assert_eq!(value["run_id"], config.public.run_id);
        assert_eq!(value["step"], "bootstrap");
        assert_eq!(value["failure_kind"], "scenario");
        assert_eq!(
            value["message"],
            "Packaged Host-Client E2E scenario failed."
        );
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn bootstrap_failure_does_not_exit_without_a_valid_private_activation() {
        let absent_exit_code = std::cell::Cell::new(None);
        assert!(
            fail_bootstrap_for_raw_configuration(RawConfiguration::default(), |code| {
                absent_exit_code.set(Some(code))
            },)
            .expect_err("normal app bootstrap failure command must be unavailable")
            .contains("not active")
        );
        assert_eq!(absent_exit_code.get(), None);

        let (directory, _, raw) = private_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        std::fs::write(
            directory.join(MARKER_FILE_NAME),
            format!("{MARKER_FORMAT}\nwrong-run-id-value\n"),
        )
        .expect("replace marker");
        let malformed_exit_code = std::cell::Cell::new(None);
        assert!(fail_bootstrap_for_raw_configuration(raw, |code| {
            malformed_exit_code.set(Some(code))
        })
        .expect_err("malformed activation must not request process exit")
        .contains("does not match"));
        assert_eq!(malformed_exit_code.get(), None);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn bootstrap_failure_exits_after_activation_even_when_later_configuration_is_invalid() {
        let (directory, _, mut raw) = private_fixture(CLIENT_ROLE, CLIENT_RECOVER_PHASE);
        raw.port = None;
        raw.database_path = None;
        assert!(resolve_configuration(raw.clone())
            .expect_err("full configuration must remain invalid")
            .contains(PORT_ENV_VAR));

        let exit_code = std::cell::Cell::new(None);
        fail_bootstrap_for_raw_configuration(raw, |code| exit_code.set(Some(code)))
            .expect("persist safe bootstrap failure after activation");
        assert_eq!(exit_code.get(), Some(1));
        let result_path = directory.join(result_file_name(CLIENT_ROLE, CLIENT_RECOVER_PHASE));
        let value: serde_json::Value = read_private_json(
            &result_path,
            "Packaged Host-Client E2E partial bootstrap failure fixture",
        )
        .expect("read safe bootstrap failure");
        assert_eq!(value["status"], "fail");
        assert_eq!(value["role"], CLIENT_ROLE);
        assert_eq!(value["phase"], CLIENT_RECOVER_PHASE);
        assert_eq!(value["step"], "bootstrap");
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn failure_exit_runs_even_when_result_persistence_fails() {
        let exit_code = std::cell::Cell::new(None);
        let result =
            exit_after_failure_result(Err("synthetic result write failure".to_string()), |code| {
                exit_code.set(Some(code))
            });
        assert_eq!(exit_code.get(), Some(1));
        assert_eq!(result.unwrap_err(), "synthetic result write failure");
    }

    #[test]
    fn port_collision_failure_kind_is_host_and_step_scoped() {
        let (directory, config) = resolved_fixture(HOST_ROLE, HOST_GENERATION_1_PHASE);
        assert_eq!(
            validated_failure_kind(
                &config,
                "enable-host-runtime",
                PackagedHostClientE2eFailureKind::PortInUse,
            )
            .expect("accept exact Host bind collision"),
            PackagedHostClientE2eFailureKind::PortInUse
        );
        assert!(validated_failure_kind(
            &config,
            "create-host-spool",
            PackagedHostClientE2eFailureKind::PortInUse,
        )
        .is_err());
        assert_eq!(
            validated_failure_kind(
                &config,
                "wait-host-ready",
                PackagedHostClientE2eFailureKind::Scenario,
            )
            .expect("accept generic scenario failure"),
            PackagedHostClientE2eFailureKind::Scenario
        );
        let _ = std::fs::remove_dir_all(directory);

        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_PAIR_PHASE);
        assert!(validated_failure_kind(
            &config,
            "wait-host-ready",
            PackagedHostClientE2eFailureKind::PortInUse,
        )
        .is_err());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn result_json_keeps_identity_only_in_the_envelope() {
        fn sorted_keys(value: &serde_json::Value) -> Vec<String> {
            let mut keys = value
                .as_object()
                .expect("JSON object")
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            keys.sort();
            keys
        }

        let expected_outer = vec![
            "completion".to_string(),
            "format".to_string(),
            "phase".to_string(),
            "role".to_string(),
            "run_id".to_string(),
            "status".to_string(),
        ];
        let mut expected_client = vec![
            "auth_cleared",
            "cache_weight_g",
            "host_weight_g",
            "library_id",
            "live_read_failed",
            "live_write_failed",
            "local_weight_g",
            "paired_before_cleanup",
            "session_renewed",
            "spool_id",
            "target_generation",
        ]
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
        expected_client.sort();

        for phase in [CLIENT_PAIR_PHASE, CLIENT_RECOVER_PHASE] {
            let (directory, config) = resolved_fixture(CLIENT_ROLE, phase);
            let mut input = pair_completion(&config);
            input.phase = phase.to_string();
            if phase == CLIENT_RECOVER_PHASE {
                input.host_weight_g = Some(RECOVERED_WEIGHT_G);
                input.cache_weight_g = RECOVERED_WEIGHT_G;
                input.auth_cleared = true;
                input.session_renewed = true;
            }
            let evidence = CompletionEvidence::Client(ClientCompletionEvidence::from(&input));
            let value = serde_json::to_value(SuccessResult {
                format: RESULT_FORMAT,
                status: "pass",
                role: CLIENT_ROLE,
                phase,
                run_id: &config.public.run_id,
                completion: &evidence,
            })
            .expect("serialize Client result");
            assert_eq!(sorted_keys(&value), expected_outer);
            assert_eq!(sorted_keys(&value["completion"]), expected_client);
            assert!(value["completion"].get("role").is_none());
            assert!(value["completion"].get("phase").is_none());
            assert!(value["completion"].get("run_id").is_none());
            let _ = std::fs::remove_dir_all(directory);
        }

        let (directory, config) = resolved_fixture(CLIENT_ROLE, CLIENT_CLEANUP_PHASE);
        let evidence =
            CompletionEvidence::Cleanup(CleanupCompletionEvidence { auth_cleared: true });
        let value = serde_json::to_value(SuccessResult {
            format: RESULT_FORMAT,
            status: "pass",
            role: CLIENT_ROLE,
            phase: CLIENT_CLEANUP_PHASE,
            run_id: &config.public.run_id,
            completion: &evidence,
        })
        .expect("serialize cleanup result");
        assert_eq!(sorted_keys(&value), expected_outer);
        assert_eq!(
            sorted_keys(&value["completion"]),
            vec!["auth_cleared".to_string()]
        );
        let _ = std::fs::remove_dir_all(directory);
    }
}
