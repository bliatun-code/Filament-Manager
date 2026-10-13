use super::tests::{common_details_update, fake_host_state};
use super::*;
use crate::active_library_gateway::{ActiveLibraryGateway, ReviewedLibraryAuthority};
use crate::backend::filament_database::{FilamentDatabase, LibrarySyncSettingsRow};
use crate::library_sync_printer_write_commands::update_library_sync_host_master_catalog_entry_blocking;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::{Duration, Instant};

fn save(state: &AppState, base: &str, generation: u64, master: bool) -> Result<(), String> {
    if master {
        let input = serde_json::from_value(serde_json::json!({
            "base_url":base,"expected_library_id":"library-test","expected_target_generation":generation,
            "master_id":"master-1","material":"PLA","filament_name":"Basic","color_name":"Blue"
        })).unwrap();
        update_library_sync_host_master_catalog_entry_blocking(state, input)
    } else {
        update_library_sync_host_spool_details_for_target(
            state,
            base,
            Some("library-test"),
            Some(generation),
            common_details_update(),
        )
    }
}

fn change_target_and_back(state: &AppState) {
    PreparedTargetTransition::new(state)
        .unwrap()
        .apply()
        .unwrap();
}

struct PreparedTargetTransition {
    db: FilamentDatabase,
    original: LibrarySyncSettingsRow,
}

impl PreparedTargetTransition {
    fn new(state: &AppState) -> Result<Self, String> {
        let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
        let original = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        Ok(Self { db, original })
    }

