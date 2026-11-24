use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::backend::database_loan_picker::LoanPickerQuery;
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_models::LOAN_PICKER_CAPABILITY;
use crate::spool_picker_commands::loan_picker_page_blocking;
use serde_json::json;

#[test]
fn loan_picker_distinguishes_legacy_from_offline_and_rejects_a_late_a_b_a_page() {
    let health = |modern| {
        let mut body: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
        if modern {
            body["capabilities"] = json!([LOAN_PICKER_CAPABILITY]);
        }
        FakeHostResponse {
            expected_request_prefix: "GET /api/v1/health ",
            status: "200 OK",
            body: body.to_string(),
        }
    };
    const POST: &str = "POST /api/v1/library/loan-spool-picker ";
    let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let (url, server) = spawn_fake_host_with(
        vec![
            health(false),
            health(true),
            FakeHostResponse {
                expected_request_prefix: POST,
                status: "200 OK",
                body:
                    json!({"rows":[],"total":0,"matches":0,"selected":null,"revisions":[1,1,1,1]})
                        .to_string(),
            },
        ],
        move |request| {
            if request.starts_with(POST) {
                let db = FilamentDatabase::open(rx.recv().unwrap()).unwrap();
                let original = db.get_library_sync_settings().unwrap();
                let mut other = original.clone();
                other.library_id = "other".into();
                other.host_base_url = Some("http://other.local:4278".into());
                db.save_library_sync_settings(&other).unwrap();
                db.save_library_sync_settings(&original).unwrap();
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let generation = || db.get_library_sync_page_status().unwrap().target_generation;
    let read = |generation| {
        let query = LoanPickerQuery {
            locale: "en".into(),
            search: "PLA".into(),
            offset: 150,
            selected_id: None,
        };
        let target = json!({
            "base_url": url,
            "expected_library_id": "library-test",
            "target_generation": generation,
        });
        loan_picker_page_blocking(&state, query, serde_json::from_value(target).unwrap())
    };
    let initial = generation();
    assert!(read(initial).unwrap().is_none());
    tx.send(path.clone()).unwrap();
    assert!(read(initial)
        .unwrap_err()
        .contains("common.invalid_request"));
    server.join().unwrap();
    assert_ne!(generation(), initial);
    assert!(read(generation()).is_err());
    drop(db);
    std::fs::remove_file(path).unwrap();
}
