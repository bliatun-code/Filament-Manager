use crate::active_library_gateway::ActiveLibraryGateway;
use crate::backend::filament_database::{FilamentDatabase, SpoolWithMasterRow};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, InventoryEngine, UpdateSpoolDetailsInput, WeightSource,
};
use crate::companion_api::{
    shutdown_trusted_lan_server, start_trusted_lan_server_with_bound_listener,
};
use crate::credential_store::CredentialStore;
use crate::library_sync_cache_commands::fetch_cached_library_sync_spools_blocking;
use crate::library_sync_cache_refresh::refresh_library_sync_spool_cache;
use crate::library_sync_host_client::{
    pair_library_sync_host_session, store_library_sync_device_token,
};
use crate::library_sync_models::{
    LibrarySyncCacheTargetInput, LibrarySyncCachedSpoolList, LibrarySyncSpoolListInput,
};
use crate::library_sync_read_commands::fetch_library_sync_spools_blocking;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::library_sync_target_guard::capture_library_sync_target;
use crate::security::hash_secret;
use crate::state::{AppState, CompanionRuntimeState, TrustedLanCompanionRuntime};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HOST_LIBRARY_ID: &str = "resilience-library";
const HOST_SPOOL_ID: &str = "resilience-spool";
const CLIENT_DECOY_SPOOL_ID: &str = "client-local-decoy";
const CLIENT_SHADOW_QR: &str = "client-local-shadow-qr";
const CLIENT_SHADOW_LOCATION: &str = "Client shadow shelf";
const HOST_UPDATED_QR: &str = "resilience-host-updated-qr";
const HOST_UPDATED_LOCATION: &str = "Host updated shelf";
const PAIRING_TOKEN: &str = "resilience-pairing-token";
const HOST_PROCESS_ENV: &str = "FILAMENT_MANAGER_RESILIENCE_HOST_PROCESS";
const HOST_DB_ENV: &str = "FILAMENT_MANAGER_RESILIENCE_HOST_DB";
const HOST_PORT_ENV: &str = "FILAMENT_MANAGER_RESILIENCE_HOST_PORT";
const HOST_READY_ENV: &str = "FILAMENT_MANAGER_RESILIENCE_HOST_READY";
const HOST_STOP_ENV: &str = "FILAMENT_MANAGER_RESILIENCE_HOST_STOP";
const HOST_PROCESS_TEST: &str = "library_sync_resilience_tests::resilience_host_process";

struct TestDatabases {
    paths: Vec<PathBuf>,
}

impl TestDatabases {
    fn new(paths: Vec<PathBuf>) -> Self {
        Self { paths }
    }
}

impl Drop for TestDatabases {
    fn drop(&mut self) {
        for path in &self.paths {
            for suffix in ["", "-wal", "-shm"] {
                let candidate = if suffix.is_empty() {
                    path.clone()
                } else {
                    PathBuf::from(format!("{}{suffix}", path.to_string_lossy()))
                };
                let _ = std::fs::remove_file(candidate);
            }
        }
    }
}

struct HostProcess {
    child: Child,
    port: u16,
    ready_path: PathBuf,
    stop_path: PathBuf,
}

impl HostProcess {
    async fn start(db_path: &Path, requested_port: u16, generation: u8) -> Self {
        let ready_path = db_path.with_extension(format!("host-{generation}.ready"));
        let stop_path = db_path.with_extension(format!("host-{generation}.stop"));
        let _ = std::fs::remove_file(&ready_path);
        let _ = std::fs::remove_file(&stop_path);
        let child = Command::new(std::env::current_exe().expect("find resilience test binary"))
            .arg("--exact")
            .arg(HOST_PROCESS_TEST)
            .arg("--nocapture")
            .arg("--test-threads=1")
            .env(HOST_PROCESS_ENV, "1")
            .env(HOST_DB_ENV, db_path)
            .env(HOST_PORT_ENV, requested_port.to_string())
            .env(HOST_READY_ENV, &ready_path)
            .env(HOST_STOP_ENV, &stop_path)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("start separate Host test process");
        let mut process = Self {
            child,
            port: 0,
            ready_path,
            stop_path,
        };
        process.port = process.wait_until_ready().await;
        process
    }

