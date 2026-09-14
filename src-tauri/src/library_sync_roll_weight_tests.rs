use super::*;
use crate::inventory_bulk_models::LibrarySyncInventoryBulkMutationInput;
use crate::library_sync_inventory_bulk_write_commands::execute_library_sync_host_inventory_bulk_mutation_blocking as execute;

fn request(host: &SyntheticHost, generation: u64) -> LibrarySyncInventoryBulkMutationInput {
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let spool = db.get_spool_by_id("original-host-roll").unwrap().unwrap();
    serde_json::from_value(serde_json::json!({
        "base_url":host.base_url,"expected_library_id":LIBRARY_ID,"expected_target_generation":generation,
        "mutation":{"action":"ROLL_WEIGHT","measured_total_g":850,"expected_remaining_g":spool.remaining_g,"expected_tare_g":0,"expected_slot_id":"printer / one_ams_1_slot_1",
            "spool":{"spool_id":spool.id,"expected_status":spool.status,"expected_location_id":spool.location_id,
                "expected_home_location_id":spool.home_location_id,"expected_active_loan":db.spool_has_active_loan(&spool.id).unwrap(),"expected_assigned_to_printer":true}}
    })).unwrap()
}

#[test]
fn roll_weight_host_commits_once_and_preserves_client_rows_and_host_assignment() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let spool = db.get_spool_by_id("original-host-roll").unwrap().unwrap();
    drop(db);
    let receipt = execute(&state, request(&host, generation)).unwrap();
    assert!(receipt.committed);
    assert_eq!(receipt.affected_count, 1);
    assert_eq!(snapshot(&state.db_path), before);
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let changed = db.get_spool_by_id("original-host-roll").unwrap().unwrap();
    assert_eq!(changed.status, "ASSIGNED");
    assert_eq!(changed.current_weight_g, Some(850));
    assert_eq!(changed.remaining_g, Some(850));
    assert_eq!(changed.location_id, spool.location_id);
    assert!(db.spool_assigned_to_printer(&spool.id).unwrap());
    drop(db);
    assert_eq!(
        host.finish()
            .iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .count(),
        1
    );
}

#[test]
fn roll_weight_old_host_bad_generation_unpaired_and_health_transition_send_no_post() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for case in [
        "legacy",
        "generation",
        "missing-generation",
        "unpaired",
        "health-transition",
    ] {
        let mut host = SyntheticHost::start(case != "legacy", serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, case != "unpaired");
        let before_client = snapshot(&state.db_path);
        let before_host = snapshot(host.db_path.to_str().unwrap());
        let mut input = request(&host, generation);
        match case {
            "generation" => input.expected_target_generation = Some(generation + 1),
            "missing-generation" => input.expected_target_generation = None,
            "health-transition" => host.transition_at(TransitionAt::Health, &state),
            _ => {}
        }
        let error = execute(&state, input).unwrap_err();
        if case == "legacy" {
            assert!(error.contains("inventory.roll_weight.host_unsupported"));
        }
        assert_eq!(snapshot(&state.db_path), before_client, "{case}");
        assert_eq!(
            snapshot(host.db_path.to_str().unwrap()),
            before_host,
            "{case}"
        );
        assert!(
            host.finish()
                .iter()
                .all(|(request, _)| !request.starts_with("POST ")),
            "{case}"
        );
    }
}

#[test]
fn roll_weight_host_rejects_changed_slot_and_late_failure_without_partial_changes() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for stale in [false, true] {
        let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let input = request(&host, generation);
        if stale {
            let engine = InventoryEngine::new(FilamentDatabase::open(&host.db_path).unwrap());
            engine
                .assign_printer_slot(AssignPrinterSlotInput {
                    printer_id: "printer / one".into(),
                    slot_id: "printer / one_ams_1_slot_1".into(),
                    spool_id: Some("incoming-host-roll".into()),
                    rfid_override_tray_uuid: None,
                    rfid_override_color_hex: None,
                    clear_live_cache_before_next_refresh: None,
                })
                .unwrap();
        } else {
            FilamentDatabase::open(&host.db_path).unwrap().connection().execute_batch("CREATE TRIGGER fail_status BEFORE INSERT ON spool_history_events WHEN NEW.event_type='PRINT_JOB_RECORDED' BEGIN SELECT RAISE(ABORT,'late status failure'); END;").unwrap();
        }
        let before_client = snapshot(&state.db_path);
        let before_host = snapshot(host.db_path.to_str().unwrap());
        assert!(execute(&state, input).is_err());
        assert_eq!(snapshot(&state.db_path), before_client);
        assert_eq!(snapshot(host.db_path.to_str().unwrap()), before_host);
        assert_eq!(
            host.finish()
                .iter()
                .filter(|(request, _)| request.starts_with("POST "))
                .count(),
            1
        );
    }
}

#[test]
fn roll_weight_acknowledged_write_survives_cache_target_change_and_rejects_invalid_receipts() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for receipt in [
        None,
        Some(serde_json::json!({"committed":false,"affected_count":1,"history_spool_count":1})),
        Some(serde_json::json!({"committed":true,"affected_count":2,"history_spool_count":2})),
        Some(serde_json::json!({"committed":true,"affected_count":1,"history_spool_count":0})),
        Some(serde_json::json!({})),
    ] {
        let mut host = SyntheticHost::start(
            true,
            receipt.as_ref().map_or_else(
                || serde_json::json!({"ok":true}),
                |receipt| serde_json::json!({"bulk_receipt":receipt}),
            ),
        );
        let (_directory, state, generation) = client(&host, true);
        let before = snapshot(&state.db_path);
        if receipt.is_none() {
            host.transition_at(TransitionAt::Cache, &state);
        }
        let result = execute(&state, request(&host, generation));
        assert_eq!(result.is_ok(), receipt.is_none());
        assert_eq!(snapshot(&state.db_path), before);
        assert_eq!(
            host.finish()
                .iter()
                .filter(|(request, _)| request.starts_with("POST "))
                .count(),
            1
        );
    }
}
