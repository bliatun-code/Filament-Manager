use super::*;
use rusqlite::types::Value;

fn receipt_engine(quantity: i64) -> InventoryEngine {
    let db = FilamentDatabase::open(":memory:").unwrap();
    db.apply_schema().unwrap();
    let engine = InventoryEngine::new(db);
    engine
        .create_wishlist_item(CreateWishlistItemInput {
            id: "receipt-location-order".into(),
            master_id: None,
            material: "PLA".into(),
            filament_name: "Synthetic receipt location".into(),
            color_name: "Blue".into(),
            vendor: Some("Synthetic".into()),
            quantity: Some(quantity),
            note: None,
        })
        .unwrap();
    engine
        .update_wishlist_item_status(UpdateWishlistStatusInput {
            item_id: "receipt-location-order".into(),
            status: "ON_ORDER".into(),
        })
        .unwrap();
    engine
}

fn request(quantity: i64, location: Option<&str>) -> ReceiveWishlistItemInput {
    ReceiveWishlistItemInput {
        item_id: "receipt-location-order".into(),
        quantity,
        home_location: location.map(str::to_string),
        purchase_metadata: None,
    }
}

fn receipt_state(engine: &InventoryEngine) -> Vec<Vec<Vec<Value>>> {
    [
        "inventory_locations",
        "filament_master_list",
        "filament_spools",
        "spool_history_events",
        "wishlist_items",
        "library_domain_revisions",
    ]
    .iter()
    .map(|table| {
        let mut statement = engine
            .db
            .connection()
            .prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))
            .unwrap();
        let columns = statement.column_count();
        statement
            .query_map([], |row| (0..columns).map(|i| row.get(i)).collect())
            .unwrap()
            .collect::<Result<Vec<Vec<Value>>, _>>()
            .unwrap()
    })
    .collect()
}

fn assert_received_locations(engine: &InventoryEngine, ids: &[String], expected: &str) {
    for id in ids {
        let spool = engine.db.get_spool_by_id(id).unwrap().unwrap();
        assert_eq!(spool.home_location_id.as_deref(), Some(expected));
        assert_eq!(spool.location_id.as_deref(), Some(expected));
        let history = engine.list_spool_history(id, 10).unwrap();
        let receipt = history
            .iter()
            .find(|event| event.event_type == "PURCHASE_RECEIPT_RECORDED")
            .unwrap();
        assert_eq!(receipt.payload_json["home_location_id"], expected);
        assert_eq!(receipt.payload_json["location_id"], expected);
    }
}

#[test]
fn partial_and_full_receipt_reuse_existing_location_by_id_and_name() {
    let engine = receipt_engine(3);
    let location = engine
        .db
        .create_inventory_location("Receipt shelf", None)
        .unwrap();
    let partial = engine
        .receive_wishlist_item(request(2, Some(&location.id)))
        .unwrap();
    assert_eq!(
        (partial.remaining_quantity, partial.status.as_str()),
        (1, "ON_ORDER")
    );
    assert_received_locations(&engine, &partial.spool_ids, &location.id);
    let full = engine
        .receive_wishlist_item(request(1, Some("  receipt   SHELF  ")))
        .unwrap();
    assert_eq!(
        (full.remaining_quantity, full.status.as_str()),
        (0, "RECEIVED")
    );
    assert_received_locations(&engine, &full.spool_ids, &location.id);
    assert_eq!(engine.db.list_inventory_locations(true).unwrap().len(), 1);
}

#[test]
fn receipt_creates_one_named_location_for_every_new_roll() {
    let engine = receipt_engine(2);
    let result = engine
        .receive_wishlist_item(request(2, Some("  Dry   box  ")))
        .unwrap();
    let locations = engine.db.list_inventory_locations(true).unwrap();
    assert_eq!(locations.len(), 1);
    assert_eq!(locations[0].name, "Dry box");
    assert_eq!(locations[0].location_type, "GENERIC");
    assert_received_locations(&engine, &result.spool_ids, &locations[0].id);
}

#[test]
fn omitted_and_blank_receipt_locations_preserve_unassigned_receipts() {
    for location in [None, Some(""), Some(" \t\n ")] {
        let engine = receipt_engine(1);
        let result = engine.receive_wishlist_item(request(1, location)).unwrap();
        let spool = engine
            .db
            .get_spool_by_id(&result.spool_ids[0])
            .unwrap()
            .unwrap();
        assert_eq!(spool.location_id, None);
        assert_eq!(spool.home_location_id, None);
        assert!(engine.db.list_inventory_locations(true).unwrap().is_empty());
    }
    let old_request: ReceiveWishlistItemInput = serde_json::from_value(json!({
        "item_id": "old-client", "quantity": 1,
    }))
    .unwrap();
    assert_eq!(old_request.home_location, None);
}

#[test]
fn archived_system_and_invalid_receipt_locations_leave_every_record_unchanged() {
    let engine = receipt_engine(1);
    let archived = engine
        .db
        .create_inventory_location("Archived shelf", None)
        .unwrap();
    engine.db.archive_inventory_location(&archived.id).unwrap();
    engine.db.connection().execute(
        "INSERT INTO inventory_locations (id, name, type) VALUES ('printer-slot', 'Printer slot', 'PRINTER_SLOT')", [],
    ).unwrap();
    for (location, expected_code) in [
        (archived.id, "inventory.location.archived"),
        (
            "printer-slot".to_string(),
            "inventory.location.system_owned",
        ),
        ("x".repeat(121), "inventory.location.name_too_long"),
    ] {
        let before = receipt_state(&engine);
        let error = engine
            .receive_wishlist_item(request(1, Some(&location)))
            .unwrap_err();
        assert!(
            matches!(error, InventoryError::InvalidOperation { code, .. } if code == expected_code)
        );
        assert_eq!(receipt_state(&engine), before);
    }
}

#[test]
fn late_receipt_failure_rolls_back_location_master_rolls_history_and_order() {
    let engine = receipt_engine(2);
    engine
        .db
        .connection()
        .execute_batch(
            "CREATE TRIGGER reject_receipt_queue_update BEFORE UPDATE ON wishlist_items
         WHEN NEW.id = 'receipt-location-order' AND NEW.quantity = 0
         BEGIN SELECT RAISE(ABORT, 'synthetic late receipt failure'); END;",
        )
        .unwrap();
    let before = receipt_state(&engine);
    assert!(engine
        .receive_wishlist_item(request(2, Some("New dry box")))
        .is_err());
    assert_eq!(receipt_state(&engine), before);
}