    fn apply(&self) -> Result<(), String> {
        let mut away = self.original.clone();
        away.host_base_url = Some("http://other.invalid:4278".into());
        let mut restored = self
            .db
            .save_library_sync_settings(&away)
            .map_err(|error| format!("change target: {error}"))?;
        if restored.target_generation != self.original.target_generation + 1 {
            return Err("first target transition did not advance generation".into());
        }
        restored.host_base_url = self.original.host_base_url.clone();
        let restored = self
            .db
            .save_library_sync_settings(&restored)
            .map_err(|error| format!("restore target: {error}"))?;
        if restored.target_generation != self.original.target_generation + 2
            || restored.host_base_url != self.original.host_base_url
            || restored.library_id != self.original.library_id
            || restored.mode != self.original.mode
        {
            return Err(
                "restored target did not preserve the original authority with generation +2".into(),
            );
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum TransitionAt {
    Never,
    Health,
    Post,
    Cache,
}

// The server must finish SQLite connection setup (including Windows WAL pragmas)
// before the caller starts a health request with the real 2.5-second deadline.
// Only the two actual target changes belong between receiving health and replying.
struct ReviewedSaveHost {
    scenario: String,
    done: Arc<AtomicBool>,
    server: Option<std::thread::JoinHandle<Result<Vec<String>, String>>>,
}

impl ReviewedSaveHost {
    fn start(
        listener: TcpListener,
        state: &AppState,
        scenario: String,
        capable: bool,
        transition_at: TransitionAt,
    ) -> Self {
        Self::start_with_setup(
            listener,
            state,
            scenario,
            capable,
            transition_at,
            |_| Ok(()),
        )
    }

    fn start_with_setup(
        listener: TcpListener,
        state: &AppState,
        scenario: String,
        capable: bool,
        transition_at: TransitionAt,
        setup: impl FnOnce(&TcpListener) -> Result<(), String> + Send + 'static,
    ) -> Self {
        listener
            .set_nonblocking(true)
            .unwrap_or_else(|error| panic!("{scenario}: configure listener: {error}"));
        let state = state.clone();
        let done = Arc::new(AtomicBool::new(false));
        let server_done = Arc::clone(&done);
        let server_scenario = scenario.clone();
        let (ready_tx, ready_rx) = mpsc::channel();
        let server = std::thread::spawn(move || {
            setup(&listener)
                .map_err(|error| format!("{server_scenario}: fixture setup stage: {error}"))?;
            let transition = PreparedTargetTransition::new(&state).map_err(|error| {
                format!("{server_scenario}: prepare target transition: {error}")
            })?;
            let health_body = serde_json::json!({"ok":true,"api_version":"v1",
                "capabilities":if capable { vec!["spool-common-details-v2"] } else { vec![] },
                "auth_mode":"pairing-session","access_mode":"trusted-lan",
                "library_id":"library-test","device_name":"Test Host","sync_mode":"HOST"})
            .to_string();
            let response = |body: &str| {
                format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()
            ).into_bytes()
            };
            let health_wire = response(&health_body);
            let post_wire = response("{}");
            let cache_wire = response("[]");
            ready_tx.send(()).map_err(|error| error.to_string())?;

            let mut requests = Vec::new();
            let deadline = Instant::now() + Duration::from_secs(10);
            while !server_done.load(Ordering::SeqCst) && Instant::now() < deadline {
                let (mut stream, _) = match listener.accept() {
                    Ok(connection) => connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(error) => return Err(format!("{server_scenario}: accept: {error}")),
                };
                let accepted = Instant::now();
                let request_number = requests.len() + 1;
                let mut request_line = "<request not yet read>".to_string();
                let served = (|| -> Result<(), String> {
                    stream
                        .set_nonblocking(false)
                        .map_err(|error| error.to_string())?;
                    stream
                        .set_nodelay(true)
                        .map_err(|error| error.to_string())?;
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .map_err(|error| error.to_string())?;
                    stream
                        .set_write_timeout(Some(Duration::from_secs(2)))
                        .map_err(|error| error.to_string())?;
                    let request = read_reviewed_save_request(&mut stream)?;
                    request_line = request.lines().next().unwrap_or_default().to_string();
                    let health = request_line == "GET /api/v1/health HTTP/1.1";
                    let post = request_line.starts_with("POST ");
                    let cache = request_line.starts_with("GET /api/v1/library/spools?");
                    requests.push(request);
                    if matches!(
                        (transition_at, health, post, cache),
                        (TransitionAt::Health, true, _, _)
                            | (TransitionAt::Post, _, true, _)
                            | (TransitionAt::Cache, _, _, true)
                    ) {
                        transition.apply()?;
                    }
                    let wire = if health {
                        &health_wire
                    } else if post {
                        &post_wire
                    } else if cache {
                        &cache_wire
                    } else {
                        return Err("unexpected endpoint".into());
                    };
                    stream
                        .write_all(wire)
                        .map_err(|error| format!("write complete response: {error}"))?;
                    Ok(())
                })();
                served.map_err(|error| {
                    format!(
                        "{server_scenario}: request #{request_number} {request_line:?}, elapsed {:?}: {error}",
                        accepted.elapsed()
                    )
                })?;
            }
            if !server_done.load(Ordering::SeqCst) {
                return Err(format!("{server_scenario}: fixture deadline expired"));
            }
            Ok(requests)
        });
        if let Err(error) = ready_rx.recv_timeout(Duration::from_secs(10)) {
            done.store(true, Ordering::SeqCst);
            panic!(
                "{scenario}: fixture did not become ready: {error}; server: {:?}",
                server.join()
            );
        }
        Self {
            scenario,
            done,
            server: Some(server),
        }
    }

    fn finish(mut self, client_result: &Result<(), String>) -> Vec<String> {
        self.done.store(true, Ordering::SeqCst);
        self.server
            .take()
            .unwrap()
            .join()
            .unwrap_or_else(|error| {
                panic!(
                    "{}: server panicked: {error:?}; client: {client_result:?}",
                    self.scenario
                )
            })
            .unwrap_or_else(|error| panic!("{error}; client: {client_result:?}"))
    }
}

impl Drop for ReviewedSaveHost {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
        if let Some(server) = self.server.take() {
            let _ = server.join();
        }
    }
}

fn read_reviewed_save_request(stream: &mut TcpStream) -> Result<String, String> {
    let mut received = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = stream
            .read(&mut buffer)
            .map_err(|error| format!("read request: {error}"))?;
        if count == 0 {
            return Err("request ended before its headers/body".into());
        }
        received.extend_from_slice(&buffer[..count]);
        if received.len() > 64 * 1024 {
            return Err("request exceeded fixture limit".into());
        }
        let Some(header_end) = received.windows(4).position(|part| part == b"\r\n\r\n") else {
            continue;
        };
        let headers = String::from_utf8_lossy(&received[..header_end]);
        let content_length = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then_some(value.trim())
            })
            .map(str::parse::<usize>)
            .transpose()
            .map_err(|error| error.to_string())?
            .unwrap_or(0);
        let expected_length = (header_end + 4)
            .checked_add(content_length)
            .filter(|length| *length <= 64 * 1024)
            .ok_or_else(|| "request exceeded fixture limit".to_string())?;
        if received.len() >= expected_length {
            return String::from_utf8(received).map_err(|error| error.to_string());
        }
    }
}

