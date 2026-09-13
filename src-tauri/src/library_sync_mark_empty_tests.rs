use super::*;
use crate::inventory_bulk_models::LibrarySyncInventoryBulkMutationInput;
use crate::library_sync_inventory_bulk_write_commands::execute_library_sync_host_inventory_bulk_mutation_blocking;

fn mark_request(host: &SyntheticHost, generation: u64) -> LibrarySyncInventoryBulkMutationInput {
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let spool = db.get_spool_by_id("original-host-roll").unwrap().unwrap();
    serde_json::from_value(serde_json::json!({
        "base_url": host.base_url, "expected_library_id": LIBRARY_ID,
        "expected_target_generation": generation,
        "mutation": {"action":"MARK_EMPTY", "expected_slot_id":"printer / one_ams_1_slot_1",
            "spool": {"spool_id":spool.id, "expected_status":spool.status,
                "expected_location_id":spool.location_id, "expected_home_location_id":spool.home_location_id,
                "expected_active_loan":false, "expected_assigned_to_printer":true}}
    })).unwrap()
}

#[test]
fn mark_empty_host_commits_once_and_preserves_client_business_rows() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    let before = snapshot(&state.db_path);
    let request = mark_request(&host, generation);
    let receipt =
        execute_library_sync_host_inventory_bulk_mutation_blocking(&state, request).unwrap();
    assert!(receipt.committed);
    assert_eq!(receipt.affected_count, 1);
    assert_eq!(snapshot(&state.db_path), before);
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let spool = db.get_spool_by_id("original-host-roll").unwrap().unwrap();
    assert_eq!(spool.status, "EMPTY");
    assert_eq!(spool.remaining_g, Some(0));
    assert_eq!(spool.current_weight_g, Some(0));
    assert_eq!(spool.location_id, spool.home_location_id);
    assert!(!db.spool_assigned_to_printer(&spool.id).unwrap());
    drop(db);
    let requests = host.finish();
    assert_eq!(
        requests
            .iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .count(),
        1
    );
}

#[test]
fn mark_empty_old_host_wrong_generation_and_health_transition_send_no_post() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for case in [
        "legacy",
        "generation",
        "missing-generation",
        "health-transition",
        "unpaired",
    ] {
        let mut host = SyntheticHost::start(case != "legacy", serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, case != "unpaired");
        let before_client = snapshot(&state.db_path);
        let before_host = snapshot(host.db_path.to_str().unwrap());
        let mut request = mark_request(&host, generation);
        if case == "generation" {
            request.expected_target_generation = Some(generation + 1);
        }
        if case == "missing-generation" {
            request.expected_target_generation = None;
        }
        if case == "health-transition" {
            host.transition_at(TransitionAt::Health, &state);
        }
        assert!(
            execute_library_sync_host_inventory_bulk_mutation_blocking(&state, request).is_err(),
            "{case}"
        );
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
fn mark_empty_stale_host_slot_rejection_never_changes_client_or_host_rows() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    let request = mark_request(&host, generation);
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
    drop(engine);
    let before_client = snapshot(&state.db_path);
    let before_host = snapshot(host.db_path.to_str().unwrap());
    assert!(execute_library_sync_host_inventory_bulk_mutation_blocking(&state, request).is_err());
    assert_eq!(snapshot(&state.db_path), before_client);
    assert_eq!(snapshot(host.db_path.to_str().unwrap()), before_host);
    let requests = host.finish();
    assert_eq!(
        requests
            .iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .count(),
        1
    );
}

#[test]
fn mark_empty_acknowledged_write_survives_target_change_during_refresh() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
    let (_directory, state, generation) = client(&host, true);
    host.transition_at(TransitionAt::Cache, &state);
    let receipt = execute_library_sync_host_inventory_bulk_mutation_blocking(
        &state,
        mark_request(&host, generation),
    )
    .unwrap();
    assert!(receipt.committed);
    assert_eq!(receipt.affected_count, 1);
    assert_eq!(
        FilamentDatabase::open(&host.db_path)
            .unwrap()
            .get_spool_by_id("original-host-roll")
            .unwrap()
            .unwrap()
            .status,
        "EMPTY"
    );
    assert_eq!(
        host.finish()
            .iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .count(),
        1
    );
}
