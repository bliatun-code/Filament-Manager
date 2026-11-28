use super::*;
use rusqlite::types::Value;
use serde_json::json;
use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Barrier};

struct TestLibrary(PathBuf);

impl TestLibrary {
    fn new() -> Self {
        let directory = std::env::temp_dir().join(format!(
            "catalog-spool-batches-{}-{:032x}",
            std::process::id(),
            rand::random::<u128>()
        ));
        std::fs::create_dir(&directory).unwrap();
        let library = Self(directory);
        let db = library.open();
        db.apply_schema().unwrap();
        db.get_library_sync_library_id().unwrap();
        db.connection().execute_batch(
            "INSERT INTO filament_master_list (id, material, filament_name, color_name, default_weight, vendor)
             VALUES ('batch-master-a', 'PLA', 'Batch A', 'Black', 1000, 'Bambu Lab'),
                    ('batch-master-b', 'PETG', 'Batch B', 'Blue', 1000, 'Bambu Lab');",
        ).unwrap();
        library
    }

    fn open(&self) -> FilamentDatabase {
        FilamentDatabase::open(self.0.join("library.db")).unwrap()
    }
}

impl Drop for TestLibrary {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn input(id: &str, ownership: &str) -> CatalogSpoolBatchInput {
    CatalogSpoolBatchInput {
        ams_assignment: None,
        batch_id: id.to_string(),
        master_ids: vec!["batch-master-b".to_string(), "batch-master-a".to_string()],
        initial_weight_g: 850,
        ownership_type: ownership.to_string(),
        owner_name: (ownership == "BORROWED_IN").then(|| "QA owner".to_string()),
        owner_contact: (ownership == "BORROWED_IN").then(|| "owner@example.invalid".to_string()),
        ownership_note: (ownership == "BORROWED_IN").then(|| "Prototype rolls".to_string()),
        location: Some("Batch dry box".to_string()),
    }
}

fn state(db: &FilamentDatabase) -> BTreeMap<String, Vec<Vec<Value>>> {
    let conn = db.connection();
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    tables
        .into_iter()
        .map(|table| {
            assert!(table
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_'));
            let mut statement = conn.prepare(&format!("SELECT * FROM {table}")).unwrap();
            let columns = statement.column_count();
            let mut rows: Vec<Vec<Value>> = statement
                .query_map([], |row| {
                    (0..columns).map(|column| row.get(column)).collect()
                })
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap();
            rows.sort_by_cached_key(|row| format!("{row:?}"));
            (table, rows)
        })
        .collect()
}

fn count(db: &FilamentDatabase, table: &str) -> i64 {
    db.connection()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}

fn assert_code(error: InventoryError, expected: &str) {
    match error {
        InventoryError::InvalidOperation { code, .. } => assert_eq!(code, expected),
        other => panic!("Expected {expected}, received {other:?}"),
    }
}

#[test]
fn owned_batch_preserves_order_duplicates_and_normalized_replay_without_writes() {
    let library = TestLibrary::new();
    let db = library.open();
    let mut request = input("owned-batch", "OWNED");
    request.master_ids.push("batch-master-b".to_string());
    let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
    assert_eq!(receipt.batch_id, "owned-batch");
    assert_eq!(receipt.spool_ids.len(), 3);
    assert_eq!(receipt.spool_ids.iter().collect::<HashSet<_>>().len(), 3);
    for (spool_id, master_id) in receipt.spool_ids.iter().zip(&request.master_ids) {
        assert!(spool_id.starts_with("spool_"));
        let row = db.get_spool_with_master_by_id(spool_id).unwrap().unwrap();
        assert_eq!(&row.spool.master_id, master_id);
        assert_eq!(row.spool.ownership_type, "OWNED");
        assert_eq!(row.spool.initial_weight_g, Some(850));
        assert_eq!(row.spool.current_weight_g, Some(850));
        assert_eq!(row.spool.remaining_g, Some(850));
        assert!(row.spool.location_id.is_some());
        assert_eq!(row.location_name.as_deref(), Some("Batch dry box"));
        assert_eq!(row.home_location_name, row.location_name);
        assert_eq!(row.spool.home_location_id, row.spool.location_id);
        let events = db.list_spool_history_events(spool_id, 10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "CREATED");
        assert_eq!(
            events[0].payload_json,
            json!({"status":"IN_STOCK", "ownership_type":"OWNED"})
        );
    }
    assert_eq!(count(&db, "spool_loans"), 0);
    assert_eq!(count(&db, "catalog_spool_batches"), 1);
    let after = state(&db);
    request.batch_id = " owned-batch ".to_string();
    request.ownership_type = " owned ".to_string();
    request.master_ids[0] = " batch-master-b ".to_string();
    request.location = Some(" Batch dry box ".to_string());
    assert_eq!(db.create_catalog_spool_batch(request).unwrap(), receipt);
    assert_eq!(
        db.get_catalog_spool_batch_receipt("owned-batch").unwrap(),
        Some(receipt)
    );
    assert_eq!(state(&db), after);
}

#[test]
fn borrowed_batch_commits_each_loan_and_history_once_and_replays_after_reopen() {
    let library = TestLibrary::new();
    let request = input("borrowed-batch", "BORROWED_IN");
    let receipt;
    let after;
    {
        let db = library.open();
        receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
        for spool_id in &receipt.spool_ids {
            let row = db.get_spool_with_master_by_id(spool_id).unwrap().unwrap();
            assert_eq!(row.spool.ownership_type, "BORROWED_IN");
            assert_eq!(row.spool.owner_name, request.owner_name);
            assert_eq!(row.spool.owner_contact, request.owner_contact);
            assert_eq!(row.spool.ownership_note, request.ownership_note);
            assert!(row.spool.location_id.is_some());
            assert_eq!(row.spool.home_location_id, row.spool.location_id);
            assert_eq!(row.location_name, request.location);
            assert_eq!(row.home_location_name, request.location);
            let loan: (String, String, String, String, String, i64) = db.connection().query_row(
                "SELECT id, loan_direction, loan_status, counterparty_name, counterparty_contact, grams_out
                 FROM spool_loans WHERE spool_id = ?1",
                [spool_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            ).unwrap();
            assert_eq!(
                (&loan.1, &loan.2, &loan.3, &loan.4, loan.5),
                (
                    &"INBOUND".to_string(),
                    &"ACTIVE".to_string(),
                    &"QA owner".to_string(),
                    &"owner@example.invalid".to_string(),
                    850
                )
            );
            let events = db.list_spool_history_events(spool_id, 10).unwrap();
            assert_eq!(events.len(), 2);
            let event = events
                .iter()
                .find(|event| event.event_type == "BORROWED_IN_REGISTERED")
                .unwrap();
            assert_eq!(
                event.payload_json,
                json!({
                    "loan_id": loan.0, "ownership_type":"BORROWED_IN", "owner_name":"QA owner",
                    "owner_contact":"owner@example.invalid", "ownership_note":"Prototype rolls",
                    "loan_direction":"INBOUND", "counterparty_name":"QA owner", "grams_out":850
                })
            );
        }
        assert_eq!(count(&db, "spool_loans"), 2);
        assert_eq!(count(&db, "spool_history_events"), 4);
        after = state(&db);
    }
    let db = library.open();
    assert_eq!(db.create_catalog_spool_batch(request).unwrap(), receipt);
    assert_eq!(state(&db), after);
}

#[test]
fn concurrent_replays_commit_exactly_one_batch() {
    let library = Arc::new(TestLibrary::new());
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let library = Arc::clone(&library);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let db = library.open();
                barrier.wait();
                db.create_catalog_spool_batch(input("concurrent", "BORROWED_IN"))
                    .unwrap()
            })
        })
        .collect();
    let receipts: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert!(receipts.iter().all(|receipt| receipt == &receipts[0]));
    let db = library.open();
    assert_eq!(count(&db, "filament_spools"), 2);
    assert_eq!(count(&db, "spool_loans"), 2);
    assert_eq!(count(&db, "spool_history_events"), 4);
    assert_eq!(count(&db, "catalog_spool_batches"), 1);
}

