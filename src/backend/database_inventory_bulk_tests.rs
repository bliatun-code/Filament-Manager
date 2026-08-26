use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::params;

use super::*;
use crate::backend::database_core::FilamentDatabase;
use crate::backend::database_inventory_bulk_models::{
    InventoryBulkMutationInput, InventoryBulkSpoolPrecondition,
};

fn with_test_database(test_name: &str, test: impl FnOnce(&FilamentDatabase)) {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "filament-manager-inventory-bulk-{test_name}-{nanos}.db"
    ));
    let database = FilamentDatabase::open(&path).expect("open test database");
    database.apply_schema().expect("apply test schema");
    seed_catalog_and_locations(&database);

    let outcome = catch_unwind(AssertUnwindSafe(|| test(&database)));
    drop(database);
    remove_database_files(&path);
    if let Err(payload) = outcome {
        resume_unwind(payload);
    }
}

fn remove_database_files(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

fn seed_catalog_and_locations(database: &FilamentDatabase) {
    database
        .connection()
        .execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('master-1', 'PLA', 'Basic', 'Black', 1000, 'Generic')",
            [],
        )
        .expect("insert master");
    for (id, name) in [("location-a", "Shelf A"), ("location-b", "Shelf B")] {
        database
            .connection()
            .execute(
                "INSERT INTO inventory_locations (
                    id, name, type, created_at, updated_at
                 ) VALUES (?1, ?2, 'GENERIC', datetime('now'), datetime('now'))",
                params![id, name],
            )
            .expect("insert location");
    }
}

fn insert_spool(
    database: &FilamentDatabase,
    spool_id: &str,
    status: SpoolStatus,
    location_id: Option<&str>,
    home_location_id: Option<&str>,
) {
    database
        .connection()
        .execute(
            "INSERT INTO filament_spools (
                id, master_id, status, location_id, home_location_id
             ) VALUES (?1, 'master-1', ?2, ?3, ?4)",
            params![spool_id, status.as_str(), location_id, home_location_id],
        )
        .expect("insert spool");
}

fn precondition(
    spool_id: &str,
    status: SpoolStatus,
    location_id: Option<&str>,
    home_location_id: Option<&str>,
    active_loan: bool,
    assigned_to_printer: bool,
) -> InventoryBulkSpoolPrecondition {
    InventoryBulkSpoolPrecondition {
        spool_id: spool_id.to_string(),
        expected_status: status,
        expected_location_id: location_id.map(str::to_string),
        expected_home_location_id: home_location_id.map(str::to_string),
        expected_active_loan: active_loan,
        expected_assigned_to_printer: assigned_to_printer,
    }
}

fn move_input(
    expected_affected_count: i64,
    spools: Vec<InventoryBulkSpoolPrecondition>,
) -> InventoryBulkMutationInput {
    InventoryBulkMutationInput::Move {
        expected_affected_count,
        spools,
        target_location_id: "location-b".to_string(),
    }
}

fn status_input(
    expected_affected_count: i64,
    spools: Vec<InventoryBulkSpoolPrecondition>,
    target_status: SpoolStatus,
) -> InventoryBulkMutationInput {
    InventoryBulkMutationInput::Status {
        expected_affected_count,
        spools,
        target_status,
    }
}

fn error_code(error: InventoryError) -> &'static str {
    match error {
        InventoryError::InvalidOperation { code, .. } => code,
        other => panic!("expected InvalidOperation, received {other:?}"),
    }
}

