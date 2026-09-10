use super::*;
use crate::app_services::CompanionService;
use crate::backend::filament_database::FilamentDatabase;
use crate::backend::inventory_engine::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, InventoryEngine,
    PrinterSlotOperationInput,
};
use crate::companion_session::random_hex_token;
use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::printer_slot_write_commands::operate_printer_slot_blocking;
use crate::state::{CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT};
use rusqlite::types::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

const LIBRARY_ID: &str = "synthetic-slot-host";
type RequestLog = Vec<(String, String)>;
// Network scenarios share the process HTTP client and authority gate. Keep the
// synthetic listeners serial so setup contention cannot consume a health deadline.
static NETWORK_TEST_LOCK: Mutex<()> = Mutex::new(());

struct TestDirectory(PathBuf);
impl TestDirectory {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("printer-slot-operation-{}", random_hex_token(16)));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[derive(Clone, Copy, Default)]
enum TransitionAt {
    #[default]
    Never,
    Health,
    Post,
    Cache,
}

struct SyntheticHost {
    base_url: String,
    db_path: PathBuf,
    stopped: Arc<AtomicBool>,
    transition: Arc<Mutex<(TransitionAt, Option<String>)>>,
    server: Option<std::thread::JoinHandle<RequestLog>>,
    _directory: TestDirectory,
}

fn seed(path: &std::path::Path, spool_id: &str) -> String {
    let db = FilamentDatabase::open(path).unwrap();
    db.apply_schema().unwrap();
    let engine = InventoryEngine::new(db);
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: spool_id.into(),
            material: "PLA".into(),
            filament_name: "Synthetic basic".into(),
            color_name: "White".into(),
            hex_color: Some("#ffffff".into()),
            product_url: None,
            vendor: Some("Manual".into()),
            default_weight_g: Some(1000),
            qr_code: None,
            status: Some("IN_STOCK".into()),
            ownership_type: Some("OWNED".into()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            location: Some("Original shelf".into()),
        })
        .unwrap();
    FilamentDatabase::open(path)
        .unwrap()
        .get_spool_by_id(spool_id)
        .unwrap()
        .unwrap()
        .master_id
}

