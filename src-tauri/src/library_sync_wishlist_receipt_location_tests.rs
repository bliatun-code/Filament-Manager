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

struct OlderHost {
    base_url: String,
    stopped: Arc<AtomicBool>,
    accepted: std::sync::mpsc::Receiver<()>,
    server: Option<std::thread::JoinHandle<Vec<(String, String)>>>,
}

impl OlderHost {
    fn start() -> Self {
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
                let body = if request_line.starts_with("GET /api/v1/health ") {
                    serde_json::json!({"ok":true,"api_version":"v1","capabilities":[],
                        "auth_mode":"pairing-session","access_mode":"trusted-lan",
                        "library_id":LIBRARY_ID,"device_name":"Synthetic older Host","sync_mode":"HOST"}).to_string()
                } else if request_line == "POST /api/v1/wishlist/order/receive HTTP/1.1" {
                    serde_json::json!({"spool_ids":["host-received-spool"],"received_quantity":1,
                        "remaining_quantity":0,"status":"RECEIVED"})
                    .to_string()
                } else {
                    "[]".to_string()
                };
                requests.push((request_line, payload));
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
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

impl Drop for OlderHost {
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

fn input(base_url: &str, home_location: Option<&str>) -> LibrarySyncReceiveWishlistItemInput {
    LibrarySyncReceiveWishlistItemInput {
        base_url: base_url.to_string(),
        expected_library_id: Some(LIBRARY_ID.into()),
        item_id: "order".into(),
        quantity: 1,
        purchase_metadata: None,
        home_location: home_location.map(str::to_string),
    }
}

#[test]
fn receipt_location_synthetic_host_waits_for_the_first_request_bytes() {
    let mut host = OlderHost::start();
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
    let mut host = OlderHost::start();
    let (_directory, state) = client(&host.base_url, false);
    let error = receive_library_sync_host_wishlist_item_blocking(
        &state,
        input(&host.base_url, Some("  Receipt shelf  ")),
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
        let mut host = OlderHost::start();
        let (_directory, state) = client(&host.base_url, true);
        let result = receive_library_sync_host_wishlist_item_blocking(
            &state,
            input(&host.base_url, location),
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
            2,
            None,
            Some("  Shelf A  "),
            &[WISHLIST_RECEIPT_LOCATION_CAPABILITY.to_string()]
        )
        .unwrap(),
        serde_json::json!({"quantity":2,"home_location":"Shelf A"})
    );
}