fn spool_locations(
    database: &FilamentDatabase,
    spool_id: &str,
) -> (Option<String>, Option<String>) {
    database
        .connection()
        .query_row(
            "SELECT location_id, home_location_id
             FROM filament_spools
             WHERE id = ?1",
            params![spool_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read spool locations")
}

fn spool_status(database: &FilamentDatabase, spool_id: &str) -> String {
    database
        .connection()
        .query_row(
            "SELECT status FROM filament_spools WHERE id = ?1",
            params![spool_id],
            |row| row.get(0),
        )
        .expect("read spool status")
}

fn history_count(database: &FilamentDatabase, event_type: &str) -> i64 {
    database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM spool_history_events WHERE event_type = ?1",
            params![event_type],
            |row| row.get(0),
        )
        .expect("read history count")
}

fn spool_price_batch_locked(database: &FilamentDatabase, spool_id: &str) -> bool {
    database
        .connection()
        .query_row(
            "SELECT purchase_price_batch_locked
             FROM filament_spools
             WHERE id = ?1",
            params![spool_id],
            |row| row.get(0),
        )
        .expect("read batch price lock")
}

#[test]
fn bulk_historical_status_locks_price_and_reactivation_preserves_lock() {
    with_test_database("historical-price-lock", |database| {
        insert_spool(
            database,
            "bulk-history-lock",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );

        database
            .execute_inventory_bulk_mutation(status_input(
                1,
                vec![precondition(
                    "bulk-history-lock",
                    SpoolStatus::InStock,
                    Some("location-a"),
                    Some("location-a"),
                    false,
                    false,
                )],
                SpoolStatus::Lost,
            ))
            .expect("mark spool lost");
        assert_eq!(spool_status(database, "bulk-history-lock"), "LOST");
        assert!(spool_price_batch_locked(database, "bulk-history-lock"));

        database
            .execute_inventory_bulk_mutation(status_input(
                1,
                vec![precondition(
                    "bulk-history-lock",
                    SpoolStatus::Lost,
                    Some("location-a"),
                    Some("location-a"),
                    false,
                    false,
                )],
                SpoolStatus::InStock,
            ))
            .expect("reactivate spool");
        assert_eq!(spool_status(database, "bulk-history-lock"), "IN_STOCK");
        assert!(spool_price_batch_locked(database, "bulk-history-lock"));
        assert_eq!(
            history_count(database, "PURCHASE_PRICE_BATCH_LOCK_UPDATED"),
            1
        );
        let source: String = database
            .connection()
            .query_row(
                "SELECT json_extract(payload_json, '$.source')
                 FROM spool_history_events
                 WHERE spool_id = 'bulk-history-lock'
                   AND event_type = 'PURCHASE_PRICE_BATCH_LOCK_UPDATED'",
                [],
                |row| row.get(0),
            )
            .expect("read lock audit source");
        assert_eq!(source, BULK_SOURCE);
    });
}

#[test]
fn move_updates_current_and_home_counts_exact_changes_and_skips_true_noops() {
    with_test_database("move", |database| {
        insert_spool(
            database,
            "current-and-home",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );
        insert_spool(
            database,
            "home-only",
            SpoolStatus::Empty,
            Some("location-b"),
            Some("location-a"),
        );
        insert_spool(
            database,
            "noop",
            SpoolStatus::Lost,
            Some("location-b"),
            Some("location-b"),
        );

        let result = database
            .execute_inventory_bulk_mutation(move_input(
                2,
                vec![
                    precondition(
                        "current-and-home",
                        SpoolStatus::InStock,
                        Some("location-a"),
                        Some("location-a"),
                        false,
                        false,
                    ),
                    precondition(
                        "home-only",
                        SpoolStatus::Empty,
                        Some("location-b"),
                        Some("location-a"),
                        false,
                        false,
                    ),
                    precondition(
                        "noop",
                        SpoolStatus::Lost,
                        Some("location-b"),
                        Some("location-b"),
                        false,
                        false,
                    ),
                ],
            ))
            .expect("execute bulk move");

        assert_eq!(result.affected_count, 2);
        assert_eq!(result.history_spool_count, 2);
        assert!(result.committed);
        assert_eq!(
            spool_locations(database, "current-and-home"),
            (
                Some("location-b".to_string()),
                Some("location-b".to_string())
            )
        );
        assert_eq!(
            spool_locations(database, "home-only"),
            (
                Some("location-b".to_string()),
                Some("location-b".to_string())
            )
        );
        assert_eq!(history_count(database, "LOCATION_UPDATED"), 2);

        let payload: String = database
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM spool_history_events
                 WHERE spool_id = 'home-only' AND event_type = 'LOCATION_UPDATED'",
                [],
                |row| row.get(0),
            )
            .expect("read bulk move history");
        let payload: serde_json::Value = serde_json::from_str(&payload).expect("parse history");
        assert_eq!(payload["source"], BULK_SOURCE);
        assert_eq!(payload["bulk_action"], "MOVE");
        assert_eq!(payload["previous_home_location_id"], "location-a");
        assert_eq!(payload["target_location_id"], "location-b");
    });
}

