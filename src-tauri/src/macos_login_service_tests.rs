use super::*;
use plist::{Dictionary, Value};
use std::os::unix::fs::symlink;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

struct Fixture {
    root: PathBuf,
    agents: PathBuf,
    executable: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "filament-login-service-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let bundle = root.join("Filament Manager.app");
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::create_dir_all(bundle.join("Contents/Library/LaunchAgents")).unwrap();
        let executable = bundle.join("Contents/MacOS/filament-manager");
        fs::write(&executable, b"test executable; never launched").unwrap();
        let mut info = Dictionary::new();
        info.insert(
            "CFBundleIdentifier".into(),
            Value::String("no.bliatun.filamentmanager".into()),
        );
        info.insert(
            "CFBundleExecutable".into(),
            Value::String("filament-manager".into()),
        );
        Value::Dictionary(info)
            .to_file_xml(bundle.join("Contents/Info.plist"))
            .unwrap();
        let mut service = Dictionary::new();
        service.insert("Label".into(), Value::String(SERVICE_LABEL.into()));
        service.insert("BundleProgram".into(), Value::String(HELPER_PROGRAM.into()));
        service.insert("RunAtLoad".into(), Value::Boolean(true));
        Value::Dictionary(service)
            .to_file_xml(bundle.join(SERVICE_PLIST))
            .unwrap();
        fs::write(
            bundle.join(HELPER_PROGRAM),
            b"test login helper; never launched",
        )
        .unwrap();
        Self {
            agents: root.join("LaunchAgents"),
            executable,
            root,
        }
    }

    fn path(&self) -> PathBuf {
        self.agents.join(LEGACY_FILE)
    }

    fn bundle(&self) -> &Path {
        self.executable.ancestors().nth(3).unwrap()
    }

    fn legacy(&self) -> Dictionary {
        let mut dictionary = Dictionary::new();
        dictionary.insert(
            "Label".into(),
            Value::String("no.bliatun.filamentmanager".into()),
        );
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

    fn record(&self, backend: &mut Mock, pending: bool) {
        backend.record = Some(
            serde_json::to_string(&RegistrationRecord {
                executable: self.executable.clone(),
                fingerprint: fingerprint(&self.executable).unwrap(),
                migration_pending: pending,
                refresh_pending: false,
                disable_pending: false,
            })
            .unwrap(),
        );
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

struct Mock {
    service: ServiceStatus,
    allowed: Result<bool, String>,
    register_result: Result<ServiceStatus, String>,
    status_after_failed_register: ServiceStatus,
    unregister_error: Option<String>,
    record: Option<String>,
    fail_store: bool,
    trace: Vec<&'static str>,
    edit_during_register: Option<(PathBuf, Vec<u8>)>,
    permission_after_register: Option<Result<bool, String>>,
}

impl Default for Mock {
    fn default() -> Self {
        Self {
            service: ServiceStatus::NotRegistered,
            allowed: Ok(true),
            register_result: Ok(ServiceStatus::Enabled),
            status_after_failed_register: ServiceStatus::NotRegistered,
            unregister_error: None,
            record: None,
            fail_store: false,
            trace: Vec::new(),
            edit_during_register: None,
            permission_after_register: None,
        }
    }
}

impl Mock {
    fn mutations(&self) -> Vec<&'static str> {
        self.trace
            .iter()
            .copied()
            .filter(|event| !matches!(*event, "status" | "legacy_allowed" | "read_record"))
            .collect()
    }

    fn pending(&self) -> bool {
        serde_json::from_str::<RegistrationRecord>(self.record.as_ref().unwrap())
            .unwrap()
            .migration_pending
    }
}

impl Backend for Mock {
    fn status(&mut self) -> Result<ServiceStatus, String> {
        self.trace.push("status");
        Ok(self.service)
    }

    fn legacy_allowed(&mut self, plist: &Path) -> Result<bool, String> {
        self.trace.push("legacy_allowed");
        assert_eq!(plist.file_name().unwrap(), LEGACY_FILE);
        self.allowed.clone()
    }

    fn register(&mut self) -> Result<ServiceStatus, String> {
        self.trace.push("register");
        assert!(
            self.record.is_some(),
            "ownership must persist before registration"
        );
        if let Some((path, bytes)) = self.edit_during_register.take() {
            fs::write(path, bytes).unwrap();
        }
        if let Some(allowed) = self.permission_after_register.take() {
            self.allowed = allowed;
        }
        self.service = self
            .register_result
            .clone()
            .unwrap_or(self.status_after_failed_register);
        self.register_result.clone()
    }

    fn unregister(&mut self) -> Result<(), String> {
        self.trace.push("unregister");
        if let Some(error) = &self.unregister_error {
            return Err(error.clone());
        }
        self.service = ServiceStatus::NotRegistered;
        Ok(())
    }

    fn registration_record(&mut self) -> Option<String> {
        self.trace.push("read_record");
        self.record.clone()
    }

    fn store_registration_record(&mut self, record: Option<&str>) -> Result<(), String> {
        self.trace.push(if record.is_some() {
            "store_record"
        } else {
            "clear_record"
        });
        if self.fail_store {
            return Err("synthetic preference write failure".into());
        }
        self.record = record.map(str::to_owned);
        Ok(())
    }
}

#[test]
fn startup_does_not_opt_in_absent_disabled_customized_or_os_denied_legacy() {
    for case in [
        "absent",
        "disabled",
        "run_at_load_false",
        "customized",
        "os_denied",
    ] {
        let fixture = Fixture::new();
        let mut backend = Mock::default();
        if case != "absent" {
            let mut dictionary = fixture.legacy();
            match case {
                "disabled" => {
                    dictionary.insert("Disabled".into(), Value::Boolean(true));
                }
                "run_at_load_false" => {
                    dictionary.insert("RunAtLoad".into(), Value::Boolean(false));
                }
                "customized" => {
                    dictionary.insert("KeepAlive".into(), Value::Boolean(true));
                }
                "os_denied" => backend.allowed = Ok(false),
                _ => unreachable!(),
            }
            fixture.save(dictionary);
        }
        let before = fs::read(fixture.path()).ok();
        reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
        assert!(backend.mutations().is_empty(), "{case}");
        assert_eq!(fs::read(fixture.path()).ok(), before, "{case}");
        assert_eq!(fixture.agents.exists(), case != "absent");
    }
}

#[test]
fn unknown_legacy_permission_never_registers_or_changes_the_agent() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let before = fs::read(fixture.path()).unwrap();
    let mut backend = Mock {
        allowed: Err("permission check unavailable".into()),
        ..Mock::default()
    };
    assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
    assert!(backend.mutations().is_empty());
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
    assert!(status(&fixture.agents, &fixture.executable, &mut backend).is_err());
}

