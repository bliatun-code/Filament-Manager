use super::*;
use crate::library_sync_danger_zone_commands::{
    delete_library_sync_host_spool_blocking, purge_library_sync_host_spool_blocking,
};
use crate::library_sync_models::LibrarySyncDeleteSpoolInput;

type Remove = fn(&AppState, LibrarySyncDeleteSpoolInput) -> Result<(), String>;
const OPERATIONS: [(&str, Remove); 2] = [
    ("delete", delete_library_sync_host_spool_blocking),
    ("purge", purge_library_sync_host_spool_blocking),
];

fn removal_request(host: &SyntheticHost, generation: u64) -> LibrarySyncDeleteSpoolInput {
    LibrarySyncDeleteSpoolInput {
        base_url: host.base_url.clone(),
        expected_library_id: Some(LIBRARY_ID.into()),
        expected_target_generation: generation,
        spool_id: "original-host-roll".into(),
        reason: Some("reviewed removal".into()),
    }
}

#[test]
fn removal_old_host_commits_once_despite_cache_failure_and_preserves_client_rows() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for (name, remove) in OPERATIONS {
        let mut host = SyntheticHost::start(false, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let before = snapshot(&state.db_path);
        remove(&state, removal_request(&host, generation)).unwrap();
        assert_eq!(snapshot(&state.db_path), before, "{name}");
        let db = FilamentDatabase::open(&host.db_path).unwrap();
        let removed = db.get_spool_by_id("original-host-roll").unwrap();
        if name == "delete" {
            assert_eq!(removed.unwrap().status, "DELETED");
        } else {
            assert!(removed.is_none());
        }
        assert!(!db.spool_assigned_to_printer("original-host-roll").unwrap());
        assert!(db.get_spool_by_id("incoming-host-roll").unwrap().is_some());
        drop(db);
        let requests = host.finish();
        let posts: Vec<_> = requests
            .iter()
            .filter(|(request, _)| request.starts_with("POST "))
            .collect();
        assert_eq!(posts.len(), 1);
        assert!(posts[0].0.contains(&format!("/{name} ")));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&posts[0].1).unwrap(),
            serde_json::json!({"reason":"reviewed removal"})
        );
    }
}

#[test]
fn removal_invalid_authority_or_health_target_transition_sends_no_post() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for (_, remove) in OPERATIONS {
        for case in [
            "generation",
            "library",
            "blank-id",
            "health-transition",
            "unpaired",
        ] {
            let mut host = SyntheticHost::start(false, serde_json::json!({"ok":true}));
            let (_directory, state, generation) = client(&host, case != "unpaired");
            let before_client = snapshot(&state.db_path);
            let before_host = snapshot(host.db_path.to_str().unwrap());
            let mut request = removal_request(&host, generation);
            match case {
                "generation" => request.expected_target_generation += 1,
                "library" => request.expected_library_id = Some("another-library".into()),
                "blank-id" => request.spool_id = " ".into(),
                "health-transition" => host.transition_at(TransitionAt::Health, &state),
                _ => {}
            }
            assert!(remove(&state, request).is_err(), "{case}");
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
    assert!(
        serde_json::from_value::<LibrarySyncDeleteSpoolInput>(serde_json::json!({
            "base_url":"http://host", "expected_library_id":LIBRARY_ID, "spool_id":"roll"
        }))
        .is_err(),
        "missing generation cannot enter the native command"
    );
}

#[test]
fn removal_requires_positive_acknowledgment_without_replaying_the_write() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for (_, remove) in OPERATIONS {
        for acknowledgment in [
            serde_json::json!({"ok":false}),
            serde_json::json!({}),
            serde_json::json!({"ok":"true"}),
        ] {
            let mut host = SyntheticHost::start(false, acknowledgment);
            let (_directory, state, generation) = client(&host, true);
            let before = snapshot(&state.db_path);
            assert!(remove(&state, removal_request(&host, generation)).is_err());
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
}

#[test]
fn removal_target_changes_during_acknowledgment_or_refresh_never_touch_new_client_rows() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for (_, remove) in OPERATIONS {
        for at in [TransitionAt::Post, TransitionAt::Cache] {
            let mut host = SyntheticHost::start(false, serde_json::json!({"ok":true}));
            let (_directory, state, generation) = client(&host, true);
            let before = snapshot(&state.db_path);
            host.transition_at(at, &state);
            let result = remove(&state, removal_request(&host, generation));
            if matches!(at, TransitionAt::Cache) {
                assert!(result.is_ok());
            } else {
                assert!(result.is_err());
            }
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
}

#[test]
fn removal_host_rejects_active_loans_without_partial_changes() {
    let _serial = NETWORK_TEST_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for (_, remove) in OPERATIONS {
        let mut host = SyntheticHost::start(false, serde_json::json!({"ok":true}));
        let (_directory, state, generation) = client(&host, true);
        let db = FilamentDatabase::open(&host.db_path).unwrap();
        // An active inbound loan is just as protected from removal as an outbound one.
        db.connection().execute_batch("INSERT INTO spool_loans (id,spool_id,loan_direction,borrower_name,loan_status,grams_out) VALUES ('active','original-host-roll','INBOUND','Owner','ACTIVE',700)").unwrap();
        drop(db);
        let before_host = snapshot(host.db_path.to_str().unwrap());
        let before_client = snapshot(&state.db_path);
        assert!(remove(&state, removal_request(&host, generation)).is_err());
        assert_eq!(snapshot(host.db_path.to_str().unwrap()), before_host);
        assert_eq!(snapshot(&state.db_path), before_client);
        assert_eq!(
            host.finish()
                .iter()
                .filter(|(request, _)| request.starts_with("POST "))
                .count(),
            1
        );
    }
}
