//! App-owned legacy LaunchAgent registration. This manages the user's plist
//! intent only; macOS Background Task Management approval remains OS-owned.
use plist::{Dictionary, Value};
use std::ffi::CString;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const BUNDLE_ID: &str = "no.bliatun.filamentmanager";
const AGENT_FILE: &str = "no.bliatun.filamentmanager.plist";
const MAX_PLIST_BYTES: u64 = 1024 * 1024;
static NEXT_TEMPORARY_FILE: AtomicU64 = AtomicU64::new(1);

struct ExistingAgent {
    dictionary: Dictionary,
    bytes: Vec<u8>,
    metadata: Metadata,
}

fn describe(error: impl std::fmt::Display) -> String {
    format!("Could not manage Filament Manager launch at login: {error}")
}

fn reject(message: &str) -> String {
    describe(message)
}

fn unstable_location(path: &Path) -> bool {
    let path = path.to_string_lossy();
    path.starts_with("/Volumes/") || path.contains("/AppTranslocation/")
}

/// Resolve the exact running executable within its own matching app bundle.
/// Startup callers additionally suppress reconciliation in development/QA.
pub(crate) fn validate_installed_executable(executable: &Path) -> Result<PathBuf, String> {
    if executable.to_str().is_none() {
        return Err(reject(
            "the application executable path cannot be represented in a launch agent plist",
        ));
    }
    if unstable_location(executable) {
        return Err("APP_LOCATION_UNSTABLE".into());
    }
    let metadata = fs::symlink_metadata(executable).map_err(describe)?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err(reject(
            "the application executable is not a regular single-link file",
        ));
    }
    let executable = executable.canonicalize().map_err(describe)?;
    if executable.to_str().is_none() {
        return Err(reject(
            "the application executable path cannot be represented in a launch agent plist",
        ));
    }
    if unstable_location(&executable) {
        return Err("APP_LOCATION_UNSTABLE".into());
    }
    let macos = executable
        .parent()
        .ok_or_else(|| reject("missing app bundle"))?;
    let contents = macos.parent().ok_or_else(|| reject("missing app bundle"))?;
    let bundle = contents
        .parent()
        .ok_or_else(|| reject("missing app bundle"))?;
    if macos.file_name().and_then(|name| name.to_str()) != Some("MacOS")
        || contents.file_name().and_then(|name| name.to_str()) != Some("Contents")
        || bundle.extension().and_then(|name| name.to_str()) != Some("app")
    {
        return Err(reject(
            "launch at login requires the installed application bundle",
        ));
    }
    let info_path = contents.join("Info.plist");
    let info_metadata = fs::symlink_metadata(&info_path).map_err(describe)?;
    if !info_metadata.is_file()
        || info_metadata.nlink() != 1
        || info_metadata.len() > MAX_PLIST_BYTES
    {
        return Err(reject("the application Info.plist is not a regular file"));
    }
    let info = Value::from_reader(File::open(info_path).map_err(describe)?).map_err(describe)?;
    let info = info
        .as_dictionary()
        .ok_or_else(|| reject("invalid app bundle metadata"))?;
    if info.get("CFBundleIdentifier").and_then(Value::as_string) != Some(BUNDLE_ID)
        || info.get("CFBundleExecutable").and_then(Value::as_string)
            != executable.file_name().and_then(|name| name.to_str())
    {
        return Err(reject(
            "the app bundle identity does not match Filament Manager",
        ));
    }
    Ok(executable)
}

fn check_directory(directory: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(directory).map_err(describe)?;
    if !metadata.is_dir() {
        return Err(reject("LaunchAgents must be a real directory"));
    }
    Ok(())
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
        && left.uid() == right.uid()
        && right.nlink() == 1
        && right.is_file()
}