#[test]
fn approved_stock_agent_migrates_and_records_completion_once() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let mut backend = Mock::default();
    assert!(status(&fixture.agents, &fixture.executable, &mut backend).unwrap());
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert!(!fixture.path().exists());
    assert!(!backend.pending());
    assert_eq!(
        backend.mutations(),
        ["store_record", "register", "store_record"]
    );
    backend.trace.clear();
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert!(backend.mutations().is_empty());
    assert!(status(&fixture.agents, &fixture.executable, &mut backend).unwrap());
}

#[test]
fn approval_required_retires_legacy_without_retrying_or_reporting_enabled() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let mut backend = Mock {
        register_result: Ok(ServiceStatus::RequiresApproval),
        ..Mock::default()
    };
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert!(
        !fixture.path().exists(),
        "legacy must not bypass modern approval"
    );
    assert!(!status(&fixture.agents, &fixture.executable, &mut backend).unwrap());
    backend.trace.clear();
    fs::write(fixture.bundle().join(HELPER_PROGRAM), b"new helper version").unwrap();
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert!(set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).is_err());
    assert!(backend.mutations().is_empty());
}

#[test]
fn explicit_enable_can_create_new_service_but_denied_legacy_stays_untouched() {
    let fixture = Fixture::new();
    let mut backend = Mock::default();
    set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).unwrap();
    assert_eq!(backend.service, ServiceStatus::Enabled);
    assert!(!fixture.agents.exists());
    assert!(!backend.pending());

    let fixture = Fixture::new();
    let mut dictionary = fixture.legacy();
    dictionary.insert("Disabled".into(), Value::Boolean(true));
    fixture.save(dictionary);
    let before = fs::read(fixture.path()).unwrap();
    let mut backend = Mock {
        allowed: Ok(false),
        ..Mock::default()
    };
    assert!(set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).is_err());
    assert!(backend.mutations().is_empty());
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
    backend.allowed = Ok(true);
    set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).unwrap();
    assert!(!fixture.path().exists());
    assert_eq!(backend.service, ServiceStatus::Enabled);
}