#[test]
fn reviewed_detail_saves_reject_old_generation_before_health_or_auth() {
    for master in [false, true] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (state, path) = fake_host_state(&base);
        let generation = FilamentDatabase::open(&path)
            .unwrap()
            .get_library_sync_settings()
            .unwrap()
            .target_generation;
        change_target_and_back(&state);
        let error = save(&state, &base, generation, master).unwrap_err();
        assert!(error.contains("common.invalid_request"), "{error}");
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        std::fs::remove_file(path).unwrap();
    }
}

fn detail_save_scenario(master: bool, change: bool) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (state, path) = fake_host_state(&base);
    let generation = FilamentDatabase::open(&path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap()
        .target_generation;
    let scenario = format!("detail master={master}, change={change}");
    let host = ReviewedSaveHost::start(
        listener,
        &state,
        scenario.clone(),
        true,
        if change {
            TransitionAt::Health
        } else {
            TransitionAt::Never
        },
    );
    let result = save(&state, &base, generation, master);
    let requests = host.finish(&result);
    let writes: Vec<_> = requests
        .iter()
        .filter(|request| request.starts_with("POST "))
        .collect();
    assert!(
        requests
            .first()
            .is_some_and(|request| request.starts_with("GET /api/v1/health ")),
        "{scenario}: missing initial health; requests: {requests:?}; client: {result:?}"
    );
    if change {
        let error = result.unwrap_err();
        assert!(
            error.contains("common.invalid_request"),
            "{scenario}: {error}"
        );
        assert_eq!(
            requests.len(),
            1,
            "{scenario}: only the original health read is permitted"
        );
        assert!(writes.is_empty(), "{scenario}: {writes:?}");
    } else {
        result.unwrap_or_else(|error| panic!("{scenario}: {error}"));
        assert_eq!(writes.len(), 1, "{scenario}: {requests:?}");
        assert!(
            writes[0].starts_with(if master {
                "POST /api/v1/catalog/masters/master-1/details "
            } else {
                "POST /api/v1/spools/spool-1/details "
            }),
            "{scenario}: {writes:?}"
        );
        assert_eq!(
            requests.len(),
            if master { 2 } else { 3 },
            "{scenario}: {requests:?}"
        );
    }
    let db = FilamentDatabase::open(&path).unwrap();
    let settings = db.get_library_sync_settings().unwrap();
    assert_eq!(
        settings.target_generation,
        generation + if change { 2 } else { 0 },
        "{scenario}"
    );
    assert_eq!(
        settings.host_base_url.as_deref(),
        Some(base.as_str()),
        "{scenario}"
    );
    assert_eq!(settings.library_id, "library-test", "{scenario}");
    if !change && !master {
        assert!(
            settings.cached_spools.unwrap().rows.is_empty(),
            "{scenario}"
        );
    } else {
        assert!(settings.cached_spools.is_none(), "{scenario}");
    }
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn reviewed_detail_saves_keep_the_original_target_through_health_and_post() {
    for master in [false, true] {
        for change in [false, true] {
            detail_save_scenario(master, change);
        }
    }
}

#[test]
fn reviewed_detail_saves_remain_correct_with_concurrent_independent_hosts() {
    std::thread::scope(|scope| {
        for master in [false, true] {
            for change in [false, true] {
                scope.spawn(move || detail_save_scenario(master, change));
            }
        }
    });
}

#[test]
fn reviewed_save_waits_for_fixture_setup_before_starting_health() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (state, path) = fake_host_state(&base);
    let generation = FilamentDatabase::open(&path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap()
        .target_generation;
    let (queue_probe_tx, queue_probe_rx) = mpsc::channel();
    let (release_setup_tx, release_setup_rx) = mpsc::channel();
    let (save_started_tx, save_started_rx) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        let host = ReviewedSaveHost::start_with_setup(
            listener,
            &state,
            "held fixture setup".into(),
            true,
            TransitionAt::Never,
            move |listener| {
                // Inspect only the server's original handle, immediately after
                // configuring it. A cloned Winsock handle must not introduce an
                // unbounded accept while the setup release is still withheld.
                listener
                    .set_nonblocking(true)
                    .map_err(|error| format!("configure setup queue probe: {error}"))?;
                let queue_empty = match listener.accept() {
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => Ok(()),
                    Err(error) => Err(format!("inspect setup queue: {error}")),
                    Ok(_) => Err("health connection arrived before fixture setup was ready".into()),
                };
                queue_probe_tx
                    .send(queue_empty.clone())
                    .map_err(|error| format!("report setup queue probe: {error}"))?;
                queue_empty?;
                release_setup_rx
                    .recv_timeout(Duration::from_secs(10))
                    .map_err(|error| format!("wait for setup release: {error}"))?;
                Ok(())
            },
        );
        save_started_tx
            .send(())
            .expect("report save start after fixture readiness");
        let result = save(&state, &base, generation, true);
        let requests = host.finish(&result);
        result.expect("save after fixture setup release");
        assert_eq!(
            requests.len(),
            2,
            "released fixture health/POST sequence: {requests:?}"
        );
        assert!(
            requests[0].starts_with("GET /api/v1/health "),
            "released fixture health: {requests:?}"
        );
        assert!(
            requests[1].starts_with("POST /api/v1/catalog/masters/master-1/details "),
            "released fixture POST: {requests:?}"
        );
    });
    queue_probe_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("receive original-listener setup queue inspection")
        .expect("health must not start while fixture setup is held");
    assert_eq!(
        save_started_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty),
        "save must remain behind fixture readiness while setup is held"
    );
    release_setup_tx
        .send(())
        .expect("release held fixture setup");
    save_started_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("save must start after fixture setup becomes ready");
    worker
        .join()
        .expect("complete released fixture save and health/POST assertions");
    std::fs::remove_file(path).unwrap();
}

