use super::*;
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_session::random_hex_token;
use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::state::{CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

const LIBRARY_ID: &str = "synthetic-receipt-host";

struct TestDirectory(PathBuf);
impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct ReceiptTestHost {
    base_url: String,
    stopped: Arc<AtomicBool>,
    accepted: std::sync::mpsc::Receiver<()>,
    server: Option<std::thread::JoinHandle<Vec<(String, String)>>>,
}

enum ReceiptHostApi {
    Legacy,
    Keyed,
    DowngradedAfterHealth,
}

impl ReceiptTestHost {
    fn start() -> Self {
        Self::start_with_receipt_behavior(ReceiptHostApi::Legacy, false)
    }

    fn start_with_receipt_behavior(api: ReceiptHostApi, drop_receipt_response: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&stopped);
        let (accepted_tx, accepted) = std::sync::mpsc::channel();
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
                accepted_tx.send(()).unwrap();
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
                let legacy_receipt = request_line == "POST /api/v1/wishlist/order/receive HTTP/1.1";
                let keyed_receipt =
                    request_line == "POST /api/v1/wishlist/order/receive-idempotent HTTP/1.1";
                let accepted_receipt =
                    legacy_receipt || (keyed_receipt && matches!(api, ReceiptHostApi::Keyed));

                let (status, body) = if request_line.starts_with("GET /api/v1/health ") {
                    let capabilities: Vec<_> = (!matches!(api, ReceiptHostApi::Legacy))
                        .then_some(WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY)
                        .into_iter()
                        .collect();
                    (
                        "200 OK",
                        serde_json::json!({"ok":true,"api_version":"v1","capabilities":capabilities,
                            "auth_mode":"pairing-session","access_mode":"trusted-lan",
                            "library_id":LIBRARY_ID,"device_name":"Synthetic receipt Host","sync_mode":"HOST"}).to_string()
                    )
                } else if accepted_receipt {
                    (
                        "200 OK",
                        serde_json::json!({"spool_ids":["host-received-spool"],"received_quantity":1,
                            "remaining_quantity":0,"status":"RECEIVED"}).to_string()
                    )
                } else if keyed_receipt {
                    ("404 Not Found", String::new())
                } else {
                    ("200 OK", "[]".to_string())
                };
                requests.push((request_line, payload));
                if accepted_receipt && drop_receipt_response {
                    continue;
                }
                write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
                stream.flush().unwrap();
            }
            requests
        });
        Self {
            base_url,
            stopped,
            accepted,
            server: Some(server),
        }
    }

    fn finish(&mut self) -> Vec<(String, String)> {
        self.stopped.store(true, Ordering::Release);
        self.server.take().unwrap().join().unwrap()
    }
}

impl Drop for ReceiptTestHost {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Some(server) = self.server.take() {
            let _ = server.join();
        }
    }
}

fn client(base_url: &str, authenticated: bool) -> (TestDirectory, AppState) {
    let directory = TestDirectory(
        std::env::temp_dir().join(format!("receipt-location-{}", random_hex_token(16))),
    );
    std::fs::create_dir(&directory.0).unwrap();
    let path = directory.0.join("client.db");
    let db = FilamentDatabase::open(&path).unwrap();
    db.apply_schema().unwrap();
    let mut settings = db.get_library_sync_settings().unwrap();
    settings.mode = "CLIENT".into();
    settings.library_id = LIBRARY_ID.into();
    settings.host_base_url = Some(base_url.to_string());
    db.save_library_sync_settings(&settings).unwrap();
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
            .replace_authenticated(base_url, "session", "csrf", "device")
            .unwrap();
    }
    (directory, state)
}

fn input(
    base_url: &str,
    generation: u64,
    home_location: Option<&str>,
) -> LibrarySyncReceiveWishlistItemInput {
    LibrarySyncReceiveWishlistItemInput {
        base_url: base_url.to_string(),
        expected_library_id: LIBRARY_ID.into(),
        expected_target_generation: generation,
        item_id: "order".into(),
        quantity: 1,
        request_id: None,
        retry: false,
        purchase_metadata: None,
        home_location: home_location.map(str::to_string),
    }
}

