use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::{
    backend::{database_stock_cards::StockCardQuery, filament_database::FilamentDatabase},
    companion_models::{STOCK_CARDS_CAPABILITY, STOCK_CARD_SEARCH_CAPABILITY},
    spool_picker_commands::stock_card_page_blocking,
};
use serde_json::json;

#[test]
fn stock_card_pages_distinguish_old_hosts_and_offline_and_reject_late_a_b_a_reads() {
    const POST: &str = "POST /api/v1/library/stock-cards ";
    let health = |modern| {
        let mut body: serde_json::Value = serde_json::from_str(&fake_health()).unwrap();
        body["capabilities"] = json!([STOCK_CARDS_CAPABILITY]);
        if modern {
            body["capabilities"] = json!([STOCK_CARDS_CAPABILITY, STOCK_CARD_SEARCH_CAPABILITY]);
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
        body: json!({"cards":[],"total":4,"visible":4,"borrowed":0,"groups":1,"revisions":[12,9]})
            .to_string(),
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
    let query = || StockCardQuery {
        member_of: None,
        locale: None,
        offset: 100,
        search: "hidden roll".into(),
    };
    let target = |generation| {
        serde_json::from_value(json!({
            "base_url":url,"expected_library_id":"library-test","target_generation":generation
        }))
        .unwrap()
    };
    let read = |generation| stock_card_page_blocking(&state, query(), target(generation));
    assert!(read(initial).unwrap().is_none()); // new Client needs its first complete offline copy
    let captured = db.save_library_sync_cached_spools(&[]).unwrap();
    assert!(read(initial).unwrap().is_none()); // older Host
    let page = read(initial).unwrap().unwrap();
    assert_eq!((page.total, page.revisions), (4, [12, 9]));
    assert_eq!(
        db.get_library_sync_settings()
            .unwrap()
            .cached_spools
            .unwrap()
            .captured_at,
        captured
    );
    tx.send(path.clone()).unwrap();
    assert!(read(initial)
        .unwrap_err()
        .contains("common.invalid_request"));
    server.join().unwrap();
    let current = db.get_library_sync_page_status().unwrap().target_generation;
    assert_ne!(current, initial);
    assert!(read(initial).is_err());
    db.save_library_sync_cached_spools(&[]).unwrap();
    assert!(read(current).is_err()); // disconnected
    drop(db);
    std::fs::remove_file(path).unwrap();
}
