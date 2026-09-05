use super::*;
use crate::companion_api::{
    reconcile_trusted_lan_server, COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS,
};
use axum::middleware::Next;
use tokio::sync::{oneshot, Semaphore};

const TEST_DEADLINE: Duration = Duration::from_secs(8);

struct AbortTask<T>(tokio::task::JoinHandle<T>);

impl<T> Drop for AbortTask<T> {
    fn drop(&mut self) {
        self.0.abort();
    }
}

struct TestLibrary(PathBuf);

impl Drop for TestLibrary {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", self.0.display()));
        }
    }
}

struct TestServerCleanup {
    runtime: TrustedLanCompanionRuntime,
    release_response: Arc<Semaphore>,
}

impl Drop for TestServerCleanup {
    fn drop(&mut self) {
        // Also release an accepted response if an assertion fails during drain.
        self.release_response.add_permits(1);
        if let Some(server) = self.runtime.take_server_handle() {
            server.shutdown().abort();
        }
    }
}

fn app_state(runtime: TrustedLanCompanionRuntime, db_path: &Path) -> AppState {
    AppState {
        db_path: db_path.to_string_lossy().into_owned(),
        companion: CompanionRuntimeState::new(runtime),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    }
}

async fn observed(signal: &Semaphore) {
    tokio::time::timeout(TEST_DEADLINE, signal.acquire())
        .await
        .expect("lifecycle signal must arrive")
        .expect("lifecycle signal stays open")
        .forget();
}

