use super::super::fetch_library_sync_spool_detail_blocking;
use super::{
    fake_health, fake_host_state, spawn_fake_host_with, spool_snapshot::row, FakeHostResponse,
};
use crate::backend::filament_database::FilamentDatabase;
use crate::library_sync_models::LibrarySyncSpoolDetailInput;
use serde_json::json;

fn switch_away_and_back(db: &FilamentDatabase) {
    let original = db.get_library_sync_settings().unwrap();
    let mut other = original.clone();
    other.host_base_url = Some("http://other.local:4278".into());
    other.library_id = "library-other".into();
    db.save_library_sync_settings(&other).unwrap();
    db.save_library_sync_settings(&original).unwrap();
}

#[test]
fn spool_detail_rejects_a_b_a_before_dispatch_and_while_reading() {
    const DETAIL: &str = "GET /api/v1/spools/roll?history_limit=80&usage_limit=500 ";
    let responses = (0..2)
        .flat_map(|_| {
            [
                FakeHostResponse {
                    expected_request_prefix: "GET /api/v1/health ",
                    status: "200 OK",
                    body: fake_health(),
                },
                FakeHostResponse {
                    expected_request_prefix: DETAIL,
                    status: "200 OK",
                    body: json!({
                        "spool": row("roll"), "history": [], "usage": [], "active_loan": null
                    })
                    .to_string(),
                },
            ]
        })
        .collect();
    let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let mut details = 0;
    let (url, server) = spawn_fake_host_with(responses, move |request| {
        if request.starts_with(DETAIL) {
            details += 1;
            if details == 2 {
                switch_away_and_back(&FilamentDatabase::open(rx.recv().unwrap()).unwrap());
            }
        }
    });
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let generation = || db.get_library_sync_page_status().unwrap().target_generation;
    let read = |target_generation| {
        fetch_library_sync_spool_detail_blocking(
            &state,
            LibrarySyncSpoolDetailInput {
                base_url: url.clone(),
                expected_library_id: "library-test".into(),
                target_generation,
                spool_id: "roll".into(),
                history_limit: None,
                usage_limit: None,
            },
        )
    };
    let queued = generation();
    switch_away_and_back(&db);
    let current = generation();
    assert_ne!(queued, current);
    assert!(read(queued).unwrap_err().contains("common.invalid_request"));
    assert_eq!(read(current).unwrap().spool.spool.id, "roll");
    tx.send(path.clone()).unwrap();
    assert!(read(current).is_err());
    assert_ne!(current, generation());
    server.join().unwrap();
    drop(db);
    std::fs::remove_file(path).unwrap();
}