#[test]
fn customized_agent_explicit_enable_and_disable_keep_using_legacy_policy() {
    let fixture = Fixture::new();
    let mut dictionary = fixture.legacy();
    dictionary.insert("RunAtLoad".into(), Value::Boolean(false));
    dictionary
        .get_mut("ProgramArguments")
        .unwrap()
        .as_array_mut()
        .unwrap()
        .push(Value::String("--custom-argument".into()));
    fixture.save(dictionary.clone());
    let mut backend = Mock::default();
    set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).unwrap();
    let actual = Value::from_file(fixture.path())
        .unwrap()
        .into_dictionary()
        .unwrap();
    assert_eq!(
        actual.get("ProgramArguments"),
        dictionary.get("ProgramArguments")
    );
    assert_eq!(actual.get("RunAtLoad"), Some(&Value::Boolean(true)));
    assert!(backend.mutations().is_empty());
    set_enabled(&fixture.agents, &fixture.executable, false, &mut backend).unwrap();
    assert!(!fixture.path().exists());
    assert!(!backend.trace.contains(&"register"));
}

#[test]
fn registration_failure_keeps_legacy_and_clears_only_confirmed_absent_service() {
    for uncertain in [false, true] {
        let fixture = Fixture::new();
        fixture.save(fixture.legacy());
        let before = fs::read(fixture.path()).unwrap();
        let mut backend = Mock {
            register_result: Err("synthetic registration failure".into()),
            status_after_failed_register: if uncertain {
                ServiceStatus::Enabled
            } else {
                ServiceStatus::NotRegistered
            },
            ..Mock::default()
        };
        assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
        assert_eq!(fs::read(fixture.path()).unwrap(), before);
        assert_eq!(backend.record.is_some(), uncertain);
        assert!(!backend.trace.contains(&"unregister"));
        if uncertain {
            assert!(backend.pending());
        }
    }
}

#[test]
fn failed_pre_registration_record_write_does_not_call_native_registration() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let before = fs::read(fixture.path()).unwrap();
    let mut backend = Mock {
        fail_store: true,
        ..Mock::default()
    };
    assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
    assert!(!backend.trace.contains(&"register"));
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
}

#[test]
fn concurrent_legacy_edit_rolls_back_new_service_and_preserves_edited_bytes() {
    for rollback_fails in [false, true] {
        let fixture = Fixture::new();
        fixture.save(fixture.legacy());
        let mut dictionary = fixture.legacy();
        dictionary.insert("Disabled".into(), Value::Boolean(true));
        let mut edited = Vec::new();
        Value::Dictionary(dictionary)
            .to_writer_xml(&mut edited)
            .unwrap();
        let mut backend = Mock {
            edit_during_register: Some((fixture.path(), edited.clone())),
            unregister_error: rollback_fails.then(|| "synthetic rollback failure".into()),
            ..Mock::default()
        };
        assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
        assert_eq!(fs::read(fixture.path()).unwrap(), edited);
        assert!(backend.trace.contains(&"unregister"));
        assert_eq!(backend.record.is_some(), rollback_fails);
        if rollback_fails {
            assert!(backend.pending());
        }
    }
}

