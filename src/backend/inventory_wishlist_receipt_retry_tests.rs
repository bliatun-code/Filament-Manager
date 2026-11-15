use super::*;

const ORDER_ID: &str = "test-receipt-order";
const REQUEST_ID: &str = "test-receipt-request-id";

fn initialize(db: FilamentDatabase, quantity: i64) -> InventoryEngine {
    db.apply_schema().unwrap();
    let engine = InventoryEngine::new(db);
    engine
        .create_wishlist_item(CreateWishlistItemInput {
            id: ORDER_ID.to_string(),
            master_id: None,
            material: "PETG".to_string(),
            filament_name: "Receipt test".to_string(),
            color_name: "Grey".to_string(),
            vendor: Some("Synthetic".to_string()),
            quantity: Some(quantity),
            note: None,
        })
        .unwrap();
    engine
        .update_wishlist_item_status(UpdateWishlistStatusInput {
            item_id: ORDER_ID.to_string(),
            status: "ON_ORDER".to_string(),
        })
        .unwrap();
    engine
}

fn request(quantity: i64, request_id: Option<&str>) -> ReceiveWishlistItemInput {
    ReceiveWishlistItemInput {
        item_id: ORDER_ID.to_string(),
        quantity,
        home_location: None,
        purchase_metadata: None,
        request_id: request_id.map(str::to_string),
    }
}

fn order(engine: &InventoryEngine) -> WishlistItemRow {
    engine.list_wishlist_items(1).unwrap().pop().unwrap()
}

fn count(engine: &InventoryEngine, table: &str) -> i64 {
    engine
        .db
        .connection()
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}

struct ReceiptTestDatabase(std::path::PathBuf);

impl ReceiptTestDatabase {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "filament-wishlist-receipt-{:032x}.sqlite",
            rand::random::<u128>()
        )))
    }

    fn open(&self) -> FilamentDatabase {
        FilamentDatabase::open(&self.0).unwrap()
    }
}

impl Drop for ReceiptTestDatabase {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[test]
fn caps_each_receipt_without_rewriting_a_large_existing_order() {
    let engine = initialize(FilamentDatabase::open(":memory:").unwrap(), i64::MAX);

    for quantity in [101, i64::MAX] {
        assert!(matches!(
            engine.receive_wishlist_item(request(quantity, None)),
            Err(InventoryError::InvalidOperation {
                code: "wishlist.receive.quantity_too_large",
                ..
            })
        ));
    }
    assert_eq!(order(&engine).quantity, i64::MAX);
    assert_eq!(count(&engine, "filament_spools"), 0);
    assert_eq!(count(&engine, "spool_history_events"), 0);

    let receipt = engine
        .receive_wishlist_item(request(100, Some(REQUEST_ID)))
        .unwrap();
    assert_eq!(receipt.spool_ids.len(), 100);
    assert_eq!(receipt.remaining_quantity, i64::MAX - 100);
    assert_eq!(order(&engine).quantity, i64::MAX - 100);
    assert_eq!(order(&engine).status, "ON_ORDER");
}

#[test]
fn returns_the_exact_receipt_after_reopen_and_after_order_deletion() {
    let database = ReceiptTestDatabase::new();
    let engine = initialize(database.open(), 2);
    let input = request(1, Some(REQUEST_ID));
    let original = engine.receive_wishlist_item(input.clone()).unwrap();
    drop(engine);

    let engine = InventoryEngine::new(database.open());
    assert_eq!(
        engine.receive_wishlist_item(input.clone()).unwrap(),
        original
    );
    assert_eq!(order(&engine).quantity, 1);
    assert_eq!(count(&engine, "filament_spools"), 1);
    assert_eq!(count(&engine, "wishlist_receipt_requests"), 1);
    assert_eq!(
        engine
            .list_spool_history(&original.spool_ids[0], 10)
            .unwrap()
            .iter()
            .filter(|event| event.event_type == "PURCHASE_RECEIPT_RECORDED")
            .count(),
        1
    );

    assert!(matches!(
        engine.receive_wishlist_item(request(2, Some(REQUEST_ID))),
        Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.request_conflict",
            ..
        })
    ));
    let next = engine
        .receive_wishlist_item(request(1, Some("next-receipt")))
        .unwrap();
    assert_ne!(next.spool_ids, original.spool_ids);
    assert_eq!(next.remaining_quantity, 0);
    engine.delete_wishlist_item(ORDER_ID).unwrap();
    assert_eq!(engine.receive_wishlist_item(input).unwrap(), original);
    assert_eq!(count(&engine, "filament_spools"), 2);
}

#[test]
fn two_connections_replaying_a_request_apply_one_partial_receipt() {
    let database = ReceiptTestDatabase::new();
    drop(initialize(database.open(), 2));
    let start = std::sync::Barrier::new(2);
    let receipt = || {
        start.wait();
        let engine = InventoryEngine::new(database.open());
        engine
            .receive_wishlist_item(request(1, Some(REQUEST_ID)))
            .unwrap()
    };
    std::thread::scope(|scope| {
        let concurrent = scope.spawn(receipt);
        assert_eq!(receipt(), concurrent.join().unwrap());
    });

    let engine = InventoryEngine::new(database.open());
    assert_eq!(order(&engine).quantity, 1);
    assert_eq!(count(&engine, "filament_spools"), 1);
    assert_eq!(count(&engine, "wishlist_receipt_requests"), 1);
}

#[test]
fn failed_journal_insert_rolls_back_the_order_spools_and_history() {
    let engine = initialize(FilamentDatabase::open(":memory:").unwrap(), 2);
    engine
        .db
        .connection()
        .execute_batch(
            "CREATE TRIGGER fail_wishlist_receipt BEFORE INSERT ON wishlist_receipt_requests
              BEGIN SELECT RAISE(ABORT, 'test receipt insert failure'); END;",
        )
        .unwrap();
    let input = request(1, Some(REQUEST_ID));
    assert!(engine.receive_wishlist_item(input.clone()).is_err());
    assert_eq!(order(&engine).quantity, 2);
    assert_eq!(count(&engine, "filament_spools"), 0);
    assert_eq!(count(&engine, "spool_history_events"), 0);
    assert_eq!(count(&engine, "wishlist_receipt_requests"), 0);
    engine
        .db
        .connection()
        .execute_batch("DROP TRIGGER fail_wishlist_receipt")
        .unwrap();
    assert_eq!(
        engine
            .receive_wishlist_item(input)
            .unwrap()
            .remaining_quantity,
        1
    );
}

#[test]
fn portable_restore_keeps_the_local_receipt_without_exporting_the_journal() {
    let engine = initialize(FilamentDatabase::open(":memory:").unwrap(), 2);
    let input = request(1, Some(REQUEST_ID));
    let receipt = engine.receive_wishlist_item(input.clone()).unwrap();
    let backup = engine.db.export_full_backup_json().unwrap();
    let portable: serde_json::Value = serde_json::from_str(&backup).unwrap();
    assert!(portable["tables"]
        .get("wishlist_receipt_requests")
        .is_none());

    engine.db.import_full_backup_json(&backup).unwrap();
    assert_eq!(engine.receive_wishlist_item(input).unwrap(), receipt);
    assert_eq!(order(&engine).quantity, 1);
    assert_eq!(count(&engine, "filament_spools"), 1);
    assert_eq!(count(&engine, "wishlist_receipt_requests"), 1);

    engine.reset_app_state().unwrap();
    assert_eq!(count(&engine, "wishlist_receipt_requests"), 0);
}