#[tokio::test]
async fn restart_drains_an_active_post_before_rebinding_the_same_port() {
    let library = TestLibrary(temp_db_path("restart-drain"));
    seed_db(&library.0).expect("seed private test library");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback listener");
    let address = listener.local_addr().unwrap();
    let runtime = TrustedLanCompanionRuntime::new(address.port())
        .with_selected_interface("Test interface", "127.0.0.1")
        .with_enabled(true)
        .with_qa_mode(true);
    let state = app_state(runtime.clone(), &library.0);
    let api_state = CompanionApiState::new(
        state.db_path.clone(),
        runtime.clone(),
        state.credentials.clone(),
    );
    let response_ready = Arc::new(Semaphore::new(0));
    let release_response = Arc::new(Semaphore::new(0));
    let _cleanup = TestServerCleanup {
        runtime: runtime.clone(),
        release_response: release_response.clone(),
    };
    let ready = response_ready.clone();
    let release = release_response.clone();
    let router = build_router(api_state).layer(middleware::from_fn(
        move |request: Request<Body>, next: Next| {
            let ready = ready.clone();
            let release = release.clone();
            async move {
                let hold_response = request.uri().path() == "/api/v1/spools/spool_1/weight";
                let response = next.run(request).await;
                if hold_response {
                    ready.add_permits(1);
                    release.acquire().await.unwrap().forget();
                }
                response
            }
        },
    ));
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let draining = Arc::new(Semaphore::new(0));
    let drain_started = draining.clone();
    let server = tauri::async_runtime::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
            drain_started.add_permits(1);
        })
        .await
        .expect("serve test router");
    });
    runtime.install_server_handle(shutdown_tx, server);
    runtime.mark_running();

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap();
    let origin = format!("http://{address}");
    let pairing_token = "drain-test-pairing-token";
    FilamentDatabase::open(&library.0)
        .unwrap()
        .create_trusted_lan_pairing(Some("Drain test"), &hash_secret(pairing_token), 600)
        .unwrap();
    let pair = client
        .post(format!("{origin}/api/v1/auth/pair"))
        .header("origin", &origin)
        .header("content-type", "application/json")
        .body(format!(r#"{{"pairing_token":"{pairing_token}"}}"#))
        .send()
        .await
        .unwrap();
    assert_eq!(pair.status(), StatusCode::OK);
    let cookie = extract_named_cookie(pair.headers(), COMPANION_SESSION_COOKIE).unwrap();
    let csrf = extract_csrf_token(&pair.text().await.unwrap()).unwrap();
    let post = client
        .post(format!("{origin}/api/v1/spools/spool_1/weight"))
        .header("origin", &origin)
        .header("content-type", "application/json")
        .header("cookie", format!("{COMPANION_SESSION_COOKIE}={cookie}"))
        .header(COMPANION_CSRF_HEADER, csrf)
        .body(r#"{"grams":740}"#);
    let mut request = AbortTask(tokio::spawn(async move {
        let response = post.send().await.expect("receive definitive POST result");
        (response.status(), response.text().await.unwrap())
    }));
    observed(&response_ready).await;
    let mut restart = AbortTask(tokio::spawn(reconcile_trusted_lan_server(state.clone())));
    observed(&draining).await;

    // The old implementation can still deliver the accepted POST after aborting
    // the top-level Axum task. Only this pending-restart assertion catches it.
    assert!(
        tokio::time::timeout(
            Duration::from_secs(COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS)
                + Duration::from_millis(300),
            &mut restart.0,
        )
        .await
        .is_err(),
        "restart must wait past the app-exit grace period"
    );
    assert!(!request.0.is_finished());
    assert!(
        tokio::net::TcpStream::connect(address).await.is_err(),
        "the old listener must stop accepting connections while draining"
    );

    release_response.add_permits(1);
    let (status, body) = tokio::time::timeout(TEST_DEADLINE, &mut request.0)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(status, StatusCode::OK, "{body}");
    tokio::time::timeout(TEST_DEADLINE, &mut restart.0)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(runtime.running());
    let health = client
        .get(format!("{origin}/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);
    let _ = health.bytes().await.unwrap();
    let db = FilamentDatabase::open(&library.0).unwrap();
    let weight: i64 = db
        .connection()
        .query_row(
            "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let history: i64 = db.connection().query_row(
        "SELECT COUNT(*) FROM spool_history_events WHERE spool_id = 'spool_1' AND event_type = 'WEIGHT_UPDATED'",
        [], |row| row.get(0),
    ).unwrap();
    assert_eq!(weight, 740);
    assert_eq!(history, 1);
    drop(db);
    tokio::time::timeout(TEST_DEADLINE, shutdown_trusted_lan_server(&state))
        .await
        .unwrap();
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}

struct DropSignal(Option<oneshot::Sender<()>>);

impl Drop for DropSignal {
    fn drop(&mut self) {
        if let Some(signal) = self.0.take() {
            let _ = signal.send(());
        }
    }
}

fn install_stuck_server() -> (AppState, Arc<Semaphore>, oneshot::Receiver<()>) {
    let state = app_state(
        trusted_lan_runtime_for_address("127.0.0.1").with_qa_mode(true),
        Path::new("unused-lifecycle-test.db"),
    );
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (dropped_tx, dropped_rx) = oneshot::channel();
    let draining = Arc::new(Semaphore::new(0));
    let drain_started = draining.clone();
    let server = tauri::async_runtime::spawn(async move {
        let _drop_signal = DropSignal(Some(dropped_tx));
        let _ = shutdown_rx.await;
        drain_started.add_permits(1);
        std::future::pending::<()>().await;
    });
    state
        .companion
        .trusted_lan
        .install_server_handle(shutdown_tx, server);
    (state, draining, dropped_rx)
}

#[tokio::test]
async fn app_shutdown_bounds_a_stuck_server() {
    let (state, draining, dropped) = install_stuck_server();
    let started = tokio::time::Instant::now();
    tokio::time::timeout(TEST_DEADLINE, shutdown_trusted_lan_server(&state))
        .await
        .expect("app shutdown must stay bounded");
    observed(&draining).await;
    tokio::time::timeout(TEST_DEADLINE, dropped)
        .await
        .unwrap()
        .unwrap();
    assert!(started.elapsed() >= Duration::from_secs(COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS));
    assert!(state.companion.trusted_lan.shutting_down());
    assert!(!state.companion.trusted_lan.running());
    assert!(state.companion.trusted_lan.take_server_handle().is_none());
}

#[tokio::test]
async fn app_shutdown_interrupts_an_existing_restart_drain_without_rebinding() {
    let (state, draining, dropped) = install_stuck_server();
    let mut restart = AbortTask(tokio::spawn(reconcile_trusted_lan_server(state.clone())));
    observed(&draining).await;
    let started = tokio::time::Instant::now();
    tokio::time::timeout(TEST_DEADLINE, shutdown_trusted_lan_server(&state))
        .await
        .expect("shutdown must interrupt the restart holding the reconciliation gate");
    tokio::time::timeout(TEST_DEADLINE, &mut restart.0)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    tokio::time::timeout(TEST_DEADLINE, dropped)
        .await
        .unwrap()
        .unwrap();
    assert!(started.elapsed() >= Duration::from_secs(COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS));
    assert!(!state.companion.trusted_lan.running());
    assert!(state.companion.trusted_lan.take_server_handle().is_none());
}

#[tokio::test]
async fn cancelled_reconciliation_does_not_detach_the_server_task() {
    let (state, draining, dropped) = install_stuck_server();
    let mut restart = AbortTask(tokio::spawn(reconcile_trusted_lan_server(state.clone())));
    observed(&draining).await;
    restart.0.abort();
    assert!((&mut restart.0).await.unwrap_err().is_cancelled());
    tokio::time::timeout(TEST_DEADLINE, dropped)
        .await
        .expect("cancelling reconciliation must abort its owned server task")
        .unwrap();
    tokio::time::timeout(TEST_DEADLINE, shutdown_trusted_lan_server(&state))
        .await
        .expect("cancelled reconciliation must release its gate");
    assert!(!state.companion.trusted_lan.running());
    assert!(state.companion.trusted_lan.take_server_handle().is_none());
}