#[test]
fn every_review_snapshot_field_is_revalidated_before_writes() {
    with_test_database("stale-preconditions", |database| {
        insert_spool(
            database,
            "spool-1",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );

        let stale_preconditions = [
            precondition(
                "spool-1",
                SpoolStatus::Empty,
                Some("location-a"),
                Some("location-a"),
                false,
                false,
            ),
            precondition(
                "spool-1",
                SpoolStatus::InStock,
                Some("location-b"),
                Some("location-a"),
                false,
                false,
            ),
            precondition(
                "spool-1",
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-b"),
                false,
                false,
            ),
            precondition(
                "spool-1",
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-a"),
                true,
                false,
            ),
            precondition(
                "spool-1",
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-a"),
                false,
                true,
            ),
        ];

        for stale in stale_preconditions {
            let error = database
                .execute_inventory_bulk_mutation(status_input(1, vec![stale], SpoolStatus::Lost))
                .expect_err("stale review must abort");
            assert_eq!(error_code(error), "inventory.bulk.stale_snapshot");
        }
        assert_eq!(spool_status(database, "spool-1"), "IN_STOCK");
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
    });
}

#[test]
fn affected_count_mismatch_and_duplicate_ids_abort_before_any_write() {
    with_test_database("fail-closed-request", |database| {
        for spool_id in ["spool-1", "spool-2"] {
            insert_spool(
                database,
                spool_id,
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-a"),
            );
        }
        let selected = ["spool-1", "spool-2"]
            .map(|spool_id| {
                precondition(
                    spool_id,
                    SpoolStatus::InStock,
                    Some("location-a"),
                    Some("location-a"),
                    false,
                    false,
                )
            })
            .to_vec();
        let error = database
            .execute_inventory_bulk_mutation(status_input(1, selected.clone(), SpoolStatus::Lost))
            .expect_err("wrong expected count must fail");
        assert_eq!(error_code(error), "inventory.bulk.affected_count_mismatch");

        let error = database
            .execute_inventory_bulk_mutation(status_input(
                2,
                vec![selected[0].clone(), selected[0].clone()],
                SpoolStatus::Lost,
            ))
            .expect_err("duplicate ids must fail");
        assert_eq!(error_code(error), "inventory.bulk.duplicate_spool_id");
        assert_eq!(spool_status(database, "spool-1"), "IN_STOCK");
        assert_eq!(spool_status(database, "spool-2"), "IN_STOCK");
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
    });
}

#[test]
fn affected_active_loans_in_both_directions_are_rejected() {
    with_test_database("loan-locks", |database| {
        for (spool_id, direction) in [("outbound", "OUTBOUND"), ("inbound", "INBOUND")] {
            insert_spool(
                database,
                spool_id,
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-a"),
            );
            database
                .connection()
                .execute(
                    "INSERT INTO spool_loans (
                        id, spool_id, borrower_name, loan_direction, loan_status, grams_out
                     ) VALUES (?1, ?2, 'Counterparty', ?3, 'ACTIVE', 1000)",
                    params![format!("loan-{spool_id}"), spool_id, direction],
                )
                .expect("insert active loan");

            let error = database
                .execute_inventory_bulk_mutation(status_input(
                    1,
                    vec![precondition(
                        spool_id,
                        SpoolStatus::InStock,
                        Some("location-a"),
                        Some("location-a"),
                        true,
                        false,
                    )],
                    SpoolStatus::Lost,
                ))
                .expect_err("active loans must lock affected spools");
            assert_eq!(error_code(error), "inventory.bulk.active_loan");
            assert_eq!(spool_status(database, spool_id), "IN_STOCK");
        }
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
    });
}

