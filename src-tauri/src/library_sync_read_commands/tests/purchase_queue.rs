use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::{
    backend::{database_wishlist_queue::PurchaseQueueQuery, filament_database::FilamentDatabase},
    companion_models::PURCHASE_QUEUE_CAPABILITY,
    spool_picker_commands::purchase_queue_page_blocking,
};
use serde_json::json;

#[test]
fn purchase_pages_negotiate_old_hosts_and_guard_offline_rows_through_a_b_a() {
    const POST: &str = "POST /api/v1/library/purchase-queue ";
    let health = |modern| {
        let mut body: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
        if modern {
            body["capabilities"] = json!([PURCHASE_QUEUE_CAPABILITY]);
        }
        FakeHostResponse {
            expected_request_prefix: "GET /api/v1/health ",
            status: "200 OK",
            body: body.to_string(),
        }
    };
    let page = |id| {
        FakeHostResponse { expected_request_prefix: POST, status: "200 OK",
        body:json!({"rows":[{"id":id,"material":"PLA","filament_name":"Silk","color_name":"Blue",
            "vendor":"Manual","status":"ON_ORDER","quantity":1,"updated_at":"","created_at":""}],
            "summary":{"all":502,"onOrder":1,"wishlist":0,"received":501}, "offset":0,"matched":1,"revision":42}).to_string()
    }
    };
    let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
    let mut posts = 0;
    let (url, server) = spawn_fake_host_with(
        vec![
            health(false),
            health(true),
            page("first"),
            health(true),
            page("stale"),
        ],
        move |request| {
            if !request.starts_with(POST) {
                return;
            }
            posts += 1;
            if posts == 2 {
                let db = FilamentDatabase::open(rx.recv().unwrap()).unwrap();
                let original = db.get_library_sync_settings().unwrap();
                let mut other = original.clone();
                other.library_id = "library-b".into();
                db.save_library_sync_settings(&other).unwrap();
                db.save_library_sync_settings(&original).unwrap();
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let read = |generation| {
        purchase_queue_page_blocking(&state,
        PurchaseQueueQuery{ status:"ON_ORDER".into(), search:"blue".into(), offset:0,reviewed_item_id:None },
        serde_json::from_value(json!({"base_url":url,"expected_library_id":"library-test","target_generation":generation})).unwrap())
    };
    let generation = db.get_library_sync_page_status().unwrap().target_generation;
    assert!(read(generation).unwrap().is_none());
    assert_eq!(read(generation).unwrap().unwrap().summary.all, 502);
    assert_eq!(
        db.get_library_sync_settings()
            .unwrap()
            .cached_wishlist
            .unwrap()
            .rows[0]
            .id,
        "first"
    );
    tx.send(path.clone()).unwrap();
    assert!(read(generation).is_err());
    server.join().unwrap();
    assert!(db
        .get_library_sync_settings()
        .unwrap()
        .cached_wishlist
        .into_iter()
        .flat_map(|cache| cache.rows)
        .all(|row| row.id != "stale"));
    assert!(read(db.get_library_sync_page_status().unwrap().target_generation).is_err());
    drop(db);
    std::fs::remove_file(path).unwrap();
}
