use super::*;
use std::os::unix::ffi::OsStringExt;
use std::os::unix::fs::symlink;

struct Fixture {
    root: PathBuf,
    agents: PathBuf,
    executable: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let sequence = NEXT_TEMPORARY_FILE.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "filament-manager-autostart-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&root).unwrap();
        let executable = Self::bundle(&root, "Filament & Manager.app");
        Self {
            agents: root.join("LaunchAgents"),
            root,
            executable,
        }
    }

    fn bundle(root: &Path, name: &str) -> PathBuf {
        let contents = root.join(name).join("Contents");
        let macos = contents.join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        let executable = macos.join("filament-manager");
        fs::write(&executable, b"synthetic executable; never launched").unwrap();
        let mut info = Dictionary::new();
        info.insert("CFBundleIdentifier".into(), Value::String(BUNDLE_ID.into()));
        info.insert(
            "CFBundleExecutable".into(),
            Value::String("filament-manager".into()),
        );
        Value::Dictionary(info)
            .to_file_xml(contents.join("Info.plist"))
            .unwrap();
        executable.canonicalize().unwrap()
    }

    fn path(&self) -> PathBuf {
        self.agents.join(AGENT_FILE)
    }

    fn legacy(&self) -> Dictionary {
        let mut dictionary = Dictionary::new();
        dictionary.insert("Label".into(), Value::String(BUNDLE_ID.into()));
        dictionary.insert(
            "ProgramArguments".into(),
            Value::Array(vec![
                Value::String(self.executable.to_string_lossy().into_owned()),
                Value::String("--background".into()),
            ]),
        );
        dictionary.insert("RunAtLoad".into(), Value::Boolean(true));
        dictionary
    }

    fn save(&self, dictionary: Dictionary) {
        fs::create_dir_all(&self.agents).unwrap();
        Value::Dictionary(dictionary)
            .to_file_xml(self.path())
            .unwrap();
    }

    fn read(&self) -> Dictionary {
        Value::from_file(self.path())
            .unwrap()
            .into_dictionary()
            .unwrap()
    }

    fn assert_no_staging_files(&self) {
        let names = fs::read_dir(&self.agents)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, [std::ffi::OsString::from(AGENT_FILE)]);
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn macos_autostart_new_registration_uses_bundle_association_and_escaped_background_args() {
    let fixture = Fixture::new();
    assert!(!is_enabled(&fixture.agents, &fixture.executable).unwrap());
    enable(&fixture.agents, &fixture.executable).unwrap();
    let mut expected = fixture.legacy();
    expected.insert("AssociatedBundleIdentifiers".into(), association());
    assert_eq!(fixture.read(), expected);
    assert!(has_registration(&fixture.agents, &fixture.executable).unwrap());
    assert!(is_enabled(&fixture.agents, &fixture.executable).unwrap());
    assert!(fs::read_to_string(fixture.path())
        .unwrap()
        .contains("&amp;"));
    assert_eq!(fs::metadata(fixture.path()).unwrap().nlink(), 1);
    assert_eq!(fs::metadata(fixture.path()).unwrap().mode() & 0o777, 0o600);
    fixture.assert_no_staging_files();
}

#[test]
fn macos_autostart_reconcile_absent_agent_never_opts_in_or_creates_directories() {
    let fixture = Fixture::new();
    assert!(!has_registration(&fixture.agents, &fixture.executable).unwrap());
    assert!(!reconcile(&fixture.agents, &fixture.executable).unwrap());
    assert!(!fixture.agents.exists());
    disable(&fixture.agents, &fixture.executable).unwrap();
    assert!(!fixture.agents.exists());
}