#[test]
fn pending_migration_finishes_retirement_before_refresh_and_handles_already_retired_agent() {
    for has_legacy in [false, true] {
        let fixture = Fixture::new();
        if has_legacy {
            fixture.save(fixture.legacy());
        }
        let mut backend = Mock {
            service: ServiceStatus::Enabled,
            ..Mock::default()
        };
        fixture.record(&mut backend, true);
        reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
        assert!(!fixture.path().exists());
        assert!(!backend.pending());
        assert_eq!(backend.mutations(), ["store_record", "store_record"]);
    }
}

#[test]
fn pending_migration_rolls_back_if_legacy_was_disabled_customized_or_os_denied() {
    for case in ["disabled", "customized", "os_denied"] {
        let fixture = Fixture::new();
        let mut dictionary = fixture.legacy();
        let mut backend = Mock {
            service: ServiceStatus::Enabled,
            ..Mock::default()
        };
        match case {
            "disabled" => {
                dictionary.insert("Disabled".into(), Value::Boolean(true));
            }
            "customized" => {
                dictionary.insert("KeepAlive".into(), Value::Boolean(true));
            }
            "os_denied" => backend.allowed = Ok(false),
            _ => unreachable!(),
        }
        fixture.save(dictionary);
        fixture.record(&mut backend, true);
        let before = fs::read(fixture.path()).unwrap();
        reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
        assert_eq!(
            backend.mutations(),
            ["store_record", "unregister", "clear_record"],
            "{case}"
        );
        assert_eq!(backend.service, ServiceStatus::NotRegistered);
        assert_eq!(fs::read(fixture.path()).unwrap(), before);
    }
}

#[test]
fn enabled_service_refreshes_changed_helper_only_after_unregister_completes() {
    let fixture = Fixture::new();
    let mut backend = Mock {
        service: ServiceStatus::Enabled,
        ..Mock::default()
    };
    fixture.record(&mut backend, false);
    let before = backend.record.clone();
    fs::write(
        fixture.bundle().join(HELPER_PROGRAM),
        b"updated bundled helper",
    )
    .unwrap();
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert_eq!(
        backend.mutations(),
        ["store_record", "unregister", "register", "store_record"]
    );
    assert_ne!(backend.record, before);
    backend.trace.clear();
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert!(backend.mutations().is_empty());
}

#[test]
fn failed_unregister_never_registers_replacement_or_clears_ownership() {
    let fixture = Fixture::new();
    let mut backend = Mock {
        service: ServiceStatus::Enabled,
        unregister_error: Some("native unregister failure".into()),
        ..Mock::default()
    };
    fixture.record(&mut backend, false);
    let before = backend.record.clone();
    fs::write(fixture.bundle().join(HELPER_PROGRAM), b"updated helper").unwrap();
    assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
    assert_eq!(backend.mutations(), ["store_record", "unregister"]);
    assert_ne!(backend.record, before);
    assert!(
        serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap())
            .unwrap()
            .refresh_pending
    );
    fixture.save(fixture.legacy());
    backend.trace.clear();
    assert!(set_enabled(&fixture.agents, &fixture.executable, false, &mut backend).is_err());
    let record =
        serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
    assert!(record.disable_pending);
    assert!(!record.refresh_pending);
    assert!(
        !fixture.path().exists(),
        "explicit opt-out should still remove owned legacy bypass"
    );
    assert_eq!(backend.mutations(), ["store_record", "unregister"]);
}

