use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::{
    backend::{database_location_spools::LocationSpoolQuery, filament_database::FilamentDatabase},
    companion_models::LOCATION_SPOOLS_CAPABILITY,
    spool_picker_commands::{cached_location_spool_page_blocking, location_spool_page_blocking},
};
use serde_json::json;

#[test]
fn location_spool_pages_distinguish_old_hosts_and_offline_and_reject_late_a_b_a_reads() {
    const POST: &str = "POST /api/v1/library/location-spools ";
    let health = |modern| {
        let mut body: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
        if modern {
            body["capabilities"] = json!([LOCATION_SPOOLS_CAPABILITY]);
        }
        FakeHostResponse {
            expected_request_prefix: "GET /api/v1/health ",
            status: "200 OK",
            body: body.to_string(),
        }
    };
    let response = || FakeHostResponse {
        expected_request_prefix: POST,
        status: "200 OK",
        body: json!({"rows":[],"total":4,"matches":0,"revisions":[12,9]}).to_string(),
    };
    let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let mut posts = 0;
    let (url, server) = spawn_fake_host_with(
        vec![
            health(false),
            health(true),
            response(),
            health(true),
            response(),
        ],
        move |request| {
            if request.starts_with(POST) {
                posts += 1;
                if posts == 2 {
                    let db = FilamentDatabase::open(rx.recv().unwrap()).unwrap();
                    let original = db.get_library_sync_settings().unwrap();
                    let mut other = original.clone();
                    other.library_id = "other".into();
                    other.host_base_url = Some("http://other.local:4278".into());
                    db.save_library_sync_settings(&other).unwrap();
                    db.save_library_sync_settings(&original).unwrap();
                }
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let initial = db.get_library_sync_page_status().unwrap().target_generation;
    let query = || LocationSpoolQuery {
        location_id: "shelf-a".into(),
        search: "green".into(),
        offset: 100,
    };
    let target = |generation| {
        serde_json::from_value(json!({
            "base_url":url,"expected_library_id":"library-test","target_generation":generation
        }))
        .unwrap()
    };
    let read = |generation| location_spool_page_blocking(&state, query(), target(generation));
    let cached =
        |generation| cached_location_spool_page_blocking(&state, query(), target(generation));
    assert!(read(initial).unwrap().is_none());
    assert!(cached(initial).unwrap().is_none());
    let captured = db.save_library_sync_cached_spools(&[]).unwrap();
    let page = read(initial).unwrap().unwrap();
    assert_eq!((page.total, page.matches, page.revisions), (4, 0, [12, 9]));
    assert!(page.captured_at.is_none());
    let saved = cached(initial).unwrap().unwrap();
    assert_eq!(saved.captured_at.as_deref(), Some(captured.as_str()));
    assert_eq!(saved.total, 0);
    tx.send(path.clone()).unwrap();
    assert!(read(initial)
        .unwrap_err()
        .contains("common.invalid_request"));
    server.join().unwrap();
    let current = db.get_library_sync_page_status().unwrap().target_generation;
    assert_ne!(current, initial);
    assert!(cached(initial)
        .unwrap_err()
        .contains("common.invalid_request"));
    assert!(read(current).is_err());
    assert!(cached(current).unwrap().is_none());
    drop(db);
    std::fs::remove_file(path).unwrap();
}