    fn port(&self) -> u16 {
        self.port
    }

    async fn wait_until_ready(&mut self) -> u16 {
        for _ in 0..200 {
            if self.ready_path.is_file() {
                return std::fs::read_to_string(&self.ready_path)
                    .expect("read Host readiness marker")
                    .trim()
                    .parse::<u16>()
                    .expect("Host readiness marker contains bound port");
            }
            if let Some(status) = self.child.try_wait().expect("poll Host test process") {
                panic!("Host test process exited before readiness with {status}");
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("Host test process did not become ready within five seconds");
    }

    async fn stop(mut self) {
        std::fs::write(&self.stop_path, b"stop").expect("signal Host test process");
        for _ in 0..200 {
            if let Some(status) = self
                .child
                .try_wait()
                .expect("poll stopping Host test process")
            {
                self.cleanup_control_files();
                assert!(
                    status.success(),
                    "Host test process stopped with unsuccessful status {status}"
                );
                return;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        self.child.kill().expect("kill stuck Host test process");
        let _ = self.child.wait();
        self.cleanup_control_files();
        panic!("Host test process did not stop within five seconds");
    }

    fn cleanup_control_files(&self) {
        let _ = std::fs::remove_file(&self.ready_path);
        let _ = std::fs::remove_file(&self.stop_path);
    }
}

impl Drop for HostProcess {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        self.cleanup_control_files();
    }
}

fn temp_db_path(role: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "filament-manager-library-resilience-{}-{role}-{nanos}.sqlite",
        std::process::id()
    ))
}

fn app_state(db_path: &Path, runtime: TrustedLanCompanionRuntime) -> AppState {
    AppState {
        db_path: db_path.to_string_lossy().into_owned(),
        companion: CompanionRuntimeState::new(runtime),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    }
}

fn seed_host(db_path: &Path) {
    let db = FilamentDatabase::open(db_path).expect("open Host database");
    db.apply_schema().expect("apply Host schema");
    let mut settings = db.get_library_sync_settings().expect("load Host settings");
    settings.mode = "HOST".to_string();
    settings.device_name = "Resilience Host".to_string();
    settings.library_id = HOST_LIBRARY_ID.to_string();
    settings.host_base_url = None;
    db.save_library_sync_settings(&settings)
        .expect("save Host settings");
    db.create_trusted_lan_pairing(Some("Resilience Client"), &hash_secret(PAIRING_TOKEN), 600)
        .expect("create one-time Host pairing");

    let engine = InventoryEngine::new(db);
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: HOST_SPOOL_ID.to_string(),
            material: "PLA".to_string(),
            filament_name: "Resilience Basic".to_string(),
            color_name: "Signal Green".to_string(),
            hex_color: Some("#00ae42".to_string()),
            product_url: None,
            vendor: Some("Test".to_string()),
            default_weight_g: Some(1000),
            qr_code: Some("resilience-qr".to_string()),
            status: Some("IN_STOCK".to_string()),
            ownership_type: Some("OWNED".to_string()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            location: Some("Host shelf".to_string()),
        })
        .expect("seed Host spool");
    engine
        .update_spool_tare_weight(HOST_SPOOL_ID, 0)
        .expect("make resilience Host weight assertions exact");
}

