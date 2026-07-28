use crate::backend::filament_database::{FilamentDatabase, TrustedLanPairedBrowserRow};
use crate::companion_error::CompanionApiError;
use crate::companion_http::cookie_value_from_headers;
use crate::security::hash_secret;
use axum::http::{header::SET_COOKIE, HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rand::rngs::SysRng;
use rand::TryRng;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::Zeroize;

pub(crate) const COMPANION_SESSION_COOKIE: &str = "bfm_companion_session";
pub(crate) const COMPANION_TRUSTED_LAN_DEVICE_COOKIE: &str = "bfm_trusted_lan_device";
const COMPANION_SESSION_MAX_AGE_SECONDS: u64 = 8 * 60 * 60;
const COMPANION_TRUSTED_LAN_DEVICE_MAX_AGE_SECONDS: u64 = 30 * 24 * 60 * 60;

pub(crate) type CompanionSessionStore = Arc<RwLock<HashMap<String, CompanionSession>>>;

#[derive(Clone)]
pub(crate) struct CompanionSession {
    pub(crate) csrf_token: String,
    created_at_epoch_s: u64,
    paired_browser_id: Option<String>,
    qa_session: bool,
}

impl Drop for CompanionSession {
    fn drop(&mut self) {
        self.csrf_token.zeroize();
    }
}

#[derive(Serialize)]
struct AuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
    expires_in_seconds: u64,
}

pub(crate) fn new_companion_session_store() -> CompanionSessionStore {
    Arc::new(RwLock::new(HashMap::new()))
}

pub fn generate_pairing_token() -> String {
    random_hex_token(24)
}

pub(crate) fn generate_companion_spool_id() -> String {
    format!(
        "spool_companion_{}_{}",
        unix_epoch_millis(),
        random_hex_token(4)
    )
}