#[test]
fn another_copy_or_missing_ownership_cannot_modify_registered_service() {
    for missing_record in [false, true] {
        let fixture = Fixture::new();
        let other = Fixture::new();
        let mut backend = Mock {
            service: ServiceStatus::Enabled,
            ..Mock::default()
        };
        if !missing_record {
            other.record(&mut backend, false);
        }
        assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
        assert!(set_enabled(&fixture.agents, &fixture.executable, false, &mut backend).is_err());
        assert!(backend.mutations().is_empty());
    }
}

#[test]
fn malformed_or_linked_helper_configuration_never_registers() {
    for case in [
        "plist",
        "helper_symlink",
        "helper_hardlink",
        "plist_symlink",
    ] {
        let fixture = Fixture::new();
        match case {
            "plist" => {
                fs::write(fixture.bundle().join(SERVICE_PLIST), b"not a property list").unwrap()
            }
            "helper_symlink" | "plist_symlink" => {
                let target = fixture.bundle().join(if case == "helper_symlink" {
                    HELPER_PROGRAM
                } else {
                    SERVICE_PLIST
                });
                let other = fixture.root.join("outside-bundle");
                fs::rename(&target, &other).unwrap();
                symlink(&other, &target).unwrap();
            }
            "helper_hardlink" => fs::hard_link(
                fixture.bundle().join(HELPER_PROGRAM),
                fixture.root.join("helper-link"),
            )
            .unwrap(),
            _ => unreachable!(),
        }
        let mut backend = Mock::default();
        assert!(
            set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).is_err(),
            "{case}"
        );
        assert!(backend.mutations().is_empty(), "{case}");
        assert!(!fixture.agents.exists());
    }
}

#[test]
fn permission_revocation_during_registration_rolls_back_without_retiring_legacy() {
    for permission in [Ok(false), Err("permission became unavailable".into())] {
        let fixture = Fixture::new();
        fixture.save(fixture.legacy());
        let before = fs::read(fixture.path()).unwrap();
        let mut backend = Mock {
            permission_after_register: Some(permission),
            ..Mock::default()
        };
        assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
        assert_eq!(backend.service, ServiceStatus::NotRegistered);
        assert!(backend.record.is_none());
        assert_eq!(fs::read(fixture.path()).unwrap(), before);
        assert_eq!(
            backend.mutations(),
            ["store_record", "register", "unregister", "clear_record"]
        );
    }
}

#[test]
fn interrupted_refresh_resumes_after_unregister_without_creating_legacy() {
    let fixture = Fixture::new();
    let mut backend = Mock::default();
    fixture.record(&mut backend, false);
    let mut record =
        serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
    record.refresh_pending = true;
    backend.record = Some(serde_json::to_string(&record).unwrap());
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert_eq!(backend.service, ServiceStatus::Enabled);
    assert_eq!(
        backend.mutations(),
        ["store_record", "register", "store_record"]
    );
    assert!(!fixture.agents.exists());
    assert!(
        !serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap())
            .unwrap()
            .refresh_pending
    );
}

#[test]
fn interrupted_refresh_never_retries_when_approval_has_been_revoked() {
    let fixture = Fixture::new();
    let mut backend = Mock {
        service: ServiceStatus::RequiresApproval,
        ..Mock::default()
    };
    fixture.record(&mut backend, false);
    let mut record =
        serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
    record.refresh_pending = true;
    backend.record = Some(serde_json::to_string(&record).unwrap());
    reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
    assert_eq!(backend.mutations(), ["store_record"]);
    assert!(!status(&fixture.agents, &fixture.executable, &mut backend).unwrap());
    assert!(
        !serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap())
            .unwrap()
            .refresh_pending
    );
}

