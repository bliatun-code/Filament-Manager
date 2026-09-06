use super::*;
use rusqlite::types::Value;

fn snapshot(db: &FilamentDatabase) -> Vec<Vec<Vec<Value>>> {
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

async fn post_batch(
    router: &Router,
    session: Option<&AuthenticatedTestSession>,
    payload: &serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri("/api/v1/spools/catalog-batch")
        .header("content-type", "application/json")
        .header("host", "127.0.0.1:4278")
        .header("origin", "http://127.0.0.1:4278");
    if let Some(session) = session {
        request = request
            .header(
                "cookie",
                format!("bfm_companion_session={}", session.session_cookie),
            )
            .header(COMPANION_CSRF_HEADER, &session.csrf_token);
    }
    let response = router
        .clone()
        .oneshot(request.body(Body::from(payload.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

fn batch_payload(master_id: &str) -> serde_json::Value {
    serde_json::json!({
        "batch_id": "api-atomic-batch", "master_ids": [master_id, master_id],
        "initial_weight_g": 850, "ownership_type": "BORROWED_IN",
        "owner_name": "Synthetic owner", "owner_contact": "synthetic@example.invalid",
        "ownership_note": "Atomic API batch test", "location": "Batch dry box"
    })
}

#[tokio::test]
async fn companion_catalog_batch_rolls_back_later_failure_and_replays_exact_receipt() {
    let path = temp_db_path("catalog-batch-atomic");
    seed_db(&path).unwrap();
    let db = FilamentDatabase::open(&path).unwrap();
    let master_id = db.get_spool_by_id("spool_1").unwrap().unwrap().master_id;
    let router = build_router(test_state(&path));
    let session = pair_test_session(&router, &path).await.unwrap();
    let before = snapshot(&db);
    let payload = batch_payload(&master_id);
    let mut invalid = payload.clone();
    invalid["master_ids"][1] = "nonexistent-later-master".into();
    let (status, error) = post_batch(&router, Some(&session), &invalid).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error["code"], "inventory.batch.invalid");
    assert_eq!(snapshot(&db), before);

    db.connection()
        .execute_batch(
            "CREATE TRIGGER reject_second_batch_loan BEFORE INSERT ON spool_loans
         WHEN (SELECT COUNT(*) FROM spool_loans WHERE counterparty_name = 'Synthetic owner') >= 1
         BEGIN SELECT RAISE(ABORT, 'synthetic later loan failure'); END;",
        )
        .unwrap();
    let (status, error) = post_batch(&router, Some(&session), &payload).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(error["code"], "common.internal");
    assert_eq!(
        snapshot(&db),
        before,
        "second loan failure must also roll back the first spool, location, history and revisions"
    );
    db.connection()
        .execute_batch("DROP TRIGGER reject_second_batch_loan")
        .unwrap();

    let (status, receipt) = post_batch(&router, Some(&session), &payload).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(receipt["batch_id"], payload["batch_id"]);
    let ids = receipt["spool_ids"].as_array().unwrap();
    assert_eq!(ids.len(), 2);
    assert_ne!(ids[0], ids[1]);
    for id in ids {
        let spool_id = id.as_str().unwrap();
        let spool = db.get_spool_by_id(spool_id).unwrap().unwrap();
        assert_eq!(spool.ownership_type, "BORROWED_IN");
        assert_eq!(spool.initial_weight_g, Some(850));
        assert!(spool.location_id.is_some());
        assert_eq!(spool.location_id, spool.home_location_id);
        assert_eq!(db.list_spool_history_events(spool_id, 10).unwrap().len(), 2);
    }
    let committed = snapshot(&db);
    let (status, replay) = post_batch(&router, Some(&session), &payload).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(replay, receipt);
    assert_eq!(
        snapshot(&db),
        committed,
        "replay must not add spools, loans, history or revisions"
    );
    let mut mismatch = payload;
    mismatch["initial_weight_g"] = 900.into();
    let (status, error) = post_batch(&router, Some(&session), &mismatch).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(error["code"], "inventory.batch.conflict");
    assert_eq!(snapshot(&db), committed);
    drop(router);
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn companion_catalog_batch_auth_and_persisted_role_fail_closed() {
    let path = temp_db_path("catalog-batch-authority");
    seed_db(&path).unwrap();
    let db = FilamentDatabase::open(&path).unwrap();
    let master_id = db.get_spool_by_id("spool_1").unwrap().unwrap().master_id;
    let router = build_router(test_state(&path));
    let payload = batch_payload(&master_id);
    let before = snapshot(&db);
    assert_eq!(
        post_batch(&router, None, &payload).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(snapshot(&db), before);
    let session = pair_test_session(&router, &path).await.unwrap();
    db.set_setting("library_sync_mode", "CLIENT").unwrap();
    assert_eq!(
        post_batch(&router, Some(&session), &payload).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(snapshot(&db), before);
    drop(router);
    drop(db);
    std::fs::remove_file(path).unwrap();
}
