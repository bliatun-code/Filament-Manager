use super::{
    fake_host_state, fetch_library_sync_wishlist_items_blocking, LibrarySyncWishlistListInput,
};
use crate::backend::filament_database::FilamentDatabase;
use crate::library_sync_wishlist_write_commands::create_library_sync_host_wishlist_item_blocking;
use serde_json::json;
use std::net::TcpListener;

#[test]
fn stale_dashboard_generation_sends_neither_wishlist_read_nor_create() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let original = db.get_library_sync_settings().unwrap();
    let mut replacement = original.clone();
    replacement.library_id = "replacement".into();
    db.save_library_sync_settings(&replacement).unwrap();
    db.save_library_sync_settings(&original).unwrap();
    assert!(
        db.get_library_sync_page_status().unwrap().target_generation > original.target_generation
    );
    let read = LibrarySyncWishlistListInput {
        reviewed_item_id: None,
        base_url: url.clone(),
        expected_library_id: Some(original.library_id.clone()),
        expected_target_generation: Some(original.target_generation),
        limit: None,
    };
    let write = serde_json::from_value(json!({
        "base_url": url, "expected_library_id": original.library_id,
        "expected_target_generation": original.target_generation,
        "material": "PLA", "filament_name": "Basic", "color_name": "Gray", "vendor": "Test",
    }))
    .unwrap();
    let target = serde_json::from_value(json!({
        "mode":"CLIENT","host_base_url":url,"library_id":original.library_id,
        "target_generation":original.target_generation
    }))
    .unwrap();
    for error in [
        crate::inventory_create_commands::ensure_dashboard_purchase_blocking(
            &state,
            suggestion(),
            target,
        )
        .unwrap_err(),
        fetch_library_sync_wishlist_items_blocking(&state, read).unwrap_err(),
        create_library_sync_host_wishlist_item_blocking(&state, write).unwrap_err(),
    ] {
        assert!(error.contains("common.invalid_request"), "{error}");
    }
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn local_dashboard_purchase_rechecks_its_library_under_the_write_gate() {
    use crate::inventory_create_commands::create_local_wishlist_item;
    let (state, path) = fake_host_state("http://example.invalid");
    let db = FilamentDatabase::open(&path).unwrap();
    let mut local = db.get_library_sync_settings().unwrap();
    local.mode = "STANDALONE".into();
    local.host_base_url = None;
    db.save_library_sync_settings(&local).unwrap();
    let target = || {
        serde_json::from_value(
            serde_json::to_value(db.get_library_sync_page_status().unwrap()).unwrap(),
        )
        .unwrap()
    };
    let item = |id| {
        serde_json::from_value(
            json!({"id":id,"material":"PLA","filament_name":"Basic","color_name":"Gray"}),
        )
        .unwrap()
    };
    let original = target();
    create_local_wishlist_item(&state, item("first"), Some(&original)).unwrap();
    let mut other = local.clone();
    other.library_id = "local-other".into();
    db.save_library_sync_settings(&other).unwrap();
    db.save_library_sync_settings(&local).unwrap();
    assert!(
        create_local_wishlist_item(&state, item("stale"), Some(&original))
            .unwrap_err()
            .contains("common.invalid_request")
    );
    create_local_wishlist_item(&state, item("legacy"), None).unwrap();
    assert_eq!(db.list_wishlist_items(10).unwrap().len(), 2);
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn local_purchase_deletion_requires_the_confirmed_library_and_generation() {
    use crate::inventory_create_commands::create_local_wishlist_item;
    use crate::inventory_wishlist_commands::delete_local_wishlist_item;

    let (state, path) = fake_host_state("http://example.invalid");
    let db = FilamentDatabase::open(&path).unwrap();
    let client = db.get_library_sync_settings().unwrap();
    let mut local = client.clone();
    local.mode = "STANDALONE".into();
    local.host_base_url = None;
    db.save_library_sync_settings(&local).unwrap();
    let target = || {
        serde_json::from_value(
            serde_json::to_value(db.get_library_sync_page_status().unwrap()).unwrap(),
        )
        .unwrap()
    };

    for mode in ["STANDALONE", "HOST"] {
        local.mode = mode.into();
        db.save_library_sync_settings(&local).unwrap();
        let reviewed = target();
        create_local_wishlist_item(&state, suggestion(), Some(&reviewed)).unwrap();
        let order = db.list_wishlist_items(10).unwrap().remove(0).id;

        let mut other = local.clone();
        other.library_id = "other-local-library".into();
        db.save_library_sync_settings(&other).unwrap();
        assert!(delete_local_wishlist_item(&state, &order, &reviewed)
            .unwrap_err()
            .contains("common.invalid_request"));
        db.save_library_sync_settings(&client).unwrap();
        assert!(delete_local_wishlist_item(&state, &order, &target())
            .unwrap_err()
            .contains("common.forbidden"));
        db.save_library_sync_settings(&local).unwrap();
        assert!(delete_local_wishlist_item(&state, &order, &reviewed)
            .unwrap_err()
            .contains("common.invalid_request"));
        assert_eq!(db.list_wishlist_items(10).unwrap()[0].id, order);
        delete_local_wishlist_item(&state, &order, &target()).unwrap();
        assert!(db.list_wishlist_items(10).unwrap().is_empty());
    }
    drop(db);
    std::fs::remove_file(path).unwrap();
}

fn suggestion() -> crate::backend::inventory_engine::CreateWishlistItemInput {
    serde_json::from_value(json!({
        "id":"suggestion", "material":"PLA","filament_name":"Silk","color_name":"Blue"
    }))
    .unwrap()
}

#[test]
fn paired_dashboard_purchase_requires_capability_and_returns_host_order_id() {
    use super::{fake_health, spawn_fake_host_with, FakeHostResponse};
    use crate::companion_models::DASHBOARD_PURCHASE_CAPABILITY;
    use crate::inventory_create_commands::ensure_dashboard_purchase_blocking;
    let response = |path, body: serde_json::Value| FakeHostResponse {
        expected_request_prefix: path,
        status: "200 OK",
        body: body.to_string(),
    };
    let mut health: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
    let legacy = response("GET /api/v1/health ", health.clone());
    health["capabilities"] = json!([DASHBOARD_PURCHASE_CAPABILITY]);
    let order =
        json!({"kind":"REUSED","itemId":"older-order","status":"ON_ORDER","match":"IDENTITY"});
    let (url, server) = spawn_fake_host_with(
        vec![
            legacy,
            response("GET /api/v1/health ", health.clone()),
            response("POST /api/v1/wishlist/dashboard-purchase ", order.clone()),
            response("GET /api/v1/library/wishlist?limit=500 ", json!([])),
            response("GET /api/v1/health ", health),
            response(
                "GET /api/v1/library/wishlist?limit=500&reviewed_item_id=old%2Forder%26x ",
                json!([{
                    "id":"old/order&x", "material":"PLA", "filament_name":"Silk", "color_name":"Blue",
                    "vendor":"Manual", "status":"ON_ORDER", "quantity":7, "created_at":"", "updated_at":""
                }]),
            ),
        ],
        |request| {
            if request.starts_with("POST ") {
                assert!(request.to_ascii_lowercase().contains("\r\ncookie:"));
            }
        },
    );
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let target = || {
        serde_json::from_value(
            serde_json::to_value(db.get_library_sync_page_status().unwrap()).unwrap(),
        )
        .unwrap()
    };
    let run = || ensure_dashboard_purchase_blocking(&state, suggestion(), target());
    assert!(run()
        .unwrap_err()
        .contains("purchase_metadata.host_unsupported"));
    assert_eq!(serde_json::to_value(run().unwrap()).unwrap(), order);
    let status = db.get_library_sync_page_status().unwrap();
    let result = fetch_library_sync_wishlist_items_blocking(
        &state,
        LibrarySyncWishlistListInput {
            reviewed_item_id: Some("old/order&x".into()),
            base_url: url,
            expected_library_id: Some(status.library_id),
            expected_target_generation: Some(status.target_generation),
            limit: Some(500),
        },
    )
    .unwrap();
    assert_eq!(result[0].id, "old/order&x");
    assert_eq!(result[0].quantity, 7);
    assert_eq!(
        db.get_library_sync_settings()
            .unwrap()
            .cached_wishlist
            .unwrap()
            .rows[0]
            .id,
        result[0].id
    );
    server.join().unwrap();
    drop(db);
    std::fs::remove_file(path).unwrap();
}