#[test]
fn affected_printer_slot_and_removed_spools_are_rejected() {
    with_test_database("slot-and-removed-locks", |database| {
        insert_spool(
            database,
            "assigned",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );
        database
            .connection()
            .execute(
                "INSERT INTO printers (id, model, name) VALUES ('printer-1', 'X1C', 'Printer')",
                [],
            )
            .expect("insert printer");
        database
            .connection()
            .execute(
                "INSERT INTO ams_units (id, printer_id, slot_count)
                 VALUES ('ams-1', 'printer-1', 1)",
                [],
            )
            .expect("insert ams");
        database
            .connection()
            .execute(
                "INSERT INTO ams_slots (id, ams_id, slot_index, spool_id)
                 VALUES ('slot-1', 'ams-1', 1, 'assigned')",
                [],
            )
            .expect("insert slot");
        let slot_error = database
            .execute_inventory_bulk_mutation(move_input(
                1,
                vec![precondition(
                    "assigned",
                    SpoolStatus::InStock,
                    Some("location-a"),
                    Some("location-a"),
                    false,
                    true,
                )],
            ))
            .expect_err("printer slot must lock an affected spool");
        assert_eq!(
            error_code(slot_error),
            "inventory.bulk.printer_slot_controlled"
        );

        insert_spool(database, "removed", SpoolStatus::Deleted, None, None);
        database
            .connection()
            .execute(
                "UPDATE filament_spools SET deleted_at = datetime('now') WHERE id = 'removed'",
                [],
            )
            .expect("mark spool deleted");
        let removed_error = database
            .execute_inventory_bulk_mutation(status_input(
                1,
                vec![precondition(
                    "removed",
                    SpoolStatus::Deleted,
                    None,
                    None,
                    false,
                    false,
                )],
                SpoolStatus::InStock,
            ))
            .expect_err("removed spool must be rejected");
        assert_eq!(error_code(removed_error), "inventory.bulk.removed_spool");
        assert_eq!(history_count(database, "LOCATION_UPDATED"), 0);
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
    });
}

#[test]
fn locked_noops_are_unchanged_while_other_rows_move() {
    with_test_database("locked-noops", |database| {
        insert_spool(
            database,
            "loan-noop",
            SpoolStatus::Borrowed,
            Some("location-b"),
            Some("location-b"),
        );
        database
            .connection()
            .execute(
                "INSERT INTO spool_loans (
                    id, spool_id, borrower_name, loan_direction, loan_status, grams_out
                 ) VALUES ('loan-noop-id', 'loan-noop', 'Alice', 'OUTBOUND', 'ACTIVE', 500)",
                [],
            )
            .expect("insert noop loan");
        insert_spool(
            database,
            "stock-move",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );

        let result = database
            .execute_inventory_bulk_mutation(move_input(
                1,
                vec![
                    precondition(
                        "loan-noop",
                        SpoolStatus::Borrowed,
                        Some("location-b"),
                        Some("location-b"),
                        true,
                        false,
                    ),
                    precondition(
                        "stock-move",
                        SpoolStatus::InStock,
                        Some("location-a"),
                        Some("location-a"),
                        false,
                        false,
                    ),
                ],
            ))
            .expect("locked no-op does not block another affected row");
        assert_eq!(result.affected_count, 1);
        assert_eq!(history_count(database, "LOCATION_UPDATED"), 1);
        assert_eq!(
            spool_locations(database, "loan-noop"),
            (
                Some("location-b".to_string()),
                Some("location-b".to_string())
            )
        );
    });
}

