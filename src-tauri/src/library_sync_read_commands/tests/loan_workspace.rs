use super::{
    fake_health, fake_host_state, spawn_fake_host, spawn_fake_host_with, FakeHostResponse,
};
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_models::LOAN_WORKSPACE_COUNTS;
use crate::loan_workspace_commands::counts_blocking;
use serde_json::json;

#[test]
fn loan_workspace_counts_keep_an_offline_copy_and_reject_a_b_a() {
    let mut health: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
    health["capabilities"] = json!([LOAN_WORKSPACE_COUNTS]);
    let get = "GET /api/v1/library/loan-workspace-counts ";
    let response = |prefix, body: serde_json::Value| FakeHostResponse {
        expected_request_prefix: prefix,
        status: "200 OK",
        body: body.to_string(),
    };
    let totals = json!({"stock":10000,"loans":4,"locations":3,"purchases":0});
    let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let (url, server) = spawn_fake_host_with(
        vec![
            response("GET /api/v1/health ", health.clone()),
            response(get, totals.clone()),
            response("GET /api/v1/health ", health),
            response(get, totals),
        ],
        move |request| {
            if request.starts_with(get) {
                if let Some(path) = rx.recv().ok().filter(|p| !p.as_os_str().is_empty()) {
                    let db = FilamentDatabase::open(path).unwrap();
                    let a = db.get_library_sync_settings().unwrap();
                    let mut b = a.clone();
                    b.library_id = "other".into();
                    db.save_library_sync_settings(&b).unwrap();
                    db.save_library_sync_settings(&a).unwrap();
                }
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let generation = || db.get_library_sync_page_status().unwrap().target_generation;
    let read = |g| {
        counts_blocking(
            &state,
            serde_json::from_value(json!({
                "base_url":url, "expected_library_id":"library-test", "target_generation":g
            }))
            .unwrap(),
        )
    };
    let initial = generation();
    tx.send(std::path::PathBuf::new()).unwrap();
    let live = read(initial).unwrap();
    assert_eq!(live.stock, Some(10000));
    assert_eq!(db.cached_loan_workspace_counts().unwrap(), live);
    tx.send(path.clone()).unwrap();
    assert!(read(initial)
        .unwrap_err()
        .contains("common.invalid_request"));
    server.join().unwrap();
    assert_ne!(initial, generation());
    assert_eq!(read(generation()).unwrap().stock, None);
    db.save_loan_workspace_counts(&live).unwrap();
    assert_eq!(read(generation()).unwrap(), live);
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn legacy_loan_workspace_shows_only_counts_its_host_can_prove() {
    use crate::backend::statistics::InventoryOverview;
    for (total, expected_loans) in [(3, Some(2)), (4, None)] {
        let overview = InventoryOverview {
            total_spools: total,
            total_owned_spools: 2,
            total_borrowed_in_spools: 1,
            ..Default::default()
        };
        let reply = |expected_request_prefix, body| FakeHostResponse {
            expected_request_prefix,
            status: "200 OK",
            body,
        };
        let (url, server) = spawn_fake_host(vec![
            reply("GET /api/v1/health ", fake_health()),
            reply("GET /api/v1/library/snapshot ", json!({"ok":true,"device_name":"Host","sync_mode":"HOST",
                "library_id":"library-test","captured_at":"now","inventory":overview,"active_loans":1,"printers":0}).to_string()),
            reply("GET /api/v1/library/wishlist?limit=500 ", "[{}]".into()),
        ]);
        let (state, path) = fake_host_state(&url);
        let db = FilamentDatabase::open(&path).unwrap();
        let target = json!({"base_url":url,"expected_library_id":"library-test",
            "target_generation":db.get_library_sync_page_status().unwrap().target_generation});
        let counts = counts_blocking(&state, serde_json::from_value(target).unwrap()).unwrap();
        assert_eq!(
            (
                counts.stock,
                counts.loans,
                counts.locations,
                counts.purchases
            ),
            (Some(total), expected_loans, None, Some(1))
        );
        server.join().unwrap();
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
