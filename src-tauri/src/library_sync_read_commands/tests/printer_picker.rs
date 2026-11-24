use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_models::PRINTER_PICKER_CAPABILITY;
use crate::printer_picker_commands::printer_picker_page_blocking;
use serde_json::json;

#[test]
fn printer_picker_uses_legacy_fallback_and_discards_late_page_after_a_b_a() {
    const POST: &str = "POST /api/v1/library/printer-spool-picker ";
    let health = |modern: bool| {
        let mut body: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
        if modern {
            body["capabilities"] = json!([PRINTER_PICKER_CAPABILITY]);
        }
        FakeHostResponse {
            expected_request_prefix: "GET /api/v1/health ",
            status: "200 OK",
            body: body.to_string(),
        }
    };
    let (send, receive) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let (url, server) = spawn_fake_host_with(
        vec![
            health(false),
            health(true),
            FakeHostResponse {
                expected_request_prefix: POST,
                status: "200 OK",
                body: json!({"rows":[],"total":0,"current_match":null,"revisions":[1,1,1]})
                    .to_string(),
            },
        ],
        move |request| {
            if request.starts_with(POST) {
                let db = FilamentDatabase::open(receive.recv().unwrap()).unwrap();
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
    let read = || {
        printer_picker_page_blocking(&state,
        serde_json::from_value(json!({"slot_id":"slot","locale":"nb","search":"red","offset":120})).unwrap(),
        serde_json::from_value(json!({"base_url":url,"expected_library_id":"library-test","target_generation":generation})).unwrap())
    };
    assert!(read().unwrap().is_none());
    send.send(path.clone()).unwrap();
    assert!(read().is_err());
    server.join().unwrap();
    assert!(db.get_library_sync_page_status().unwrap().target_generation > generation);
    drop(db);
    std::fs::remove_file(path).unwrap();
}