#[test]
fn unsupported_status_and_non_active_generic_move_targets_fail_closed() {
    with_test_database("targets", |database| {
        insert_spool(
            database,
            "spool-1",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
        );
        let selected = vec![precondition(
            "spool-1",
            SpoolStatus::InStock,
            Some("location-a"),
            Some("location-a"),
            false,
            false,
        )];
        let status_error = database
            .execute_inventory_bulk_mutation(status_input(
                1,
                selected.clone(),
                SpoolStatus::Assigned,
            ))
            .expect_err("ASSIGNED is not a manual bulk target");
        assert_eq!(
            error_code(status_error),
            "inventory.bulk.invalid_status_target"
        );

        database
            .connection()
            .execute(
                "INSERT INTO inventory_locations (
                    id, name, type, archived_at, created_at, updated_at
                 ) VALUES (
                    'archived', 'Old shelf', 'GENERIC', datetime('now'), datetime('now'), datetime('now')
                 )",
                [],
            )
            .expect("insert archived location");
        let location_error = database
            .execute_inventory_bulk_mutation(InventoryBulkMutationInput::Move {
                expected_affected_count: 1,
                spools: selected,
                target_location_id: "archived".to_string(),
            })
            .expect_err("archived location is not a valid target");
        assert_eq!(
            error_code(location_error),
            "inventory.bulk.invalid_location_target"
        );
        assert_eq!(spool_status(database, "spool-1"), "IN_STOCK");
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
    });
}

#[test]
fn late_history_failure_rolls_back_every_status_and_history_write() {
    with_test_database("late-rollback", |database| {
        for spool_id in ["spool-a", "spool-b"] {
            insert_spool(
                database,
                spool_id,
                SpoolStatus::InStock,
                Some("location-a"),
                Some("location-a"),
            );
        }
        database
            .connection()
            .execute_batch(
                "CREATE TRIGGER fail_second_bulk_history
                 BEFORE INSERT ON spool_history_events
                 WHEN NEW.spool_id = 'spool-b' AND NEW.event_type = 'STATUS_UPDATED'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced late bulk history failure');
                 END;",
            )
            .expect("install late failure trigger");

        let error = database
            .execute_inventory_bulk_mutation(status_input(
                2,
                ["spool-a", "spool-b"]
                    .map(|spool_id| {
                        precondition(
                            spool_id,
                            SpoolStatus::InStock,
                            Some("location-a"),
                            Some("location-a"),
                            false,
                            false,
                        )
                    })
                    .to_vec(),
                SpoolStatus::Empty,
            ))
            .expect_err("late history failure must roll back the transaction");
        assert!(error
            .to_string()
            .contains("forced late bulk history failure"));
        assert_eq!(spool_status(database, "spool-a"), "IN_STOCK");
        assert_eq!(spool_status(database, "spool-b"), "IN_STOCK");
        assert_eq!(history_count(database, "STATUS_UPDATED"), 0);
        assert_eq!(history_count(database, "USED_UP"), 0);
    });
}

#[test]
fn wire_contract_uses_ui_action_and_snake_case_fields() {
    let input: InventoryBulkMutationInput = serde_json::from_value(serde_json::json!({
        "action": "STATUS",
        "expected_affected_count": 1,
        "spools": [{
            "spool_id": "spool-1",
            "expected_status": "IN_STOCK",
            "expected_location_id": "location-a",
            "expected_home_location_id": "location-a",
            "expected_active_loan": false,
            "expected_assigned_to_printer": false
        }],
        "target_status": "EMPTY"
    }))
    .expect("deserialize UI bulk command");
    let serialized = serde_json::to_value(input).expect("serialize bulk command");
    assert_eq!(serialized["action"], "STATUS");
    assert_eq!(serialized["target_status"], "EMPTY");
    assert_eq!(serialized["spools"][0]["expected_status"], "IN_STOCK");
}