#[test]
fn changed_payload_conflicts_including_payloads_that_are_now_invalid() {
    let library = TestLibrary::new();
    let db = library.open();
    let request = input("immutable-request", "BORROWED_IN");
    db.create_catalog_spool_batch(request.clone()).unwrap();
    let after = state(&db);
    let mut alternatives = Vec::new();
    let mut changed = request.clone();
    changed.master_ids.reverse();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.master_ids.clear();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.initial_weight_g = -1;
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.owner_name = None;
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.owner_contact = None;
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.ownership_note = None;
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.location = None;
    alternatives.push(changed);
    let mut changed = request;
    changed.ownership_type = "OWNED".to_string();
    alternatives.push(changed);
    for changed in alternatives {
        assert_code(
            db.create_catalog_spool_batch(changed).unwrap_err(),
            "inventory.batch.conflict",
        );
        assert_eq!(state(&db), after);
    }
}

#[test]
fn committed_receipt_survives_catalog_reset_and_physical_spool_removal() {
    let library = TestLibrary::new();
    let db = library.open();
    let request = input("durable-receipt", "OWNED");
    let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
    db.reset_catalog_data().unwrap();
    assert_eq!(
        db.create_catalog_spool_batch(request.clone()).unwrap(),
        receipt
    );
    db.connection()
        .execute_batch(
            "DELETE FROM spool_history_events;
         DELETE FROM filament_spools;
         DELETE FROM filament_master_list WHERE id IN ('batch-master-a', 'batch-master-b');
         DELETE FROM inventory_locations WHERE name = 'Batch dry box';",
        )
        .unwrap();
    let after_removal = state(&db);
    assert_eq!(db.create_catalog_spool_batch(request).unwrap(), receipt);
    assert_eq!(state(&db), after_removal);
}

