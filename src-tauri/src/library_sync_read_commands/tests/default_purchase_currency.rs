use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::{
    backend::filament_database::FilamentDatabase,
    companion_models::{DEFAULT_PURCHASE_CURRENCY_CAPABILITY, FILAMENT_PRICE_STANDARDS_CAPABILITY},
    inventory_filament_standards_commands::default_purchase_currency_blocking,
    library_sync_target_guard::LibraryReadTarget,
};
use serde_json::{json, Value};

const MODERN: &str = "GET /api/v1/library/default-purchase-currency ";
const LEGACY: &str = "GET /api/v1/library/filament-standards ";

fn response(path: &'static str, body: Value) -> FakeHostResponse {
    FakeHostResponse {
        expected_request_prefix: path,
        status: "200 OK",
        body: body.to_string(),
    }
}

fn health(capabilities: &[&str]) -> FakeHostResponse {
    let mut body: Value = serde_json::from_str(&fake_health()).unwrap();
    body["capabilities"] = json!(capabilities);
    response("GET /api/v1/health ", body)
}

fn target(url: Option<&str>, library: &str, generation: u64) -> LibraryReadTarget {
    serde_json::from_value(
        json!({ "base_url":url, "expected_library_id":library, "target_generation":generation }),
    )
    .unwrap()
}

#[test]
fn default_purchase_currency_negotiates_once_and_never_substitutes_client_currency() {
    let modern = [
        DEFAULT_PURCHASE_CURRENCY_CAPABILITY,
        FILAMENT_PRICE_STANDARDS_CAPABILITY,
    ];
    let old = [FILAMENT_PRICE_STANDARDS_CAPABILITY];
    let (url, server) = spawn_fake_host_with(
        vec![
            health(&modern),
            response(MODERN, json!(" eur ")),
            health(&modern),
            response(MODERN, Value::Null),
            health(&modern),
            response(MODERN, json!("invalid")),
            health(&modern),
            FakeHostResponse {
                expected_request_prefix: MODERN,
                status: "503 Service Unavailable",
                body: json!({"message":"unavailable"}).to_string(),
            },
            health(&old),
            response(
                LEGACY,
                json!({"settings":{"default_purchase_currency":" usd ","price_standards":[]},"groups":[{"spools":["legacy detail"]}]}),
            ),
            health(&old),
            response(LEGACY, json!({"settings":{},"groups":[]})),
            health(&[]),
        ],
        |request| {
            if request.starts_with(MODERN) || request.starts_with(LEGACY) {
                assert!(request.to_ascii_lowercase().contains("\r\ncookie:"));
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    db.set_setting("default_purchase_currency", "NOK").unwrap();
    let generation = db.get_library_sync_page_status().unwrap().target_generation;
    let read = || {
        default_purchase_currency_blocking(&state, target(Some(&url), "library-test", generation))
    };
    // A local target in Client mode is rejected even though the Client database has NOK.
    assert!(
        default_purchase_currency_blocking(&state, target(None, "library-test", generation))
            .is_err()
    );
    assert!(
        default_purchase_currency_blocking(&state, target(Some(&url), " ", generation)).is_err()
    );
    assert_eq!(read().unwrap().as_deref(), Some("EUR"));
    assert_eq!(read().unwrap(), None);
    assert_eq!(read().unwrap(), None);
    assert!(read().is_err()); // No expensive legacy retry when a supporting Host fails.
    assert_eq!(read().unwrap().as_deref(), Some("USD"));
    assert_eq!(read().unwrap(), None);
    assert!(read()
        .unwrap_err()
        .contains("filament_standards.host_unsupported"));
    server.join().unwrap();
    assert!(read().is_err()); // Disconnected, with a populated Client setting.
    let mut settings = db.get_library_sync_settings().unwrap();
    settings.mode = "STANDALONE".into();
    settings.host_base_url = None;
    let local = db.save_library_sync_settings(&settings).unwrap();
    let local_read = |selected_generation| {
        default_purchase_currency_blocking(
            &state,
            target(None, &local.library_id, selected_generation),
        )
    };
    assert!(local_read(generation).is_err());
    assert_eq!(
        local_read(local.target_generation).unwrap().as_deref(),
        Some("NOK")
    );
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn default_purchase_currency_rejects_late_a_b_a_on_both_host_routes() {
    for (capability, route, body) in [
        (DEFAULT_PURCHASE_CURRENCY_CAPABILITY, MODERN, json!("NOK")),
        (
            FILAMENT_PRICE_STANDARDS_CAPABILITY,
            LEGACY,
            json!({"settings":{"default_purchase_currency":"NOK"},"groups":[]}),
        ),
    ] {
        let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
        let (url, server) = spawn_fake_host_with(
            vec![health(&[capability]), response(route, body)],
            move |request| {
                if request.starts_with(route) {
                    let db = FilamentDatabase::open(rx.recv().unwrap()).unwrap();
                    let original = db.get_library_sync_settings().unwrap();
                    let mut other = original.clone();
                    other.library_id = "library-b".into();
                    other.host_base_url = Some("http://other.local:4278".into());
                    db.save_library_sync_settings(&other).unwrap();
                    db.save_library_sync_settings(&original).unwrap();
                }
            },
        );
        let (state, path) = fake_host_state(&url);
        let db = FilamentDatabase::open(&path).unwrap();
        let generation = db.get_library_sync_page_status().unwrap().target_generation;
        tx.send(path.clone()).unwrap();
        let read = || {
            default_purchase_currency_blocking(
                &state,
                target(Some(&url), "library-test", generation),
            )
        };
        assert!(read().unwrap_err().contains("common.invalid_request"));
        server.join().unwrap();
        assert!(read().unwrap_err().contains("common.invalid_request"));
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
