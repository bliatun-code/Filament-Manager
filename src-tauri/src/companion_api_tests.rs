use super::{companion_browser_assets, hash_secret, CompanionApiState};
use crate::app_services::CompanionService;
use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreatePrinterInput, InventoryEngine, LendSpoolInput,
};
use crate::companion_http::COMPANION_CSRF_HEADER;
use crate::companion_payload::{build_companion_spool_qr_payload, build_qr_svg};
use crate::companion_routes::build_router;
use crate::companion_session::{COMPANION_SESSION_COOKIE, COMPANION_TRUSTED_LAN_DEVICE_COOKIE};
use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
use crate::state::TrustedLanCompanionRuntime;
use axum::body::{to_bytes, Body};
use axum::http::{header::SET_COOKIE, HeaderMap, Request, StatusCode};
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "filament-manager-companion-api-{test_name}-{nanos}.db"
    ))
}

fn companion_browser_relative_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for (needle, terminator) in [
        ("from \"./", '"'),
        ("from './", '\''),
        ("import(\"./", '"'),
        ("import('./", '\''),
    ] {
        for tail in content.split(needle).skip(1) {
            if let Some(end_index) = tail.find(terminator) {
                let import_path = &tail[..end_index];
                if import_path.ends_with(".js") {
                    imports.push(import_path.to_string());
                }
            }
        }
    }
    imports
}

fn seed_db(db_path: &Path) -> Result<(), String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    db.apply_schema().map_err(|error| error.to_string())?;
    let engine = InventoryEngine::new(db);
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: "spool_1".to_string(),
            material: "PLA".to_string(),
            filament_name: "Basic".to_string(),
            color_name: "White".to_string(),
            hex_color: Some("#ffffff".to_string()),
            product_url: None,
            vendor: Some("Manual".to_string()),
            default_weight_g: Some(1000),
            qr_code: Some("qr-1".to_string()),
            status: Some("IN_STOCK".to_string()),
            ownership_type: Some("OWNED".to_string()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            location: Some("Shelf".to_string()),
        })
        .map_err(|error| error.to_string())?;
    engine
        .create_manual_spool(CreateManualSpoolInput {
            id: "spool_2".to_string(),
            material: "PLA".to_string(),
            filament_name: "Matte".to_string(),
            color_name: "Black".to_string(),
            hex_color: Some("#111111".to_string()),
            product_url: None,
            vendor: Some("Manual".to_string()),
            default_weight_g: Some(1000),
            qr_code: Some("qr-2".to_string()),
            status: Some("IN_STOCK".to_string()),
            ownership_type: Some("OWNED".to_string()),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            location: Some("Shelf".to_string()),
        })
        .map_err(|error| error.to_string())?;
    engine
        .create_printer(CreatePrinterInput {
            id: "printer_1".to_string(),
            model: "Bambu X1C".to_string(),
            name: "Bench Printer".to_string(),
            ams_units: Some(1),
            slots_per_ams: Some(1),
        })
        .map_err(|error| error.to_string())
}

fn trusted_lan_runtime_for_address(address: &str) -> TrustedLanCompanionRuntime {
    let runtime = TrustedLanCompanionRuntime::new(4278)
        .with_selected_interface("Test interface", address)
        .with_enabled(true);
    runtime.mark_running();
    runtime
}

fn test_state(db_path: &Path) -> CompanionApiState {
    CompanionApiState::new(
        db_path.to_string_lossy().to_string(),
        trusted_lan_runtime_for_address("127.0.0.1"),
        CredentialStore::in_memory(),
    )
}

fn qa_test_state(db_path: &Path) -> CompanionApiState {
    CompanionApiState::new(
        db_path.to_string_lossy().to_string(),
        trusted_lan_runtime_for_address("127.0.0.1").with_qa_mode(true),
        CredentialStore::in_memory(),
    )
}

fn trusted_lan_test_state(db_path: &Path) -> CompanionApiState {
    CompanionApiState::new(
        db_path.to_string_lossy().to_string(),
        trusted_lan_runtime_for_address("192.168.1.50"),
        CredentialStore::in_memory(),
    )
}

fn extract_cookie_value(set_cookie: &str) -> Result<String, String> {
    let cookie_pair = set_cookie
        .split(';')
        .next()
        .ok_or_else(|| "missing cookie pair".to_string())?;
    let (_, value) = cookie_pair
        .split_once('=')
        .ok_or_else(|| "missing cookie value".to_string())?;
    Ok(value.to_string())
}

fn extract_named_cookie(headers: &HeaderMap, cookie_name: &str) -> Result<String, String> {
    for header_value in headers.get_all(SET_COOKIE).iter() {
        let set_cookie = header_value
            .to_str()
            .map_err(|error| format!("invalid Set-Cookie header: {error}"))?;
        let cookie_pair = set_cookie
            .split(';')
            .next()
            .ok_or_else(|| "missing cookie pair".to_string())?;
        let (name, _) = cookie_pair
            .split_once('=')
            .ok_or_else(|| "missing cookie value".to_string())?;
        if name == cookie_name {
            return extract_cookie_value(set_cookie);
        }
    }

    Err(format!("missing {cookie_name} cookie"))
}

fn assert_no_store(headers: &HeaderMap) {
    let cache_control = headers
        .get(axum::http::header::CACHE_CONTROL)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    assert!(
        cache_control.contains("no-store"),
        "expected no-store, got {cache_control:?}"
    );
    assert_eq!(
        headers
            .get(axum::http::header::PRAGMA)
            .and_then(|value| value.to_str().ok()),
        Some("no-cache")
    );
}

struct AuthenticatedTestSession {
    session_cookie: String,
    csrf_token: String,
}

async fn pair_test_session(
    router: &axum::Router,
    db_path: &Path,
) -> Result<AuthenticatedTestSession, String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let pairing_token = format!("pairing-{}", hash_secret(&db_path.to_string_lossy()));
    db.create_trusted_lan_pairing(Some("Test Browser"), &hash_secret(&pairing_token), 600)
        .map_err(|error| error.to_string())?;

    let pair = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/pair")
                .header("content-type", "application/json")
                .header("host", "127.0.0.1:4278")
                .header("origin", "http://127.0.0.1:4278")
                .body(Body::from(format!(
                    r#"{{"pairing_token":"{pairing_token}"}}"#
                )))
                .map_err(|error| error.to_string())?,
        )
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(pair.status(), StatusCode::OK);
    assert_no_store(pair.headers());

    let session_cookie = extract_named_cookie(pair.headers(), COMPANION_SESSION_COOKIE)?;
    let _device_cookie = extract_named_cookie(pair.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE)?;
    let pair_body = to_bytes(pair.into_body(), usize::MAX)
        .await
        .map_err(|error| error.to_string())?;
    let pair_body_text =
        String::from_utf8(pair_body.to_vec()).map_err(|error| error.to_string())?;
    let csrf_token = extract_csrf_token(&pair_body_text)?;

    Ok(AuthenticatedTestSession {
        session_cookie,
        csrf_token,
    })
}

fn extract_csrf_token(body_text: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    parsed
        .get("csrf_token")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "missing csrf_token".to_string())
}