#[test]
fn receipt_is_bound_to_library_identity_but_survives_role_and_generation_changes() {
    let library = TestLibrary::new();
    let db = library.open();
    let request = input("library-receipt", "OWNED");
    let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
    db.connection().execute_batch(
        "INSERT INTO settings (key, value) VALUES ('library_sync_mode', 'HOST') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
         INSERT INTO settings (key, value) VALUES ('library_sync_target_generation', '42') ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    ).unwrap();
    assert_eq!(
        db.create_catalog_spool_batch(request.clone()).unwrap(),
        receipt
    );
    db.connection()
        .execute(
            "UPDATE settings SET value = 'another-library' WHERE key = 'library_sync_library_id'",
            [],
        )
        .unwrap();
    let after = state(&db);
    assert_code(
        db.create_catalog_spool_batch(request).unwrap_err(),
        "inventory.batch.conflict",
    );
    assert_code(
        db.get_catalog_spool_batch_receipt("library-receipt")
            .unwrap_err(),
        "inventory.batch.conflict",
    );
    assert_eq!(state(&db), after);
}

#[test]
fn late_history_or_receipt_failure_rolls_back_spools_loans_locations_and_revisions() {
    for trigger in [
        "CREATE TRIGGER fail_batch_second_history BEFORE INSERT ON spool_history_events
         WHEN NEW.event_type = 'CREATED' AND (SELECT COUNT(*) FROM filament_spools) = 2
         BEGIN SELECT RAISE(ABORT, 'synthetic late history failure'); END;",
        "CREATE TRIGGER fail_batch_receipt BEFORE INSERT ON catalog_spool_batches
         BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END;",
    ] {
        let library = TestLibrary::new();
        let db = library.open();
        db.connection().execute_batch(trigger).unwrap();
        let before = state(&db);
        let error = db
            .create_catalog_spool_batch(input("late-failure", "BORROWED_IN"))
            .unwrap_err();
        assert!(matches!(error, InventoryError::Db(_)));
        assert_eq!(state(&db), before);
        assert_eq!(
            db.get_catalog_spool_batch_receipt("late-failure").unwrap(),
            None
        );
        db.connection().execute_batch("DROP TRIGGER IF EXISTS fail_batch_second_history; DROP TRIGGER IF EXISTS fail_batch_receipt;").unwrap();
        db.create_catalog_spool_batch(input("late-failure", "BORROWED_IN"))
            .unwrap();
        assert_eq!(count(&db, "filament_spools"), 2);
        assert_eq!(count(&db, "spool_loans"), 2);
    }
}

