use super::*;
use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::inventory_engine::CreateWishlistItemInput;

const ORDER_ID: &str = "receipt-lost-response";

async fn receive(
    router: &Router,
    session: &AuthenticatedTestSession,
    body: &'static str,
) -> axum::response::Response {
    router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/wishlist/{ORDER_ID}/receive-idempotent"))
                .header("content-type", "application/json")
                .header("host", "127.0.0.1:4278")
                .header("origin", "http://127.0.0.1:4278")
                .header(
                    "cookie",
                    format!("bfm_companion_session={}", session.session_cookie),
                )
                .header(COMPANION_CSRF_HEADER, &session.csrf_token)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap()
}

#[tokio::test]
async fn losing_the_committed_response_does_not_receive_a_second_roll() {
    let path = temp_db_path("wishlist-receipt-retry");
    seed_db(&path).unwrap();
    let engine = InventoryEngine::new(FilamentDatabase::open(&path).unwrap());
    let initial_spool_count = engine.list_spools(20, 0).unwrap().len();
    engine
        .create_wishlist_item(CreateWishlistItemInput {
            id: ORDER_ID.to_string(),
            master_id: None,
            material: "PETG".to_string(),
            filament_name: "Receipt test".to_string(),
            color_name: "Grey".to_string(),
            vendor: None,
            quantity: Some(2),
            note: None,
        })
        .unwrap();
    drop(engine);

    let router = build_router(test_state(&path));
    let session = pair_test_session(&router, &path).await.unwrap();
    let missing_id = receive(&router, &session, r#"{"quantity":1}"#).await;
    assert_eq!(missing_id.status(), StatusCode::BAD_REQUEST);
    let missing_id: serde_json::Value =
        serde_json::from_slice(&to_bytes(missing_id.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    assert_eq!(missing_id["code"], "wishlist.receive.request_id_invalid");

    let request = r#"{"request_id":"may-have-committed","quantity":1}"#;
    let initial_response = receive(&router, &session, request).await;
    assert_eq!(initial_response.status(), StatusCode::OK);
    drop(initial_response);
    drop(router);

    let router = build_router(test_state(&path));
    let session = pair_test_session(&router, &path).await.unwrap();
    let repeat = receive(&router, &session, request).await;
    assert_eq!(repeat.status(), StatusCode::OK);
    let receipt: WishlistReceiptResult =
        serde_json::from_slice(&to_bytes(repeat.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(receipt.received_quantity, 1);
    assert_eq!(receipt.remaining_quantity, 1);
    assert_eq!(receipt.spool_ids.len(), 1);

    let conflict = receive(
        &router,
        &session,
        r#"{"request_id":"may-have-committed","quantity":2}"#,
    )
    .await;
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    let conflict: serde_json::Value =
        serde_json::from_slice(&to_bytes(conflict.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(conflict["code"], "wishlist.receive.request_conflict");

    let oversized = receive(
        &router,
        &session,
        r#"{"request_id":"too-many","quantity":9223372036854775807}"#,
    )
    .await;
    assert_eq!(oversized.status(), StatusCode::BAD_REQUEST);
    let oversized: serde_json::Value =
        serde_json::from_slice(&to_bytes(oversized.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    assert_eq!(oversized["code"], "wishlist.receive.quantity_too_large");

    let engine = InventoryEngine::new(FilamentDatabase::open(&path).unwrap());
    assert_eq!(engine.list_wishlist_items(1).unwrap()[0].quantity, 1);
    assert_eq!(
        engine.list_spools(20, 0).unwrap().len(),
        initial_spool_count + 1
    );
    assert_eq!(
        engine
            .list_spool_history(&receipt.spool_ids[0], 10)
            .unwrap()
            .iter()
            .filter(|event| event.event_type == "PURCHASE_RECEIPT_RECORDED")
            .count(),
        1
    );
    drop(engine);
    drop(router);
    let _ = std::fs::remove_file(path);
}
