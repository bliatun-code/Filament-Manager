use super::*;
use crate::app_services::CompanionService;
use crate::backend::filament_database::FilamentDatabase;
use crate::backend::inventory_engine::{CreateManualSpoolInput, InventoryEngine};
use crate::companion_session::random_hex_token;
use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
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

const LIBRARY_ID: &str = "synthetic-batch-host";
type RequestLog = Vec<(String, String)>;
// Network scenarios share the process HTTP client and authority gate. Keep the
// synthetic listeners serial so setup contention cannot consume a health deadline.
static NETWORK_TEST_LOCK: Mutex<()> = Mutex::new(());

struct TestDirectory(PathBuf);
impl TestDirectory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("catalog-batch-{}", random_hex_token(16)));
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
    master_id: String,
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
    fn start(capable: bool, drop_first_response: bool) -> Self {
        let directory = TestDirectory::new();
        let db_path = directory.0.join("host.db");
        let master_id = seed(&db_path, "original-host-roll");
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
            let mut post_count = 0;
            while !stop.load(Ordering::Acquire) {
                let mut stream = match listener.accept() {
                    Ok((stream, _)) => stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(error) => panic!("synthetic Host accept: {error}"),
                };
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
                let post = request_line == "POST /api/v1/spools/catalog-batch HTTP/1.1";
                let (status, body) = if health {
                    ("200 OK", serde_json::json!({"ok":true,"api_version":"v1",
                        "capabilities": if capable { vec![CATALOG_SPOOL_BATCH_CAPABILITY] } else { vec![] },
                        "auth_mode":"pairing-session","access_mode":"trusted-lan", "library_id":LIBRARY_ID,
                        "device_name":"Synthetic batch Host","sync_mode":"HOST"}).to_string())
                } else if post {
                    post_count += 1;
                    let input: CatalogSpoolBatchInput = serde_json::from_str(&payload).unwrap();
                    let receipt = service.create_catalog_spool_batch(input).unwrap();
                    ("200 OK", serde_json::to_string(&receipt).unwrap())
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
                if post && post_count == 1 && drop_first_response {
                    continue;
                }
                write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
                stream.flush().unwrap();
            }
            requests
        });
        Self {
            base_url,
            master_id,
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

fn input(host: &SyntheticHost, generation: u64) -> LibrarySyncCatalogSpoolBatchInput {
    LibrarySyncCatalogSpoolBatchInput {
        base_url: host.base_url.clone(),
        expected_library_id: LIBRARY_ID.into(),
        expected_target_generation: generation,
        batch: CatalogSpoolBatchInput {
            batch_id: "lost-response-batch".into(),
            master_ids: vec![host.master_id.clone(), host.master_id.clone()],
            initial_weight_g: 850,
            ownership_type: "BORROWED_IN".into(),
            owner_name: Some("Synthetic owner".into()),
            owner_contact: None,
            ownership_note: None,
            location: Some("Batch dry box".into()),
        },
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
        "catalog_spool_batches",
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
fn catalog_batch_lost_response_retry_returns_same_real_host_receipt_without_client_shadow_writes() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, true);
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    let error =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap_err();
    assert!(!error.contains("inventory.batch.invalid"));
    let host_committed = snapshot(host.db_path.to_str().unwrap());
    assert_eq!(host_committed[1].len(), 3);
    assert_eq!(host_committed[2].len(), 2);
    assert_eq!(host_committed[6].len(), 1);
    // The transaction is already saved; even failing local success/status persistence
    // on retry must leave the authoritative receipt successful.
    FilamentDatabase::open(&state.db_path)
        .unwrap()
        .connection()
        .execute_batch(
            "CREATE TRIGGER reject_batch_validation_status BEFORE INSERT ON settings
         WHEN NEW.key = 'library_sync_last_checked_at'
         BEGIN SELECT RAISE(ABORT, 'synthetic validation persistence failure'); END;",
        )
        .unwrap();
    let receipt =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap();
    let saved = FilamentDatabase::open(&host.db_path)
        .unwrap()
        .get_catalog_spool_batch_receipt("lost-response-batch")
        .unwrap()
        .unwrap();
    assert_eq!(receipt, saved);
    assert_eq!(snapshot(host.db_path.to_str().unwrap()), host_committed);
    assert_eq!(snapshot(&state.db_path), before);
    let requests = host.finish();
    assert!(
        requests
            .iter()
            .any(|(line, _)| line.starts_with("GET /api/v1/library/loans?")),
        "borrowed batch must also refresh the scoped loan cache"
    );
    let posts: Vec<_> = requests
        .iter()
        .filter(|(line, _)| line.starts_with("POST "))
        .collect();
    assert_eq!(
        posts.len(),
        2,
        "transport must not automatically resend a lost acknowledgement"
    );
    assert_eq!(
        posts[0], posts[1],
        "explicit retry must preserve the exact idempotent request"
    );
}

#[test]
fn catalog_batch_lost_response_retry_after_host_backup_restore_preserves_original_receipt() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, true);
    let (_directory, state, generation) = client(&host, true);
    let client_before = snapshot(&state.db_path);
    create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
        .expect_err("the Host commits but drops its first acknowledgement");

    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let receipt = db
        .get_catalog_spool_batch_receipt("lost-response-batch")
        .unwrap()
        .unwrap();
    let backup = db.export_full_backup_json().unwrap();
    let portable: serde_json::Value = serde_json::from_str(&backup).unwrap();
    assert!(portable["tables"].get("catalog_spool_batches").is_none());
    db.import_full_backup_json(&backup).unwrap();
    // Full JSON restore excludes role/auth settings. Restore the authoritative
    // Host role explicitly; the synthetic HTTP dispatcher uses this real database.
    db.set_setting("library_sync_mode", "HOST").unwrap();
    assert_eq!(db.get_library_sync_library_id().unwrap(), LIBRARY_ID);
    assert_eq!(
        db.get_catalog_spool_batch_receipt("lost-response-batch")
            .unwrap(),
        Some(receipt.clone()),
        "installation-local receipts must survive restoring the same library"
    );
    drop(db);

    let restored = snapshot(host.db_path.to_str().unwrap());
    assert_eq!(restored[1].len(), 3);
    assert_eq!(restored[2].len(), 2);
    assert_eq!(restored[6].len(), 1);
    let replay =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap();
    assert_eq!(replay, receipt);
    assert_eq!(
        snapshot(host.db_path.to_str().unwrap()),
        restored,
        "retry after restore must not recreate rolls, loans, history or revisions"
    );
    assert_eq!(snapshot(&state.db_path), client_before);
    let requests = host.finish();
    let posts: Vec<_> = requests
        .iter()
        .filter(|(line, _)| line.starts_with("POST "))
        .collect();
    assert_eq!(posts.len(), 2);
    assert_eq!(
        posts[0], posts[1],
        "same-ID retry sends the original payload"
    );
}

