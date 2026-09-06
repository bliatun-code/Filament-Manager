use super::*;
use rusqlite::types::Value;

fn inventory_snapshot(db: &FilamentDatabase) -> Vec<Vec<Vec<Value>>> {
    [
        "filament_master_list",
        "filament_spools",
        "spool_loans",
        "inventory_locations",
        "spool_history_events",
        "library_domain_revisions",
    ]
    .iter()
    .map(|table| {
        let mut statement = db
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

async fn create_borrowed_catalog_spool(
    router: &Router,
    session: &AuthenticatedTestSession,
    master_id: &str,
    location: &str,
) -> (StatusCode, serde_json::Value) {
    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/spools/borrowed-in")
                .header("content-type", "application/json")
                .header("host", "127.0.0.1:4278")
                .header("origin", "http://127.0.0.1:4278")
                .header(
                    "cookie",
                    format!("bfm_companion_session={}", session.session_cookie),
                )
                .header(COMPANION_CSRF_HEADER, &session.csrf_token)
                .body(Body::from(
                    serde_json::json!({
                        "master_id": master_id,
                        "owner_name": "Synthetic owner",
                        "owner_contact": "synthetic@example.invalid",
                        "ownership_note": "Synthetic borrowed catalog test",
                        "initial_weight_g": 860,
                        "location": location,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn companion_api_borrowed_catalog_create_keeps_location_and_loan_atomic() {
    let db_path = temp_db_path("borrowed-catalog-atomic-location");
    seed_db(&db_path).unwrap();
    let db = FilamentDatabase::open(&db_path).unwrap();
    let master_id = db.get_spool_by_id("spool_1").unwrap().unwrap().master_id;
    let router = build_router(test_state(&db_path));
    let session = pair_test_session(&router, &db_path).await.unwrap();
    let before = inventory_snapshot(&db);

    let (status, response) =
        create_borrowed_catalog_spool(&router, &session, &master_id, &"x".repeat(121)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(response["code"], "inventory.location.name_too_long");
    assert!(
        inventory_snapshot(&db) == before,
        "invalid location must leave all inventory rows and revisions unchanged"
    );

    // Fail after location, spool, initial history and inbound loan insertion.
    db.connection()
        .execute_batch(
            "CREATE TRIGGER reject_borrowed_catalog_history
             BEFORE INSERT ON spool_history_events
             WHEN NEW.event_type = 'BORROWED_IN_REGISTERED'
             BEGIN SELECT RAISE(ABORT, 'synthetic late history failure'); END;",
        )
        .unwrap();
    let (status, _) =
        create_borrowed_catalog_spool(&router, &session, &master_id, "Atomic borrowed shelf").await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(
        inventory_snapshot(&db) == before,
        "late history failure must roll back location, spool, loan and revisions"
    );
    db.connection()
        .execute_batch("DROP TRIGGER reject_borrowed_catalog_history")
        .unwrap();

    let (status, response) =
        create_borrowed_catalog_spool(&router, &session, &master_id, "Atomic borrowed shelf").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(response["ok"], true);
    let spool_id = response["spool_id"]
        .as_str()
        .expect("Host returns created ID");
    let spool = db.get_spool_by_id(spool_id).unwrap().unwrap();
    assert_eq!(spool.master_id, master_id);
    assert_eq!(spool.ownership_type, "BORROWED_IN");
    assert_eq!(spool.owner_name.as_deref(), Some("Synthetic owner"));
    assert_eq!(spool.remaining_g, Some(860));
    let location = db
        .list_inventory_locations(false)
        .unwrap()
        .into_iter()
        .find(|location| location.name == "Atomic borrowed shelf")
        .unwrap();
    assert_eq!(spool.location_id.as_deref(), Some(location.id.as_str()));
    assert_eq!(spool.home_location_id, spool.location_id);
    let loans = db
        .list_spool_loans_for_direction(20, false, Some("INBOUND"))
        .unwrap();
    assert_eq!(loans.len(), 1);
    let loan = &loans[0].loan;
    assert_eq!(loan.spool_id, spool_id);
    assert_eq!(loan.loan_direction, "INBOUND");
    assert_eq!(loan.counterparty_name, "Synthetic owner");
    assert_eq!(loan.grams_out, 860);
    let history = db.list_spool_history_events(spool_id, 20).unwrap();
    assert_eq!(history.len(), 2);
    assert!(history.iter().any(|event| event.event_type == "CREATED"));
    assert!(history
        .iter()
        .any(|event| event.event_type == "BORROWED_IN_REGISTERED"));
    assert_eq!(db.list_spools_with_master(20, 0).unwrap().len(), 3);
    assert_ne!(inventory_snapshot(&db), before);

    drop(router);
    drop(db);
    std::fs::remove_file(db_path).unwrap();
}
