//! Policy for migrating an owned legacy login agent to its bundled SMAppService.
//! Native registration and preference persistence are injected so policy tests
//! never register jobs or change the logged-in user's background permissions.
use crate::macos_autostart::{self as legacy, LegacySnapshot};
use crate::macos_service_management::ServiceStatus;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, Metadata, OpenOptions};
use std::io::Read;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

const LEGACY_FILE: &str = "no.bliatun.filamentmanager.plist";
const SERVICE_LABEL: &str = "no.bliatun.filamentmanager.background";
const SERVICE_PLIST: &str =
    "Contents/Library/LaunchAgents/no.bliatun.filamentmanager.background.plist";
const HELPER_PROGRAM: &str = "Contents/MacOS/filament-manager-login-helper";

pub(crate) trait Backend {
    fn status(&mut self) -> Result<ServiceStatus, String>;
    fn legacy_allowed(&mut self, plist: &Path) -> Result<bool, String>;
    fn register(&mut self) -> Result<ServiceStatus, String>;
    fn unregister(&mut self) -> Result<(), String>;
    fn registration_record(&mut self) -> Option<String>;
    fn store_registration_record(&mut self, record: Option<&str>) -> Result<(), String>;
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RegistrationRecord {
    executable: PathBuf,
    fingerprint: String,
    migration_pending: bool,
    #[serde(default)]
    refresh_pending: bool,
    #[serde(default)]
    disable_pending: bool,
}

struct State {
    executable: PathBuf,
    legacy: Option<LegacySnapshot>,
    service: ServiceStatus,
    record: Option<RegistrationRecord>,
}

fn error(message: impl std::fmt::Display) -> String {
    format!("Could not manage Filament Manager launch at login: {message}")
}

fn read_state(
    directory: &Path,
    executable: &Path,
    backend: &mut impl Backend,
) -> Result<State, String> {
    let executable = legacy::validate_installed_executable(executable)?;
    let legacy = legacy::inspect_registration(directory, &executable)?;
    let record = backend
        .registration_record()
        .map(|json| serde_json::from_str::<RegistrationRecord>(&json).map_err(error))
        .transpose()?;
    if let Some(record) = &record {
        if record.executable != executable {
            return Err(error(
                "the background service belongs to another application copy",
            ));
        }
        if record.fingerprint.len() != 64
            || !record
                .fingerprint
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(error("the background service ownership record is invalid"));
        }
        if [
            record.migration_pending,
            record.refresh_pending,
            record.disable_pending,
        ]
        .into_iter()
        .filter(|pending| *pending)
        .count()
            > 1
        {
            return Err(error(
                "the background service ownership record has conflicting operations",
            ));
        }
    }
    let mut service = backend.status()?;
    if service == ServiceStatus::NotFound && record.is_none() {
        // macOS also reports NotFound for a bundled agent it has never seen.
        // Only a complete, recognized bundle can be treated as a first install.
        fingerprint(&executable)?;
        service = ServiceStatus::NotRegistered;
    }
    if !matches!(
        service,
        ServiceStatus::NotRegistered | ServiceStatus::RequiresApproval
    ) && record.is_none()
    {
        return Err(error(format!(
            "the background service ({service:?}) has no matching application ownership record"
        )));
    }
    Ok(State {
        executable,
        legacy,
        service,
        record,
    })
}

fn save_record(backend: &mut impl Backend, record: &RegistrationRecord) -> Result<(), String> {
    let json = serde_json::to_string(record).map_err(error)?;
    backend.store_registration_record(Some(&json))
}

fn same_file(left: &Metadata, right: &Metadata) -> bool {
    left.dev() == right.dev()
        && left.ino() == right.ino()
        && left.len() == right.len()
        && left.mtime() == right.mtime()
        && left.mtime_nsec() == right.mtime_nsec()
        && left.ctime() == right.ctime()
        && left.ctime_nsec() == right.ctime_nsec()
        && left.mode() == right.mode()
        && right.nlink() == 1
        && right.is_file()
}