#[test]
fn interrupted_explicit_disable_finishes_opt_out_and_never_resumes_refresh() {
    for service in [ServiceStatus::Enabled, ServiceStatus::NotRegistered] {
        let fixture = Fixture::new();
        fixture.save(fixture.legacy());
        let mut backend = Mock {
            service,
            ..Mock::default()
        };
        fixture.record(&mut backend, false);
        let mut record =
            serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
        record.disable_pending = true;
        backend.record = Some(serde_json::to_string(&record).unwrap());
        assert!(!status(&fixture.agents, &fixture.executable, &mut backend).unwrap());
        reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
        assert_eq!(backend.service, ServiceStatus::NotRegistered);
        assert!(backend.record.is_none());
        assert!(!fixture.path().exists());
        assert!(!backend.trace.contains(&"register"));
        backend.trace.clear();
        reconcile(&fixture.agents, &fixture.executable, &mut backend).unwrap();
        assert!(backend.mutations().is_empty());
    }
}

#[test]
fn pending_recovery_flush_failure_does_not_mutate_native_service_or_legacy() {
    for operation in ["migration", "refresh", "disable"] {
        let fixture = Fixture::new();
        fixture.save(fixture.legacy());
        let before = fs::read(fixture.path()).unwrap();
        let mut backend = Mock {
            service: ServiceStatus::Enabled,
            fail_store: true,
            ..Mock::default()
        };
        fixture.record(&mut backend, operation == "migration");
        let mut record =
            serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
        record.refresh_pending = operation == "refresh";
        record.disable_pending = operation == "disable";
        backend.record = Some(serde_json::to_string(&record).unwrap());
        assert!(
            reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err(),
            "{operation}"
        );
        assert_eq!(backend.mutations(), ["store_record"], "{operation}");
        assert_eq!(fs::read(fixture.path()).unwrap(), before);
    }
}

#[test]
fn missing_native_service_keeps_pending_migration_and_legacy_for_recovery() {
    let fixture = Fixture::new();
    fixture.save(fixture.legacy());
    let before = fs::read(fixture.path()).unwrap();
    let mut backend = Mock {
        service: ServiceStatus::NotFound,
        ..Mock::default()
    };
    fixture.record(&mut backend, true);
    assert!(reconcile(&fixture.agents, &fixture.executable, &mut backend).is_err());
    assert!(backend.pending());
    assert_eq!(backend.mutations(), ["store_record"]);
    assert_eq!(fs::read(fixture.path()).unwrap(), before);
}

#[test]
fn explicit_enable_reports_new_approval_requirement_after_safe_legacy_retirement() {
    for has_legacy in [false, true] {
        let fixture = Fixture::new();
        if has_legacy {
            fixture.save(fixture.legacy());
        }
        let mut backend = Mock {
            register_result: Ok(ServiceStatus::RequiresApproval),
            ..Mock::default()
        };
        let result = set_enabled(&fixture.agents, &fixture.executable, true, &mut backend);
        assert!(result.unwrap_err().contains("System Settings"));
        assert!(!fixture.path().exists());
        assert_eq!(backend.service, ServiceStatus::RequiresApproval);
        assert!(!backend.pending());
        backend.trace.clear();
        assert!(set_enabled(&fixture.agents, &fixture.executable, true, &mut backend).is_err());
        assert!(backend.mutations().is_empty());
    }
}

#[test]
fn explicit_enable_reports_approval_requirement_after_resuming_interrupted_refresh() {
    let fixture = Fixture::new();
    let mut backend = Mock {
        register_result: Ok(ServiceStatus::RequiresApproval),
        ..Mock::default()
    };
    fixture.record(&mut backend, false);
    let mut record =
        serde_json::from_str::<RegistrationRecord>(backend.record.as_ref().unwrap()).unwrap();
    record.refresh_pending = true;
    backend.record = Some(serde_json::to_string(&record).unwrap());
    assert!(
        set_enabled(&fixture.agents, &fixture.executable, true, &mut backend)
            .unwrap_err()
            .contains("System Settings")
    );
    assert_eq!(backend.service, ServiceStatus::RequiresApproval);
    assert_eq!(
        backend.mutations(),
        ["store_record", "register", "store_record"]
    );
}
