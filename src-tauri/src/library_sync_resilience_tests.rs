use crate::active_library_gateway::ActiveLibraryGateway;
use crate::backend::filament_database::{FilamentDatabase, SpoolWithMasterRow};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreatePrinterInput, CreateWishlistItemInput, InventoryEngine,
    UpdateSpoolDetailsInput, UpdateWishlistStatusInput, WeightSource,
};
use crate::companion_api::{
    shutdown_trusted_lan_server, start_trusted_lan_server_with_bound_listener,
};
use crate::credential_store::CredentialStore;
use crate::library_sync_cache_commands::{
    fetch_cached_library_sync_loans_blocking, fetch_cached_library_sync_printer_overview_blocking,
    fetch_cached_library_sync_spools_blocking, fetch_cached_library_sync_wishlist_blocking,
};
use crate::library_sync_cache_refresh::refresh_library_sync_spool_cache;
use crate::library_sync_host_client::{
    pair_library_sync_host_session, store_library_sync_device_token,
};
use crate::library_sync_loan_write_commands::lend_library_sync_host_spool_blocking;
use crate::library_sync_models::{
    LibrarySyncAssignPrinterSlotInput, LibrarySyncCacheTargetInput, LibrarySyncCachedSpoolList,
    LibrarySyncCreateSpoolInput, LibrarySyncLendSpoolInput, LibrarySyncReceiveWishlistItemInput,
    LibrarySyncSpoolListInput,
};
use crate::library_sync_printer_write_commands::assign_library_sync_host_printer_slot_blocking;
use crate::library_sync_read_commands::fetch_library_sync_spools_blocking;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::library_sync_spool_write_commands::create_library_sync_host_spool_blocking;
use crate::library_sync_target_guard::capture_library_sync_target;
use crate::library_sync_wishlist_write_commands::receive_library_sync_host_wishlist_item_blocking;
use crate::security::hash_secret;
use crate::state::{AppState, CompanionRuntimeState, TrustedLanCompanionRuntime};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HOST_LIBRARY_ID: &str = "resilience-library";
const HOST_SPOOL_ID: &str = "resilience-spool";
const HOST_PRINTER_ID: &str = "resilience-printer";
const HOST_SLOT_ID: &str = "resilience-printer_ams_1_slot_1";
const HOST_SENTINEL_SLOT_ID: &str = "resilience-printer_ams_1_slot_2";
const HOST_WISHLIST_ID: &str = "resilience-wishlist";
const CLIENT_DECOY_SPOOL_ID: &str = "client-local-decoy";
const CLIENT_SHADOW_QR: &str = "client-local-shadow-qr";
const CLIENT_SHADOW_LOCATION: &str = "Client shadow shelf";
static RESILIENCE_PROCESS_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
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

fn seed_fixed_workflow_host(db_path: &Path) {
    seed_host(db_path);
    let engine = InventoryEngine::new(
        FilamentDatabase::open(db_path).expect("open fixed-workflow Host database"),
    );
    engine
        .create_printer(CreatePrinterInput {
            id: HOST_PRINTER_ID.to_string(),
            model: "Bambu Lab P1S".to_string(),
            name: "Resilience Printer".to_string(),
            ams_units: Some(1),
            slots_per_ams: Some(2),
        })
        .expect("seed Host printer");
    FilamentDatabase::open(db_path)
        .expect("open Host printer seed database")
        .assign_spool_to_ams_slot(
            HOST_PRINTER_ID,
            HOST_SENTINEL_SLOT_ID,
            Some(HOST_SPOOL_ID),
            None,
            None,
            false,
        )
        .expect("seed an unrelated Host printer assignment");
    engine
        .create_wishlist_item(CreateWishlistItemInput {
            id: HOST_WISHLIST_ID.to_string(),
            master_id: None,
            material: "PETG".to_string(),
            filament_name: "Resilience Ordered".to_string(),
            color_name: "Ocean Teal".to_string(),
            vendor: Some("Test".to_string()),
            quantity: Some(2),
            note: Some("Fixed workflow receipt".to_string()),
        })
        .expect("seed Host wishlist item");
    engine
        .update_wishlist_item_status(UpdateWishlistStatusInput {
            item_id: HOST_WISHLIST_ID.to_string(),
            status: "ON_ORDER".to_string(),
        })
        .expect("mark Host wishlist item on order");
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
        .list_spools(10_000, 0)
        .expect("list Client-local spools")
}