#[test]
fn macos_autostart_reconcile_only_adds_association_and_is_byte_stable_afterwards() {
    let fixture = Fixture::new();
    let mut legacy = fixture.legacy();
    legacy.insert("RunAtLoad".into(), Value::Boolean(false));
    legacy.insert("Disabled".into(), Value::Boolean(true));
    legacy.insert(
        "UserNote".into(),
        Value::String("keep my launch configuration".into()),
    );
    legacy
        .get_mut("ProgramArguments")
        .unwrap()
        .as_array_mut()
        .unwrap()
        .push(Value::String("--custom-user-argument".into()));
    fixture.save(legacy.clone());
    fs::set_permissions(fixture.path(), fs::Permissions::from_mode(0o640)).unwrap();
    assert!(has_registration(&fixture.agents, &fixture.executable).unwrap());
    assert!(reconcile(&fixture.agents, &fixture.executable).unwrap());
    legacy.insert("AssociatedBundleIdentifiers".into(), association());
    assert_eq!(fixture.read(), legacy);
    assert!(!is_enabled(&fixture.agents, &fixture.executable).unwrap());
    assert_eq!(fs::metadata(fixture.path()).unwrap().mode() & 0o777, 0o640);
    let after = fs::read(fixture.path()).unwrap();
    let metadata = fs::metadata(fixture.path()).unwrap();
    assert!(has_registration(&fixture.agents, &fixture.executable).unwrap());
    assert!(!reconcile(&fixture.agents, &fixture.executable).unwrap());
    assert_eq!(fs::read(fixture.path()).unwrap(), after);
    assert!(same_file(&metadata, &fs::metadata(fixture.path()).unwrap()));
    fixture.assert_no_staging_files();
}

#[test]
fn macos_autostart_explicit_enable_restores_plist_intent_preserving_custom_configuration() {
    let fixture = Fixture::new();
    let mut legacy = fixture.legacy();
    legacy.insert("RunAtLoad".into(), Value::Boolean(false));
    legacy.insert("Disabled".into(), Value::Boolean(true));
    legacy.insert("UserNote".into(), Value::String("retained".into()));
    legacy
        .get_mut("ProgramArguments")
        .unwrap()
        .as_array_mut()
        .unwrap()
        .push(Value::String("--custom-user-argument".into()));
    fixture.save(legacy.clone());
    assert!(!is_enabled(&fixture.agents, &fixture.executable).unwrap());
    enable(&fixture.agents, &fixture.executable).unwrap();
    legacy.insert("AssociatedBundleIdentifiers".into(), association());
    legacy.insert("RunAtLoad".into(), Value::Boolean(true));
    legacy.insert("Disabled".into(), Value::Boolean(false));
    assert_eq!(fixture.read(), legacy);
    assert!(is_enabled(&fixture.agents, &fixture.executable).unwrap());
    let after = fs::read(fixture.path()).unwrap();
    enable(&fixture.agents, &fixture.executable).unwrap();
    assert_eq!(fs::read(fixture.path()).unwrap(), after);
}

#[test]
fn macos_autostart_disable_removes_only_the_recognized_registration() {
    let fixture = Fixture::new();
    enable(&fixture.agents, &fixture.executable).unwrap();
    let other = fixture.agents.join("unrelated.plist");
    fs::write(&other, b"unrelated configuration").unwrap();
    disable(&fixture.agents, &fixture.executable).unwrap();
    assert!(!fixture.path().exists());
    assert_eq!(fs::read(other).unwrap(), b"unrelated configuration");
    assert!(!is_enabled(&fixture.agents, &fixture.executable).unwrap());
    disable(&fixture.agents, &fixture.executable).unwrap();
}

#[test]
fn macos_autostart_rejects_unrecognized_label_program_or_arguments_without_modification() {
    let fixture = Fixture::new();
    for malformed in [
        "label",
        "program",
        "argument-path",
        "background-argument",
        "run-at-load",
        "disabled",
    ] {
        let mut dictionary = fixture.legacy();
        match malformed {
            "label" => {
                dictionary.insert("Label".into(), Value::String("another.app".into()));
            }
            "program" => {
                dictionary.insert("Program".into(), Value::String("/bin/sh".into()));
            }
            "argument-path" => {
                dictionary
                    .get_mut("ProgramArguments")
                    .unwrap()
                    .as_array_mut()
                    .unwrap()[0] = Value::String("/bin/sh".into());
            }
            "background-argument" => {
                dictionary
                    .get_mut("ProgramArguments")
                    .unwrap()
                    .as_array_mut()
                    .unwrap()
                    .pop();
            }
            "run-at-load" => {
                dictionary.insert("RunAtLoad".into(), Value::String("true".into()));
            }
            _ => {
                dictionary.insert("Disabled".into(), Value::String("false".into()));
            }
        }
        fixture.save(dictionary);
        let before = fs::read(fixture.path()).unwrap();
        assert!(
            has_registration(&fixture.agents, &fixture.executable).is_err(),
            "{malformed}"
        );
        assert!(
            reconcile(&fixture.agents, &fixture.executable).is_err(),
            "{malformed}"
        );
        assert!(
            enable(&fixture.agents, &fixture.executable).is_err(),
            "{malformed}"
        );
        assert!(
            disable(&fixture.agents, &fixture.executable).is_err(),
            "{malformed}"
        );
        assert!(
            is_enabled(&fixture.agents, &fixture.executable).is_err(),
            "{malformed}"
        );
        assert_eq!(fs::read(fixture.path()).unwrap(), before, "{malformed}");
    }
    fixture.assert_no_staging_files();
}