#[test]
fn validation_failures_leave_every_table_unchanged_and_allow_corrected_retry() {
    let library = TestLibrary::new();
    let db = library.open();
    let before = state(&db);
    let request = input("validation", "OWNED");
    let mut alternatives = Vec::new();
    let mut changed = request.clone();
    changed.master_ids.clear();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.master_ids = vec!["batch-master-a".to_string(); 101];
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.initial_weight_g = -1;
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.ownership_type = "unknown".to_string();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.ownership_type = "BORROWED_IN".to_string();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.master_ids[1] = "missing-master".to_string();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.master_ids[0] = " ".to_string();
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.location = Some("x".repeat(500));
    alternatives.push(changed);
    let mut changed = request.clone();
    changed.batch_id = "bad/id".to_string();
    alternatives.push(changed);
    for changed in alternatives {
        assert_code(
            db.create_catalog_spool_batch(changed).unwrap_err(),
            "inventory.batch.invalid",
        );
        assert_eq!(state(&db), before);
    }
    db.create_catalog_spool_batch(request).unwrap();
    assert_eq!(count(&db, "filament_spools"), 2);
}

#[test]
fn acknowledged_new_batch_ids_create_distinct_rolls_and_maximum_batch_is_supported() {
    let library = TestLibrary::new();
    let db = library.open();
    let mut request = input("first", "OWNED");
    request.master_ids = vec!["batch-master-a".to_string(); 100];
    request.initial_weight_g = 0;
    let first = db.create_catalog_spool_batch(request.clone()).unwrap();
    request.batch_id = "second".to_string();
    let second = db.create_catalog_spool_batch(request).unwrap();
    assert_eq!(first.spool_ids.len(), 100);
    assert_eq!(
        first
            .spool_ids
            .iter()
            .chain(&second.spool_ids)
            .collect::<HashSet<_>>()
            .len(),
        200
    );
    assert_eq!(count(&db, "filament_spools"), 200);
}

#[test]
fn json_restore_keeps_batch_journal_and_replay_never_duplicates_restored_rolls() {
    for ownership in ["OWNED", "BORROWED_IN"] {
        let library = TestLibrary::new();
        let db = library.open();
        let request = input("saved-before-restore", ownership);
        let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
        let backup = db.export_full_backup_json().unwrap();
        let content: serde_json::Value = serde_json::from_str(&backup).unwrap();
        assert!(content["tables"].get("catalog_spool_batches").is_none());

        db.import_full_backup_json(&backup).unwrap();
        let restored = state(&db);
        let replay = db.create_catalog_spool_batch(request).unwrap();
        assert_eq!(
            count(&db, "filament_spools"),
            2,
            "retrying after restore must not create a second copy of the restored batch"
        );
        assert_eq!(replay, receipt);
        assert_eq!(
            state(&db),
            restored,
            "receipt lookup must leave every restored table and revision unchanged"
        );
        assert_eq!(count(&db, "catalog_spool_batches"), 1);
    }
}

#[test]
fn json_restore_before_batch_preserves_receipt_without_recreating_removed_rolls() {
    for ownership in ["OWNED", "BORROWED_IN"] {
        let library = TestLibrary::new();
        let db = library.open();
        let backup_before_batch = db.export_full_backup_json().unwrap();
        let request = input("removed-by-restore", ownership);
        let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();

        db.import_full_backup_json(&backup_before_batch).unwrap();
        assert_eq!(count(&db, "filament_spools"), 0);
        assert_eq!(count(&db, "spool_loans"), 0);
        assert_eq!(count(&db, "catalog_spool_batches"), 1);
        let restored = state(&db);
        assert_eq!(db.create_catalog_spool_batch(request).unwrap(), receipt);
        assert_eq!(
            state(&db),
            restored,
            "an old receipt may name rolls removed by restore but cannot recreate them"
        );
    }
}