pub(crate) fn random_hex_token(byte_count: usize) -> String {
    let mut bytes = vec![0u8; byte_count];
    SysRng
        .try_fill_bytes(&mut bytes)
        .expect("OS RNG should be available for trusted-LAN token generation");
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

pub(crate) fn unix_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub(crate) fn session_id_from_headers(headers: &HeaderMap) -> Option<String> {
    cookie_value_from_headers(headers, COMPANION_SESSION_COOKIE)
}

fn trusted_lan_device_token_from_headers(headers: &HeaderMap) -> Option<String> {
    cookie_value_from_headers(headers, COMPANION_TRUSTED_LAN_DEVICE_COOKIE)
}

fn build_session_cookie(session_id: &str) -> String {
    format!(
        "{COMPANION_SESSION_COOKIE}={session_id}; HttpOnly; SameSite=Strict; Max-Age={COMPANION_SESSION_MAX_AGE_SECONDS}; Path=/api/v1"
    )
}

fn build_trusted_lan_device_cookie(device_token: &str) -> String {
    format!(
        "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_token}; HttpOnly; SameSite=Strict; Max-Age={COMPANION_TRUSTED_LAN_DEVICE_MAX_AGE_SECONDS}; Path=/api/v1/auth"
    )
}

pub(crate) fn find_active_session(
    sessions: &CompanionSessionStore,
    db_path: &str,
    headers: &HeaderMap,
) -> Result<Option<CompanionSession>, CompanionApiError> {
    let Some(session_id) = session_id_from_headers(headers) else {
        return Ok(None);
    };

    let session = sessions
        .read()
        .map_err(|_| CompanionApiError::Internal("Failed to read session state".to_string()))?
        .get(session_id.as_str())
        .cloned();

    let Some(session) = session else {
        return Ok(None);
    };
    if session_is_expired(&session) {
        return Ok(None);
    }

    let Some(browser_id) = session.paired_browser_id.as_deref() else {
        if session.qa_session {
            return Ok(Some(session));
        }
        return Ok(None);
    };
    let db = open_companion_db(db_path)?;
    let browser = db
        .get_trusted_lan_paired_browser_by_id(browser_id)
        .map_err(CompanionApiError::from)?;
    if browser
        .as_ref()
        .and_then(|value| value.revoked_at.as_ref())
        .is_some()
    {
        return Ok(None);
    }

    Ok(Some(session))
}

pub(crate) fn find_active_trusted_lan_browser(
    db_path: &str,
    headers: &HeaderMap,
) -> Result<Option<TrustedLanPairedBrowserRow>, CompanionApiError> {
    let Some(device_token) = trusted_lan_device_token_from_headers(headers) else {
        return Ok(None);
    };

    let db = open_companion_db(db_path)?;
    let device_token_hash = hash_secret(&device_token);
    db.get_active_trusted_lan_paired_browser_by_device_token_hash(&device_token_hash)
        .map_err(CompanionApiError::from)
}

pub(crate) fn build_authenticated_session_response(
    sessions: &CompanionSessionStore,
    db_path: &str,
    paired_browser_id: Option<String>,
    device_token: Option<&str>,
    last_origin: Option<&str>,
) -> Result<Response, CompanionApiError> {
    build_session_response(
        sessions,
        Some(db_path),
        paired_browser_id,
        device_token,
        last_origin,
        false,
    )
}

pub(crate) fn build_qa_authenticated_session_response(
    sessions: &CompanionSessionStore,
) -> Result<Response, CompanionApiError> {
    build_session_response(sessions, None, None, None, None, true)
}

fn build_session_response(
    sessions: &CompanionSessionStore,
    db_path: Option<&str>,
    paired_browser_id: Option<String>,
    device_token: Option<&str>,
    last_origin: Option<&str>,
    qa_session: bool,
) -> Result<Response, CompanionApiError> {
    let session_id = random_hex_token(32);
    let csrf_token = random_hex_token(24);
    let session = CompanionSession {
        csrf_token: csrf_token.clone(),
        created_at_epoch_s: unix_epoch_seconds(),
        paired_browser_id: paired_browser_id.clone(),
        qa_session,
    };

    sessions
        .write()
        .map_err(|_| CompanionApiError::Internal("Failed to write session state".to_string()))?
        .insert(session_id.clone(), session);

    if let Some(browser_id) = paired_browser_id.as_deref() {
        let Some(db_path) = db_path else {
            return Err(CompanionApiError::Internal(
                "Authenticated browser sessions require a database path".to_string(),
            ));
        };
        let db = open_companion_db(db_path)?;
        db.touch_trusted_lan_paired_browser(browser_id, last_origin)
            .map_err(CompanionApiError::from)?;
    }

    let response_body = AuthenticatedSessionResponse {
        ok: true,
        csrf_token,
        expires_in_seconds: COMPANION_SESSION_MAX_AGE_SECONDS,
    };
    let mut response = Json(response_body).into_response();
    let session_cookie = build_session_cookie(&session_id);
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&session_cookie).map_err(|error| {
            CompanionApiError::Internal(format!("Failed to build session cookie: {error}"))
        })?,
    );
    if let Some(device_token) = device_token {
        let device_cookie = build_trusted_lan_device_cookie(device_token);
        response.headers_mut().append(
            SET_COOKIE,
            HeaderValue::from_str(&device_cookie).map_err(|error| {
                CompanionApiError::Internal(format!(
                    "Failed to build trusted-LAN device cookie: {error}"
                ))
            })?,
        );
    }
    Ok(response)
}

fn session_is_expired(session: &CompanionSession) -> bool {
    unix_epoch_seconds().saturating_sub(session.created_at_epoch_s)
        > COMPANION_SESSION_MAX_AGE_SECONDS
}

fn unix_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn open_companion_db(db_path: &str) -> Result<FilamentDatabase, CompanionApiError> {
    FilamentDatabase::open(db_path).map_err(|error| {
        CompanionApiError::Internal(format!("Failed to open companion database: {error}"))
    })
}
