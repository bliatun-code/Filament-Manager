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
const COMPANION_SESSION_CAPACITY: usize = 512;

#[derive(Clone)]
pub(crate) struct CompanionSessionStore {
    state: Arc<RwLock<CompanionSessionStoreState>>,
    capacity: usize,
    max_age_seconds: u64,
}

struct CompanionSessionStoreState {
    sessions: HashMap<String, StoredCompanionSession>,
    next_sequence: u64,
}

struct StoredCompanionSession {
    session: CompanionSession,
    sequence: u64,
}

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
    CompanionSessionStore::new(
        COMPANION_SESSION_CAPACITY,
        COMPANION_SESSION_MAX_AGE_SECONDS,
    )
}

impl CompanionSessionStore {
    fn new(capacity: usize, max_age_seconds: u64) -> Self {
        Self {
            state: Arc::new(RwLock::new(CompanionSessionStoreState {
                sessions: HashMap::new(),
                next_sequence: 0,
            })),
            capacity: capacity.max(1),
            max_age_seconds,
        }
    }

    fn insert(
        &self,
        session_id: String,
        session: CompanionSession,
        now_epoch_s: u64,
    ) -> Result<(), CompanionApiError> {
        let mut state = self.state.write().map_err(|_| {
            CompanionApiError::Internal("Failed to write session state".to_string())
        })?;
        prune_expired_sessions(&mut state.sessions, now_epoch_s, self.max_age_seconds);
        state.sessions.remove(&session_id);
        while state.sessions.len() >= self.capacity {
            let oldest_session_id = state
                .sessions
                .iter()
                .min_by_key(|(_, stored)| (stored.session.created_at_epoch_s, stored.sequence))
                .map(|(id, _)| id.clone());
            let Some(oldest_session_id) = oldest_session_id else {
                break;
            };
            state.sessions.remove(&oldest_session_id);
        }

        let sequence = state.next_sequence;
        state.next_sequence = state.next_sequence.wrapping_add(1);
        state
            .sessions
            .insert(session_id, StoredCompanionSession { session, sequence });
        Ok(())
    }

    fn get_active(
        &self,
        session_id: &str,
        now_epoch_s: u64,
    ) -> Result<Option<CompanionSession>, CompanionApiError> {
        let mut state = self.state.write().map_err(|_| {
            CompanionApiError::Internal("Failed to write session state".to_string())
        })?;
        prune_expired_sessions(&mut state.sessions, now_epoch_s, self.max_age_seconds);
        Ok(state
            .sessions
            .get(session_id)
            .map(|stored| stored.session.clone()))
    }

    pub(crate) fn clear(&self) -> Result<(), CompanionApiError> {
        self.state
            .write()
            .map_err(|_| CompanionApiError::Internal("Failed to write session state".to_string()))?
            .sessions
            .clear();
        Ok(())
    }

    fn remove(&self, session_id: &str) -> Result<(), CompanionApiError> {
        self.state
            .write()
            .map_err(|_| CompanionApiError::Internal("Failed to write session state".to_string()))?
            .sessions
            .remove(session_id);
        Ok(())
    }

    #[cfg(test)]
    fn len_at(&self, now_epoch_s: u64) -> Result<usize, CompanionApiError> {
        let mut state = self.state.write().map_err(|_| {
            CompanionApiError::Internal("Failed to write session state".to_string())
        })?;
        prune_expired_sessions(&mut state.sessions, now_epoch_s, self.max_age_seconds);
        Ok(state.sessions.len())
    }
}

fn prune_expired_sessions(
    sessions: &mut HashMap<String, StoredCompanionSession>,
    now_epoch_s: u64,
    max_age_seconds: u64,
) {
    sessions
        .retain(|_, stored| !session_is_expired_at(&stored.session, now_epoch_s, max_age_seconds));
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

    let Some(session) = sessions.get_active(session_id.as_str(), unix_epoch_seconds())? else {
        return Ok(None);
    };

    let Some(browser_id) = session.paired_browser_id.as_deref() else {
        if session.qa_session {
            return Ok(Some(session));
        }
        sessions.remove(&session_id)?;
        return Ok(None);
    };
    let db = open_companion_db(db_path)?;
    let browser = db
        .get_trusted_lan_paired_browser_by_id(browser_id)
        .map_err(CompanionApiError::from)?;
    match browser {
        Some(browser) if browser.revoked_at.is_none() => Ok(Some(session)),
        _ => {
            sessions.remove(&session_id)?;
            Ok(None)
        }
    }
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
    let created_at_epoch_s = unix_epoch_seconds();
    let session = CompanionSession {
        csrf_token: csrf_token.clone(),
        created_at_epoch_s,
        paired_browser_id: paired_browser_id.clone(),
        qa_session,
    };

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
    sessions.insert(session_id.clone(), session, created_at_epoch_s)?;

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

fn session_is_expired_at(
    session: &CompanionSession,
    now_epoch_s: u64,
    max_age_seconds: u64,
) -> bool {
    now_epoch_s.saturating_sub(session.created_at_epoch_s) >= max_age_seconds
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_session(created_at_epoch_s: u64, csrf_token: &str) -> CompanionSession {
        CompanionSession {
            csrf_token: csrf_token.to_string(),
            created_at_epoch_s,
            paired_browser_id: None,
            qa_session: true,
        }
    }

    #[test]
    fn expired_sessions_are_removed_deterministically_on_lookup() {
        let store = CompanionSessionStore::new(4, 10);
        store
            .insert("expired".to_string(), test_session(100, "old"), 100)
            .expect("insert expired candidate");
        store
            .insert("active".to_string(), test_session(101, "new"), 101)
            .expect("insert active candidate");

        assert!(store
            .get_active("expired", 110)
            .expect("lookup expired session")
            .is_none());
        assert_eq!(store.len_at(110).expect("count active sessions"), 1);
        assert_eq!(
            store
                .get_active("active", 110)
                .expect("lookup active session")
                .expect("active session")
                .csrf_token,
            "new"
        );
    }

    #[test]
    fn session_capacity_evicts_oldest_in_stable_insertion_order() {
        let store = CompanionSessionStore::new(2, 100);
        store
            .insert("first".to_string(), test_session(50, "first"), 50)
            .expect("insert first");
        store
            .insert("second".to_string(), test_session(50, "second"), 50)
            .expect("insert second");
        store
            .insert("third".to_string(), test_session(50, "third"), 50)
            .expect("insert third");

        assert!(store
            .get_active("first", 51)
            .expect("lookup first")
            .is_none());
        assert!(store
            .get_active("second", 51)
            .expect("lookup second")
            .is_some());
        assert!(store
            .get_active("third", 51)
            .expect("lookup third")
            .is_some());
        assert_eq!(store.len_at(51).expect("count capped sessions"), 2);
    }

    #[test]
    fn expired_sessions_are_pruned_before_capacity_eviction() {
        let store = CompanionSessionStore::new(2, 5);
        store
            .insert("expired".to_string(), test_session(10, "expired"), 10)
            .expect("insert expired");
        store
            .insert("active".to_string(), test_session(14, "active"), 14)
            .expect("insert active");
        store
            .insert("new".to_string(), test_session(15, "new"), 15)
            .expect("insert new");

        assert!(store
            .get_active("expired", 15)
            .expect("lookup expired")
            .is_none());
        assert!(store
            .get_active("active", 15)
            .expect("lookup active")
            .is_some());
        assert!(store.get_active("new", 15).expect("lookup new").is_some());
    }
}