fn client_shadow_spool(db_path: &Path) -> SpoolWithMasterRow {
    client_local_spools(db_path)
        .into_iter()
        .find(|row| row.spool.id == HOST_SPOOL_ID)
        .expect("find same-id Client-local shadow spool")
}

fn client_local_snapshot(db_path: &Path) -> serde_json::Value {
    spool_inventory_snapshot(db_path)
}

fn spool_inventory_snapshot(db_path: &Path) -> serde_json::Value {
    let mut rows = client_local_spools(db_path);
    rows.sort_by(|left, right| left.spool.id.cmp(&right.spool.id));
    let engine = InventoryEngine::new(
        FilamentDatabase::open(db_path).expect("open Client history database for verification"),
    );
    let mut history = rows
        .iter()
        .flat_map(|row| {
            engine
                .list_spool_history(&row.spool.id, 10_000)
                .expect("list complete Client-local spool history")
        })
        .collect::<Vec<_>>();
    history.sort_by(|left, right| left.id.cmp(&right.id));
    serde_json::json!({
        "spools": rows,
        "history": history,
    })
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

async fn pair_client_with_host(client: &AppState, client_db_path: &Path, base_url: &str) -> u64 {
    let paired = {
        let base_url = base_url.to_string();
        run_blocking(move || pair_library_sync_host_session(&base_url, PAIRING_TOKEN)).await
    };
    store_library_sync_device_token(client, base_url, &paired.device_token)
        .expect("store Client device token");
    client
        .library_sync_auth
        .replace_authenticated(
            base_url,
            paired.session_id.clone(),
            paired.csrf_token.clone(),
            paired.device_token.clone(),
        )
        .expect("store Client runtime session");
    FilamentDatabase::open(client_db_path)
        .expect("open Client pairing database")
        .finalize_library_sync_client_pairing(
            None,
            "Host desktop pairing completed.",
            Some("Resilience Host"),
        )
        .expect("finalize Client pairing metadata");
    capture_library_sync_target(client, base_url, Some(HOST_LIBRARY_ID))
        .expect("capture paired Client target")
        .generation()
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
    let _process_test_guard = RESILIENCE_PROCESS_TEST_LOCK.lock().await;
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

    let target_generation = pair_client_with_host(&client, &client_db_path, &base_url).await;

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

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn real_tcp_client_completes_the_five_fixed_workflows_on_the_host() {
    let _process_test_guard = RESILIENCE_PROCESS_TEST_LOCK.lock().await;
    let host_db_path = temp_db_path("workflow-host");
    let client_db_path = temp_db_path("workflow-client");
    let _databases = TestDatabases::new(vec![host_db_path.clone(), client_db_path.clone()]);

    seed_fixed_workflow_host(&host_db_path);
    let host = HostProcess::start(&host_db_path, 0, 1).await;
    let base_url = format!("http://127.0.0.1:{}", host.port());
    configure_client(&client_db_path, &base_url);
    let client = app_state(
        &client_db_path,
        TrustedLanCompanionRuntime::new(host.port()).with_qa_mode(true),
    );
    let target_generation = pair_client_with_host(&client, &client_db_path, &base_url).await;
    let client_local_before = client_local_snapshot(&client_db_path);

    let registered_spool_id = {
        let state = client.clone();
        let base_url = base_url.clone();
        run_blocking(move || {
            create_library_sync_host_spool_blocking(
                &state,
                LibrarySyncCreateSpoolInput {
                    base_url,
                    expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                    master_id: None,
                    material: Some("PLA".to_string()),
                    filament_name: Some("Fixed Workflow".to_string()),
                    color_name: Some("Signal Violet".to_string()),
                    vendor: Some("Test".to_string()),
                    initial_weight_g: Some(875),
                    location: Some("Workflow shelf".to_string()),
                    hex_color: Some("#7C3AED".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                },
            )
        })
        .await
    };

    let host_inventory_before_find = spool_inventory_snapshot(&host_db_path);
    let found_rows = read_host_spools(&client, &base_url).await;
    let matching_rows = found_rows
        .iter()
        .filter(|row| {
            row.master.material == "PLA"
                && row.master.color_name == "Signal Violet"
                && row.location_name.as_deref() == Some("Workflow shelf")
        })
        .collect::<Vec<_>>();
    assert_eq!(
        matching_rows.len(),
        1,
        "find exactly one matching Host spool"
    );
    let found_spool = matching_rows[0];
    assert_eq!(found_spool.spool.id, registered_spool_id);
    assert_eq!(found_spool.master.material, "PLA");
    assert_eq!(found_spool.master.filament_name, "Fixed Workflow");
    assert_eq!(found_spool.master.color_name, "Signal Violet");
    assert_eq!(found_spool.master.vendor, "Test");
    assert_eq!(found_spool.spool.ownership_type, "OWNED");
    assert_eq!(found_spool.location_name.as_deref(), Some("Workflow shelf"));
    assert_eq!(
        found_spool.home_location_name.as_deref(),
        Some("Workflow shelf")
    );
    assert_eq!(found_spool.spool.initial_weight_g, Some(875));
    assert_eq!(found_spool.spool.current_weight_g, Some(875));
    assert_eq!(found_spool.spool.remaining_g, Some(875));
    assert_eq!(
        spool_inventory_snapshot(&host_db_path),
        host_inventory_before_find,
        "finding and reading the Host spool must not mutate Host inventory or history"
    );
    let cached_spools = client_cached_spools(&client, &base_url, target_generation);
    let cached_registered_spools = cached_spools
        .rows
        .iter()
        .filter(|row| row.spool.id == registered_spool_id)
        .collect::<Vec<_>>();
    assert_eq!(cached_registered_spools.len(), 1);
    let cached_registered_spool = cached_registered_spools[0];
    assert_eq!(cached_registered_spool.master.material, "PLA");
    assert_eq!(
        cached_registered_spool.master.filament_name,
        "Fixed Workflow"
    );
    assert_eq!(cached_registered_spool.master.color_name, "Signal Violet");
    assert_eq!(cached_registered_spool.master.vendor, "Test");
    assert_eq!(cached_registered_spool.spool.ownership_type, "OWNED");
    assert_eq!(cached_registered_spool.spool.initial_weight_g, Some(875));
    assert_eq!(cached_registered_spool.spool.current_weight_g, Some(875));
    assert_eq!(cached_registered_spool.spool.remaining_g, Some(875));
    assert_eq!(
        cached_registered_spool.location_name.as_deref(),
        Some("Workflow shelf")
    );
    assert_eq!(
        cached_registered_spool.home_location_name.as_deref(),
        Some("Workflow shelf")
    );

    {
        let state = client.clone();
        let base_url = base_url.clone();
        let spool_id = registered_spool_id.clone();
        run_blocking(move || {
            assign_library_sync_host_printer_slot_blocking(
                &state,
                LibrarySyncAssignPrinterSlotInput {
                    base_url,
                    expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                    printer_id: HOST_PRINTER_ID.to_string(),
                    slot_id: HOST_SLOT_ID.to_string(),
                    spool_id: Some(spool_id),
                    rfid_override_tray_uuid: None,
                    rfid_override_color_hex: None,
                    clear_live_cache_before_next_refresh: Some(false),
                },
            )
        })
        .await;
    }
    let host_printer_db =
        FilamentDatabase::open(&host_db_path).expect("open Host printer database");
    let loaded_spool_id: Option<String> = host_printer_db
        .connection()
        .query_row(
            "SELECT spool_id FROM ams_slots WHERE id = ?1",
            [HOST_SLOT_ID],
            |row| row.get(0),
        )
        .expect("read Host printer slot");
    assert_eq!(
        loaded_spool_id.as_deref(),
        Some(registered_spool_id.as_str())
    );
    let sentinel_spool_id: Option<String> = host_printer_db
        .connection()
        .query_row(
            "SELECT spool_id FROM ams_slots WHERE id = ?1",
            [HOST_SENTINEL_SLOT_ID],
            |row| row.get(0),
        )
        .expect("read unrelated Host printer slot");
    assert_eq!(sentinel_spool_id.as_deref(), Some(HOST_SPOOL_ID));
    let cached_printer = fetch_cached_library_sync_printer_overview_blocking(
        &client,
        &LibrarySyncCacheTargetInput {
            base_url: base_url.clone(),
            expected_library_id: HOST_LIBRARY_ID.to_string(),
            target_generation,
        },
    )
    .expect("read target-scoped Client printer cache")
    .expect("printer assignment is cached on the Client")
    .rows
    .into_iter()
    .find(|row| row.printer.id == HOST_PRINTER_ID)
    .expect("find cached Host printer");
    assert_eq!(
        cached_printer
            .slots
            .iter()
            .find(|slot| slot.slot_id == HOST_SLOT_ID)
            .and_then(|slot| slot.spool_id.as_deref()),
        Some(registered_spool_id.as_str())
    );
    assert_eq!(
        cached_printer
            .slots
            .iter()
            .find(|slot| slot.slot_id == HOST_SENTINEL_SLOT_ID)
            .and_then(|slot| slot.spool_id.as_deref()),
        Some(HOST_SPOOL_ID)
    );

    {
        let state = client.clone();
        let base_url = base_url.clone();
        let spool_id = registered_spool_id.clone();
        run_blocking(move || {
            lend_library_sync_host_spool_blocking(
                &state,
                LibrarySyncLendSpoolInput {
                    base_url,
                    expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                    spool_id,
                    borrower_name: "Workflow Borrower".to_string(),
                    counterparty_contact: Some("borrower@example.test".to_string()),
                    grams_out: 830,
                    note: Some("Five-flow gate".to_string()),
                    expected_return_at: Some("2026-09-30".to_string()),
                },
            )
        })
        .await;
    }
    let host_engine = InventoryEngine::new(
        FilamentDatabase::open(&host_db_path).expect("open Host workflow database"),
    );
    let matching_loans = host_engine
        .list_spool_loans_for_direction(10, false, Some("OUTBOUND"))
        .expect("list Host outbound loans")
        .into_iter()
        .filter(|row| row.loan.spool_id == registered_spool_id)
        .collect::<Vec<_>>();
    assert_eq!(matching_loans.len(), 1, "create exactly one Host loan");
    let active_loan = &matching_loans[0];
    assert_eq!(active_loan.loan.loan_status, "ACTIVE");
    assert_eq!(active_loan.loan.borrower_name, "Workflow Borrower");
    assert_eq!(active_loan.loan.counterparty_name, "Workflow Borrower");
    assert_eq!(
        active_loan.loan.counterparty_contact.as_deref(),
        Some("borrower@example.test")
    );
    assert_eq!(active_loan.loan.grams_out, 830);
    assert_eq!(
        active_loan.loan.lent_note.as_deref(),
        Some("Five-flow gate")
    );
    assert_eq!(
        active_loan.loan.expected_return_at.as_deref(),
        Some("2026-09-30")
    );
    let borrowed_spools = host_engine
        .list_spools(20, 0)
        .expect("list Host spools after loan");
    let borrowed_spool = borrowed_spools
        .iter()
        .find(|row| row.spool.id == registered_spool_id)
        .expect("find borrowed Host spool");
    assert_eq!(borrowed_spool.spool.status, "BORROWED");
    assert_eq!(borrowed_spool.spool.current_weight_g, Some(830));
    assert_eq!(borrowed_spool.spool.remaining_g, Some(830));
    assert_eq!(
        borrowed_spool.location_name.as_deref(),
        Some("Loaned to: Workflow Borrower")
    );
    assert_eq!(
        borrowed_spool.home_location_name.as_deref(),
        Some("Workflow shelf")
    );
    let cleared_target_spool_id: Option<String> = host_printer_db
        .connection()
        .query_row(
            "SELECT spool_id FROM ams_slots WHERE id = ?1",
            [HOST_SLOT_ID],
            |row| row.get(0),
        )
        .expect("read cleared Host printer slot after loan");
    assert_eq!(cleared_target_spool_id, None);
    let preserved_sentinel_spool_id: Option<String> = host_printer_db
        .connection()
        .query_row(
            "SELECT spool_id FROM ams_slots WHERE id = ?1",
            [HOST_SENTINEL_SLOT_ID],
            |row| row.get(0),
        )
        .expect("read unrelated Host printer slot after loan");
    assert_eq!(preserved_sentinel_spool_id.as_deref(), Some(HOST_SPOOL_ID));
    let cached_loans = fetch_cached_library_sync_loans_blocking(
        &client,
        &LibrarySyncCacheTargetInput {
            base_url: base_url.clone(),
            expected_library_id: HOST_LIBRARY_ID.to_string(),
            target_generation,
        },
    )
    .expect("read target-scoped Client loan cache")
    .expect("loan is cached on the Client");
    let cached_active_loans = cached_loans
        .rows
        .iter()
        .filter(|row| row.loan.spool_id == registered_spool_id && row.loan.loan_status == "ACTIVE")
        .collect::<Vec<_>>();
    assert_eq!(cached_active_loans.len(), 1);
    let cached_active_loan = cached_active_loans[0];
    assert_eq!(cached_active_loan.loan.borrower_name, "Workflow Borrower");
    assert_eq!(
        cached_active_loan.loan.counterparty_contact.as_deref(),
        Some("borrower@example.test")
    );
    assert_eq!(cached_active_loan.loan.grams_out, 830);
    assert_eq!(
        cached_active_loan.loan.lent_note.as_deref(),
        Some("Five-flow gate")
    );
    assert_eq!(
        cached_active_loan.loan.expected_return_at.as_deref(),
        Some("2026-09-30")
    );
    let cached_borrowed_spool = client_cached_spools(&client, &base_url, target_generation)
        .rows
        .into_iter()
        .find(|row| row.spool.id == registered_spool_id)
        .expect("find borrowed spool in target-scoped Client cache");
    assert_eq!(cached_borrowed_spool.spool.status, "BORROWED");
    assert_eq!(cached_borrowed_spool.spool.current_weight_g, Some(830));
    assert_eq!(cached_borrowed_spool.spool.remaining_g, Some(830));
    assert_eq!(
        cached_borrowed_spool.location_name.as_deref(),
        Some("Loaned to: Workflow Borrower")
    );
    assert_eq!(
        cached_borrowed_spool.home_location_name.as_deref(),
        Some("Workflow shelf")
    );
    let cached_printer_after_loan = fetch_cached_library_sync_printer_overview_blocking(
        &client,
        &LibrarySyncCacheTargetInput {
            base_url: base_url.clone(),
            expected_library_id: HOST_LIBRARY_ID.to_string(),
            target_generation,
        },
    )
    .expect("read target-scoped Client printer cache after loan")
    .expect("printer cache is refreshed after the loan")
    .rows
    .into_iter()
    .find(|row| row.printer.id == HOST_PRINTER_ID)
    .expect("find cached Host printer after loan");
    assert_eq!(
        cached_printer_after_loan
            .slots
            .iter()
            .find(|slot| slot.slot_id == HOST_SLOT_ID)
            .and_then(|slot| slot.spool_id.as_deref()),
        None
    );
    assert_eq!(
        cached_printer_after_loan
            .slots
            .iter()
            .find(|slot| slot.slot_id == HOST_SENTINEL_SLOT_ID)
            .and_then(|slot| slot.spool_id.as_deref()),
        Some(HOST_SPOOL_ID)
    );

    let host_spool_count_before_receipt = host_engine
        .list_spools(20, 0)
        .expect("count Host spools before receipt")
        .len();

    let receipt = {
        let state = client.clone();
        let base_url = base_url.clone();
        run_blocking(move || {
            receive_library_sync_host_wishlist_item_blocking(
                &state,
                LibrarySyncReceiveWishlistItemInput {
                    base_url,
                    expected_library_id: Some(HOST_LIBRARY_ID.to_string()),
                    item_id: HOST_WISHLIST_ID.to_string(),
                    quantity: 2,
                    purchase_metadata: None,
                },
            )
        })
        .await
    };
    assert_eq!(receipt.received_quantity, 2);
    assert_eq!(receipt.remaining_quantity, 0);
    assert_eq!(receipt.status, "RECEIVED");
    assert_eq!(receipt.spool_ids.len(), 2);
    assert_ne!(receipt.spool_ids[0], receipt.spool_ids[1]);
    let host_engine = InventoryEngine::new(
        FilamentDatabase::open(&host_db_path).expect("reopen Host workflow database"),
    );
    let received_item = host_engine
        .list_wishlist_items(10)
        .expect("list Host wishlist")
        .into_iter()
        .find(|item| item.id == HOST_WISHLIST_ID)
        .expect("find received Host wishlist item");
    assert_eq!(received_item.status, "RECEIVED");
    assert_eq!(received_item.quantity, 0);
    let host_spools = host_engine
        .list_spools(20, 0)
        .expect("list final Host spools");
    assert_eq!(host_spools.len(), host_spool_count_before_receipt + 2);
    for receipt_spool_id in &receipt.spool_ids {
        let received_spool = host_spools
            .iter()
            .filter(|row| row.spool.id == *receipt_spool_id)
            .collect::<Vec<_>>();
        assert_eq!(received_spool.len(), 1);
        let received_spool = received_spool[0];
        assert_eq!(received_spool.master.material, "PETG");
        assert_eq!(received_spool.master.filament_name, "Resilience Ordered");
        assert_eq!(received_spool.master.color_name, "Ocean Teal");
        assert_eq!(received_spool.master.vendor, "Test");
        assert_eq!(received_spool.spool.status, "IN_STOCK");
        assert_eq!(received_spool.spool.initial_weight_g, Some(1_000));
        assert_eq!(received_spool.spool.current_weight_g, Some(1_000));
        assert_eq!(received_spool.spool.remaining_g, Some(1_000));
        let receipt_history = host_engine
            .list_spool_history(receipt_spool_id, 20)
            .expect("list received spool history")
            .into_iter()
            .filter(|event| event.event_type == "PURCHASE_RECEIPT_RECORDED")
            .collect::<Vec<_>>();
        assert_eq!(receipt_history.len(), 1);
        assert_eq!(
            receipt_history[0].payload_json["wishlist_item_id"],
            HOST_WISHLIST_ID
        );
        assert_eq!(receipt_history[0].payload_json["initial_weight_g"], 1_000);
    }
    let cached_wishlist = fetch_cached_library_sync_wishlist_blocking(
        &client,
        &LibrarySyncCacheTargetInput {
            base_url: base_url.clone(),
            expected_library_id: HOST_LIBRARY_ID.to_string(),
            target_generation,
        },
    )
    .expect("read target-scoped Client wishlist cache")
    .expect("wishlist receipt is cached on the Client");
    let cached_item = cached_wishlist
        .rows
        .iter()
        .find(|item| item.id == HOST_WISHLIST_ID)
        .expect("find received item in Client cache");
    assert_eq!(cached_item.status, "RECEIVED");
    assert_eq!(cached_item.quantity, 0);
    assert_eq!(
        client_cached_spools(&client, &base_url, target_generation)
            .rows
            .iter()
            .filter(|row| receipt.spool_ids.contains(&row.spool.id))
            .count(),
        2
    );

    assert_eq!(client_local_snapshot(&client_db_path), client_local_before);
    host.stop().await;
}