#[test]
fn macos_autostart_another_bundle_copy_cannot_repoint_or_reconcile_installed_registration() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let another = Fixture::bundle(&fixture.root, "Temporary Copy.app");
    let before = fs::read(fixture.path()).unwrap();
    assert!(has_registration(&fixture.agents, &another).is_err());
    assert!(reconcile(&fixture.agents, &another).is_err());
    assert!(enable(&fixture.agents, &another).is_err());
    assert!(disable(&fixture.agents, &another).is_err());
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
}

#[test]
fn macos_autostart_refuses_malformed_nonregular_symlink_and_hardlink_agents() {
    for kind in [
        "malformed",
        "directory",
        "symlink",
        "broken-symlink",
        "hardlink",
    ] {
        let fixture = Fixture::new();
        fs::create_dir(&fixture.agents).unwrap();
        let referenced = fixture.root.join("do-not-change.plist");
        Value::Dictionary(fixture.legacy())
            .to_file_xml(&referenced)
            .unwrap();
        let reference_bytes = fs::read(&referenced).unwrap();
        match kind {
            "malformed" => fs::write(fixture.path(), b"not a plist").unwrap(),
            "directory" => fs::create_dir(fixture.path()).unwrap(),
            "symlink" => symlink(&referenced, fixture.path()).unwrap(),
            "broken-symlink" => symlink(fixture.root.join("absent"), fixture.path()).unwrap(),
            _ => fs::hard_link(&referenced, fixture.path()).unwrap(),
        }
        let before = fs::symlink_metadata(fixture.path()).unwrap();
        assert!(
            has_registration(&fixture.agents, &fixture.executable).is_err(),
            "{kind}"
        );
        assert!(
            reconcile(&fixture.agents, &fixture.executable).is_err(),
            "{kind}"
        );
        assert!(
            enable(&fixture.agents, &fixture.executable).is_err(),
            "{kind}"
        );
        assert!(
            disable(&fixture.agents, &fixture.executable).is_err(),
            "{kind}"
        );
        assert!(
            is_enabled(&fixture.agents, &fixture.executable).is_err(),
            "{kind}"
        );
        let after = fs::symlink_metadata(fixture.path()).unwrap();
        assert_eq!(
            (before.dev(), before.ino()),
            (after.dev(), after.ino()),
            "{kind}"
        );
        assert_eq!(fs::read(referenced).unwrap(), reference_bytes, "{kind}");
    }
}

#[test]
fn macos_autostart_refuses_symlinked_launchagents_directory() {
    let fixture = Fixture::new();
    let other = fixture.root.join("other-directory");
    fs::create_dir(&other).unwrap();
    symlink(&other, &fixture.agents).unwrap();
    assert!(has_registration(&fixture.agents, &fixture.executable).is_err());
    assert!(enable(&fixture.agents, &fixture.executable).is_err());
    assert!(reconcile(&fixture.agents, &fixture.executable).is_err());
    assert_eq!(fs::read_dir(&other).unwrap().count(), 0);
}