fn configure_client(db_path: &Path, base_url: &str) {
    let db = FilamentDatabase::open(db_path).expect("open Client database");
    db.apply_schema().expect("apply Client schema");
    let engine = InventoryEngine::new(db);
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: HOST_SPOOL_ID.to_string(),
            material: "ABS".to_string(),
            filament_name: "Client shadow".to_string(),
            color_name: "Must never be updated".to_string(),
            hex_color: Some("#ff3366".to_string()),
            product_url: None,
            vendor: Some("Client only".to_string()),
            default_weight_g: Some(444),
            qr_code: Some(CLIENT_SHADOW_QR.to_string()),
            status: Some("IN_STOCK".to_string()),
            ownership_type: Some("OWNED".to_string()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(444),
            location: Some(CLIENT_SHADOW_LOCATION.to_string()),
        })
        .expect("seed same-id Client-local shadow spool");
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: CLIENT_DECOY_SPOOL_ID.to_string(),
            material: "ABS".to_string(),
            filament_name: "Local decoy".to_string(),
            color_name: "Must never leak".to_string(),
            hex_color: Some("#ff00ff".to_string()),
            product_url: None,
            vendor: Some("Client only".to_string()),
            default_weight_g: Some(999),
            qr_code: Some("client-local-decoy-qr".to_string()),
            status: Some("IN_STOCK".to_string()),
            ownership_type: Some("OWNED".to_string()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(999),
            location: Some("Client-only shelf".to_string()),
        })
        .expect("seed Client-local decoy spool");
    let db = FilamentDatabase::open(db_path).expect("reopen Client settings database");
    let mut settings = db
        .get_library_sync_settings()
        .expect("load Client settings");
    settings.mode = "CLIENT".to_string();
    settings.device_name = "Resilience Client".to_string();
    settings.library_id = HOST_LIBRARY_ID.to_string();
    settings.host_base_url = Some(base_url.to_string());
    db.save_library_sync_settings(&settings)
        .expect("save Client target");
}

fn host_spool(db_path: &Path) -> SpoolWithMasterRow {
    let db = FilamentDatabase::open(db_path).expect("open Host database for verification");
    InventoryEngine::new(db)
        .list_spools(10, 0)
        .expect("list Host spools")
        .into_iter()
        .find(|row| row.spool.id == HOST_SPOOL_ID)
        .expect("find Host spool")
}

fn spool_history_count(db_path: &Path, spool_id: &str) -> i64 {
    let db = FilamentDatabase::open(db_path).expect("open spool history database");
    db.connection()
        .query_row(
            "SELECT COUNT(*) FROM spool_history_events WHERE spool_id = ?1",
            [spool_id],
            |row| row.get(0),
        )
        .expect("count spool history")
}

fn client_local_spools(db_path: &Path) -> Vec<SpoolWithMasterRow> {
    let db = FilamentDatabase::open(db_path).expect("open Client database for verification");
    InventoryEngine::new(db)
        .list_spools(10, 0)
        .expect("list Client-local spools")
}

fn client_shadow_spool(db_path: &Path) -> SpoolWithMasterRow {
    client_local_spools(db_path)
        .into_iter()
        .find(|row| row.spool.id == HOST_SPOOL_ID)
        .expect("find same-id Client-local shadow spool")
}

fn client_local_snapshot(db_path: &Path) -> serde_json::Value {
    let mut rows = client_local_spools(db_path);
    rows.sort_by(|left, right| left.spool.id.cmp(&right.spool.id));
    serde_json::to_value(rows).expect("serialize complete Client-local library")
}

fn client_cached_spools(
    client: &AppState,
    base_url: &str,
    target_generation: u64,
) -> LibrarySyncCachedSpoolList {
    fetch_cached_library_sync_spools_blocking(
        client,
        &LibrarySyncCacheTargetInput {
            base_url: base_url.to_string(),
            expected_library_id: HOST_LIBRARY_ID.to_string(),
            target_generation,
        },
    )
    .expect("read target-scoped Client Host cache")
    .expect("Client Host cache should exist")
}

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> T {
    tokio::task::spawn_blocking(operation)
        .await
        .expect("join blocking resilience operation")
        .expect("complete blocking resilience operation")
}

async fn read_host_spools(client: &AppState, base_url: &str) -> Vec<SpoolWithMasterRow> {
    let state = client.clone();
    let base_url = base_url.to_string();
    run_blocking(move || {
        fetch_library_sync_spools_blocking(
            &state,
            LibrarySyncSpoolListInput {
                base_url,
                expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                limit: Some(10),
                offset: Some(0),
            },
        )
    })
    .await
}