fn bundled_bytes(bundle: &Path, relative: &str, limit: u64) -> Result<Vec<u8>, String> {
    let path = bundle.join(relative);
    let metadata = fs::symlink_metadata(&path).map_err(error)?;
    if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() > limit {
        return Err(error(
            "the bundled login service must use regular single-link files",
        ));
    }
    if path.canonicalize().map_err(error)? != path {
        return Err(error(
            "the bundled login service must not follow symlinked paths",
        ));
    }
    let mut file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(&path)
        .map_err(error)?;
    if !same_file(&metadata, &file.metadata().map_err(error)?) {
        return Err(error("the bundled login service changed while opening it"));
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() as u64 > limit || !same_file(&metadata, &file.metadata().map_err(error)?) {
        return Err(error("the bundled login service changed while reading it"));
    }
    Ok(bytes)
}

fn fingerprint(executable: &Path) -> Result<String, String> {
    let bundle = executable
        .ancestors()
        .nth(3)
        .ok_or_else(|| error("missing app bundle"))?;
    let plist = bundled_bytes(bundle, SERVICE_PLIST, 1024 * 1024)?;
    let value = plist::Value::from_reader(std::io::Cursor::new(&plist)).map_err(error)?;
    let dictionary = value
        .as_dictionary()
        .ok_or_else(|| error("invalid bundled login service plist"))?;
    if dictionary.len() != 3
        || dictionary.get("Label").and_then(plist::Value::as_string) != Some(SERVICE_LABEL)
        || dictionary
            .get("BundleProgram")
            .and_then(plist::Value::as_string)
            != Some(HELPER_PROGRAM)
        || dictionary
            .get("RunAtLoad")
            .and_then(plist::Value::as_boolean)
            != Some(true)
    {
        return Err(error(
            "the bundled login service configuration is not recognized",
        ));
    }
    let helper = bundled_bytes(bundle, HELPER_PROGRAM, 32 * 1024 * 1024)?;
    let mut digest = Sha256::new();
    digest.update(b"Filament Manager bundled login service v1\0");
    digest.update((plist.len() as u64).to_be_bytes());
    digest.update(&plist);
    digest.update((helper.len() as u64).to_be_bytes());
    digest.update(&helper);
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// A denied legacy job is not consent to create a new modern service.
fn legacy_allowed(directory: &Path, backend: &mut impl Backend) -> Result<bool, String> {
    backend.legacy_allowed(&directory.join(LEGACY_FILE))
}

fn rollback(backend: &mut impl Backend) -> Result<(), String> {
    backend.unregister()?;
    backend.store_registration_record(None)
}

fn retire_or_rollback(
    directory: &Path,
    snapshot: &LegacySnapshot,
    backend: &mut impl Backend,
) -> Result<(), String> {
    if let Err(retire_error) = legacy::retire_registration(directory, snapshot) {
        return match rollback(backend) {
            Ok(()) => Err(retire_error),
            Err(rollback_error) => Err(error(format!(
                "{retire_error}; service rollback also failed: {rollback_error}"
            ))),
        };
    }
    Ok(())
}

fn register(
    directory: &Path,
    executable: &Path,
    snapshot: Option<&LegacySnapshot>,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let mut record = RegistrationRecord {
        executable: executable.to_path_buf(),
        fingerprint: fingerprint(executable)?,
        migration_pending: snapshot.is_some(),
        refresh_pending: false,
        disable_pending: false,
    };
    // Persist before the native call: a crash may occur after registration, and
    // the next launch must be able to finish or roll back that exact migration.
    save_record(backend, &record)?;
    complete_registration(directory, snapshot, &mut record, backend)
}

fn complete_registration(
    directory: &Path,
    snapshot: Option<&LegacySnapshot>,
    record: &mut RegistrationRecord,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let service = match backend.register() {
        Ok(service) => service,
        Err(register_error) => {
            if matches!(backend.status(), Ok(ServiceStatus::NotRegistered)) {
                backend.store_registration_record(None)?;
            }
            return Err(register_error);
        }
    };
    match service {
        ServiceStatus::NotRegistered => {
            backend.store_registration_record(None)?;
            return Err(error("macOS did not register the background service"));
        }
        ServiceStatus::NotFound => {
            return Err(error("macOS could not find the bundled background service"))
        }
        ServiceStatus::Enabled | ServiceStatus::RequiresApproval => {}
    }
    if let Some(snapshot) = snapshot {
        // RequiresApproval must retire the legacy job too, otherwise the old
        // agent would bypass the user's modern background activity permission.
        let allowed = legacy_allowed(directory, backend);
        if !matches!(allowed, Ok(true)) {
            rollback(backend)?;
            return Err(allowed.err().unwrap_or_else(|| {
                error("legacy background permission changed during registration")
            }));
        }
        retire_or_rollback(directory, snapshot, backend)?;
    }
    if record.migration_pending || record.refresh_pending {
        record.migration_pending = false;
        record.refresh_pending = false;
        save_record(backend, record)?;
    }
    Ok(())
}

/// Returns false when recovery rolled back an interrupted migration. Do not
/// immediately migrate again in the same call after observing an opt-out.
fn recover_pending(
    directory: &Path,
    state: &mut State,
    backend: &mut impl Backend,
) -> Result<bool, String> {
    if let Some(record) = state
        .record
        .as_ref()
        .filter(|record| record.disable_pending || record.migration_pending)
    {
        // A previous persistence call may have updated the process preference
        // cache but failed its disk flush. Re-establish durable intent first.
        save_record(backend, record)?;
    }
    if state
        .record
        .as_ref()
        .is_some_and(|record| record.disable_pending)
    {
        finish_disable(directory, state, backend)?;
        return Ok(false);
    }
    let Some(record) = state
        .record
        .as_mut()
        .filter(|record| record.migration_pending)
    else {
        return Ok(true);
    };
    if state.service == ServiceStatus::NotRegistered {
        backend.store_registration_record(None)?;
        state.record = None;
        return Ok(true);
    }
    if state.service == ServiceStatus::NotFound {
        if let Some(snapshot) = &state.legacy
            && snapshot.stock()
            && snapshot.enabled()
            && legacy_allowed(directory, backend)?
        {
            // The process can exit after saving migration intent but before
            // its first native register call. Resume only that approved, owned
            // stock migration; NotFound alone is not registration authority.
            record.fingerprint = fingerprint(&state.executable)?;
            save_record(backend, record)?;
            complete_registration(directory, Some(snapshot), record, backend)?;
            state.legacy = None;
            state.service = backend.status()?;
            return Ok(true);
        }
        return Err(error(
            "macOS could not find the background service during migration recovery",
        ));
    }
    if let Some(snapshot) = &state.legacy {
        let allowed = if snapshot.stock() && snapshot.enabled() {
            legacy_allowed(directory, backend)
        } else {
            Ok(false)
        };
        if !matches!(allowed, Ok(true)) {
            rollback(backend)?;
            state.service = ServiceStatus::NotRegistered;
            state.record = None;
            allowed?;
            return Ok(false);
        }
        retire_or_rollback(directory, snapshot, backend)?;
        state.legacy = None;
    }
    record.migration_pending = false;
    save_record(backend, record)?;
    Ok(true)
}

fn refresh_enabled(
    directory: &Path,
    state: &State,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let record = state
        .record
        .as_ref()
        .ok_or_else(|| error("missing service ownership record"))?;
    let fingerprint = fingerprint(&state.executable)?;
    if !record.refresh_pending && record.fingerprint == fingerprint {
        return Ok(());
    }
    let mut pending = RegistrationRecord {
        executable: state.executable.clone(),
        fingerprint,
        migration_pending: false,
        refresh_pending: true,
        disable_pending: false,
    };
    save_record(backend, &pending)?;
    // The native implementation waits for unregister completion on a worker
    // thread. Never call register while the previous registration is active.
    backend.unregister()?;
    complete_registration(directory, None, &mut pending, backend)
}

fn resume_refresh(
    directory: &Path,
    state: &mut State,
    backend: &mut impl Backend,
) -> Result<bool, String> {
    let Some(record) = state
        .record
        .as_mut()
        .filter(|record| record.refresh_pending)
    else {
        return Ok(false);
    };
    match state.service {
        ServiceStatus::NotRegistered => {
            record.fingerprint = fingerprint(&state.executable)?;
            save_record(backend, record)?;
            complete_registration(directory, None, record, backend)?;
            Ok(true)
        }
        ServiceStatus::RequiresApproval => {
            // A user may revoke approval while the refresh is interrupted.
            // Persist that observation rather than retrying registration.
            record.refresh_pending = false;
            save_record(backend, record)?;
            Ok(false)
        }
        ServiceStatus::Enabled | ServiceStatus::NotFound => Ok(false),
    }
}

fn finish_disable(
    directory: &Path,
    state: &State,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let service_result = if state.service == ServiceStatus::NotRegistered {
        Ok(())
    } else {
        backend.unregister()
    };
    // Retire the legacy bypass even if the modern unregister call fails. Keep
    // the persisted disable intent until both operations have succeeded.
    let legacy_result = legacy::disable(directory, &state.executable);
    service_result.and(legacy_result)?;
    backend.store_registration_record(None)
}

fn require_enabled(backend: &mut impl Backend) -> Result<(), String> {
    match backend.status()? {
        ServiceStatus::Enabled => Ok(()),
        ServiceStatus::RequiresApproval => Err(error("allow Filament Manager in System Settings > General > Login Items before enabling launch at login")),
        ServiceStatus::NotRegistered | ServiceStatus::NotFound => Err(error("macOS did not enable the bundled background service")),
    }
}

pub(crate) fn status(
    directory: &Path,
    executable: &Path,
    backend: &mut impl Backend,
) -> Result<bool, String> {
    let state = read_state(directory, executable, backend)?;
    if state
        .record
        .as_ref()
        .is_some_and(|record| record.disable_pending)
    {
        return Ok(false);
    }
    match state.service {
        ServiceStatus::Enabled => Ok(true),
        ServiceStatus::RequiresApproval | ServiceStatus::NotFound => Ok(false),
        ServiceStatus::NotRegistered => match state.legacy {
            Some(snapshot) if snapshot.enabled() => legacy_allowed(directory, backend),
            _ => Ok(false),
        },
    }
}

pub(crate) fn reconcile(
    directory: &Path,
    executable: &Path,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let mut state = read_state(directory, executable, backend)?;
    if !recover_pending(directory, &mut state, backend)? {
        return Ok(());
    }
    if resume_refresh(directory, &mut state, backend)? {
        return Ok(());
    }
    match state.service {
        ServiceStatus::Enabled => refresh_enabled(directory, &state, backend),
        ServiceStatus::RequiresApproval => Ok(()),
        ServiceStatus::NotFound => Err(error(
            "macOS could not find the registered background service",
        )),
        ServiceStatus::NotRegistered => {
            if let Some(snapshot) = &state.legacy
                && snapshot.stock()
                && snapshot.enabled()
                && legacy_allowed(directory, backend)?
            {
                return register(directory, &state.executable, Some(snapshot), backend);
            }
            Ok(())
        }
    }
}

pub(crate) fn set_enabled(
    directory: &Path,
    executable: &Path,
    enabled: bool,
    backend: &mut impl Backend,
) -> Result<(), String> {
    let mut state = read_state(directory, executable, backend)?;
    if !enabled {
        if state.service != ServiceStatus::NotRegistered && state.record.is_none() {
            // A persistent OS opt-out can exist without a registration record.
            // It is safe to report that state, but not to remove an unowned job.
            return Err(error(format!(
                "the background service ({:?}) cannot be removed without a matching application ownership record",
                state.service
            )));
        }
        if let Some(record) = &mut state.record {
            record.migration_pending = false;
            record.refresh_pending = false;
            record.disable_pending = true;
            save_record(backend, record)?;
        }
        return finish_disable(directory, &state, backend);
    }
    if state.service == ServiceStatus::NotFound && state.record.is_some() {
        // A new explicit opt-in supersedes pending removal or migration intent.
        // An unseen service may reject unregister with EPERM, so retrying that
        // old operation first would permanently prevent a valid explicit opt-in.
        return enable_unregistered(directory, &state, backend);
    }
    if !recover_pending(directory, &mut state, backend)? {
        return Err(error("the interrupted migration was rolled back; review background activity permissions before enabling it"));
    }
    if resume_refresh(directory, &mut state, backend)? {
        return require_enabled(backend);
    }
    match state.service {
        ServiceStatus::Enabled => {
            refresh_enabled(directory, &state, backend)?;
            require_enabled(backend)
        }
        ServiceStatus::RequiresApproval => Err(error("allow Filament Manager in System Settings > General > Login Items before enabling launch at login")),
        ServiceStatus::NotRegistered | ServiceStatus::NotFound => enable_unregistered(directory, &state, backend),
    }
}

fn enable_unregistered(
    directory: &Path,
    state: &State,
    backend: &mut impl Backend,
) -> Result<(), String> {
    if let Some(snapshot) = &state.legacy {
        if !legacy_allowed(directory, backend)? {
            return Err(error("the existing login agent is disabled by macOS; review Background App Activity in System Settings"));
        }
        if !snapshot.stock() {
            if state.service == ServiceStatus::NotFound {
                return Err(error("the registered background service could not be found; the customized legacy login agent was preserved"));
            }
            return legacy::enable(directory, &state.executable);
        }
    }
    register(directory, &state.executable, state.legacy.as_ref(), backend)?;
    require_enabled(backend)
}

#[cfg(test)]
#[path = "macos_login_service_tests.rs"]
mod tests;