#[test]
fn queued_reviewed_local_details_cannot_follow_a_new_client_authority() {
    let (state, path) = fake_host_state("http://127.0.0.1:1");
    let input =
        serde_json::from_value(serde_json::json!({"spool_id":"never-write","status":"IN_STOCK"}))
            .unwrap();
    let result = ActiveLibraryGateway::new(&state)
        .update_spool_details(input, Some(ReviewedLibraryAuthority::Local));
    assert!(result.unwrap_err().contains("common.invalid_request"));
    assert!(FilamentDatabase::open(&path)
        .unwrap()
        .get_spool_by_id("never-write")
        .unwrap()
        .is_none());
    std::fs::remove_file(path).unwrap();
}

fn save_rfid(state: &AppState, base: &str, generation: Option<u64>) -> Result<(), String> {
    update_library_sync_host_spool_rfid_tag_blocking(state, serde_json::from_value(serde_json::json!({
        "base_url":base,"expected_library_id":"library-test","expected_target_generation":generation,
        "spool_id":"spool / one","rfid_tag":"TAG-123","rfid_observed_at":"2026-09-15T12:00:00Z"
    })).unwrap())
}

#[test]
fn reviewed_rfid_rejects_old_generation_before_network() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (state, path) = fake_host_state(&base);
    let generation = FilamentDatabase::open(&path)
        .unwrap()
        .get_library_sync_settings()
        .unwrap()
        .target_generation;
    change_target_and_back(&state);
    assert!(save_rfid(&state, &base, Some(generation))
        .unwrap_err()
        .contains("common.invalid_request"));
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
    std::fs::remove_file(path).unwrap();
}

