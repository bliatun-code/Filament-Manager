use super::super::fetch_library_sync_spool_snapshot_blocking;
use super::{
    fake_health, fake_host_state, spawn_fake_host, spawn_fake_host_with, FakeHostResponse,
};
use crate::backend::filament_database::{FilamentDatabase, SpoolWithMasterRow};
use crate::library_sync_cache_commands::fetch_cached_library_sync_spools_blocking;
use crate::library_sync_models::LibrarySyncCacheTargetInput;
use serde_json::json;

const FIRST: &str = "GET /api/v1/library/spools?limit=1000&offset=0 ";
const NEXT: &str = "GET /api/v1/library/spools?limit=1000&offset=1000 ";

fn row(id: &str) -> SpoolWithMasterRow {
    serde_json::from_value(json!({
        "spool": {
            "id": id, "master_id": "master", "status": "IN_STOCK", "ownership_type": "OWNED"
        },
        "master": {
            "id": "master", "material": "PLA", "filament_name": "Basic", "color_name": "Black",
            "default_weight": 1000, "vendor": "Test"
        }
    }))
    .unwrap()
}

fn response(path: &'static str, body: String) -> FakeHostResponse {
    FakeHostResponse {
        expected_request_prefix: path,
        status: "200 OK",
        body,
    }
}

fn health() -> FakeHostResponse {
    response("GET /api/v1/health ", fake_health())
}

fn target(db: &FilamentDatabase) -> LibrarySyncCacheTargetInput {
    let settings = db.get_library_sync_settings().unwrap();
    LibrarySyncCacheTargetInput {
        base_url: settings.host_base_url.unwrap(),
        expected_library_id: settings.library_id,
        target_generation: settings.target_generation,
    }
}

#[test]
fn interrupted_second_page_preserves_previous_offline_copy_and_timestamp() {
    let page =
        serde_json::to_string(&(0..1000).map(|i| row(&i.to_string())).collect::<Vec<_>>()).unwrap();
    let revision = json!({
        "library_id": "library-test", "inventory": 1, "catalog": 1,
        "printers": 0, "loans": 0, "jobs": 0, "wishlist": 0
    });
    let (url, server) = spawn_fake_host(vec![
        health(),
        response(FIRST, page.clone()),
        response("GET /api/v1/library/revisions ", revision.to_string()),
        response(FIRST, page),
        FakeHostResponse {
            expected_request_prefix: NEXT,
            status: "503 Service Unavailable",
            body: String::new(),
        },
    ]);
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let saved = db
        .save_library_sync_cached_spools(&[row("offline")])
        .unwrap();
    assert!(fetch_library_sync_spool_snapshot_blocking(&state, target(&db)).is_err());
    server.join().unwrap();
    let cached = fetch_cached_library_sync_spools_blocking(&state, &target(&db))
        .unwrap()
        .unwrap();
    assert_eq!(cached.captured_at, saved);
    assert_eq!(cached.rows.len(), 1);
    assert_eq!(cached.rows[0].spool.id, "offline");
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn response_from_a_previous_generation_cannot_replace_the_new_offline_copy() {
    let (send, receive) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let (url, server) = spawn_fake_host_with(
        vec![health(), response(FIRST, json!([row("late")]).to_string())],
        move |request| {
            if request.starts_with(FIRST) {
                let db = FilamentDatabase::open(receive.recv().unwrap()).unwrap();
                let original = db.get_library_sync_settings().unwrap();
                let mut replacement = original.clone();
                replacement.host_base_url = Some("http://other.local:4278".into());
                replacement.library_id = "library-other".into();
                db.save_library_sync_settings(&replacement).unwrap();
                db.save_library_sync_settings(&original).unwrap();
                db.save_library_sync_cached_spools(&[row("replacement")])
                    .unwrap();
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let original = target(&db);
    send.send(path.clone()).unwrap();
    assert!(fetch_library_sync_spool_snapshot_blocking(&state, target(&db)).is_err());
    server.join().unwrap();
    assert!(fetch_cached_library_sync_spools_blocking(&state, &original).is_err());
    let current = target(&db);
    assert!(current.target_generation > original.target_generation);
    let cached = fetch_cached_library_sync_spools_blocking(&state, &current)
        .unwrap()
        .unwrap();
    assert_eq!(cached.rows.len(), 1);
    assert_eq!(cached.rows[0].spool.id, "replacement");
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn full_and_empty_live_lists_each_replace_the_previous_copy() {
    let (url, server) = spawn_fake_host(vec![
        health(),
        response(FIRST, json!([row("fresh")]).to_string()),
        health(),
        response(FIRST, "[]".into()),
    ]);
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    for expected in [vec!["fresh"], vec![]] {
        let live = fetch_library_sync_spool_snapshot_blocking(&state, target(&db)).unwrap();
        let cached = fetch_cached_library_sync_spools_blocking(&state, &target(&db))
            .unwrap()
            .unwrap();
        assert_eq!(
            live.captured_at.as_deref(),
            Some(cached.captured_at.as_str())
        );
        assert_eq!(
            live.rows
                .iter()
                .map(|row| row.spool.id.as_str())
                .collect::<Vec<_>>(),
            expected
        );
        assert_eq!(json!(live.rows), json!(cached.rows));
    }
    server.join().unwrap();
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn a_failed_cache_write_keeps_live_rows_and_the_previous_offline_copy() {
    let (url, server) = spawn_fake_host(vec![
        health(),
        response(FIRST, json!([row("live")]).to_string()),
    ]);
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    db.save_library_sync_cached_spools(&[row("offline")])
        .unwrap();
    rusqlite::Connection::open(&path).unwrap().execute_batch(
        "CREATE TRIGGER fail_spool_cache BEFORE INSERT ON settings WHEN NEW.key = 'library_sync_cached_spools_json'
         BEGIN SELECT RAISE(ABORT, 'simulated cache failure'); END;"
    ).unwrap();
    let live = fetch_library_sync_spool_snapshot_blocking(&state, target(&db)).unwrap();
    assert!(live.captured_at.is_none());
    assert_eq!(live.rows[0].spool.id, "live");
    let cached = fetch_cached_library_sync_spools_blocking(&state, &target(&db))
        .unwrap()
        .unwrap();
    assert_eq!(cached.rows[0].spool.id, "offline");
    server.join().unwrap();
    drop(db);
    std::fs::remove_file(path).unwrap();
}