fn extract_first_slot_id(body_text: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    parsed
        .get(0)
        .and_then(|printer| printer.get("slots"))
        .and_then(|slots| slots.get(0))
        .and_then(|slot| slot.get("slot_id"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "missing slot_id".to_string())
}

fn extract_loan_id(body_text: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    parsed
        .get("loan")
        .and_then(|loan| loan.get("id"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "missing loan.id".to_string())
}

fn extract_active_loan_id_from_spool_detail(body_text: &str) -> Result<Option<String>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    Ok(parsed
        .get("active_loan")
        .and_then(|loan| loan.get("loan"))
        .and_then(|loan| loan.get("id"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string()))
}

fn extract_active_loan_ids(body_text: &str) -> Result<Vec<String>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    let rows = parsed
        .as_array()
        .ok_or_else(|| "active loans response was not an array".to_string())?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            row.get("loan")
                .and_then(|loan| loan.get("id"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .collect())
}

fn extract_loan_statuses(body_text: &str) -> Result<Vec<String>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    let rows = parsed
        .as_array()
        .ok_or_else(|| "loan response was not an array".to_string())?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            row.get("loan")
                .and_then(|loan| loan.get("loan_status"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .collect())
}

fn extract_loan_directions(body_text: &str) -> Result<Vec<String>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    let rows = parsed
        .as_array()
        .ok_or_else(|| "loan response was not an array".to_string())?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            row.get("loan")
                .and_then(|loan| loan.get("loan_direction"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .collect())
}

fn extract_spool_id(body_text: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    parsed
        .get("spool_id")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "missing spool_id".to_string())
}

fn extract_wishlist_item_id(body_text: &str, filament_name: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_text).map_err(|error| error.to_string())?;
    let rows = parsed
        .as_array()
        .ok_or_else(|| "wishlist response was not an array".to_string())?;
    rows.iter()
        .find(|row| {
            row.get("filament_name")
                .and_then(|value| value.as_str())
                .map(|value| value == filament_name)
                .unwrap_or(false)
        })
        .and_then(|row| row.get("id"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "missing wishlist item id".to_string())
}

#[tokio::test]
async fn companion_api_pairs_session_and_requires_csrf_for_writes() {
    let db_path = temp_db_path("paired-session");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let authorized_read = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(authorized_read.status(), StatusCode::OK);

        let initial_history = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans?include_returned=true")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(initial_history.status(), StatusCode::OK);
        let initial_history_body = to_bytes(initial_history.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let initial_history_text =
            String::from_utf8(initial_history_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(extract_loan_statuses(&initial_history_text)?.is_empty());

        let printer_overview = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/printers/overview")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(printer_overview.status(), StatusCode::OK);
        let printer_body = to_bytes(printer_overview.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let printer_text =
            String::from_utf8(printer_body.to_vec()).map_err(|error| error.to_string())?;
        let slot_id = extract_first_slot_id(&printer_text)?;

        let active_loans_before_lend = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans/active")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans_before_lend.status(), StatusCode::OK);
        let active_loans_before_lend_body =
            to_bytes(active_loans_before_lend.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
        let active_loans_before_lend_text =
            String::from_utf8(active_loans_before_lend_body.to_vec())
                .map_err(|error| error.to_string())?;
        assert!(extract_active_loan_ids(&active_loans_before_lend_text)?.is_empty());

        let forbidden_write = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/weight")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::from(r#"{"grams":740}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(forbidden_write.status(), StatusCode::FORBIDDEN);

        let successful_write = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/weight")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"grams":740}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(successful_write.status(), StatusCode::OK);

        let assign_slot = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                    ))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"spool_id":"spool_1"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(assign_slot.status(), StatusCode::OK);

        let replace_slot = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                    ))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"spool_id":"spool_2"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(replace_slot.status(), StatusCode::BAD_REQUEST);

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"remaining_g\":740"));
        assert!(detail_text.contains("\"status\":\"ASSIGNED\""));

        let clear_slot = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                    ))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"spool_id":null}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(clear_slot.status(), StatusCode::OK);

        let lend_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/lend")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"borrower_name":"Alice","grams_out":690,"note":"Prototype batch"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(lend_spool.status(), StatusCode::OK);

        let lend_body = to_bytes(lend_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let lend_text = String::from_utf8(lend_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(lend_text.contains("\"message\":\"Spool loan created\""));
        assert!(lend_text.contains("\"borrower_name\":\"Alice\""));
        assert!(lend_text.contains("\"grams_out\":690"));
        let loan_id = extract_loan_id(&lend_text)?;

        let active_loans_after_lend = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans/active")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans_after_lend.status(), StatusCode::OK);
        let active_loans_after_lend_body =
            to_bytes(active_loans_after_lend.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
        let active_loans_after_lend_text = String::from_utf8(active_loans_after_lend_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert_eq!(
            extract_active_loan_ids(&active_loans_after_lend_text)?,
            vec![loan_id.clone()]
        );

        let history_after_lend = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans?include_returned=true")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(history_after_lend.status(), StatusCode::OK);
        let history_after_lend_body = to_bytes(history_after_lend.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let history_after_lend_text = String::from_utf8(history_after_lend_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert_eq!(
            extract_loan_statuses(&history_after_lend_text)?,
            vec!["ACTIVE".to_string()]
        );

        let borrowed_detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(borrowed_detail.status(), StatusCode::OK);
        let borrowed_detail_body = to_bytes(borrowed_detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let borrowed_detail_text =
            String::from_utf8(borrowed_detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(borrowed_detail_text.contains("\"status\":\"BORROWED\""));
        assert_eq!(
            extract_active_loan_id_from_spool_detail(&borrowed_detail_text)?,
            Some(loan_id.clone())
        );

        let return_loan = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/loans/{loan_id}/return"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"returned_grams":660,"note":"Returned after prototype"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(return_loan.status(), StatusCode::OK);
        let return_body = to_bytes(return_loan.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let return_text =
            String::from_utf8(return_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(return_text.contains("\"message\":\"Spool loan returned\""));
        assert!(return_text.contains("\"returned_grams\":660"));

        let returned_detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(returned_detail.status(), StatusCode::OK);
        let returned_detail_body = to_bytes(returned_detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let returned_detail_text =
            String::from_utf8(returned_detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(returned_detail_text.contains("\"status\":\"IN_STOCK\""));
        assert!(returned_detail_text.contains("\"remaining_g\":660"));
        assert_eq!(
            extract_active_loan_id_from_spool_detail(&returned_detail_text)?,
            None
        );

        let active_loans_after_return = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans/active")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans_after_return.status(), StatusCode::OK);
        let active_loans_after_return_body =
            to_bytes(active_loans_after_return.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
        let active_loans_after_return_text =
            String::from_utf8(active_loans_after_return_body.to_vec())
                .map_err(|error| error.to_string())?;
        assert!(extract_active_loan_ids(&active_loans_after_return_text)?.is_empty());

        let history_after_return = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans?include_returned=true")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(history_after_return.status(), StatusCode::OK);
        let history_after_return_body = to_bytes(history_after_return.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let history_after_return_text = String::from_utf8(history_after_return_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert_eq!(
            extract_loan_statuses(&history_after_return_text)?,
            vec!["RETURNED".to_string()]
        );

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_pairs_session_and_requires_csrf_for_writes failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_trusted_lan_requires_exact_host_and_pairing() {
    let db_path = temp_db_path("trusted-lan-session-status");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let session_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(session_status.status(), StatusCode::OK);
        let session_status_body = to_bytes(session_status.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let session_status_text =
            String::from_utf8(session_status_body.to_vec()).map_err(|error| error.to_string())?;
        let session_status_json: serde_json::Value =
            serde_json::from_str(&session_status_text).map_err(|error| error.to_string())?;
        assert_eq!(
            session_status_json
                .get("auth_mode")
                .and_then(|value| value.as_str()),
            Some("pairing-session")
        );
        assert_eq!(
            session_status_json
                .get("access_mode")
                .and_then(|value| value.as_str()),
            Some("trusted-lan")
        );
        assert_eq!(
            session_status_json
                .get("authenticated")
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            session_status_json
                .get("can_renew")
                .and_then(|value| value.as_bool()),
            Some(false)
        );

        let protected_read = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools")
                    .header("host", "192.168.1.50:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(protected_read.status(), StatusCode::FORBIDDEN);

        let localhost_health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .header("host", "localhost:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(localhost_health.status(), StatusCode::FORBIDDEN);

        let missing_host_health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(missing_host_health.status(), StatusCode::FORBIDDEN);

        let localhost_pair = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/pair")
                    .header("content-type", "application/json")
                    .header("host", "localhost:4278")
                    .header("origin", "http://localhost:4278")
                    .body(Body::from(r#"{"pairing_token":"unused-token"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(localhost_pair.status(), StatusCode::FORBIDDEN);

        let host_health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(host_health.status(), StatusCode::OK);
        let host_health_body = to_bytes(host_health.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let host_health_text =
            String::from_utf8(host_health_body.to_vec()).map_err(|error| error.to_string())?;
        let host_health_json: serde_json::Value =
            serde_json::from_str(&host_health_text).map_err(|error| error.to_string())?;
        assert_eq!(
            host_health_json
                .get("access_mode")
                .and_then(|value| value.as_str()),
            Some("trusted-lan")
        );
        assert!(host_health_json
            .get("library_id")
            .and_then(|value| value.as_str())
            .is_some());
        assert!(host_health_json
            .get("device_name")
            .and_then(|value| value.as_str())
            .is_some());

        let removed_bootstrap_route = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/bootstrap")
                    .header("content-type", "application/json")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .body(Body::from("{}"))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(removed_bootstrap_route.status(), StatusCode::NOT_FOUND);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_trusted_lan_requires_exact_host_and_pairing failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_library_reads_require_an_active_session() {
    let db_path = temp_db_path("trusted-lan-library-read-auth");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));
        let library_paths = [
            "/api/v1/library/revisions",
            "/api/v1/library/snapshot",
            "/api/v1/library/spools?limit=10&offset=0",
            "/api/v1/library/printers",
            "/api/v1/library/printer-settings",
            "/api/v1/library/loans?limit=10",
            "/api/v1/library/statistics/filament-consumption?limit=10",
            "/api/v1/library/catalog/masters?limit=10",
            "/api/v1/library/wishlist?limit=10",
        ];

        let health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(health.status(), StatusCode::OK);

        for path in library_paths {
            let missing_session = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header("host", "127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(
                missing_session.status(),
                StatusCode::UNAUTHORIZED,
                "{path} must reject requests without a session"
            );

            let invalid_session = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", "bfm_companion_session=invalid-session")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(
                invalid_session.status(),
                StatusCode::UNAUTHORIZED,
                "{path} must reject invalid sessions"
            );
        }

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;
        for path in library_paths {
            let valid_session = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(
                valid_session.status(),
                StatusCode::OK,
                "{path} must accept an active session"
            );
        }

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_library_reads_require_an_active_session failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_library_revisions_require_auth_and_advance_after_writes() {
    let db_path = temp_db_path("library-revisions");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/revisions")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        assert_no_store(unauthorized.headers());

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
        } = pair_test_session(&router, &db_path).await?;
        let initial = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/revisions")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(initial.status(), StatusCode::OK);
        assert_no_store(initial.headers());
        let initial_body = to_bytes(initial.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let initial_revisions: serde_json::Value =
            serde_json::from_slice(&initial_body).map_err(|error| error.to_string())?;
        assert!(initial_revisions["library_id"].as_str().is_some());
        let initial_inventory = initial_revisions["inventory"]
            .as_i64()
            .ok_or_else(|| "inventory revision missing".to_string())?;

        let write = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/weight")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, csrf_token)
                    .body(Body::from(r#"{"grams":825}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(write.status(), StatusCode::OK);

        let current = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/revisions")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(current.status(), StatusCode::OK);
        assert_no_store(current.headers());
        let current_body = to_bytes(current.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let current_revisions: serde_json::Value =
            serde_json::from_slice(&current_body).map_err(|error| error.to_string())?;
        assert!(current_revisions["inventory"].as_i64().unwrap_or_default() > initial_inventory);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_library_revisions_require_auth_and_advance_after_writes failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_library_snapshot_exposes_host_summary() {
    let db_path = temp_db_path("trusted-lan-library-snapshot");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));
        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let snapshot_response = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/snapshot")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(snapshot_response.status(), StatusCode::OK);

        let snapshot_body = to_bytes(snapshot_response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let snapshot_text =
            String::from_utf8(snapshot_body.to_vec()).map_err(|error| error.to_string())?;
        let snapshot_json: serde_json::Value =
            serde_json::from_str(&snapshot_text).map_err(|error| error.to_string())?;

        assert_eq!(
            snapshot_json.get("ok").and_then(|value| value.as_bool()),
            Some(true)
        );
        assert!(snapshot_json
            .get("captured_at")
            .and_then(|value| value.as_str())
            .is_some());
        assert!(snapshot_json
            .get("library_id")
            .and_then(|value| value.as_str())
            .is_some());
        assert!(snapshot_json
            .get("device_name")
            .and_then(|value| value.as_str())
            .is_some());
        assert_eq!(
            snapshot_json
                .get("sync_mode")
                .and_then(|value| value.as_str()),
            Some("STANDALONE")
        );
        assert_eq!(
            snapshot_json
                .get("active_loans")
                .and_then(|value| value.as_i64()),
            Some(0)
        );
        assert_eq!(
            snapshot_json
                .get("printers")
                .and_then(|value| value.as_i64()),
            Some(1)
        );
        assert_eq!(
            snapshot_json
                .get("inventory")
                .and_then(|value| value.get("total_spools"))
                .and_then(|value| value.as_i64()),
            Some(2)
        );
        assert_eq!(
            snapshot_json
                .get("inventory")
                .and_then(|value| value.get("low_stock"))
                .and_then(|value| value.as_i64()),
            Some(0)
        );

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_library_snapshot_exposes_host_summary failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_trusted_lan_pairs_renews_and_revokes_browser_sessions() {
    let db_path = temp_db_path("trusted-lan-pair-renew-revoke");
    let result = async {
        seed_db(&db_path)?;
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        let pairing_token = "trusted-lan-pairing-token";
        db.create_trusted_lan_pairing(
            Some("Safari on iPad"),
            &hash_secret(pairing_token),
            600,
        )
        .map_err(|error| error.to_string())?;

        let state = trusted_lan_test_state(&db_path);
        let router = build_router(state.clone());

        let pair = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/pair")
                    .header("content-type", "application/json")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .body(Body::from(format!(
                        r#"{{"pairing_token":"{pairing_token}"}}"#
                    )))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(pair.status(), StatusCode::OK);
        let session_cookie = extract_named_cookie(pair.headers(), COMPANION_SESSION_COOKIE)?;
        let device_cookie =
            extract_named_cookie(pair.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE)?;
        let pair_body = to_bytes(pair.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let pair_body_text =
            String::from_utf8(pair_body.to_vec()).map_err(|error| error.to_string())?;
        let initial_csrf_token = extract_csrf_token(&pair_body_text)?;

        let second_pair = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/pair")
                    .header("content-type", "application/json")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .body(Body::from(format!(
                        r#"{{"pairing_token":"{pairing_token}"}}"#
                    )))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(second_pair.status(), StatusCode::UNAUTHORIZED);

        let authenticated_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_SESSION_COOKIE}={session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(authenticated_status.status(), StatusCode::OK);
        let authenticated_status_body =
            to_bytes(authenticated_status.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
        let authenticated_status_text =
            String::from_utf8(authenticated_status_body.to_vec())
                .map_err(|error| error.to_string())?;
        let authenticated_status_json: serde_json::Value =
            serde_json::from_str(&authenticated_status_text)
                .map_err(|error| error.to_string())?;
        assert_eq!(
            authenticated_status_json
                .get("authenticated")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            authenticated_status_json
                .get("access_mode")
                .and_then(|value| value.as_str()),
            Some("trusted-lan")
        );

        let paired_browsers = db
            .list_trusted_lan_paired_browsers()
            .map_err(|error| error.to_string())?;
        assert_eq!(paired_browsers.len(), 1);
        assert_eq!(
            paired_browsers[0].display_name.as_deref(),
            Some("Safari on iPad")
        );
        assert_eq!(
            paired_browsers[0].last_origin.as_deref(),
            Some("http://192.168.1.50:4278")
        );
        let paired_browser_id = paired_browsers[0].id.clone();

        state
            .sessions
            .clear()
            .map_err(|_| "Failed to clear session state".to_string())?;

        let renewable_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(renewable_status.status(), StatusCode::OK);
        let renewable_status_body = to_bytes(renewable_status.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let renewable_status_text = String::from_utf8(renewable_status_body.to_vec())
            .map_err(|error| error.to_string())?;
        let renewable_status_json: serde_json::Value =
            serde_json::from_str(&renewable_status_text).map_err(|error| error.to_string())?;
        assert_eq!(
            renewable_status_json
                .get("authenticated")
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            renewable_status_json
                .get("can_renew")
                .and_then(|value| value.as_bool()),
            Some(true)
        );

        let renew = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/renew")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(renew.status(), StatusCode::OK);
        let renewed_session_cookie =
            extract_named_cookie(renew.headers(), COMPANION_SESSION_COOKIE)?;
        let renew_body = to_bytes(renew.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let renew_body_text =
            String::from_utf8(renew_body.to_vec()).map_err(|error| error.to_string())?;
        let renewed_csrf_token = extract_csrf_token(&renew_body_text)?;
        assert_ne!(renewed_csrf_token, initial_csrf_token);

        let renewed_write = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/weight")
                    .header("content-type", "application/json")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_SESSION_COOKIE}={renewed_session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .header(COMPANION_CSRF_HEADER, &renewed_csrf_token)
                    .body(Body::from(r#"{"grams":735}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(renewed_write.status(), StatusCode::OK);

        db.revoke_trusted_lan_paired_browser(&paired_browser_id)
            .map_err(|error| error.to_string())?;

        let revoked_active_session_read = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/snapshot")
                    .header("host", "192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_SESSION_COOKIE}={renewed_session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(
            revoked_active_session_read.status(),
            StatusCode::UNAUTHORIZED
        );

        state
            .sessions
            .clear()
            .map_err(|_| "Failed to clear session state".to_string())?;

        let revoked_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(revoked_status.status(), StatusCode::OK);
        let revoked_status_body = to_bytes(revoked_status.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let revoked_status_text = String::from_utf8(revoked_status_body.to_vec())
            .map_err(|error| error.to_string())?;
        let revoked_status_json: serde_json::Value =
            serde_json::from_str(&revoked_status_text).map_err(|error| error.to_string())?;
        assert_eq!(
            revoked_status_json
                .get("authenticated")
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            revoked_status_json
                .get("can_renew")
                .and_then(|value| value.as_bool()),
            Some(false)
        );

        let denied_renew = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/renew")
                    .header("host", "192.168.1.50:4278")
                    .header("origin", "http://192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(denied_renew.status(), StatusCode::UNAUTHORIZED);

        let revoked_session_read = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/snapshot")
                    .header("host", "192.168.1.50:4278")
                    .header(
                        "cookie",
                        format!(
                            "{COMPANION_SESSION_COOKIE}={renewed_session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                        ),
                    )
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(revoked_session_read.status(), StatusCode::UNAUTHORIZED);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_api_trusted_lan_pairs_renews_and_revokes_browser_sessions failed: {message}"
        );
    }
}

#[tokio::test]
async fn companion_api_exports_full_backup_from_protected_route() {
    let db_path = temp_db_path("protected-full-backup");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/backup/full")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;
        let backup = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/backup/full")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(backup.status(), StatusCode::OK);

        let body = to_bytes(backup.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let body_text = String::from_utf8(body.to_vec()).map_err(|error| error.to_string())?;
        let parsed: serde_json::Value =
            serde_json::from_str(&body_text).map_err(|error| error.to_string())?;
        let backup_content = parsed
            .get("content")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "missing backup content".to_string())?;
        assert!(backup_content.contains("\"filament_spools\""));
        assert!(backup_content.contains("\"spool_1\""));
        assert!(backup_content.contains("\"printer_1\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_exports_full_backup_from_protected_route failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_qa_route_can_expire_sessions() {
    let db_path = temp_db_path("qa-expire-session");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(qa_test_state(&db_path));

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let library_snapshot_before = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/snapshot")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(library_snapshot_before.status(), StatusCode::OK);

        let expire = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/qa/expire-session")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(expire.status(), StatusCode::OK);

        let library_snapshot_after = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/snapshot")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(library_snapshot_after.status(), StatusCode::UNAUTHORIZED);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_qa_route_can_expire_sessions failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_qa_session_bootstraps_protected_access_only_in_qa_mode() {
    let db_path = temp_db_path("qa-session-bootstrap");
    let result = async {
        seed_db(&db_path)?;

        let regular_router = build_router(test_state(&db_path));
        let unavailable = regular_router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/qa/session")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unavailable.status(), StatusCode::NOT_FOUND);

        let router = build_router(qa_test_state(&db_path));
        let session = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/qa/session")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(session.status(), StatusCode::OK);
        let session_cookie = extract_named_cookie(session.headers(), COMPANION_SESSION_COOKIE)?;
        assert!(
            extract_named_cookie(session.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE).is_err(),
            "QA session should not persist a trusted-LAN browser device"
        );

        let session_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(session_status.status(), StatusCode::OK);
        let status_body = to_bytes(session_status.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let status_text =
            String::from_utf8(status_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(status_text.contains("\"authenticated\":true"));

        let inventory = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools?limit=10&offset=0")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(inventory.status(), StatusCode::OK);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_api_qa_session_bootstraps_protected_access_only_in_qa_mode failed: {message}"
        );
    }
}

#[tokio::test]
async fn companion_api_qa_delay_header_keeps_detail_route_working() {
    let db_path = temp_db_path("qa-delay-detail");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(qa_test_state(&db_path));

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let started_at = tokio::time::Instant::now();
        let detail = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1?history_limit=4&usage_limit=4")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header("x-companion-qa-delay-ms", "40")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);
        assert!(started_at.elapsed() >= std::time::Duration::from_millis(30));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_qa_delay_header_keeps_detail_route_working failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_serves_authenticated_spool_qr_svg() {
    let db_path = temp_db_path("spool-qr-svg");
    let result = async {
        seed_db(&db_path)?;
        let state = test_state(&db_path);
        let expected_svg =
            build_qr_svg(&build_companion_spool_qr_payload(&state.runtime, "spool_1"))
                .map_err(|error| format!("{error:?}"))?;
        let router = build_router(state);

        let unauthenticated = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1/qr-image.svg")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let qr_image = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1/qr-image.svg")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(qr_image.status(), StatusCode::OK);
        assert_eq!(
            qr_image
                .headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("image/svg+xml; charset=utf-8")
        );

        let qr_body = to_bytes(qr_image.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let qr_text = String::from_utf8(qr_body.to_vec()).map_err(|error| error.to_string())?;
        assert_eq!(qr_text, expected_svg);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_serves_authenticated_spool_qr_svg failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_registers_owned_manual_spool() {
    let db_path = temp_db_path("owned-manual");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/manual")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r##"{"material":"PLA","filament_name":"Basic","color_name":"Red","vendor":"Bambu","initial_weight_g":1000,"qr_code":"QR-22","location":"Shelf A","hex_color":"#DC2626"}"##,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_spool.status(), StatusCode::OK);

        let create_body = to_bytes(create_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let create_text =
            String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(create_text.contains("\"message\":\"Filament added\""));
        let spool_id = extract_spool_id(&create_text)?;

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"ownership_type\":\"OWNED\""));
        assert!(detail_text.contains("\"hex_color\":\"#DC2626\""));

        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = result {
        panic!("companion_api_registers_owned_manual_spool failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_lists_catalog_and_wishlist_items() {
    let db_path = temp_db_path("catalog-wishlist-list");
    let result = async {
        seed_db(&db_path)?;
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        let masters = db
            .list_master_catalog(10, None)
            .map_err(|error| error.to_string())?;
        let master_id = masters
            .first()
            .map(|row| row.id.clone())
            .ok_or_else(|| "missing master catalog seed".to_string())?;
        let engine = InventoryEngine::new(db);
        engine
            .create_wishlist_item(crate::backend::inventory_engine::CreateWishlistItemInput {
                id: "wish_seed_1".to_string(),
                master_id: Some(master_id),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                vendor: Some("Manual".to_string()),
                quantity: Some(2),
                note: Some("Restock".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let router = build_router(test_state(&db_path));
        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let catalog = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/catalog/masters?limit=200&search=Basic")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(catalog.status(), StatusCode::OK);
        let catalog_body = to_bytes(catalog.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let catalog_text =
            String::from_utf8(catalog_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(catalog_text.contains("\"filament_name\":\"Basic\""));

        let wishlist = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/wishlist?limit=10")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(wishlist.status(), StatusCode::OK);
        let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_text =
            String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(wishlist_text.contains("\"id\":\"wish_seed_1\""));
        assert!(wishlist_text.contains("\"status\":\"WISHLIST\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_lists_catalog_and_wishlist_items failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_updates_master_catalog_entry() {
    let db_path = temp_db_path("catalog-master-update");
    let result = async {
        seed_db(&db_path)?;
        let master = FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .list_master_catalog(20, Some("Basic"))
            .map_err(|error| error.to_string())?
            .into_iter()
            .next()
            .ok_or_else(|| "missing master catalog seed".to_string())?;

        let router = build_router(test_state(&db_path));
        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let update = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/catalog/masters/{}/details", master.id))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r##"{"vendor":"eSUN","material":"PLA","filament_name":"PLA+","color_name":"Deep Purple","hex_color":" #4B3290 ","product_url":" https://example.com/pla ","default_weight":750}"##,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update.status(), StatusCode::OK);

        let updated = FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .list_master_catalog(20, Some("Deep Purple"))
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|row| row.id == master.id)
            .ok_or_else(|| "updated master catalog row not found".to_string())?;
        assert_eq!(updated.vendor, "eSUN");
        assert_eq!(updated.material, "PLA");
        assert_eq!(updated.filament_name, "PLA+");
        assert_eq!(updated.color_name, "Deep Purple");
        assert_eq!(updated.hex_color.as_deref(), Some("#4B3290"));
        assert_eq!(updated.product_url.as_deref(), Some("https://example.com/pla"));
        assert_eq!(updated.default_weight, 750);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_updates_master_catalog_entry failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_rejects_invalid_catalog_refresh_vendor() {
    let db_path = temp_db_path("catalog-refresh-invalid-vendor");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));
        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/catalog/refresh")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"vendor":"Other","material_types":[]}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_rejects_invalid_catalog_refresh_vendor failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_registers_owned_catalog_spool() {
    let db_path = temp_db_path("owned-catalog");
    let result = async {
        seed_db(&db_path)?;
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);
        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "seed_catalog_spool".to_string(),
                material: "PLA".to_string(),
                filament_name: "Blue Basic".to_string(),
                color_name: "Blue".to_string(),
                hex_color: Some("#2563EB".to_string()),
                product_url: None,
                vendor: Some("Bambu".to_string()),
                default_weight_g: Some(1000),
                qr_code: None,
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: None,
            })
            .map_err(|error| error.to_string())?;

        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        let master_id = db
            .list_master_catalog(50, Some("Blue Basic"))
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|row| row.vendor == "Bambu")
            .map(|row| row.id)
            .ok_or_else(|| "missing bambu catalog master".to_string())?;

        let router = build_router(test_state(&db_path));
        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/owned")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(format!(
                        r#"{{"master_id":"{master_id}","initial_weight_g":900,"location":"Shelf B","qr_code":"QR-CAT-1"}}"#
                    )))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_spool.status(), StatusCode::OK);

        let create_body = to_bytes(create_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let create_text =
            String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
        let spool_id = extract_spool_id(&create_text)?;

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"ownership_type\":\"OWNED\""));
        assert!(detail_text.contains("\"location_id\":\"Shelf B\""));
        assert!(detail_text.contains("\"remaining_g\":900"));
        assert!(detail_text.contains("\"qr_code\":\"QR-CAT-1\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_registers_owned_catalog_spool failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_creates_and_updates_wishlist_item() {
    let db_path = temp_db_path("wishlist-create-update");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_item = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/wishlist")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"material":"PETG","filament_name":"Solid","color_name":"Blue","vendor":"Bambu","quantity":3,"note":"Order soon"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_item.status(), StatusCode::OK);

        let wishlist = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/wishlist?limit=10")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(wishlist.status(), StatusCode::OK);
        let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_text =
            String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
        let item_id = extract_wishlist_item_id(&wishlist_text, "Solid")?;

        let update_item = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/wishlist/{item_id}/status"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"ON_ORDER"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update_item.status(), StatusCode::OK);

        let wishlist = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/wishlist?limit=10")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_text =
            String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(wishlist_text.contains(format!("\"id\":\"{item_id}\"").as_str()));
        assert!(wishlist_text.contains("\"status\":\"ON_ORDER\""));

        let receive_partial = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/wishlist/{item_id}/receive"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"quantity":2}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(receive_partial.status(), StatusCode::OK);
        let receive_partial_body = to_bytes(receive_partial.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let receive_partial_json: serde_json::Value = serde_json::from_slice(&receive_partial_body)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            receive_partial_json
                .get("spool_ids")
                .and_then(|value| value.as_array())
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            receive_partial_json
                .get("remaining_quantity")
                .and_then(|value| value.as_i64()),
            Some(1)
        );
        assert_eq!(
            receive_partial_json.get("status").and_then(|value| value.as_str()),
            Some("ON_ORDER")
        );

        let receive_too_many = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/wishlist/{item_id}/receive"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"quantity":2}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(receive_too_many.status(), StatusCode::BAD_REQUEST);

        let receive_final = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/wishlist/{item_id}/receive"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"quantity":1}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(receive_final.status(), StatusCode::OK);
        let receive_final_body = to_bytes(receive_final.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let receive_final_json: serde_json::Value = serde_json::from_slice(&receive_final_body)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            receive_final_json
                .get("remaining_quantity")
                .and_then(|value| value.as_i64()),
            Some(0)
        );
        assert_eq!(
            receive_final_json.get("status").and_then(|value| value.as_str()),
            Some("RECEIVED")
        );

        let spools = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools?limit=20")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        let spools_body = to_bytes(spools.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let spools_json: serde_json::Value =
            serde_json::from_slice(&spools_body).map_err(|error| error.to_string())?;
        assert_eq!(spools_json.as_array().map(Vec::len), Some(5));

        let wishlist = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/wishlist?limit=10")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_json: serde_json::Value =
            serde_json::from_slice(&wishlist_body).map_err(|error| error.to_string())?;
        let received_row = wishlist_json
            .as_array()
            .and_then(|rows| {
                rows.iter().find(|row| {
                    row.get("id").and_then(|value| value.as_str()) == Some(item_id.as_str())
                })
            })
            .ok_or_else(|| "received wishlist row missing".to_string())?;
        assert_eq!(received_row.get("quantity").and_then(|value| value.as_i64()), Some(0));
        assert_eq!(
            received_row.get("status").and_then(|value| value.as_str()),
            Some("RECEIVED")
        );

        let delete_item = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/wishlist/{item_id}/delete"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from("{}"))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(delete_item.status(), StatusCode::OK);

        let wishlist = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/wishlist?limit=10")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let wishlist_text =
            String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(!wishlist_text.contains(format!("\"id\":\"{item_id}\"").as_str()));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_creates_and_updates_wishlist_item failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_creates_and_deletes_printer() {
    let db_path = temp_db_path("printer-create-delete");
    let result = async {
        seed_db(&db_path)?;
        let state = test_state(&db_path);
        let credentials = state.credentials.clone();
        let router = build_router(state);

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_printer = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/printers")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"id":"printer_sync_test","model":"Bambu Lab P1S","name":"Sync Test Printer","ams_units":1,"slots_per_ams":4}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_printer.status(), StatusCode::OK);

        let overview = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/printers/overview")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(overview.status(), StatusCode::OK);
        let overview_body = to_bytes(overview.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let overview_text =
            String::from_utf8(overview_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(overview_text.contains("\"id\":\"printer_sync_test\""));
        assert!(overview_text.contains("\"name\":\"Sync Test Printer\""));

        FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .save_bambu_live_integration(
                "printer_sync_test",
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.168.1.42".to_string()),
                    access_code: None,
                    access_code_configured: true,
                    access_code_binding_id: Some(
                        "11111111111111111111111111111111".to_string(),
                    ),
                    access_code_stale_binding_ids: Vec::new(),
                    printer_serial: Some("TEST-SERIAL".to_string()),
                    last_error: None,
                    tls_identity: None,
                    observed_state: None,
                },
            )
            .map_err(|error| error.to_string())?;
        let credential_key = CredentialKey::bambu_access_code(
            "printer_sync_test",
            "11111111111111111111111111111111",
        )
        .map_err(|error| error.to_string())?;
        credentials
            .set(
                &credential_key,
                &SecretValue::from_utf8("test-access-code".to_string()),
            )
            .map_err(|error| error.to_string())?;

        let delete_printer = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/printers/printer_sync_test/delete")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from("{}"))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(delete_printer.status(), StatusCode::OK);

        let overview = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/printers/overview")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        let overview_body = to_bytes(overview.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let overview_text =
            String::from_utf8(overview_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(!overview_text.contains("\"id\":\"printer_sync_test\""));

        let live_integrations = FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        assert!(!live_integrations
            .iter()
            .any(|entry| entry.printer_id == "printer_sync_test"));
        assert!(credentials
            .get(&credential_key)
            .map_err(|error| error.to_string())?
            .is_none());

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_creates_and_deletes_printer failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_blocks_bambu_credential_and_trust_mutations() {
    let db_path = temp_db_path("printer-bambu-live");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let save_live = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/printers/printer_1/bambu-live")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"enabled":true,"host":" 192.168.1.42 ","access_code":" access-code ","printer_serial":" TEST-SERIAL "}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(save_live.status(), StatusCode::FORBIDDEN);

        let integrations = FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        assert!(integrations.is_empty());

        let delete_live = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/printers/printer_1/bambu-live/delete")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from("{}"))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(delete_live.status(), StatusCode::FORBIDDEN);

        let integrations = FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        assert!(!integrations
            .iter()
            .any(|entry| entry.printer_id == "printer_1"));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_blocks_bambu_credential_and_trust_mutations failed: {error}");
    }
}

#[tokio::test]
async fn companion_printer_settings_never_return_bambu_access_code() {
    let db_path = temp_db_path("printer-settings-secret-redaction");
    let result = async {
        seed_db(&db_path)?;
        FilamentDatabase::open(&db_path)
            .map_err(|error| error.to_string())?
            .save_bambu_live_integration(
                "printer_1",
                &BambuLiveIntegrationRow {
                    enabled: false,
                    host: Some("192.168.1.42".to_string()),
                    access_code: Some("legacy-secret".to_string()),
                    access_code_configured: true,
                    access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                    access_code_stale_binding_ids: Vec::new(),
                    printer_serial: Some("TEST-SERIAL".to_string()),
                    last_error: None,
                    tls_identity: None,
                    observed_state: None,
                },
            )
            .map_err(|error| error.to_string())?;

        let state = test_state(&db_path);
        let credentials = state.credentials.clone();
        let credential_key =
            CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
                .map_err(|error| error.to_string())?;
        credentials
            .set(
                &credential_key,
                &SecretValue::from_utf8("stored-secret".to_string()),
            )
            .map_err(|error| error.to_string())?;
        let router = build_router(state);
        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/library/printer-settings")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let payload: serde_json::Value =
            serde_json::from_slice(&body).map_err(|error| error.to_string())?;
        let config = payload["bambu_live_integrations"][0]["config"]
            .as_object()
            .ok_or_else(|| "missing sanitized Bambu integration config".to_string())?;

        assert!(config.get("access_code").is_none());
        assert_eq!(
            config
                .get("access_code_configured")
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert!(config.get("host").is_some_and(serde_json::Value::is_null));
        assert!(config
            .get("printer_serial")
            .is_some_and(serde_json::Value::is_null));
        let payload_text = String::from_utf8(body.to_vec()).map_err(|error| error.to_string())?;
        assert!(!payload_text.contains("legacy-secret"));
        assert!(!payload_text.contains("stored-secret"));
        assert!(!payload_text.contains("192.168.1.42"));
        assert!(!payload_text.contains("TEST-SERIAL"));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_printer_settings_never_return_bambu_access_code failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_rejects_spool_delete_with_active_loan() {
    let db_path = temp_db_path("delete-spool-active-loan");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        CompanionService::new(db_path.to_string_lossy().to_string())
            .lend_spool(LendSpoolInput {
                spool_id: "spool_1".to_string(),
                borrower_name: "Alice".to_string(),
                grams_out: Some(800),
                note: None,
            })
            .map_err(|error| error.to_string())?;

        let delete_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/delete")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from("{}"))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(delete_spool.status(), StatusCode::BAD_REQUEST);
        let delete_body = to_bytes(delete_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let delete_text =
            String::from_utf8(delete_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(delete_text.contains("\"code\":\"inventory.spool.active_loan\""));
        assert!(!delete_text.contains("return it before deleting"));

        let active_loans = CompanionService::new(db_path.to_string_lossy().to_string())
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans.len(), 1);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("companion_api_rejects_spool_delete_with_active_loan failed: {error}");
    }
}

#[tokio::test]
async fn companion_api_registers_borrowed_in_spool() {
    let db_path = temp_db_path("borrowed-in");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/borrowed-in")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Return after fit-checks","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_spool.status(), StatusCode::OK);

        let create_body = to_bytes(create_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let create_text =
            String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(create_text.contains("\"message\":\"Borrowed-in spool registered\""));
        let spool_id = extract_spool_id(&create_text)?;

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"ownership_type\":\"BORROWED_IN\""));
        assert!(detail_text.contains("\"owner_name\":\"Carla\""));
        assert!(detail_text.contains("\"remaining_g\":860"));
        assert!(detail_text.contains("\"loan_direction\":\"INBOUND\""));
        assert!(detail_text.contains("\"location_id\":\"Borrowed Shelf\""));

        let default_loans = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans?include_returned=true")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(default_loans.status(), StatusCode::OK);
        let default_loans_body = to_bytes(default_loans.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let default_loans_text = String::from_utf8(default_loans_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert!(extract_loan_directions(&default_loans_text)?.is_empty());

        let all_loans = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/loans?include_returned=true&direction=ALL")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(all_loans.status(), StatusCode::OK);
        let all_loans_body = to_bytes(all_loans.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let all_loans_text =
            String::from_utf8(all_loans_body.to_vec()).map_err(|error| error.to_string())?;
        assert_eq!(
            extract_loan_directions(&all_loans_text)?,
            vec!["INBOUND".to_string()]
        );

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_registers_borrowed_in_spool failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_finds_spool_by_qr() {
    let db_path = temp_db_path("find-by-qr");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession { session_cookie, .. } =
            pair_test_session(&router, &db_path).await?;

        let lookup = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/by-qr?qr_code=qr-1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(lookup.status(), StatusCode::OK);

        let lookup_body = to_bytes(lookup.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let lookup_text =
            String::from_utf8(lookup_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(lookup_text.contains("\"id\":\"spool_1\""));
        assert!(lookup_text.contains("\"qr_code\":\"qr-1\""));
        assert!(lookup_text.contains("\"filament_name\":\"Basic\""));

        let lookup_by_spool_id = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/by-qr?qr_code=spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(lookup_by_spool_id.status(), StatusCode::OK);

        let lookup_by_spool_id_body = to_bytes(lookup_by_spool_id.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let lookup_by_spool_id_text = String::from_utf8(lookup_by_spool_id_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert!(lookup_by_spool_id_text.contains("\"id\":\"spool_1\""));

        let missing = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/by-qr?qr_code=missing")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_finds_spool_by_qr failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_updates_borrowed_in_spool_metadata() {
    let db_path = temp_db_path("borrowed-in-update");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/borrowed-in")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Original owner note","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_spool.status(), StatusCode::OK);

        let create_body = to_bytes(create_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let create_text =
            String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
        let spool_id = extract_spool_id(&create_text)?;

        let update_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/spools/{spool_id}/borrowed-in"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"owner_name":"Nora","owner_contact":"nora@example.com","ownership_note":"Return after finishing the sample set"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update_spool.status(), StatusCode::OK);

        let update_body = to_bytes(update_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let update_text =
            String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(update_text.contains("\"message\":\"Borrowed-in spool details updated\""));

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"owner_name\":\"Nora\""));
        assert!(detail_text.contains("\"owner_contact\":\"nora@example.com\""));
        assert!(
            detail_text.contains(
                "\"ownership_note\":\"Return after finishing the sample set\""
            )
        );
        assert!(detail_text.contains("\"counterparty_name\":\"Nora\""));
        assert!(detail_text.contains("\"counterparty_contact\":\"nora@example.com\""));
        assert!(
            detail_text.contains(
                "\"counterparty_note\":\"Return after finishing the sample set\""
            )
        );
        assert!(detail_text.contains("\"event_type\":\"DETAILS_UPDATED\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_updates_borrowed_in_spool_metadata failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_updates_spool_status_and_location() {
    let db_path = temp_db_path("spool-details-update");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let update = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"LOST","location":"Archive Bin"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update.status(), StatusCode::OK);

        let update_body = to_bytes(update.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let update_text =
            String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(update_text.contains("\"message\":\"Spool details updated\""));

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"status\":\"LOST\""));
        assert!(detail_text.contains("\"location_id\":\"Archive Bin\""));
        assert!(detail_text.contains("\"qr_code\":\"qr-1\""));
        assert!(detail_text.contains("\"event_type\":\"DETAILS_UPDATED\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_updates_spool_status_and_location failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_preserves_location_when_status_update_omits_location() {
    let db_path = temp_db_path("spool-details-status-only");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let update_location = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"IN_STOCK","location":"Shelf A"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update_location.status(), StatusCode::OK);

        let update_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"LOST"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update_status.status(), StatusCode::OK);

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"status\":\"LOST\""));
        assert!(detail_text.contains("\"location_id\":\"Shelf A\""));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_api_preserves_location_when_status_update_omits_location failed: {message}"
        );
    }
}

#[tokio::test]
async fn companion_api_clears_location_when_status_update_sends_null_location() {
    let db_path = temp_db_path("spool-details-clear-location");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let update_location = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"IN_STOCK","location":"Shelf A"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update_location.status(), StatusCode::OK);

        let clear_location = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"IN_STOCK","location":null}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(clear_location.status(), StatusCode::OK);

        let detail = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/spools/spool_1")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.status(), StatusCode::OK);

        let detail_body = to_bytes(detail.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_text =
            String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(detail_text.contains("\"status\":\"IN_STOCK\""));
        assert!(detail_text.contains("\"location_id\":null"));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_api_clears_location_when_status_update_sends_null_location failed: {message}"
        );
    }
}

#[tokio::test]
async fn companion_api_rejects_status_and_location_edits_for_loaded_spools() {
    let db_path = temp_db_path("spool-details-reject-loaded");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let printer_overview = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/printers/overview")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(printer_overview.status(), StatusCode::OK);
        let printer_body = to_bytes(printer_overview.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let printer_text =
            String::from_utf8(printer_body.to_vec()).map_err(|error| error.to_string())?;
        let slot_id = extract_first_slot_id(&printer_text)?;

        let assign = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                    ))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"spool_id":"spool_1"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(assign.status(), StatusCode::OK);

        let update = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/details")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"status":"IN_STOCK","location":"Shelf B"}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(update.status(), StatusCode::BAD_REQUEST);

        let update_body = to_bytes(update.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let update_text =
            String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(update_text.contains("\"code\":\"inventory.spool.loaded_edit_blocked\""));
        assert!(!update_text.contains("Loaded spools use printer-slot actions"));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_api_rejects_status_and_location_edits_for_loaded_spools failed: {message}"
        );
    }
}

#[tokio::test]
async fn companion_api_hands_back_borrowed_in_spool() {
    let db_path = temp_db_path("borrowed-in-hand-back");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let create_spool = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/borrowed-in")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Return after fixture print","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(create_spool.status(), StatusCode::OK);

        let create_body = to_bytes(create_spool.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let create_text =
            String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
        let spool_id = extract_spool_id(&create_text)?;

        let detail_before = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail_before.status(), StatusCode::OK);

        let detail_before_body = to_bytes(detail_before.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let detail_before_text = String::from_utf8(detail_before_body.to_vec())
            .map_err(|error| error.to_string())?;
        let loan_id = extract_active_loan_id_from_spool_detail(&detail_before_text)?
            .ok_or_else(|| "missing active inbound loan id".to_string())?;

        let hand_back = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/loans/{loan_id}/hand-back"))
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(
                        r#"{"returned_grams":780,"note":"Handed back after fixture print"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(hand_back.status(), StatusCode::OK);

        let hand_back_body = to_bytes(hand_back.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let hand_back_text = String::from_utf8(hand_back_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert!(hand_back_text.contains("\"message\":\"Borrowed-in spool handed back\""));
        assert!(hand_back_text.contains("\"returned_grams\":780"));
        assert!(hand_back_text.contains("\"loan_direction\":\"INBOUND\""));

        let detail_after = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/spools/{spool_id}"))
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(detail_after.status(), StatusCode::NOT_FOUND);

        let inventory_after = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools?limit=500&offset=0")
                    .header("host", "127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(inventory_after.status(), StatusCode::OK);
        let inventory_after_body = to_bytes(inventory_after.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let inventory_after_text = String::from_utf8(inventory_after_body.to_vec())
            .map_err(|error| error.to_string())?;
        assert!(!inventory_after_text.contains(&spool_id));

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_hands_back_borrowed_in_spool failed: {message}");
    }
}

#[tokio::test]
async fn companion_shell_route_serves_browser_ui() {
    let db_path = temp_db_path("shell");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/companion")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(response.status(), StatusCode::OK);
        let cache_control = response
            .headers()
            .get(axum::http::header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert!(cache_control.contains("no-store"));

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let body_text = String::from_utf8(body.to_vec()).map_err(|error| error.to_string())?;
        assert!(body_text.contains("Filament Manager Companion"));
        assert!(body_text.contains("/companion/icon-light.png"));
        assert!(body_text.contains("companion-favicon"));
        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_shell_route_serves_browser_ui failed: {message}");
    }
}

#[tokio::test]
async fn companion_shell_route_serves_module_assets() {
    let db_path = temp_db_path("shell-assets");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let module_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/companion/companion_api_client.js")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(module_response.status(), StatusCode::OK);
        let module_cache_control = module_response
            .headers()
            .get(axum::http::header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert_eq!(module_cache_control, "private, no-cache");
        let module_etag = module_response
            .headers()
            .get(axum::http::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        assert!(module_etag.starts_with("W/\""));
        assert_eq!(
            module_response
                .headers()
                .get(axum::http::header::VARY)
                .and_then(|value| value.to_str().ok()),
            Some("accept-encoding")
        );

        let module_body = to_bytes(module_response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let module_text =
            String::from_utf8(module_body.to_vec()).map_err(|error| error.to_string())?;
        assert!(module_text.contains("createCompanionApiClient"));

        let not_modified = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/companion/companion_api_client.js")
                    .header(axum::http::header::IF_NONE_MATCH, &module_etag)
                    .header(axum::http::header::ACCEPT_ENCODING, "gzip")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(
            not_modified
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .and_then(|value| value.to_str().ok()),
            Some("private, no-cache")
        );
        assert_eq!(
            not_modified
                .headers()
                .get(axum::http::header::ETAG)
                .and_then(|value| value.to_str().ok()),
            Some(module_etag.as_str())
        );
        let not_modified_body = to_bytes(not_modified.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        assert!(not_modified_body.is_empty());

        let gzip_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/companion/companion_api_client.js")
                    .header(axum::http::header::ACCEPT_ENCODING, "br, gzip;q=0.7")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(gzip_response.status(), StatusCode::OK);
        assert_eq!(
            gzip_response
                .headers()
                .get(axum::http::header::CONTENT_ENCODING)
                .and_then(|value| value.to_str().ok()),
            Some("gzip")
        );
        let gzip_body = to_bytes(gzip_response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let mut decoder = GzDecoder::new(gzip_body.as_ref());
        let mut decoded = String::new();
        decoder
            .read_to_string(&mut decoded)
            .map_err(|error| error.to_string())?;
        assert!(decoded.contains("createCompanionApiClient"));

        let served_assets: HashMap<&str, _> = companion_browser_assets().collect();
        for (asset_path, asset) in companion_browser_assets() {
            let response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/companion/{asset_path}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(response.status(), StatusCode::OK);
            let content_type = response
                .headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            assert_eq!(content_type, asset.content_type);
            assert_eq!(
                response
                    .headers()
                    .get(axum::http::header::CACHE_CONTROL)
                    .and_then(|value| value.to_str().ok()),
                Some("private, no-cache")
            );
            assert!(response
                .headers()
                .get(axum::http::header::ETAG)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|etag| etag.starts_with("W/\"")));

            if asset_path.ends_with(".js") {
                for import_path in companion_browser_relative_imports(asset.content) {
                    assert!(
                        served_assets.contains_key(import_path.as_str()),
                        "{asset_path} imports {import_path}, but it is not served by the companion asset router"
                    );
                }
            }
        }

        let icon_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/companion/icon-dark.png")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(icon_response.status(), StatusCode::OK);
        let icon_content_type = icon_response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert!(icon_content_type.starts_with("image/png"));

        let missing_asset = router
            .oneshot(
                Request::builder()
                    .uri("/companion/missing.js")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(missing_asset.status(), StatusCode::NOT_FOUND);
        assert_no_store(missing_asset.headers());

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_shell_route_serves_module_assets failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_success_auth_and_error_responses_are_no_store() {
    let db_path = temp_db_path("cache-policy");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(health.status(), StatusCode::OK);
        assert_no_store(health.headers());

        let auth_status = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/session")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(auth_status.status(), StatusCode::OK);
        assert_no_store(auth_status.headers());

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inventory/spools")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        assert_no_store(unauthorized.headers());

        let unknown_api_route = router
            .oneshot(
                Request::builder()
                    .uri("/api/v1/not-a-route")
                    .header("host", "127.0.0.1:4278")
                    .body(Body::empty())
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(unknown_api_route.status(), StatusCode::NOT_FOUND);
        assert_no_store(unknown_api_route.headers());

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_success_auth_and_error_responses_are_no_store failed: {message}");
    }
}

#[tokio::test]
async fn companion_api_rejects_invalid_browser_lend_request() {
    let db_path = temp_db_path("invalid-lend");
    let result = async {
        seed_db(&db_path)?;
        let router = build_router(test_state(&db_path));

        let AuthenticatedTestSession {
            session_cookie,
            csrf_token,
            ..
        } = pair_test_session(&router, &db_path).await?;

        let missing_borrower = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/spools/spool_1/lend")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .header("cookie", format!("bfm_companion_session={session_cookie}"))
                    .header(COMPANION_CSRF_HEADER, &csrf_token)
                    .body(Body::from(r#"{"borrower_name":"   ","grams_out":700}"#))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(missing_borrower.status(), StatusCode::BAD_REQUEST);

        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_api_rejects_invalid_browser_lend_request failed: {message}");
    }
}

#[test]
fn async_companion_handlers_keep_blocking_io_behind_the_executor() {
    let sources = [
        include_str!("companion_api.rs"),
        include_str!("companion_inventory_read_api.rs"),
        include_str!("companion_library_api.rs"),
    ];
    let blocking_io_markers = [
        "FilamentDatabase::open",
        "StatisticsEngine::open",
        ".service",
        ".open_db(",
        "find_active_session(",
        "find_active_trusted_lan_browser(",
        "lock_secure_credential_mutation(",
        ".credentials.",
    ];

    for source in sources {
        for section in source.split("pub(super) async fn ").skip(1) {
            let name = section
                .split_once('(')
                .map(|(name, _)| name.trim())
                .expect("async companion handler name");
            let contains_blocking_io = blocking_io_markers
                .iter()
                .any(|marker| section.contains(marker));
            if contains_blocking_io {
                assert!(
                    section.contains(".run_blocking("),
                    "{name} performs blocking I/O without the Companion executor"
                );
            }
        }
    }
}
