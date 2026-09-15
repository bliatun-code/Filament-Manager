use super::tests::{common_details_update, fake_host_state, read_http_request};
use super::*;
use crate::active_library_gateway::{ActiveLibraryGateway, ReviewedLibraryAuthority};
use crate::backend::filament_database::FilamentDatabase;
use crate::library_sync_printer_write_commands::update_library_sync_host_master_catalog_entry_blocking;
use std::io::Write;
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
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
    let db = FilamentDatabase::open(&state.db_path).unwrap();
    let mut settings = db.get_library_sync_settings().unwrap();
    let original = settings.host_base_url.clone();
    settings.host_base_url = Some("http://other.invalid:4278".into());
    db.save_library_sync_settings(&settings).unwrap();
    settings.host_base_url = original;
    db.save_library_sync_settings(&settings).unwrap();
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

#[test]
fn reviewed_detail_saves_keep_the_original_target_through_health_and_post() {
    for master in [false, true] {
        for change in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let (state, path) = fake_host_state(&base);
            let generation = FilamentDatabase::open(&path)
                .unwrap()
                .get_library_sync_settings()
                .unwrap()
                .target_generation;
            let server_state = state.clone();
            let done = Arc::new(AtomicBool::new(false));
            let requests = Arc::new(Mutex::new(Vec::new()));
            let server_done = Arc::clone(&done);
            let server_requests = Arc::clone(&requests);
            let server = std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(10);
                while !server_done.load(Ordering::SeqCst) && Instant::now() < deadline {
                    let (mut stream, _) = match listener.accept() {
                        Ok(connection) => connection,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5));
                            continue;
                        }
                        Err(error) => panic!("accept: {error}"),
                    };
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let request = read_http_request(&mut stream);
                    let health = request.starts_with("GET /api/v1/health ");
                    server_requests.lock().unwrap().push(request);
                    if health && change {
                        change_target_and_back(&server_state);
                    }
                    let body = if health {
                        serde_json::json!({"ok":true,"api_version":"v1","capabilities":["spool-common-details-v2"],
                            "auth_mode":"pairing-session","access_mode":"trusted-lan","library_id":"library-test","device_name":"Test Host","sync_mode":"HOST"}).to_string()
                    } else {
                        "{}".into()
                    };
                    write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
                }
            });
            let result = save(&state, &base, generation, master);
            done.store(true, Ordering::SeqCst);
            server.join().unwrap();
            let requests = requests.lock().unwrap();
            let writes: Vec<_> = requests
                .iter()
                .filter(|request| request.starts_with("POST "))
                .collect();
            if change {
                assert!(result.unwrap_err().contains("common.invalid_request"));
                assert_eq!(
                    requests.len(),
                    1,
                    "only the original health read is permitted"
                );
                assert!(writes.is_empty());
            } else {
                result.unwrap();
                assert_eq!(writes.len(), 1);
                assert!(writes[0].starts_with(if master {
                    "POST /api/v1/catalog/masters/master-1/details "
                } else {
                    "POST /api/v1/spools/spool-1/details "
                }));
            }
            std::fs::remove_file(path).unwrap();
        }
    }
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
        listener.set_nonblocking(true).unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (state, path) = fake_host_state(&base);
        let generation = FilamentDatabase::open(&path)
            .unwrap()
            .get_library_sync_settings()
            .unwrap()
            .target_generation;
        let server_state = state.clone();
        let done = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let server_done = Arc::clone(&done);
        let server_requests = Arc::clone(&requests);
        let server = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(10);
            while !server_done.load(Ordering::SeqCst) && Instant::now() < deadline {
                let (mut stream, _) = match listener.accept() {
                    Ok(connection) => connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(error) => panic!("accept: {error}"),
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let request = read_http_request(&mut stream);
                let health = request.starts_with("GET /api/v1/health ");
                let post = request.starts_with("POST ");
                let cache = request.starts_with("GET /api/v1/library/spools?");
                server_requests.lock().unwrap().push(request);
                if (phase == "health" && health)
                    || (phase == "post" && post)
                    || (phase == "cache" && cache)
                {
                    change_target_and_back(&server_state);
                }
                let body = if health {
                    serde_json::json!({"ok":true,"api_version":"v1","capabilities":[],"auth_mode":"pairing-session",
                        "access_mode":"trusted-lan","library_id":"library-test","device_name":"Host","sync_mode":"HOST"}).to_string()
                } else {
                    "{}".into()
                };
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
            }
        });
        let result = save_rfid(
            &state,
            &base,
            if phase == "legacy" {
                None
            } else {
                Some(generation)
            },
        );
        done.store(true, Ordering::SeqCst);
        server.join().unwrap();
        let requests = requests.lock().unwrap();
        let posts: Vec<_> = requests.iter().filter(|r| r.starts_with("POST ")).collect();
        if phase == "health" || phase == "post" {
            assert!(
                result.unwrap_err().contains("common.invalid_request"),
                "{phase}"
            );
            assert_eq!(posts.len(), usize::from(phase == "post"));
            assert!(!requests
                .iter()
                .any(|r| r.starts_with("GET /api/v1/library/spools?")));
        } else {
            result.unwrap();
            assert_eq!(posts.len(), 1);
            assert!(posts[0].starts_with("POST /api/v1/spools/spool%20%2F%20one/rfid "));
            assert!(posts[0].contains("TAG-123"));
            if phase == "cache" {
                assert!(requests
                    .iter()
                    .any(|r| r.starts_with("GET /api/v1/library/spools?")));
            }
        }
        assert!(FilamentDatabase::open(&path)
            .unwrap()
            .get_spool_by_id("spool / one")
            .unwrap()
            .is_none());
        std::fs::remove_file(path).unwrap();
    }
}
