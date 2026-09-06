use super::*;
use crate::companion_api::{
    reconcile_trusted_lan_server, shutdown_trusted_lan_server,
    start_trusted_lan_server_with_bound_listener,
};
use crate::companion_http::COMPANION_CSRF_HEADER;
use crate::companion_session::COMPANION_SESSION_COOKIE;
use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::security::hash_secret;
use crate::state::{CompanionRuntimeState, TrustedLanCompanionRuntime};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

const DEADLINE: Duration = Duration::from_secs(10);
const SYNTHETIC_FILAMENT: &str = "Detached catalog job synthetic test filament";

struct TestLibrary(PathBuf);

impl TestLibrary {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("catalog-shell-jobs-{}", random_hex_token(16)));
        std::fs::create_dir(&directory).expect("create private test library");
        let library = Self(directory.join("library.db"));
        let db = library.db();
        db.apply_schema().expect("apply synthetic database schema");
        let mut settings = db.get_library_sync_settings().unwrap();
        settings.mode = "HOST".to_string();
        db.save_library_sync_settings(&settings).unwrap();
        library
    }

    fn db(&self) -> FilamentDatabase {
        FilamentDatabase::open(&self.0).expect("open synthetic database")
    }

    fn service(&self) -> CompanionService {
        CompanionService::new_bound_to_current_library(self.0.to_string_lossy().into_owned())
    }

    fn imported_count(&self) -> i64 {
        self.db()
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE filament_name = ?1",
                [SYNTHETIC_FILAMENT],
                |row| row.get(0),
            )
            .unwrap()
    }
}

impl Drop for TestLibrary {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
    }
}

struct ReleaseWorker(Option<mpsc::Sender<()>>);

impl ReleaseWorker {
    fn release(&mut self) {
        if let Some(sender) = self.0.take() {
            let _ = sender.send(());
        }
    }
}

impl Drop for ReleaseWorker {
    fn drop(&mut self) {
        self.release();
    }
}

fn input(id: &str) -> CatalogRefreshJobInput {
    CatalogRefreshJobInput {
        job_id: id.to_string(),
        vendor: "eSUN".to_string(),
        material: "PLA".to_string(),
    }
}

fn summary(imported: i64, output: &str) -> CatalogRefreshResult {
    serde_json::from_value(json!({
        "imported": imported, "detected_store": null, "detected_collection": null,
        "discovered_materials": ["PLA"], "reactivated_count": 0, "discontinued_count": 0,
        "reused_cached_products": 0, "detail_fetches": 0, "output": output,
    }))
    .unwrap()
}

fn import(execution: &CatalogJobExecution) -> Result<CatalogRefreshResult, String> {
    execution.import("eSUN", "PLA", "2026-09-05 00:00:00", &[entry()], |stats| {
        summary(
            stats.imported_count(),
            "Synthetic catalog refresh completed.",
        )
    })
}

fn entry() -> SourceCatalogEntryInput<'static> {
    SourceCatalogEntryInput {
        material: "PLA",
        filament_name: SYNTHETIC_FILAMENT,
        color_name: "Synthetic blue",
        hex_color: Some("#0000FF"),
        product_url: "https://example.invalid/catalog-test",
        default_weight: 1000,
    }
}

fn held_worker(library: &TestLibrary, id: &str) -> (ReleaseWorker, Arc<AtomicUsize>) {
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let invocations = Arc::new(AtomicUsize::new(0));
    let calls = Arc::clone(&invocations);
    // Dropping this accepted response must not cancel the process-owned worker.
    drop(
        start_job_with(library.service(), input(id), move |execution, _| {
            calls.fetch_add(1, Ordering::SeqCst);
            started_tx.send(()).unwrap();
            release_rx
                .recv_timeout(Duration::from_secs(30))
                .map_err(|_| "Synthetic worker was not released.".to_string())?;
            import(execution)
        })
        .unwrap(),
    );
    let release = ReleaseWorker(Some(release_tx));
    started_rx
        .recv_timeout(DEADLINE)
        .expect("detached worker must start");
    (release, invocations)
}

