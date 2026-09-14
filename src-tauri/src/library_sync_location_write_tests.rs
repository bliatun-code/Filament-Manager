use super::tests::test_state;
use super::*;
use crate::backend::filament_database::FilamentDatabase;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

fn mutate(state: &AppState, base: &str, generation: u64, action: &str) -> Result<(), String> {
    let input = serde_json::json!({"base_url":base,"expected_library_id":"library-test",
        "expected_target_generation":generation,"location_id":"a","name":"Box", "source_id":"a","target_id":"b"});
    match action {
        "create" => create_library_sync_host_location_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        "rename" => rename_library_sync_host_location_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        "merge" => merge_library_sync_host_locations_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        "archive" => archive_library_sync_host_location_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        "restore" => restore_library_sync_host_location_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        "delete" => delete_library_sync_host_location_blocking(
            state,
            serde_json::from_value(input).unwrap(),
        )
        .map(|_| ()),
        _ => unreachable!(),
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
fn location_writes_keep_reviewed_generation_before_and_during_health() {
    for action in ["create", "rename", "archive", "restore", "delete", "merge"] {
        for phase in ["fresh", "before", "health", "post", "refresh"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let (state, path) = test_state(&base);
            let generation = FilamentDatabase::open(&path)
                .unwrap()
                .get_library_sync_settings()
                .unwrap()
                .target_generation;
            if phase == "before" {
                change_target_and_back(&state);
            }
            let server_state = state.clone();
            let done = Arc::new(AtomicBool::new(false));
            let requests = Arc::new(Mutex::new(Vec::new()));
            let server_done = Arc::clone(&done);
            let server_requests = Arc::clone(&requests);
            let server = std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(15);
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
                    let mut request = Vec::new();
                    loop {
                        let mut bytes = [0; 4096];
                        let n = stream.read(&mut bytes).unwrap();
                        if n == 0 {
                            break;
                        }
                        request.extend_from_slice(&bytes[..n]);
                        let text = String::from_utf8_lossy(&request);
                        if let Some(end) = text.find("\r\n\r\n") {
                            let length = text[..end]
                                .lines()
                                .find_map(|line| {
                                    line.to_ascii_lowercase()
                                        .strip_prefix("content-length:")
                                        .map(|v| v.trim().parse::<usize>().unwrap())
                                })
                                .unwrap_or(0);
                            if request.len() >= end + 4 + length {
                                break;
                            }
                        }
                    }
                    let request = String::from_utf8(request).unwrap();
                    let first = request.lines().next().unwrap().to_string();
                    let health = first.starts_with("GET /api/v1/health ");
                    let post = first.starts_with("POST ");
                    server_requests.lock().unwrap().push(first);
                    if (phase == "health" && health)
                        || (phase == "post" && post)
                        || (phase == "refresh" && !health && !post)
                    {
                        change_target_and_back(&server_state);
                    }
                    let body = if health {
                        serde_json::json!({"ok":true,"api_version":"v1","capabilities":["inventory-locations-v1"],
                            "auth_mode":"pairing-session","access_mode":"trusted-lan","library_id":"library-test","device_name":"Test Host","sync_mode":"HOST"})
                    } else if !post { serde_json::json!([]) }
                    else if action == "merge" { serde_json::json!({"source_id":"a","target_id":"b","affected_spools":1,
                        "moved_current_references":1,"moved_home_references":0,"moved_parent_references":0}) }
                    else { serde_json::json!({"id":"a","name":"Box","location_type":"GENERIC","created_at":"","updated_at":""}) }.to_string();
                    write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
                }
            });
            let result = mutate(&state, &base, generation, action);
            done.store(true, Ordering::SeqCst);
            server.join().unwrap();
            let requests = requests.lock().unwrap();
            let writes: Vec<_> = requests
                .iter()
                .filter(|request| request.starts_with("POST "))
                .collect();
            match phase {
                "before" | "health" => {
                    assert!(
                        result.unwrap_err().contains("common.invalid_request"),
                        "{action}/{phase}"
                    );
                    assert_eq!(
                        requests.len(),
                        usize::from(phase == "health"),
                        "{action}/{phase}: {requests:?}"
                    );
                    assert!(writes.is_empty());
                }
                _ => {
                    if phase == "post" {
                        assert!(result.unwrap_err().contains("common.invalid_request"));
                    } else {
                        result.unwrap_or_else(|error| panic!("{action}/{phase}: {error}"));
                    }
                    assert_eq!(writes.len(), 1);
                    let path = match action {
                        "create" => "/api/v1/locations".to_string(),
                        "merge" => "/api/v1/locations/merge".to_string(),
                        _ => format!("/api/v1/locations/a/{action}"),
                    };
                    assert_eq!(writes[0], &format!("POST {path} HTTP/1.1"));
                    if phase == "refresh" {
                        assert_eq!(requests.len(), 3);
                    }
                    if phase == "post" {
                        assert_eq!(
                            requests.len(),
                            2,
                            "stale target must not be recaptured for cache refresh"
                        );
                    }
                }
            }
            std::fs::remove_file(path).unwrap();
        }
    }
}
