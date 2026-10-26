use super::*;
use crate::companion_access_recovery_api::access_request_scope;
use crate::trusted_lan_access_request_commands::{decide_access_request, list_access_requests};

#[test]
fn access_recovery_revoke_all_also_cancels_pending_host_approvals() {
    let path = temp_db_path("access-revoke-all");
    seed_db(&path).unwrap();
    let state = test_state(&path);
    state.runtime.mark_running();
    let host = AppState {
        db_path: state.db_path.clone(),
        companion: CompanionRuntimeState::new(state.runtime.clone()),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    let db = FilamentDatabase::open(&path).unwrap();
    let scope = access_request_scope(&state.db_path, &db.get_library_sync_library_id().unwrap());
    let (_, credential) = state
        .runtime
        .access_recovery
        .create(&scope, None, "Phone", "Safari", std::time::Instant::now())
        .unwrap();
    let credential = credential.unwrap();
    decide_access_request(&host, credential.split('.').next().unwrap(), true).unwrap();
    crate::trusted_lan_browser_revoke_all_commands::revoke_all_browsers(&host).unwrap();
    assert!(state
        .runtime
        .access_recovery
        .status(&scope, &credential, std::time::Instant::now())
        .is_err());
    assert!(list_access_requests(&host).unwrap().is_empty());
    let _ = std::fs::remove_file(path);
}

async fn recovery_post(
    router: &Router,
    path: &str,
    cookie: Option<&str>,
    body: &str,
) -> axum::response::Response {
    let mut request = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/auth/recovery/{path}"))
        .header("host", "127.0.0.1:4278")
        .header("origin", "http://127.0.0.1:4278")
        .header("x-bfm-access-request", "1")
        .header("content-type", "application/json");
    if let Some(cookie) = cookie {
        request = request.header("cookie", cookie);
    }
    router
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap()
}
async fn json(response: axum::response::Response) -> serde_json::Value {
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

#[tokio::test]
async fn access_recovery_http_approval_confirmation_sliding_year_and_revocation() {
    let path = temp_db_path("access-recovery");
    seed_db(&path).unwrap();
    let state = test_state(&path);
    let router = build_router(state.clone());
    state.runtime.mark_running();
    let host = AppState {
        db_path: state.db_path.clone(),
        companion: CompanionRuntimeState::new(state.runtime.clone()),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    let start = recovery_post(&router, "request", None, r#"{"device_name":"My iPhone"}"#).await;
    assert_eq!(start.status(), StatusCode::OK);
    assert_no_store(start.headers());
    let cookie = format!(
        "bfm_companion_access_request={}",
        extract_named_cookie(start.headers(), "bfm_companion_access_request").unwrap()
    );
    let raw = start
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .next()
        .unwrap()
        .to_str()
        .unwrap();
    assert!(raw.contains("HttpOnly; SameSite=Strict; Path=/api/v1/auth/recovery"));
    let status = json(start).await;
    assert_eq!(status["status"], "pending");
    assert!(status.get("confirmation_code").is_none());
    let row = list_access_requests(&host).unwrap().remove(0);
    let denied = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/inventory/spools")
                .header("host", "127.0.0.1:4278")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let approval = decide_access_request(&host, &row.id, true).unwrap();
    let code = approval.confirmation_code.unwrap();
    assert_eq!(
        recovery_post(&router, "confirm", None, &format!(r#"{{"code":"{code}"}}"#))
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let polled = json(recovery_post(&router, "status", Some(&cookie), "").await).await;
    assert_eq!(polled["status"], "approved");
    assert!(polled.get("confirmation_code").is_none());
    let grant = recovery_post(
        &router,
        "confirm",
        Some(&cookie),
        &format!(r#"{{"code":"{code}"}}"#),
    )
    .await;
    assert_eq!(grant.status(), StatusCode::OK);
    let session = format!(
        "{COMPANION_SESSION_COOKIE}={}",
        extract_named_cookie(grant.headers(), COMPANION_SESSION_COOKIE).unwrap()
    );
    let device = format!(
        "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={}",
        extract_named_cookie(grant.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE).unwrap()
    );
    assert!(grant
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .any(|v| v.to_str().unwrap().contains("Max-Age=31536000")));
    assert_eq!(json(grant).await["ok"], true);
    let renew = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/renew")
                .header("host", "127.0.0.1:4278")
                .header("origin", "http://127.0.0.1:4278")
                .header("cookie", &device)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(renew.status(), StatusCode::OK);
    assert!(renew
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .any(|v| v.to_str().unwrap().contains("Max-Age=31536000")));
    let replay = json(
        recovery_post(
            &router,
            "confirm",
            Some(&cookie),
            &format!(r#"{{"code":"{code}"}}"#),
        )
        .await,
    )
    .await;
    assert_eq!(replay["status"], "completed");
    let db = FilamentDatabase::open(&path).unwrap();
    let browser = db.list_trusted_lan_paired_browsers().unwrap().remove(0);
    db.revoke_trusted_lan_paired_browser(&browser.id).unwrap();
    let denied = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/inventory/spools")
                .header("host", "127.0.0.1:4278")
                .header("cookie", session)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let denied = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/renew")
                .header("host", "127.0.0.1:4278")
                .header("origin", "http://127.0.0.1:4278")
                .header("cookie", device)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn access_recovery_http_rejects_foreign_origins_missing_headers_and_remote_approval() {
    let path = temp_db_path("access-origin");
    seed_db(&path).unwrap();
    let state = test_state(&path);
    let router = build_router(state.clone());
    for (origin, custom) in [
        ("http://attacker.example", true),
        ("http://127.0.0.1:4278", false),
    ] {
        let mut req = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/recovery/request")
            .header("host", "127.0.0.1:4278")
            .header("origin", origin)
            .header("content-type", "application/json");
        if custom {
            req = req.header("x-bfm-access-request", "1");
        }
        let response = router
            .clone()
            .oneshot(req.body(Body::from(r#"{"device_name":"Phone"}"#)).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    assert_eq!(
        recovery_post(&router, "approve", None, r#"{"approve":true}"#)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    let _ = std::fs::remove_file(path);
}

#[test]
fn access_recovery_native_client_role_and_library_switch_cannot_approve() {
    let path = temp_db_path("access-client");
    seed_db(&path).unwrap();
    let state = test_state(&path);
    state.runtime.mark_running();
    let db = FilamentDatabase::open(&path).unwrap();
    let scope = access_request_scope(&state.db_path, &db.get_library_sync_library_id().unwrap());
    let (_, credential) = state
        .runtime
        .access_recovery
        .create(&scope, None, "Phone", "Safari", std::time::Instant::now())
        .unwrap();
    let credential = credential.unwrap();
    let id = credential.split('.').next().unwrap();
    let host = AppState {
        db_path: state.db_path.clone(),
        companion: CompanionRuntimeState::new(state.runtime.clone()),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    db.set_setting("library_sync_mode", "CLIENT").unwrap();
    assert!(decide_access_request(&host, id, true).is_err());
    assert!(crate::trusted_lan_browser_revoke_all_commands::revoke_all_browsers(&host).is_err());
    assert!(list_access_requests(&host).is_err());
    db.set_setting("library_sync_mode", "HOST").unwrap();
    db.set_setting("library_sync_library_id", "replacement")
        .unwrap();
    assert!(decide_access_request(&host, id, true).is_err());
    let _ = std::fs::remove_file(path);
}