fn read_regular_agent(path: &Path) -> Result<Option<(Vec<u8>, Metadata)>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(describe(error)),
    };
    // A user's LaunchAgent is never a symlink, hardlink, directory, FIFO, or a
    // file owned by another account. O_NOFOLLOW also closes the open-time race.
    if !metadata.is_file()
        || metadata.nlink() != 1
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.len() > MAX_PLIST_BYTES
    {
        return Err(reject("refusing an unsafe launch agent file"));
    }
    let mut file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(describe)?;
    if !same_file(&metadata, &file.metadata().map_err(describe)?) {
        return Err(reject("the launch agent changed while opening it"));
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(MAX_PLIST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(describe)?;
    if bytes.len() as u64 > MAX_PLIST_BYTES
        || !same_file(&metadata, &file.metadata().map_err(describe)?)
    {
        return Err(reject("the launch agent changed while reading it"));
    }
    Ok(Some((bytes, metadata)))
}

fn matching_program(value: &Value, executable: &Path) -> bool {
    let Some(program) = value.as_string().map(Path::new) else {
        return false;
    };
    program.is_absolute()
        && fs::symlink_metadata(program)
            .is_ok_and(|metadata| metadata.is_file() && metadata.nlink() == 1)
        && program
            .canonicalize()
            .is_ok_and(|program| program == executable)
}

fn read_agent(directory: &Path, executable: &Path) -> Result<Option<ExistingAgent>, String> {
    if !directory.try_exists().map_err(describe)? {
        // Do not create a LaunchAgents directory during status/reconciliation.
        // A broken directory symlink is still rejected instead of treated absent.
        return match fs::symlink_metadata(directory) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            _ => Err(reject("LaunchAgents must be a real directory")),
        };
    }
    check_directory(directory)?;
    let Some((bytes, metadata)) = read_regular_agent(&directory.join(AGENT_FILE))? else {
        return Ok(None);
    };
    let value = Value::from_reader(std::io::Cursor::new(&bytes)).map_err(describe)?;
    let dictionary = value
        .into_dictionary()
        .ok_or_else(|| reject("invalid launch agent plist"))?;
    let arguments = dictionary.get("ProgramArguments").and_then(Value::as_array);
    let valid_arguments = arguments.is_some_and(|arguments| {
        arguments
            .first()
            .is_some_and(|program| matching_program(program, executable))
            && arguments
                .iter()
                .all(|argument| argument.as_string().is_some())
            && arguments
                .iter()
                .skip(1)
                .any(|argument| argument.as_string() == Some("--background"))
    });
    if dictionary.get("Label").and_then(Value::as_string) != Some(BUNDLE_ID)
        || !valid_arguments
        || dictionary
            .get("Program")
            .is_some_and(|program| !matching_program(program, executable))
        || dictionary
            .get("RunAtLoad")
            .and_then(Value::as_boolean)
            .is_none()
        || dictionary
            .get("Disabled")
            .is_some_and(|value| value.as_boolean().is_none())
    {
        return Err(reject(
            "refusing a launch agent with an unrecognized label, program, or launch configuration",
        ));
    }
    Ok(Some(ExistingAgent {
        dictionary,
        bytes,
        metadata,
    }))
}

fn association() -> Value {
    Value::Array(vec![Value::String(BUNDLE_ID.into())])
}

pub(crate) fn is_enabled(directory: &Path, executable: &Path) -> Result<bool, String> {
    let executable = validate_installed_executable(executable)?;
    let Some(agent) = read_agent(directory, &executable)? else {
        return Ok(false);
    };
    Ok(agent
        .dictionary
        .get("RunAtLoad")
        .and_then(Value::as_boolean)
        == Some(true)
        && agent.dictionary.get("Disabled").and_then(Value::as_boolean) != Some(true))
}

pub(crate) fn enable(directory: &Path, executable: &Path) -> Result<(), String> {
    let executable = validate_installed_executable(executable)?;
    let existing = read_agent(directory, &executable)?;
    let mut dictionary = existing
        .as_ref()
        .map(|agent| agent.dictionary.clone())
        .unwrap_or_else(|| {
            let mut dictionary = Dictionary::new();
            dictionary.insert("Label".into(), Value::String(BUNDLE_ID.into()));
            dictionary.insert(
                "ProgramArguments".into(),
                Value::Array(vec![
                    Value::String(executable.to_string_lossy().into_owned()),
                    Value::String("--background".into()),
                ]),
            );
            dictionary
        });
    dictionary.insert("RunAtLoad".into(), Value::Boolean(true));
    if dictionary.contains_key("Disabled") {
        dictionary.insert("Disabled".into(), Value::Boolean(false));
    }
    dictionary.insert("AssociatedBundleIdentifiers".into(), association());
    if existing
        .as_ref()
        .is_some_and(|agent| agent.dictionary == dictionary)
    {
        return Ok(());
    }
    fs::create_dir_all(directory).map_err(describe)?;
    check_directory(directory)?;
    write_agent(&directory.join(AGENT_FILE), &dictionary, existing.as_ref())
}