#[test]
fn macos_autostart_failed_staging_write_keeps_previous_bytes_and_removes_partial_file() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let old = read_agent(&fixture.agents, &fixture.executable)
        .unwrap()
        .unwrap();
    let error = write_atomic(&fixture.path(), Some(&old), |file| {
        file.write_all(b"partial replacement")?;
        Err(io::Error::other("synthetic disk write failure"))
    })
    .unwrap_err();
    assert!(error.contains("synthetic disk write failure"));
    assert_eq!(fs::read(fixture.path()).unwrap(), old.bytes);
    assert!(same_file(
        &old.metadata,
        &fs::metadata(fixture.path()).unwrap()
    ));
    fixture.assert_no_staging_files();
}

#[test]
fn macos_autostart_concurrent_registration_or_edit_is_never_overwritten() {
    let fixture = Fixture::new();
    fs::create_dir(&fixture.agents).unwrap();
    let error = write_atomic(&fixture.path(), None, |file| {
        fs::write(fixture.path(), b"another registration")?;
        file.write_all(b"our staged registration")
    })
    .unwrap_err();
    assert!(error.contains("changed before saving"));
    assert_eq!(fs::read(fixture.path()).unwrap(), b"another registration");
    fixture.assert_no_staging_files();

    fixture.save(fixture.legacy());
    let old = read_agent(&fixture.agents, &fixture.executable)
        .unwrap()
        .unwrap();
    let mut edited = fixture.legacy();
    edited.insert("UserNote".into(), Value::String("concurrent edit".into()));
    fixture.save(edited);
    let new_bytes = fs::read(fixture.path()).unwrap();
    assert!(write_agent(&fixture.path(), &old.dictionary, Some(&old)).is_err());
    assert_eq!(fs::read(fixture.path()).unwrap(), new_bytes);
    fixture.assert_no_staging_files();
}

#[test]
fn macos_autostart_requires_matching_bundle_identity_and_stable_application_path() {
    let fixture = Fixture::new();
    assert_eq!(
        validate_installed_executable(&fixture.executable).unwrap(),
        fixture.executable
    );
    for unstable in [
        "/Volumes/Filament Manager/Filament Manager.app/Contents/MacOS/filament-manager",
        "/private/var/folders/test/AppTranslocation/random/d/Filament Manager.app/Contents/MacOS/filament-manager", // path-portability-allow: synthetic macOS AppTranslocation path rejected before filesystem access.
    ] {
        assert_eq!(validate_installed_executable(Path::new(unstable)).unwrap_err(), "APP_LOCATION_UNSTABLE");
        assert_eq!(enable(&fixture.agents, Path::new(unstable)).unwrap_err(), "APP_LOCATION_UNSTABLE");
    }
    let development = fixture.root.join("filament-manager");
    fs::write(&development, b"development executable").unwrap();
    assert!(validate_installed_executable(&development).is_err());
    let info_path = fixture
        .executable
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("Info.plist");
    let mut info = Value::from_file(&info_path)
        .unwrap()
        .into_dictionary()
        .unwrap();
    info.insert(
        "CFBundleIdentifier".into(),
        Value::String("unrelated.app".into()),
    );
    Value::Dictionary(info).to_file_xml(info_path).unwrap();
    assert!(enable(&fixture.agents, &fixture.executable).is_err());
    assert!(!fixture.agents.exists());
}

#[test]
fn macos_autostart_rejects_non_utf8_executable_paths_without_replacing_agent() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let before = fs::read(fixture.path()).unwrap();
    let non_utf8_root = fixture.root.join(std::ffi::OsString::from_vec(
        b"invalid-\xff-parent".to_vec(),
    ));
    // Reject before touching the filesystem: macOS filesystems need not allow
    // these bytes as real filenames in order to validate the input contract.
    let executable = non_utf8_root
        .join("Filament Manager.app")
        .join("Contents/MacOS/filament-manager");
    assert!(executable.to_str().is_none());
    let error = validate_installed_executable(&executable).unwrap_err();
    assert!(error.contains("cannot be represented in a launch agent plist"));
    assert!(has_registration(&fixture.agents, &executable).is_err());
    assert!(enable(&fixture.agents, &executable).is_err());
    assert!(reconcile(&fixture.agents, &executable).is_err());
    assert!(disable(&fixture.agents, &executable).is_err());
    assert!(is_enabled(&fixture.agents, &executable).is_err());
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
    fixture.assert_no_staging_files();
}