impl SyntheticHost {
    fn start(capable: bool, acknowledgment: serde_json::Value) -> Self {
        let directory = TestDirectory::new();
        let db_path = directory.0.join("host.db");
        seed(&db_path, "original-host-roll");
        seed(&db_path, "incoming-host-roll");
        let engine = InventoryEngine::new(FilamentDatabase::open(&db_path).unwrap());
        engine
            .create_printer(CreatePrinterInput {
                id: "printer / one".into(),
                model: "Bambu X1C".into(),
                name: "Synthetic slot printer".into(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .unwrap();
        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer / one".into(),
                slot_id: "printer / one_ams_1_slot_1".into(),
                spool_id: Some("original-host-roll".into()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .unwrap();
        drop(engine);
        let db = FilamentDatabase::open(&db_path).unwrap();
        db.set_setting("library_sync_library_id", LIBRARY_ID)
            .unwrap();
        drop(db);
        let service = CompanionService::new(db_path.to_string_lossy().into_owned());
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&stopped);
        let transition = Arc::new(Mutex::new((TransitionAt::Never, None::<String>)));
        let transition_state = Arc::clone(&transition);
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            while !stop.load(Ordering::Acquire) {
                let mut stream = match listener.accept() {
                    Ok((stream, _)) => stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(error) => panic!("synthetic Host accept: {error}"),
                };
                // macOS inherits the listener's nonblocking flag. The HTTP
                // reader must wait for bytes even when accept wins that race.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let (request_line, payload) = {
                    let mut reader = BufReader::new(&mut stream);
                    let mut request_line = String::new();
                    reader.read_line(&mut request_line).unwrap();
                    let mut content_length = 0;
                    loop {
                        let mut line = String::new();
                        if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                            break;
                        }
                        if let Some(value) =
                            line.to_ascii_lowercase().strip_prefix("content-length:")
                        {
                            content_length = value.trim().parse::<usize>().unwrap();
                        }
                    }
                    assert!(content_length < 64 * 1024);
                    let mut body = vec![0; content_length];
                    reader.read_exact(&mut body).unwrap();
                    (
                        request_line.trim().to_string(),
                        String::from_utf8(body).unwrap(),
                    )
                };
                let health = request_line.starts_with("GET /api/v1/health ");
                let post = request_line
                    == format!(
                        "POST /api/v1/printers/{}/slots/{}/operation HTTP/1.1",
                        encode_library_sync_path_segment("printer / one"),
                        encode_library_sync_path_segment("printer / one_ams_1_slot_1")
                    );
                let (status, body) = if health {
                    ("200 OK", serde_json::json!({"ok":true,"api_version":"v1",
                        "capabilities": if capable { vec![PRINTER_SLOT_OPERATIONS_CAPABILITY] } else { vec![] },
                        "auth_mode":"pairing-session","access_mode":"trusted-lan", "library_id":LIBRARY_ID,
                        "device_name":"Synthetic slot Host","sync_mode":"HOST"}).to_string())
                } else if post {
                    let mut value: serde_json::Value = serde_json::from_str(&payload).unwrap();
                    value["printer_id"] = "printer / one".into();
                    value["slot_id"] = "printer / one_ams_1_slot_1".into();
                    let input: PrinterSlotOperationInput = serde_json::from_value(value).unwrap();
                    service.operate_printer_slot(input).unwrap();
                    ("200 OK", acknowledgment.to_string())
                } else {
                    // Failed inventory/location reads exercise best-effort cache refresh.
                    (
                        "500 Internal Server Error",
                        serde_json::json!({"code":"common.internal"}).to_string(),
                    )
                };
                requests.push((request_line, payload));
                let mut pending = transition_state.lock().unwrap();
                if matches!(
                    (pending.0, health, post),
                    (TransitionAt::Health, true, _)
                        | (TransitionAt::Post, _, true)
                        | (TransitionAt::Cache, false, false)
                ) {
                    cycle_target(pending.1.as_deref().unwrap());
                    pending.0 = TransitionAt::Never;
                }
                drop(pending);
                write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
                stream.flush().unwrap();
            }
            requests
        });
        Self {
            base_url,
            db_path,
            stopped,
            transition,
            server: Some(server),
            _directory: directory,
        }
    }

    fn transition_at(&self, at: TransitionAt, state: &AppState) {
        *self.transition.lock().unwrap() = (at, Some(state.db_path.clone()));
    }

    fn finish(&mut self) -> RequestLog {
        self.stopped.store(true, Ordering::Release);
        self.server.take().unwrap().join().unwrap()
    }
}
impl Drop for SyntheticHost {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Some(server) = self.server.take() {
            let _ = server.join();
        }
    }
}

fn client(host: &SyntheticHost, authenticated: bool) -> (TestDirectory, AppState, u64) {
    let directory = TestDirectory::new();
    let path = directory.0.join("client.db");
    seed(&path, "client-shadow-roll");
    let db = FilamentDatabase::open(&path).unwrap();
    let mut settings = db.get_library_sync_settings().unwrap();
    settings.mode = "CLIENT".into();
    settings.library_id = LIBRARY_ID.into();
    settings.host_base_url = Some(host.base_url.clone());
    let generation = db
        .save_library_sync_settings(&settings)
        .unwrap()
        .target_generation;
    drop(db);
    let state = AppState {
        db_path: path.to_string_lossy().into_owned(),
        companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
            TRUSTED_LAN_DEFAULT_PORT,
        )),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    if authenticated {
        state
            .library_sync_auth
            .replace_authenticated(&host.base_url, "session", "csrf", "device")
            .unwrap();
    }
    (directory, state, generation)
}