fn reviewed_input(
    state: &AppState,
    home_location: Option<&str>,
) -> LibrarySyncReceiveWishlistItemInput {
    let status = FilamentDatabase::open(&state.db_path)
        .unwrap()
        .get_library_sync_page_status()
        .unwrap();
    input(
        &status.host_base_url.unwrap(),
        status.target_generation,
        home_location,
    )
}

#[test]
fn receipt_location_synthetic_host_waits_for_the_first_request_bytes() {
    let mut host = ReceiptTestHost::start();
    let mut stream =
        std::net::TcpStream::connect(host.base_url.strip_prefix("http://").unwrap()).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    host.accepted.recv_timeout(Duration::from_secs(2)).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        !host.server.as_ref().unwrap().is_finished(),
        "the accepted connection must wait for its first HTTP bytes"
    );
    stream
        .write_all(b"GET /api/v1/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".into(), String::new())]
    );
}

#[test]
fn older_host_rejects_receipt_location_before_authentication_or_mutation() {
    let mut host = ReceiptTestHost::start();
    let (_directory, state) = client(&host.base_url, false);
    let error = receive_library_sync_host_wishlist_item_blocking(
        &state,
        reviewed_input(&state, Some("  Receipt shelf  ")),
    )
    .unwrap_err();
    let error: serde_json::Value = serde_json::from_str(&error).unwrap();
    assert_eq!(error["code"], "wishlist.receive.location_host_unsupported");
    assert_eq!(
        host.finish(),
        vec![("GET /api/v1/health HTTP/1.1".to_string(), String::new())]
    );
    let db = FilamentDatabase::open(&state.db_path).unwrap();
    assert!(db.list_wishlist_items(10).unwrap().is_empty());
    assert!(db.list_inventory_locations(true).unwrap().is_empty());
}

#[test]
fn older_host_still_receives_omitted_or_blank_locations_once() {
    for location in [None, Some(" \t ")] {
        let mut host = ReceiptTestHost::start();
        let (_directory, state) = client(&host.base_url, true);
        let result = receive_library_sync_host_wishlist_item_blocking(
            &state,
            reviewed_input(&state, location),
        )
        .unwrap();
        assert_eq!(result.spool_ids, vec!["host-received-spool"]);
        let requests = host.finish();
        let writes: Vec<_> = requests
            .iter()
            .filter(|(line, _)| line.starts_with("POST "))
            .collect();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].0, "POST /api/v1/wishlist/order/receive HTTP/1.1");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&writes[0].1).unwrap(),
            serde_json::json!({"quantity":1})
        );
    }
}

#[test]
fn capable_host_receipt_payload_preserves_trimmed_location() {
    assert_eq!(
        host_wishlist_receipt_payload_for_capabilities(
            &input("http://test.local", 1, Some("  Shelf A  ")),
            &[WISHLIST_RECEIPT_LOCATION_CAPABILITY.to_string()]
        )
        .unwrap(),
        serde_json::json!({"quantity":1,"home_location":"Shelf A"})
    );
}

#[test]
fn keyed_desktop_receipt_still_works_with_an_older_host_but_cannot_retry_there() {
    let mut host = ReceiptTestHost::start();
    let (_directory, state) = client(&host.base_url, true);
    let mut first = reviewed_input(&state, None);
    first.request_id = Some("known-attempt".to_string());
    let receipt = receive_library_sync_host_wishlist_item_blocking(&state, first).unwrap();
    assert_eq!(receipt.spool_ids, ["host-received-spool"]);

    let mut repeated = reviewed_input(&state, None);
    repeated.request_id = Some("known-attempt".to_string());
    repeated.retry = true;
    let error = receive_library_sync_host_wishlist_item_blocking(&state, repeated).unwrap_err();
    assert_eq!(
        library_sync_host_error_code(&error).as_deref(),
        Some("wishlist.receive.retry_host_unsupported")
    );
    let writes: Vec<_> = host
        .finish()
        .into_iter()
        .filter(|(request, _)| request.starts_with("POST "))
        .collect();
    assert_eq!(writes.len(), 1);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&writes[0].1).unwrap(),
        serde_json::json!({"quantity": 1})
    );
}