pub(crate) fn disable(directory: &Path, executable: &Path) -> Result<(), String> {
    let executable = validate_installed_executable(executable)?;
    let Some(existing) = read_agent(directory, &executable)? else {
        return Ok(());
    };
    let path = directory.join(AGENT_FILE);
    ensure_unchanged(&path, Some(&existing))?;
    fs::remove_file(path).map_err(describe)
}

/// Add association to an existing recognized agent. Never opts a user in,
/// rewrites its program/arguments, or changes RunAtLoad/Disabled/unknown keys.
pub(crate) fn reconcile(directory: &Path, executable: &Path) -> Result<bool, String> {
    let executable = validate_installed_executable(executable)?;
    let Some(existing) = read_agent(directory, &executable)? else {
        return Ok(false);
    };
    if existing.dictionary.get("AssociatedBundleIdentifiers") == Some(&association()) {
        return Ok(false);
    }
    let mut dictionary = existing.dictionary.clone();
    dictionary.insert("AssociatedBundleIdentifiers".into(), association());
    write_agent(&directory.join(AGENT_FILE), &dictionary, Some(&existing))?;
    Ok(true)
}

fn ensure_unchanged(path: &Path, existing: Option<&ExistingAgent>) -> Result<(), String> {
    match (existing, read_regular_agent(path)?) {
        (None, None) => Ok(()),
        (Some(expected), Some((bytes, metadata)))
            if same_file(&expected.metadata, &metadata) && expected.bytes == bytes =>
        {
            Ok(())
        }
        _ => Err(reject(
            "the launch agent changed before saving; retry after checking its status",
        )),
    }
}

struct TemporaryAgent {
    path: PathBuf,
    published: bool,
}
impl Drop for TemporaryAgent {
    fn drop(&mut self) {
        if !self.published {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn write_agent(
    path: &Path,
    dictionary: &Dictionary,
    existing: Option<&ExistingAgent>,
) -> Result<(), String> {
    let mut bytes = Vec::new();
    Value::Dictionary(dictionary.clone())
        .to_writer_xml(&mut bytes)
        .map_err(describe)?;
    write_atomic(path, existing, |file| file.write_all(&bytes))
}

fn write_atomic(
    path: &Path,
    existing: Option<&ExistingAgent>,
    write: impl FnOnce(&mut File) -> io::Result<()>,
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| reject("missing LaunchAgents directory"))?;
    check_directory(parent)?;
    let mut staging = None;
    for _ in 0..64 {
        let sequence = NEXT_TEMPORARY_FILE.fetch_add(1, Ordering::Relaxed);
        let temporary = parent.join(format!(
            ".{AGENT_FILE}.{}.{sequence}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
        {
            Ok(file) => {
                staging = Some((
                    TemporaryAgent {
                        path: temporary,
                        published: false,
                    },
                    file,
                ));
                break;
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(describe(error)),
        }
    }
    let (mut temporary, mut file) =
        staging.ok_or_else(|| reject("could not create a private staging file"))?;
    write(&mut file).map_err(describe)?;
    if let Some(existing) = existing {
        file.set_permissions(fs::Permissions::from_mode(existing.metadata.mode() & 0o777))
            .map_err(describe)?;
    }
    file.sync_all().map_err(describe)?;
    drop(file);
    ensure_unchanged(path, existing)?;
    if existing.is_some() {
        fs::rename(&temporary.path, path).map_err(describe)?;
    } else {
        // Atomic no-replace publication keeps a concurrent user's registration
        // intact and never briefly exposes the new file as a hardlink.
        let from = CString::new(temporary.path.as_os_str().as_bytes()).map_err(describe)?;
        let to = CString::new(path.as_os_str().as_bytes()).map_err(describe)?;
        let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
        if result != 0 {
            return Err(describe(io::Error::last_os_error()));
        }
    }
    temporary.published = true;
    Ok(())
}

#[cfg(test)]
#[path = "macos_autostart_tests.rs"]
mod tests;