#[test]
fn catalog_batch_older_host_fails_before_auth_or_post() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(false, false);
    let (_directory, state, generation) = client(&host, false);
    let before = snapshot(&state.db_path);
    let error =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap_err();
    assert!(error.contains("inventory.batch.host_unsupported"));
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".into(), String::new())]
    );
    assert_eq!(snapshot(&state.db_path), before);
}

#[test]
fn catalog_batch_stale_persisted_request_is_rejected_before_any_network_request() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, false);
    let (_directory, state, generation) = client(&host, true);
    cycle_target(&state.db_path);
    let before = snapshot(&state.db_path);
    let error =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap_err();
    assert!(error.contains("common.invalid_request"));
    assert!(host.finish().is_empty());
    assert_eq!(snapshot(&state.db_path), before);
}

#[test]
fn catalog_batch_target_a_b_a_during_health_prevents_the_post() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, false);
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    host.transition_at(TransitionAt::Health, &state);
    let error =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap_err();
    assert!(error.contains("common.invalid_request"));
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".into(), String::new())]
    );
    assert_eq!(snapshot(&state.db_path), before);
}

#[test]
fn catalog_batch_late_response_after_target_cycle_cannot_publish_or_cache_into_new_scope() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, false);
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    host.transition_at(TransitionAt::Post, &state);
    let error =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap_err();
    assert!(error.contains("common.invalid_request"));
    let requests = host.finish();
    assert_eq!(requests.len(), 2);
    assert!(requests[1]
        .0
        .starts_with("POST /api/v1/spools/catalog-batch "));
    assert_eq!(snapshot(&state.db_path), before);
    let settings = FilamentDatabase::open(&state.db_path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap();
    assert!(settings.cached_spools.is_none());
    assert!(settings.last_validation_message.is_none());
}

#[test]
fn catalog_batch_committed_receipt_survives_target_change_during_best_effort_refresh() {
    let _network_test = NETWORK_TEST_LOCK.lock().unwrap();
    let mut host = SyntheticHost::start(true, false);
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    host.transition_at(TransitionAt::Cache, &state);
    let receipt =
        create_library_sync_host_catalog_spool_batch_blocking(&state, input(&host, generation))
            .unwrap();
    assert_eq!(receipt.spool_ids.len(), 2);
    host.finish();
    assert_eq!(snapshot(&state.db_path), before);
    let settings = FilamentDatabase::open(&state.db_path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap();
    assert!(settings.cached_spools.is_none());
    assert!(settings.last_validation_message.is_none());
}