#[test]
fn uncertain_desktop_receipt_reports_if_the_host_received_a_key() {
    for (idempotency, expected_error) in [
        (false, "wishlist.receive.outcome_unknown_legacy_host"),
        (true, "wishlist.receive.outcome_unknown"),
    ] {
        let api = if idempotency {
            ReceiptHostApi::Keyed
        } else {
            ReceiptHostApi::Legacy
        };
        let mut host = ReceiptTestHost::start_with_receipt_behavior(api, true);
        let (_directory, state) = client(&host.base_url, true);
        let mut request = reviewed_input(&state, None);
        request.request_id = Some("lost-receipt".to_string());
        let error = receive_library_sync_host_wishlist_item_blocking(&state, request).unwrap_err();
        assert_eq!(
            library_sync_host_error_code(&error).as_deref(),
            Some(expected_error)
        );
        let writes: Vec<_> = host
            .finish()
            .into_iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .collect();
        assert_eq!(writes.len(), 1);
        let path = if idempotency {
            "receive-idempotent"
        } else {
            "receive"
        };
        assert_eq!(
            writes[0].0,
            format!("POST /api/v1/wishlist/order/{path} HTTP/1.1")
        );
        let payload: serde_json::Value = serde_json::from_str(&writes[0].1).unwrap();
        assert_eq!(
            payload
                .get("request_id")
                .and_then(serde_json::Value::as_str),
            idempotency.then_some("lost-receipt"),
        );
    }
}

#[test]
fn a_stale_receipt_target_is_classified_as_not_sent() {
    let mut host = ReceiptTestHost::start();
    let (_directory, state) = client(&host.base_url, true);
    let mut request = reviewed_input(&state, None);
    request.expected_library_id = "previous-library".into();
    request.request_id = Some("not-sent-receipt".to_string());
    let error = receive_library_sync_host_wishlist_item_blocking(&state, request).unwrap_err();
    assert_eq!(
        library_sync_host_error_code(&error).as_deref(),
        Some("wishlist.receive.not_sent")
    );
    assert!(host.finish().is_empty());
}

#[test]
fn downgrading_after_health_does_not_fall_back_to_a_keyless_receipt() {
    let mut host =
        ReceiptTestHost::start_with_receipt_behavior(ReceiptHostApi::DowngradedAfterHealth, false);
    let (_directory, state) = client(&host.base_url, true);
    let mut request = reviewed_input(&state, None);
    request.request_id = Some("protected-during-downgrade".to_string());
    let error = receive_library_sync_host_wishlist_item_blocking(&state, request).unwrap_err();
    assert_eq!(
        library_sync_host_error_code(&error).as_deref(),
        Some("wishlist.receive.outcome_unknown")
    );
    let requests = host.finish();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].0, "GET /api/v1/health HTTP/1.1");
    assert_eq!(
        requests[1].0,
        "POST /api/v1/wishlist/order/receive-idempotent HTTP/1.1"
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&requests[1].1).unwrap(),
        serde_json::json!({ "quantity": 1, "request_id": "protected-during-downgrade" }),
    );
}

#[test]
fn queued_receipt_after_a_b_a_sends_no_request() {
    let mut host = ReceiptTestHost::start_with_receipt_behavior(ReceiptHostApi::Keyed, false);
    let (_directory, state) = client(&host.base_url, true);
    let db = FilamentDatabase::open(&state.db_path).unwrap();
    let original = db.get_library_sync_settings().unwrap();
    let queued = |retry| {
        let mut request = input(&host.base_url, original.target_generation, None);
        request.request_id = Some("queued-receipt-a-b-a".into());
        request.retry = retry;
        request
    };
    let mut other = original.clone();
    other.library_id = "other-library".into();
    other.host_base_url = Some("http://other.local:4278".into());
    db.save_library_sync_settings(&other).unwrap();
    db.save_library_sync_settings(&original).unwrap();
    assert_ne!(
        original.target_generation,
        db.get_library_sync_page_status().unwrap().target_generation
    );
    for retry in [false, true] {
        let error =
            receive_library_sync_host_wishlist_item_blocking(&state, queued(retry)).unwrap_err();
        assert_eq!(
            library_sync_host_error_code(&error).as_deref(),
            Some("wishlist.receive.not_sent")
        );
    }
    assert!(host.finish().is_empty());
}