fn operation() -> DesktopPrinterSlotOperationInput {
    serde_json::from_value(serde_json::json!({
        "printer_id": "printer / one", "slot_id": "printer / one_ams_1_slot_1",
        "expected_current_spool_id": "original-host-roll", "target_spool_id": "incoming-host-roll",
        "outgoing_measured_total_g": 850, "incoming_measured_total_g": 700,
    }))
    .unwrap()
}

fn input(host: &SyntheticHost, generation: u64) -> LibrarySyncPrinterSlotOperationInput {
    LibrarySyncPrinterSlotOperationInput {
        base_url: host.base_url.clone(),
        expected_library_id: LIBRARY_ID.into(),
        expected_target_generation: generation,
        operation: operation(),
    }
}

fn snapshot(path: &str) -> Vec<Vec<Vec<Value>>> {
    let db = FilamentDatabase::open(path).unwrap();
    [
        "filament_master_list",
        "filament_spools",
        "spool_loans",
        "inventory_locations",
        "spool_history_events",
        "library_domain_revisions",
        "printers",
        "ams_units",
        "ams_slots",
    ]
    .iter()
    .map(|table| {
        let mut statement = db
            .connection()
            .prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))
            .unwrap();
        let columns = statement.column_count();
        statement
            .query_map([], |row| (0..columns).map(|i| row.get(i)).collect())
            .unwrap()
            .collect::<Result<Vec<Vec<Value>>, _>>()
            .unwrap()
    })
    .collect()
}

fn cycle_target(path: &str) {
    let _gate = crate::secure_credential_mutation::lock_secure_credential_mutation().unwrap();
    let db = FilamentDatabase::open(path).unwrap();
    let original = db.get_library_sync_settings().unwrap();
    let mut next = original.clone();
    next.library_id = "another-library".into();
    next.host_base_url = Some("http://another.local:4278".into());
    db.save_library_sync_settings(&next).unwrap();
    db.save_library_sync_settings(&original).unwrap();
}

#[test]
fn printer_slot_boundary_requires_both_nullable_ids_and_rejects_blank_values() {
    let complete = serde_json::json!({
        "printer_id":"printer", "slot_id":"slot", "expected_current_spool_id":null,
        "target_spool_id":null, "outgoing_measured_total_g":null, "incoming_measured_total_g":null,
    });
    assert!(
        serde_json::from_value::<DesktopPrinterSlotOperationInput>(complete.clone())
            .unwrap()
            .into_operation()
            .is_ok()
    );
    for field in ["expected_current_spool_id", "target_spool_id"] {
        for missing in [true, false] {
            let mut value = complete.clone();
            if missing {
                value.as_object_mut().unwrap().remove(field);
            } else {
                value[field] = "   ".into();
            }
            let error = serde_json::from_value::<DesktopPrinterSlotOperationInput>(value)
                .unwrap()
                .into_operation()
                .unwrap_err();
            assert!(error.contains("common.invalid_request"));
        }
    }
}

#[test]
fn printer_slot_local_command_rejects_client_shadow_mutation() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, _) = client(&host, true);
    let before = snapshot(&state.db_path);
    let error = operate_printer_slot_blocking(&state, operation()).unwrap_err();
    assert!(error.contains("common.forbidden"));
    assert_eq!(snapshot(&state.db_path), before);
    assert!(host.finish().is_empty());
}

#[test]
fn printer_slot_wrong_target_or_generation_fails_before_network() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    for wrong in ["library", "url", "generation", "blank-library"] {
        let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let before = snapshot(&state.db_path);
        let mut request = input(&host, generation);
        match wrong {
            "library" => request.expected_library_id = "another-library".into(),
            "url" => request.base_url = "http://127.0.0.1:1".into(),
            "generation" => request.expected_target_generation += 1,
            _ => request.expected_library_id = " ".into(),
        }
        let error = operate_library_sync_host_printer_slot_blocking(&state, request).unwrap_err();
        assert!(error.contains("common.invalid_request"), "{wrong}: {error}");
        assert_eq!(snapshot(&state.db_path), before);
        assert!(host.finish().is_empty());
    }
}