fn terminal(library: &TestLibrary, authority: &str, id: &str) -> CatalogRefreshJobSnapshot {
    let deadline = Instant::now() + DEADLINE;
    loop {
        let job = library
            .db()
            .get_catalog_refresh_job(authority, id)
            .unwrap()
            .unwrap();
        if job.status != "RUNNING" {
            return job;
        }
        assert!(
            Instant::now() < deadline,
            "worker must persist a terminal receipt"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn current_authority(library: &TestLibrary) -> String {
    let _gate = lock_secure_credential_mutation().unwrap();
    authority_key(&library.db()).unwrap()
}

#[test]
fn stale_live_registration_cannot_remove_a_new_worker_reusing_the_same_job_id() {
    let path = std::env::temp_dir().join(format!("catalog-registration-{}", random_hex_token(16)));
    let previous_key = (
        path.clone(),
        "reused-job-id".to_string(),
        random_hex_token(16),
    );
    let current_key = (path, "reused-job-id".to_string(), random_hex_token(16));
    {
        let mut jobs = live_jobs().lock().unwrap();
        jobs.insert(previous_key.clone());
        jobs.insert(current_key.clone());
    }
    let previous = LiveCatalogJob(previous_key.clone());
    let current = LiveCatalogJob(current_key.clone());
    drop(previous);
    {
        let jobs = live_jobs().lock().unwrap();
        assert!(!jobs.contains(&previous_key));
        assert!(
            jobs.contains(&current_key),
            "stale cleanup must preserve the replacement worker"
        );
    }
    drop(current);
    assert!(!live_jobs().lock().unwrap().contains(&current_key));
}

#[test]
fn detached_refresh_is_single_flight_and_status_survives_service_recreation() {
    let library = TestLibrary::new();
    let authority = current_authority(&library);
    let (mut release, calls) = held_worker(&library, "job-a");
    let (status_tx, status_rx) = mpsc::channel();
    let recreated_service = library.service();
    std::thread::spawn(move || status_tx.send(get_job(&recreated_service, None)).unwrap());
    let status = status_rx
        .recv_timeout(DEADLINE)
        .expect("status must respond while source fetch waits")
        .unwrap()
        .unwrap();
    assert_eq!(status.status, "RUNNING");
    assert_eq!(status.job_id, "job-a");
    let replay = start_job_with(library.service(), input("job-a"), |_, _| {
        panic!("same ID must not repeat a worker")
    })
    .unwrap();
    assert_eq!(replay, status);
    assert!(
        start_job_with(library.service(), input("job-b"), |_, _| panic!(
            "busy library must not queue another worker"
        ))
        .is_err()
    );
    assert!(library
        .service()
        .refresh_esun_catalog(Some(vec!["PLA".to_string()]))
        .is_err());
    assert!(library
        .service()
        .refresh_bambu_catalog(Some(vec!["PLA".to_string()]))
        .is_err());
    release.release();
    let completed = terminal(&library, &authority, "job-a");
    assert_eq!(completed.status, "SUCCEEDED");
    assert_eq!(completed.result.as_ref().unwrap()["imported"], 1);
    assert_eq!(library.imported_count(), 1);
    let replay = start_job(library.service(), input("job-a")).unwrap();
    assert_eq!(replay, completed);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn authority_generation_change_during_fetch_rejects_import_and_retires_old_receipt() {
    let library = TestLibrary::new();
    let authority = current_authority(&library);
    let old_service = library.service();
    let (mut release, _) = held_worker(&library, "old-authority-job");
    {
        let _gate = lock_secure_credential_mutation().unwrap();
        let db = library.db();
        let mut settings = db.get_library_sync_settings().unwrap();
        let previous_generation = settings.target_generation;
        settings.host_base_url = Some("http://replacement.invalid:4278".to_string());
        let updated = db.save_library_sync_settings(&settings).unwrap();
        assert!(updated.target_generation > previous_generation);
    }
    release.release();
    let job = terminal(&library, &authority, "old-authority-job");
    assert_eq!(job.status, "FAILED");
    assert!(job.result.is_none());
    assert!(get_job(&old_service, Some("old-authority-job")).is_err());
    assert!(get_job(&library.service(), Some("old-authority-job"))
        .unwrap()
        .is_none());
    assert_eq!(library.imported_count(), 0);
}

#[test]
fn source_unavailable_summary_retires_failed_job_and_allows_a_fresh_request() {
    let library = TestLibrary::new();
    let authority = current_authority(&library);
    start_job_with(library.service(), input("source-failure"), |_, _| {
        Ok(summary(
            0,
            "Synthetic remote source was unavailable. Local catalog was left unchanged.",
        ))
    })
    .unwrap();
    let failed = terminal(&library, &authority, "source-failure");
    assert_eq!(failed.status, "FAILED");
    assert!(failed.result.is_none());
    assert!(failed.error.unwrap().contains("source was unavailable"));
    assert_eq!(library.imported_count(), 0);
    start_job_with(library.service(), input("after-failure"), |execution, _| {
        import(execution)
    })
    .unwrap();
    assert_eq!(
        terminal(&library, &authority, "after-failure").status,
        "SUCCEEDED"
    );
}

#[test]
fn status_recovers_a_worker_that_exited_after_failure_receipt_persistence_failed() {
    let library = TestLibrary::new();
    library.db().connection().execute_batch(
        "CREATE TRIGGER reject_failed_receipt BEFORE UPDATE OF status ON catalog_refresh_jobs
         WHEN NEW.status = 'FAILED' BEGIN SELECT RAISE(ABORT, 'synthetic receipt write failure'); END;",
    ).unwrap();
    start_job_with(library.service(), input("failed-receipt-job"), |_, _| {
        Err("Synthetic fetch failure".to_string())
    })
    .unwrap();
    let deadline = Instant::now() + DEADLINE;
    let job = loop {
        let job = get_job(&library.service(), Some("failed-receipt-job"))
            .unwrap()
            .unwrap();
        if job.status != "RUNNING" {
            break job;
        }
        assert!(
            Instant::now() < deadline,
            "exited worker must not leave an eternal active job"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(job.status, "INTERRUPTED");
    assert_eq!(library.imported_count(), 0);
    let authority = current_authority(&library);
    start_job_with(
        library.service(),
        input("after-receipt-failure"),
        |execution, _| import(execution),
    )
    .unwrap();
    assert_eq!(
        terminal(&library, &authority, "after-receipt-failure").status,
        "SUCCEEDED"
    );
}

#[test]
fn import_summary_panic_rolls_back_without_poisoning_the_authority_gate() {
    let library = TestLibrary::new();
    let authority = current_authority(&library);
    start_job_with(library.service(), input("panic-job"), |execution, _| {
        execution.import("eSUN", "PLA", "2026-09-05 00:00:00", &[entry()], |_| {
            panic!("synthetic summary panic after import before receipt")
        })
    })
    .unwrap();
    assert_eq!(terminal(&library, &authority, "panic-job").status, "FAILED");
    assert_eq!(library.imported_count(), 0);
    assert!(lock_secure_credential_mutation().is_ok());
    start_job_with(library.service(), input("after-panic"), |execution, _| {
        import(execution)
    })
    .unwrap();
    assert_eq!(
        terminal(&library, &authority, "after-panic").status,
        "SUCCEEDED"
    );
    assert_eq!(library.imported_count(), 1);
}

struct ServerCleanup(TrustedLanCompanionRuntime);

impl Drop for ServerCleanup {
    fn drop(&mut self) {
        if let Some(server) = self.0.take_server_handle() {
            server.shutdown().abort();
        }
    }
}

async fn pair(client: &reqwest::Client, library: &TestLibrary, origin: &str) -> (String, String) {
    let token = random_hex_token(16);
    library
        .db()
        .create_trusted_lan_pairing(Some("Synthetic catalog test"), &hash_secret(&token), 600)
        .unwrap();
    let response = client
        .post(format!("{origin}/api/v1/auth/pair"))
        .header("origin", origin)
        .header("content-type", "application/json")
        .body(json!({"pairing_token": token}).to_string())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find_map(|value| {
            value
                .split(';')
                .next()
                .filter(|cookie| cookie.starts_with(&format!("{COMPANION_SESSION_COOKIE}=")))
        })
        .unwrap()
        .to_string();
    let body: serde_json::Value = serde_json::from_str(&response.text().await.unwrap()).unwrap();
    (cookie, body["csrf_token"].as_str().unwrap().to_string())
}

async fn http_job(
    client: &reqwest::Client,
    origin: &str,
    cookie: &str,
) -> CatalogRefreshJobSnapshot {
    let response = client
        .get(format!("{origin}/api/v1/catalog/refresh-jobs/tcp-job"))
        .header("cookie", cookie)
        .send()
        .await
        .expect("authenticated status must respond while source fetch waits");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    serde_json::from_str(&response.text().await.unwrap()).unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn authenticated_tcp_retry_and_server_restart_recover_the_same_detached_job() {
    let library = TestLibrary::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let origin = format!("http://{address}");
    let runtime = TrustedLanCompanionRuntime::new(address.port())
        .with_enabled(true)
        .with_selected_interface("Synthetic loopback", "127.0.0.1")
        .with_qa_mode(true);
    let state = AppState {
        db_path: library.0.to_string_lossy().into_owned(),
        companion: CompanionRuntimeState::new(runtime.clone()),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    let _cleanup = ServerCleanup(runtime.clone());
    start_trusted_lan_server_with_bound_listener(state.clone(), listener)
        .await
        .unwrap();
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(DEADLINE)
        .build()
        .unwrap();
    let (cookie, csrf) = pair(&client, &library, &origin).await;
    let authority = current_authority(&library);
    let (mut release, calls) = held_worker(&library, "tcp-job");
    assert_eq!(http_job(&client, &origin, &cookie).await.status, "RUNNING");
    let retry = client
        .post(format!("{origin}/api/v1/catalog/refresh-jobs"))
        .header("origin", &origin)
        .header("cookie", &cookie)
        .header(COMPANION_CSRF_HEADER, &csrf)
        .header("content-type", "application/json")
        .body(serde_json::to_string(&input("tcp-job")).unwrap())
        .send()
        .await
        .unwrap();
    assert_eq!(retry.status(), reqwest::StatusCode::OK);
    // The client may disappear after acceptance; no retry creates another worker.
    drop(retry);
    let conflict = client
        .post(format!("{origin}/api/v1/catalog/refresh-jobs"))
        .header("origin", &origin)
        .header("cookie", &cookie)
        .header(COMPANION_CSRF_HEADER, &csrf)
        .header("content-type", "application/json")
        .body(serde_json::to_string(&input("competing-tcp-job")).unwrap())
        .send()
        .await
        .unwrap();
    assert_eq!(conflict.status(), reqwest::StatusCode::CONFLICT);
    tokio::time::timeout(DEADLINE, reconcile_trusted_lan_server(state.clone()))
        .await
        .expect("routine server restart must not wait for a detached source fetch")
        .unwrap();
    assert!(runtime.running());
    let (restarted_cookie, _) = pair(&client, &library, &origin).await;
    assert_eq!(
        http_job(&client, &origin, &restarted_cookie).await.status,
        "RUNNING"
    );
    release.release();
    assert_eq!(
        terminal(&library, &authority, "tcp-job").status,
        "SUCCEEDED"
    );
    let completed = http_job(&client, &origin, &restarted_cookie).await;
    assert_eq!(completed.result.unwrap()["imported"], 1);
    assert_eq!(library.imported_count(), 1);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    shutdown_trusted_lan_server(&state).await;
}
