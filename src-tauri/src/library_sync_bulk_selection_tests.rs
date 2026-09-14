use super::*;
use crate::inventory_bulk_models::LibrarySyncInventoryBulkMutationInput;
use crate::library_sync_inventory_bulk_write_commands::execute_library_sync_host_inventory_bulk_mutation_blocking as execute;

fn reviewed_request(
    host: &SyntheticHost,
    generation: u64,
    action: &str,
) -> LibrarySyncInventoryBulkMutationInput {
    let engine = InventoryEngine::new(FilamentDatabase::open(&host.db_path).unwrap());
    engine
        .assign_printer_slot(AssignPrinterSlotInput {
            printer_id: "printer / one".into(),
            slot_id: "printer / one_ams_1_slot_1".into(),
            spool_id: None,
            rfid_override_tray_uuid: None,
            rfid_override_color_hex: None,
            clear_live_cache_before_next_refresh: None,
        })
        .unwrap();
    drop(engine);
    let db = FilamentDatabase::open(&host.db_path).unwrap();
    let target = db
        .create_inventory_location("Bulk destination", None)
        .unwrap();
    let spools: Vec<_> = ["original-host-roll", "incoming-host-roll"].into_iter().map(|id| {
        let spool = db.get_spool_by_id(id).unwrap().unwrap();
        assert!(!db.spool_assigned_to_printer(id).unwrap());
        serde_json::json!({"spool_id":id,"expected_status":spool.status,"expected_location_id":spool.location_id,
            "expected_home_location_id":spool.home_location_id,"expected_active_loan":false,"expected_assigned_to_printer":false})
    }).collect();
    serde_json::from_value(serde_json::json!({"base_url":host.base_url,"expected_library_id":LIBRARY_ID,
        "expected_target_generation":generation,"mutation":{"action":action,"spools":spools,"expected_affected_count":2,
        "target_status":"LOST","target_location_id":target.id}})).unwrap()
}

#[test]
fn reviewed_bulk_selection_commits_both_rolls_and_rejects_replay_without_client_mutation() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for action in ["MOVE", "STATUS"] {
        for legacy_caller in [false, true] {
            let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
            let (_directory, state, generation) = client(&host, true);
            let before_client = snapshot(&state.db_path);
            let mut request = reviewed_request(&host, generation, action);
            if legacy_caller {
                request.expected_target_generation = None;
            }
            let receipt = execute(&state, request.clone()).unwrap();
            assert!(receipt.committed);
            assert_eq!(receipt.affected_count, 2);
            assert_eq!(receipt.history_spool_count, 2);
            assert_eq!(snapshot(&state.db_path), before_client);
            let db = FilamentDatabase::open(&host.db_path).unwrap();
            for id in ["original-host-roll", "incoming-host-roll"] {
                let spool = db.get_spool_by_id(id).unwrap().unwrap();
                if action == "STATUS" {
                    assert_eq!(spool.status, "LOST");
                } else {
                    let target = db
                        .list_inventory_locations(false)
                        .unwrap()
                        .into_iter()
                        .find(|row| row.name == "Bulk destination")
                        .unwrap();
                    assert_eq!(spool.location_id.as_deref(), Some(target.id.as_str()));
                }
            }
            drop(db);
            let committed = snapshot(host.db_path.to_str().unwrap());
            assert!(execute(&state, request).is_err());
            assert_eq!(snapshot(host.db_path.to_str().unwrap()), committed);
            assert_eq!(snapshot(&state.db_path), before_client);
            assert_eq!(
                host.finish()
                    .iter()
                    .filter(|(line, _)| line.starts_with("POST "))
                    .count(),
                2
            );
        }
    }
}

#[test]
fn reviewed_bulk_selection_old_generation_and_health_changes_send_no_post() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for action in ["MOVE", "STATUS"] {
        for case in ["generation", "health", "legacy", "unpaired"] {
            let mut host = SyntheticHost::start(case != "legacy", serde_json::json!({"ok":true}));
            let (_directory, state, generation) = client(&host, case != "unpaired");
            let mut request = reviewed_request(&host, generation, action);
            if case == "generation" {
                request.expected_target_generation = Some(generation + 1);
            }
            if case == "health" {
                host.transition_at(TransitionAt::Health, &state);
            }
            let before_client = snapshot(&state.db_path);
            let before_host = snapshot(host.db_path.to_str().unwrap());
            assert!(execute(&state, request).is_err(), "{action}/{case}");
            assert_eq!(snapshot(host.db_path.to_str().unwrap()), before_host);
            assert_eq!(snapshot(&state.db_path), before_client);
            let requests = host.finish();
            assert_eq!(
                requests
                    .iter()
                    .filter(|(line, _)| line.starts_with("POST "))
                    .count(),
                0
            );
            if case == "generation" {
                assert!(requests.is_empty());
            }
        }
    }
}

#[test]
fn reviewed_bulk_selection_stale_second_roll_aborts_all_writes() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for action in ["MOVE", "STATUS"] {
        let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let request = reviewed_request(&host, generation, action);
        InventoryEngine::new(FilamentDatabase::open(&host.db_path).unwrap())
            .update_spool_status("incoming-host-roll", "LOST")
            .unwrap();
        let before_host = snapshot(host.db_path.to_str().unwrap());
        let before_client = snapshot(&state.db_path);
        assert!(execute(&state, request).is_err());
        assert_eq!(snapshot(host.db_path.to_str().unwrap()), before_host);
        assert_eq!(snapshot(&state.db_path), before_client);
        assert_eq!(
            host.finish()
                .iter()
                .filter(|(line, _)| line.starts_with("POST "))
                .count(),
            1
        );
    }
}

#[test]
fn reviewed_bulk_selection_acknowledgement_survives_cache_target_change() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for action in ["MOVE", "STATUS"] {
        let mut host = SyntheticHost::start(true, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let request = reviewed_request(&host, generation, action);
        let before_client = snapshot(&state.db_path);
        host.transition_at(TransitionAt::Cache, &state);
        let receipt = execute(&state, request).unwrap();
        assert!(receipt.committed);
        assert_eq!(receipt.history_spool_count, 2);
        assert_eq!(snapshot(&state.db_path), before_client);
        assert_eq!(
            host.finish()
                .iter()
                .filter(|(line, _)| line.starts_with("POST "))
                .count(),
            1
        );
    }
}
