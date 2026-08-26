const POLL_SOURCE: &str = include_str!("bambu_live.rs");
const AUTHORITY_SOURCE: &str = include_str!("bambu_live_authority.rs");
const POLL_SCHEDULER_SOURCE: &str = include_str!("bambu_live_poll_scheduler.rs");
const SYNC_SOURCE: &str = include_str!("bambu_live_sync.rs");
const MATCHING_SOURCE: &str = include_str!("bambu_live_matching.rs");
const OBSERVATION_SOURCE: &str = include_str!("bambu_live_observation.rs");
const PERSISTENCE_SOURCE: &str = include_str!("bambu_live_persistence.rs");
const USAGE_SOURCE: &str = include_str!("bambu_live_usage.rs");

#[test]
fn live_poll_facade_stays_transport_focused() {
    assert!(
        POLL_SOURCE.lines().count() <= 500,
        "bambu_live.rs should remain a bounded transport and polling facade"
    );
    for moved_implementation in [
        "fn merge_idle_observation(",
        "fn merge_print_payload(",
        "fn apply_tray_match_status(",
        "fn sync_live_weight(",
        "fn persist_observation(",
        "fn capture_bambu_live_poll_batch(",
        "fn with_current_bambu_live_authority<",
        "fn run_bounded_blocking_polls<",
    ] {
        assert!(
            !POLL_SOURCE.contains(moved_implementation),
            "transport facade should not own `{moved_implementation}`"
        );
    }
}

#[test]
fn live_modules_keep_explicit_production_owners() {
    assert!(AUTHORITY_SOURCE.contains("fn capture_bambu_live_poll_batch("));
    assert!(AUTHORITY_SOURCE.contains("fn with_current_bambu_live_authority<"));
    assert!(POLL_SCHEDULER_SOURCE.contains("fn run_bounded_blocking_polls<"));
    assert!(OBSERVATION_SOURCE.contains("fn merge_idle_observation("));
    assert!(OBSERVATION_SOURCE.contains("fn merge_print_payload("));
    assert!(MATCHING_SOURCE.contains("fn apply_tray_match_status("));
    assert!(USAGE_SOURCE.contains("fn sync_live_weight("));
    assert!(PERSISTENCE_SOURCE.contains("fn persist_observation("));
}

#[test]
fn live_sync_matches_before_applying_usage() {
    assert!(
        SYNC_SOURCE.lines().count() <= 80,
        "bambu_live_sync.rs should remain a small orchestration boundary"
    );
    let matching = SYNC_SOURCE
        .find("match_observed_trays(db, &overview, &mut observed.trays)")
        .expect("live sync should invoke matching");
    let usage = SYNC_SOURCE
        .find("sync_observed_usage(db, &overview, &observed)")
        .expect("live sync should invoke usage synchronization");
    assert!(
        matching < usage,
        "matching must complete before usage synchronization"
    );
}