#[test]
fn json_restore_across_libraries_preserves_each_request_and_conflicts_on_wrong_library() {
    let library_a = TestLibrary::new();
    let library_b = TestLibrary::new();
    let db = library_a.open();
    let original_library_id = db.get_library_sync_library_id().unwrap();
    let request_a = input("library-a-batch", "OWNED");
    let receipt_a = db.create_catalog_spool_batch(request_a.clone()).unwrap();
    let backup_a = db.export_full_backup_json().unwrap();
    let other_db = library_b.open();
    let other_library_id = other_db.get_library_sync_library_id().unwrap();
    assert_ne!(original_library_id, other_library_id);
    let backup_b = other_db.export_full_backup_json().unwrap();

    db.import_full_backup_json(&backup_b).unwrap();
    assert_eq!(db.get_library_sync_library_id().unwrap(), other_library_id);
    let restored_b = state(&db);
    assert_code(
        db.create_catalog_spool_batch(request_a.clone())
            .unwrap_err(),
        "inventory.batch.conflict",
    );
    assert_code(
        db.get_catalog_spool_batch_receipt(&request_a.batch_id)
            .unwrap_err(),
        "inventory.batch.conflict",
    );
    assert_eq!(state(&db), restored_b);
    let request_b = input("library-b-batch", "BORROWED_IN");
    let receipt_b = db.create_catalog_spool_batch(request_b.clone()).unwrap();
    assert_eq!(count(&db, "catalog_spool_batches"), 2);

    db.import_full_backup_json(&backup_a).unwrap();
    assert_eq!(
        db.get_library_sync_library_id().unwrap(),
        original_library_id
    );
    let restored_a = state(&db);
    assert_eq!(db.create_catalog_spool_batch(request_a).unwrap(), receipt_a);
    assert_code(
        db.create_catalog_spool_batch(request_b.clone())
            .unwrap_err(),
        "inventory.batch.conflict",
    );
    assert_eq!(state(&db), restored_a);
    assert_eq!(count(&db, "catalog_spool_batches"), 2);

    db.import_full_backup_json(&backup_b).unwrap();
    let restored_b_again = state(&db);
    assert_eq!(db.create_catalog_spool_batch(request_b).unwrap(), receipt_b);
    assert_eq!(state(&db), restored_b_again);
}

#[test]
fn full_app_reset_clears_batch_receipts_and_creates_a_new_library_identity() {
    let library = TestLibrary::new();
    let db = library.open();
    let previous_library_id = db.get_library_sync_library_id().unwrap();
    db.create_catalog_spool_batch(input("before-reset", "OWNED"))
        .unwrap();
    db.reset_app_state_data().unwrap();
    assert_eq!(count(&db, "catalog_spool_batches"), 0);
    assert_eq!(count(&db, "filament_spools"), 0);
    assert_ne!(
        db.get_library_sync_library_id().unwrap(),
        previous_library_id
    );
    assert_eq!(
        db.get_catalog_spool_batch_receipt("before-reset").unwrap(),
        None
    );
}