#[test]
fn printer_slot_legacy_host_fails_before_authentication_or_post() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(false, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, false);
    let before = snapshot(&state.db_path);
    let error = operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation))
        .unwrap_err();
    assert!(error.contains("printers.slot_operation_host_unsupported"));
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".into(), String::new())]
    );
    assert_eq!(snapshot(&state.db_path), before);
}

#[test]
fn printer_slot_current_host_gets_one_atomic_post_and_refresh_failure_preserves_success() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true, "message":"saved"}));
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    FilamentDatabase::open(&state.db_path)
        .unwrap()
        .connection()
        .execute_batch(
            "CREATE TRIGGER reject_slot_status BEFORE INSERT ON settings
         WHEN NEW.key = 'library_sync_last_checked_at'
         BEGIN SELECT RAISE(ABORT, 'synthetic status failure'); END;",
        )
        .unwrap();
    operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation)).unwrap();
    assert_eq!(snapshot(&state.db_path), before);
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let actual: String = db
        .connection()
        .query_row(
            "SELECT spool_id FROM ams_slots WHERE id = 'printer / one_ams_1_slot_1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(actual, "incoming-host-roll");
    let requests = host.finish();
    let posts: Vec<_> = requests
        .iter()
        .filter(|(line, _)| line.starts_with("POST "))
        .collect();
    assert_eq!(posts.len(), 1);
    assert!(posts[0].0.contains("printer%20%2F%20one"));
    assert!(posts[0].0.ends_with("/operation HTTP/1.1"));
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&posts[0].1).unwrap(),
        serde_json::json!({
            "expected_current_spool_id":"original-host-roll", "target_spool_id":"incoming-host-roll",
            "outgoing_measured_total_g":850, "incoming_measured_total_g":700,
        })
    );
    assert!(requests
        .iter()
        .any(|(line, _)| line.starts_with("GET /api/v1/library/printers ")));
    assert!(requests
        .iter()
        .any(|(line, _)| line.starts_with("GET /api/v1/library/spools?")));
}

#[test]
fn printer_slot_target_cycle_during_health_prevents_post() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    host.transition_at(TransitionAt::Health, &state);
    let error = operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation))
        .unwrap_err();
    assert!(error.contains("common.invalid_request"));
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".into(), String::new())]
    );
}

#[test]
fn printer_slot_stale_acknowledgment_cannot_refresh_the_new_target_scope() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    host.transition_at(TransitionAt::Post, &state);
    let error = operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation))
        .unwrap_err();
    assert!(error.contains("common.invalid_request"));
    assert_eq!(host.finish().len(), 2);
    assert_eq!(snapshot(&state.db_path), before);
    let settings = FilamentDatabase::open(&state.db_path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap();
    assert!(settings.cached_spools.is_none());
    assert!(settings.cached_printers.is_none());
    assert!(settings.last_validation_message.is_none());
}

#[test]
fn printer_slot_confirmed_commit_survives_target_change_during_refresh() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    host.transition_at(TransitionAt::Cache, &state);
    operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation)).unwrap();
    assert_eq!(snapshot(&state.db_path), before);
    // The spool refresh must retain the original guard, not recapture A after A -> B -> A.
    let requests = host.finish();
    assert_eq!(requests.len(), 3);
    let settings = FilamentDatabase::open(&state.db_path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap();
    assert!(settings.cached_spools.is_none());
    assert!(settings.cached_printers.is_none());
    assert!(settings.last_validation_message.is_none());
}

#[test]
fn printer_slot_requires_a_well_formed_positive_acknowledgment() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    for acknowledgment in [
        serde_json::json!({"ok":false}),
        serde_json::json!({}),
        serde_json::json!({"ok":"true"}),
        serde_json::json!(null),
    ] {
        let mut host = SyntheticHost::start(true, acknowledgment);
        let (_directory, state, generation) = client(&host, true);
        assert!(
            operate_library_sync_host_printer_slot_blocking(&state, input(&host, generation))
                .is_err()
        );
        assert_eq!(host.finish().len(), 2);
    }
}