async fn refresh_host_spool_cache(client: &AppState, base_url: &str) {
    let state = client.clone();
    let base_url = base_url.to_string();
    let target = capture_library_sync_target(&state, &base_url, Some(HOST_LIBRARY_ID))
        .expect("capture Client Host target for cache refresh");
    run_blocking(move || {
        refresh_library_sync_spool_cache(&state, &base_url, &target);
        Ok(())
    })
    .await;
}

#[test]
fn resilience_host_process() {
    if std::env::var(HOST_PROCESS_ENV).as_deref() != Ok("1") {
        return;
    }

    let db_path = PathBuf::from(std::env::var(HOST_DB_ENV).expect("Host database path"));
    let requested_port = std::env::var(HOST_PORT_ENV)
        .expect("Host port")
        .parse::<u16>()
        .expect("valid Host port");
    let ready_path = PathBuf::from(std::env::var(HOST_READY_ENV).expect("Host ready path"));
    let stop_path = PathBuf::from(std::env::var(HOST_STOP_ENV).expect("Host stop path"));
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("create Host process runtime");

    runtime.block_on(async move {
        let listener = TcpListener::bind(("127.0.0.1", requested_port))
            .expect("bind Host process loopback listener");
        let port = listener
            .local_addr()
            .expect("read bound Host process address")
            .port();
        listener
            .set_nonblocking(true)
            .expect("set Host process listener nonblocking");
        let listener =
            tokio::net::TcpListener::from_std(listener).expect("adopt bound Host process listener");
        let host_runtime = TrustedLanCompanionRuntime::new(port)
            .with_selected_interface("Resilience loopback", "127.0.0.1")
            .with_enabled(true)
            .with_qa_mode(true);
        let host = app_state(&db_path, host_runtime);
        start_trusted_lan_server_with_bound_listener(host.clone(), listener)
            .await
            .expect("start Host Companion listener");
        let ready_tmp = ready_path.with_extension("ready.tmp");
        std::fs::write(&ready_tmp, port.to_string()).expect("write Host readiness marker");
        std::fs::rename(&ready_tmp, &ready_path).expect("publish Host readiness marker");

        while !stop_path.is_file() {
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        shutdown_trusted_lan_server(&host).await;
    });
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn real_tcp_host_client_survives_outage_restart_and_session_renewal_without_local_fallback() {
    let host_db_path = temp_db_path("host");
    let client_db_path = temp_db_path("client");
    let _databases = TestDatabases::new(vec![host_db_path.clone(), client_db_path.clone()]);

    seed_host(&host_db_path);
    let host = HostProcess::start(&host_db_path, 0, 1).await;
    let port = host.port();
    let base_url = format!("http://127.0.0.1:{port}");
    configure_client(&client_db_path, &base_url);

    let client = app_state(
        &client_db_path,
        TrustedLanCompanionRuntime::new(port).with_qa_mode(true),
    );

    let paired = {
        let base_url = base_url.clone();
        run_blocking(move || pair_library_sync_host_session(&base_url, PAIRING_TOKEN)).await
    };
    store_library_sync_device_token(&client, &base_url, &paired.device_token)
        .expect("store Client device token");
    client
        .library_sync_auth
        .replace_authenticated(
            &base_url,
            paired.session_id.clone(),
            paired.csrf_token.clone(),
            paired.device_token.clone(),
        )
        .expect("store Client runtime session");
    FilamentDatabase::open(&client_db_path)
        .expect("open Client pairing database")
        .finalize_library_sync_client_pairing(
            None,
            "Host desktop pairing completed.",
            Some("Resilience Host"),
        )
        .expect("finalize Client pairing metadata");
    let target_generation = capture_library_sync_target(&client, &base_url, Some(HOST_LIBRARY_ID))
        .expect("capture paired Client target")
        .generation();

    let initial_rows = read_host_spools(&client, &base_url).await;
    assert_eq!(initial_rows.len(), 1);
    assert_eq!(initial_rows[0].spool.id, HOST_SPOOL_ID);
    assert_eq!(
        initial_rows[0].spool.qr_code.as_deref(),
        Some("resilience-qr")
    );
    assert_eq!(initial_rows[0].location_name.as_deref(), Some("Host shelf"));

    let client_local_before = client_local_spools(&client_db_path);
    assert_eq!(client_local_before.len(), 2);
    assert!(client_local_before
        .iter()
        .any(|row| row.spool.id == CLIENT_DECOY_SPOOL_ID));
    let client_shadow_before = client_shadow_spool(&client_db_path);
    assert_eq!(
        client_shadow_before.spool.qr_code.as_deref(),
        Some(CLIENT_SHADOW_QR)
    );
    assert_eq!(
        client_shadow_before.location_name.as_deref(),
        Some(CLIENT_SHADOW_LOCATION)
    );
    assert_eq!(client_shadow_before.spool.current_weight_g, Some(444));
    let client_shadow_before_json =
        serde_json::to_value(&client_shadow_before).expect("serialize Client shadow before writes");
    let client_local_before_json = client_local_snapshot(&client_db_path);
    let client_shadow_history_before = spool_history_count(&client_db_path, HOST_SPOOL_ID);

    refresh_host_spool_cache(&client, &base_url).await;
    let warm_cache = client_cached_spools(&client, &base_url, target_generation);
    assert!(!warm_cache.captured_at.trim().is_empty());
    assert_eq!(warm_cache.rows.len(), 1);
    assert_eq!(warm_cache.rows[0].spool.id, HOST_SPOOL_ID);
    assert_eq!(
        warm_cache.rows[0].spool.qr_code.as_deref(),
        Some("resilience-qr")
    );

    let history_before_write = spool_history_count(&host_db_path, HOST_SPOOL_ID);
    {
        let state = client.clone();
        run_blocking(move || {
            ActiveLibraryGateway::new(&state).update_spool_details(UpdateSpoolDetailsInput {
                spool_id: HOST_SPOOL_ID.to_string(),
                qr_code: Some(HOST_UPDATED_QR.to_string()),
                status: "IN_STOCK".to_string(),
                location: Some(HOST_UPDATED_LOCATION.to_string()),
                home_location: Some(Some(HOST_UPDATED_LOCATION.to_string())),
                spool_tare_weight_g: None,
                ownership: None,
                purchase_metadata: None,
                purchase_price_batch_locked: None,
            })
        })
        .await;
    }
    assert_eq!(
        spool_history_count(&host_db_path, HOST_SPOOL_ID),
        history_before_write + 1
    );
    let written_host = host_spool(&host_db_path);
    assert_eq!(written_host.spool.qr_code.as_deref(), Some(HOST_UPDATED_QR));
    assert_eq!(
        written_host.location_name.as_deref(),
        Some(HOST_UPDATED_LOCATION)
    );
    assert_eq!(
        written_host.home_location_name.as_deref(),
        Some(HOST_UPDATED_LOCATION)
    );
    let written_live = read_host_spools(&client, &base_url).await;
    assert_eq!(written_live.len(), 1);
    assert_eq!(
        written_live[0].spool.qr_code.as_deref(),
        Some(HOST_UPDATED_QR)
    );
    assert_eq!(
        written_live[0].location_name.as_deref(),
        Some(HOST_UPDATED_LOCATION)
    );
    let post_write_cache = client_cached_spools(&client, &base_url, target_generation);
    assert_eq!(post_write_cache.rows.len(), 1);
    assert_eq!(
        post_write_cache.rows[0].spool.qr_code.as_deref(),
        Some(HOST_UPDATED_QR)
    );
    assert_eq!(
        serde_json::to_value(client_shadow_spool(&client_db_path))
            .expect("serialize Client shadow after successful Host write"),
        client_shadow_before_json
    );
    assert_eq!(
        client_local_snapshot(&client_db_path),
        client_local_before_json
    );
    assert_eq!(
        spool_history_count(&client_db_path, HOST_SPOOL_ID),
        client_shadow_history_before
    );

    let session_before_restart = client
        .library_sync_auth
        .current()
        .expect("read Client runtime session")
        .expect("Client session should exist")
        .session_id
        .clone();

    host.stop().await;

    let offline_history = spool_history_count(&host_db_path, HOST_SPOOL_ID);
    let offline_write = {
        let state = client.clone();
        tokio::task::spawn_blocking(move || {
            ActiveLibraryGateway::new(&state).update_spool_details(UpdateSpoolDetailsInput {
                spool_id: HOST_SPOOL_ID.to_string(),
                qr_code: Some("must-not-be-saved-offline".to_string()),
                status: "IN_STOCK".to_string(),
                location: Some("Must not exist".to_string()),
                home_location: Some(Some("Must not exist".to_string())),
                spool_tare_weight_g: None,
                ownership: None,
                purchase_metadata: None,
                purchase_price_batch_locked: None,
            })
        })
        .await
        .expect("join offline Host write")
    };
    assert!(
        offline_write.is_err(),
        "offline Host write must fail closed"
    );
    assert_eq!(
        spool_history_count(&host_db_path, HOST_SPOOL_ID),
        offline_history
    );
    let offline_read = {
        let state = client.clone();
        let base_url = base_url.clone();
        tokio::task::spawn_blocking(move || {
            fetch_library_sync_spools_blocking(
                &state,
                LibrarySyncSpoolListInput {
                    base_url,
                    expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                    limit: Some(10),
                    offset: Some(0),
                },
            )
        })
        .await
        .expect("join offline Host read")
    };
    assert!(
        offline_read.is_err(),
        "offline live Host read must fail explicitly"
    );
    let offline_cache = client_cached_spools(&client, &base_url, target_generation);
    assert_eq!(
        serde_json::to_value(&offline_cache).expect("serialize offline cache"),
        serde_json::to_value(&post_write_cache).expect("serialize post-write cache")
    );
    assert_eq!(
        serde_json::to_value(client_shadow_spool(&client_db_path))
            .expect("serialize Client shadow after failed Host write"),
        client_shadow_before_json
    );
    assert_eq!(
        client_local_snapshot(&client_db_path),
        client_local_before_json
    );
    assert_eq!(
        spool_history_count(&client_db_path, HOST_SPOOL_ID),
        client_shadow_history_before
    );

    InventoryEngine::new(
        FilamentDatabase::open(&host_db_path).expect("open stopped Host database"),
    )
    .update_spool_weight(HOST_SPOOL_ID, 660, None, WeightSource::Manual)
    .expect("change authoritative Host data while listener is stopped");
    assert_eq!(host_spool(&host_db_path).spool.current_weight_g, Some(660));

    let host = HostProcess::start(&host_db_path, port, 2).await;

    let recovered_rows = read_host_spools(&client, &base_url).await;
    assert_eq!(recovered_rows.len(), 1);
    assert_eq!(recovered_rows[0].spool.current_weight_g, Some(660));
    assert_eq!(
        recovered_rows[0].spool.qr_code.as_deref(),
        Some(HOST_UPDATED_QR)
    );
    refresh_host_spool_cache(&client, &base_url).await;
    let recovered_cache = client_cached_spools(&client, &base_url, target_generation);
    assert_eq!(recovered_cache.rows.len(), 1);
    assert_eq!(recovered_cache.rows[0].spool.id, HOST_SPOOL_ID);
    assert_eq!(recovered_cache.rows[0].spool.current_weight_g, Some(660));
    assert_eq!(
        serde_json::to_value(client_shadow_spool(&client_db_path))
            .expect("serialize Client shadow after Host restart"),
        client_shadow_before_json
    );
    assert_eq!(
        client_local_snapshot(&client_db_path),
        client_local_before_json
    );
    assert_eq!(
        spool_history_count(&client_db_path, HOST_SPOOL_ID),
        client_shadow_history_before
    );
    let session_after_restart = client
        .library_sync_auth
        .current()
        .expect("read renewed Client session")
        .expect("renewed Client session should exist")
        .session_id
        .clone();
    assert_ne!(session_after_restart, session_before_restart);

    host.stop().await;
}