#[test]
fn ams_registration_replays_and_rejects_changed_identity_occupied_slot_and_late_failure() {
    let library = TestLibrary::new();
    let db = library.open();
    db.upsert_printer_with_ams("p", "P1S", "Printer", 1, 4)
        .unwrap();
    let config = serde_json::from_value(json!({"enabled":true,"observed_state":{
        "online":true,"mqtt_connected":true,"trays":[{"tray_index":0,"loaded":true,"tray_uuid":"TAG"}]}})).unwrap();
    db.save_bambu_live_integration("p", &config).unwrap();
    let mut request = input("ams-replay", "BORROWED_IN");
    request.master_ids.truncate(1);
    request.ams_assignment = Some(CatalogAmsAssignment {
        printer_id: "p".into(),
        slot_id: "p_ams_1_slot_1".into(),
        rfid_tag: "TAG".into(),
        observed_at: "2026-01-01T00:00:00Z".into(),
    });
    let mut wrong = request.clone();
    wrong.ams_assignment.as_mut().unwrap().rfid_tag = "another-tag".into();
    let before = state(&db);
    assert!(db.create_catalog_spool_batch(wrong).is_err());
    assert_eq!(before, state(&db));
    db.connection().execute_batch("CREATE TRIGGER refuse_receipt BEFORE INSERT ON catalog_spool_batches BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
    assert!(db.create_catalog_spool_batch(request.clone()).is_err());
    assert_eq!(before, state(&db));
    db.connection()
        .execute_batch("DROP TRIGGER refuse_receipt")
        .unwrap();
    let receipt = db.create_catalog_spool_batch(request.clone()).unwrap();
    let assigned: (String,String) = db.connection().query_row(
        "SELECT s.spool_id, f.rfid_tag FROM ams_slots s JOIN filament_spools f ON s.spool_id=f.id WHERE s.id='p_ams_1_slot_1'",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
    assert_eq!(assigned, (receipt.spool_ids[0].clone(), "TAG".to_string()));
    let committed = state(&db);
    assert_eq!(
        library
            .open()
            .create_catalog_spool_batch(request.clone())
            .unwrap(),
        receipt
    );
    request.batch_id = "competing-request".into();
    assert!(db.create_catalog_spool_batch(request).is_err());
    assert_eq!(state(&db), committed);
}

#[test]
fn existing_rfid_checks_slot_and_both_tags_before_writing_and_replays_without_history() {
    let library = TestLibrary::new();
    let db = library.open();
    let rolls = db
        .create_catalog_spool_batch(input("seed-rfid", "OWNED"))
        .unwrap()
        .spool_ids;
    db.upsert_printer_with_ams("p", "P1S", "Printer", 1, 4)
        .unwrap();
    let slot = "p_ams_1_slot_1";
    let live = |tag: &str| {
        let config = serde_json::from_value(json!({"enabled":true,"observed_state":{"online":true,
            "mqtt_connected":true,"trays":[{"tray_index":0,"loaded":true,"tray_uuid":tag}]}}))
        .unwrap();
        db.save_bambu_live_integration("p", &config).unwrap();
    };
    let mut request = ExistingSpoolRfidInput {
        request_id: "reviewed-candidate".into(),
        spool_id: rolls[0].clone(),
        expected_rfid: None,
        assign_empty_slot: true,
        observation: CatalogAmsAssignment {
            printer_id: "p".into(),
            slot_id: slot.into(),
            rfid_tag: "TAG".into(),
            observed_at: "2026-01-01T00:00:00Z".into(),
        },
    };
    let reject = |review: &ExistingSpoolRfidInput| {
        let before = state(&db);
        assert_code(
            db.register_existing_spool_rfid(review.clone()).unwrap_err(),
            "printers.slot_operation_stale",
        );
        assert_eq!(state(&db), before);
    };
    live("DIFFERENT");
    reject(&request);
    live("TAG");
    db.connection()
        .execute(
            "UPDATE ams_slots SET spool_id=?1 WHERE id=?2",
            params![rolls[1], slot],
        )
        .unwrap();
    reject(&request);
    db.connection()
        .execute("UPDATE ams_slots SET spool_id=NULL WHERE id=?1", [slot])
        .unwrap();
    db.connection()
        .execute(
            "UPDATE filament_spools SET rfid_tag='TAG' WHERE id=?1",
            [&rolls[1]],
        )
        .unwrap();
    reject(&request);
    db.connection()
        .execute(
            "UPDATE filament_spools SET rfid_tag=NULL WHERE id=?1",
            [&rolls[1]],
        )
        .unwrap();
    db.connection().execute_batch("CREATE TRIGGER abort_rfid BEFORE INSERT ON catalog_spool_batches BEGIN SELECT RAISE(ABORT,'lost receipt'); END;").unwrap();
    let before = state(&db);
    assert!(db.register_existing_spool_rfid(request.clone()).is_err());
    assert_eq!(state(&db), before);
    db.connection()
        .execute_batch("DROP TRIGGER abort_rfid")
        .unwrap();
    let verify_commit = |review: &ExistingSpoolRfidInput| {
        let receipt = db.register_existing_spool_rfid(review.clone()).unwrap();
        let committed = state(&db);
        assert_eq!(receipt.spool_ids, vec![rolls[0].clone()]);
        assert_eq!(
            library
                .open()
                .register_existing_spool_rfid(review.clone())
                .unwrap(),
            receipt
        );
        assert_eq!(state(&db), committed);
        let assigned:(String,String) = db.connection().query_row(
            "SELECT s.spool_id, f.rfid_tag FROM ams_slots s JOIN filament_spools f ON f.id=s.spool_id WHERE s.id=?1",
            [slot],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        assert_eq!(
            assigned,
            (rolls[0].clone(), review.observation.rfid_tag.clone())
        );
    };
    verify_commit(&request);
    live("NEW");
    request.request_id = "manual-review".into();
    request.assign_empty_slot = false;
    request.observation.rfid_tag = "NEW".into();
    reject(&request);
    request.expected_rfid = Some("TAG".into());
    let events = count(&db, "spool_history_events");
    verify_commit(&request);
    assert_eq!(count(&db, "spool_history_events"), events + 1);
}
