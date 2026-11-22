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
    for error in [
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