#[test]
fn reviewed_rfid_keeps_target_through_health_post_and_cache() {
    for phase in ["fresh", "legacy", "health", "post", "cache"] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (state, path) = fake_host_state(&base);
        let generation = FilamentDatabase::open(&path)
            .unwrap()
            .get_library_sync_settings()
            .unwrap()
            .target_generation;
        let host = ReviewedSaveHost::start(
            listener,
            &state,
            format!("RFID phase={phase}"),
            false,
            match phase {
                "health" => TransitionAt::Health,
                "post" => TransitionAt::Post,
                "cache" => TransitionAt::Cache,
                _ => TransitionAt::Never,
            },
        );
        let result = save_rfid(
            &state,
            &base,
            if phase == "legacy" {
                None
            } else {
                Some(generation)
            },
        );
        let requests = host.finish(&result);
        assert!(
            requests
                .first()
                .is_some_and(|request| request.starts_with("GET /api/v1/health ")),
            "{phase}: missing initial health; requests: {requests:?}; client: {result:?}"
        );
        let posts: Vec<_> = requests.iter().filter(|r| r.starts_with("POST ")).collect();
        if phase == "health" || phase == "post" {
            let error = result.unwrap_err();
            assert!(error.contains("common.invalid_request"), "{phase}: {error}");
            assert_eq!(
                posts.len(),
                usize::from(phase == "post"),
                "{phase}: {requests:?}"
            );
            assert_eq!(
                requests.len(),
                if phase == "post" { 2 } else { 1 },
                "{phase}: {requests:?}"
            );
            assert!(!requests
                .iter()
                .any(|r| r.starts_with("GET /api/v1/library/spools?")));
        } else {
            result.unwrap_or_else(|error| panic!("{phase}: {error}"));
            assert_eq!(posts.len(), 1, "{phase}: {requests:?}");
            assert!(posts[0].starts_with("POST /api/v1/spools/spool%20%2F%20one/rfid "));
            assert!(posts[0].contains("TAG-123"));
            assert_eq!(requests.len(), 3, "{phase}: {requests:?}");
            assert!(
                requests[2].starts_with("GET /api/v1/library/spools?"),
                "{phase}: {requests:?}"
            );
        }
        let db = FilamentDatabase::open(&path).unwrap();
        let settings = db.get_library_sync_settings().unwrap();
        let changed = matches!(phase, "health" | "post" | "cache");
        assert_eq!(
            settings.target_generation,
            generation + if changed { 2 } else { 0 },
            "{phase}"
        );
        assert_eq!(
            settings.host_base_url.as_deref(),
            Some(base.as_str()),
            "{phase}"
        );
        assert_eq!(settings.library_id, "library-test", "{phase}");
        if changed {
            assert!(
                settings.cached_spools.is_none(),
                "{phase}: stale-target cache must not persist"
            );
        } else {
            assert!(
                settings.cached_spools.unwrap().rows.is_empty(),
                "{phase}: complete empty cache must persist"
            );
        }
        assert!(db.get_spool_by_id("spool / one").unwrap().is_none());
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
