//! Volatile, bounded browser access requests. Only native Host commands may approve.
//! The six-digit code is insufficient without the requesting browser's HttpOnly secret.
use crate::companion_error::CompanionApiError;
use crate::companion_session::{random_hex_token, unix_epoch_millis};
use crate::security::hash_secret;
use rand::{rngs::SysRng, TryRng};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use zeroize::Zeroize;

const PENDING_LIFETIME: Duration = Duration::from_secs(600);
const CODE_LIFETIME: Duration = Duration::from_secs(300);
const CAPACITY: usize = 32;
const MAX_ATTEMPTS: u8 = 3;

#[derive(Clone, Default)]
pub(crate) struct AccessRecoveryStore(Arc<Mutex<Store>>);

#[derive(Default)]
struct Store {
    requests: HashMap<String, Request>,
    creations: VecDeque<Instant>,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(store: &AccessRecoveryStore, now: Instant) -> (String, String) {
        let (_, credential) = store
            .create("library", None, "My iPhone", "Safari iPhone", now)
            .unwrap();
        let credential = credential.unwrap();
        let id = credential.split('.').next().unwrap().to_string();
        (id, credential)
    }
    #[test]
    fn access_recovery_requires_approval_and_the_exact_request_secret() {
        let store = AccessRecoveryStore::default();
        let now = Instant::now();
        let (id, secret) = request(&store, now);
        assert!(
            matches!(store.redeem("library",&secret,"000000",now,|_|Ok(())).unwrap(),Redemption::Waiting(s) if s.status=="pending")
        );
        let approved = store.decide("library", &id, true, now).unwrap();
        let code = approved.confirmation_code.unwrap();
        assert_eq!(code.len(), 6);
        assert!(code.bytes().all(|c| c.is_ascii_digit()));
        let forged = format!("{id}.{}", "f".repeat(64));
        assert!(store
            .redeem("library", &forged, &code, now, |_| Ok(()))
            .is_err());
        assert!(store
            .redeem("other-library", &secret, &code, now, |_| Ok(()))
            .is_err());
        assert!(matches!(
            store
                .redeem("library", &secret, &code, now, |name| {
                    assert_eq!(name, "My iPhone");
                    Ok(42)
                })
                .unwrap(),
            Redemption::Granted(42)
        ));
        assert!(
            matches!(store.redeem::<()>("library",&secret,&code,now,|_|panic!("replay must not grant")).unwrap(),Redemption::Waiting(s) if s.status=="completed")
        );
    }
    #[test]
    fn access_recovery_locks_after_three_attempts_and_approval_does_not_reset_budget() {
        let store = AccessRecoveryStore::default();
        let now = Instant::now();
        let (id, secret) = request(&store, now);
        let approved = store.decide("library", &id, true, now).unwrap();
        let code = approved.confirmation_code.unwrap();
        let wrong = if code == "000000" { "000001" } else { "000000" };
        for remaining in (0..3).rev() {
            let result = store
                .redeem("library", &secret, wrong, now, |_| Ok(()))
                .unwrap();
            assert!(matches!(result,Redemption::Waiting(s) if s.attempts_remaining==remaining));
            if remaining > 0 {
                assert_eq!(
                    store
                        .decide("library", &id, true, now)
                        .unwrap()
                        .confirmation_code
                        .as_deref(),
                    Some(code.as_str())
                );
            }
        }
        assert_eq!(
            store.status("library", &secret, now).unwrap().status,
            "locked"
        );
        assert!(store.decide("library", &id, true, now).is_err());
        assert!(
            matches!(store.redeem::<()>("library",&secret,&code,now,|_|panic!("locked")).unwrap(),Redemption::Waiting(s) if s.status=="locked")
        );
    }
    #[test]
    fn access_recovery_code_expires_exactly_five_minutes_after_approval() {
        let store = AccessRecoveryStore::default();
        let now = Instant::now();
        let (id, secret) = request(&store, now);
        let approval_time = now + Duration::from_secs(500);
        let code = store
            .decide("library", &id, true, approval_time)
            .unwrap()
            .confirmation_code
            .unwrap();
        assert_eq!(
            store
                .status("library", &secret, approval_time + Duration::from_secs(299))
                .unwrap()
                .status,
            "approved"
        );
        assert!(
            matches!(store.redeem::<()>("library",&secret,&code,approval_time+CODE_LIFETIME,|_|panic!("expired")).unwrap(),Redemption::Waiting(s) if s.status=="expired")
        );
        assert!(store
            .list("library", approval_time + CODE_LIFETIME)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn access_recovery_pending_expiry_cancel_decline_and_restart_cannot_grant() {
        for terminal in ["expired", "cancelled", "rejected", "restart"] {
            let store = AccessRecoveryStore::default();
            let now = Instant::now();
            let (id, secret) = request(&store, now);
            match terminal {
                "cancelled" => {
                    store.cancel("library", &secret, now).unwrap();
                }
                "rejected" => {
                    store.decide("library", &id, false, now).unwrap();
                }
                "restart" => store.clear(),
                _ => {}
            }
            if terminal == "restart" {
                assert!(store.status("library", &secret, now).is_err());
            } else {
                assert_eq!(
                    store
                        .status("library", &secret, now + PENDING_LIFETIME)
                        .unwrap()
                        .status,
                    terminal
                );
                assert!(store
                    .decide("library", &id, true, now + PENDING_LIFETIME)
                    .is_err());
            }
        }
    }
    #[test]
    fn access_recovery_deduplicates_existing_browser_and_limits_creation_globally() {
        let store = AccessRecoveryStore::default();
        let now = Instant::now();
        let (_, secret) = request(&store, now);
        assert!(store
            .create("library", Some(&secret), "Renamed", "Safari", now)
            .unwrap()
            .1
            .is_none());
        assert_eq!(store.list("library", now).unwrap().len(), 1);
        for _ in 0..9 {
            request(&store, now);
        }
        assert!(matches!(
            store.create("library", None, "Other", "", now),
            Err(CompanionApiError::RateLimited(_))
        ));
        assert!(store
            .create("library", None, "Other", "", now + Duration::from_secs(60))
            .is_ok());
        assert!(store
            .create("library", None, "\u{202e}Spoof", "", now)
            .is_err());
    }
    #[test]
    fn access_recovery_redeems_once_under_concurrency_and_survives_database_failure() {
        let store = AccessRecoveryStore::default();
        let now = Instant::now();
        let (id, secret) = request(&store, now);
        let code = store
            .decide("library", &id, true, now)
            .unwrap()
            .confirmation_code
            .unwrap();
        assert!(store
            .redeem::<()>("library", &secret, &code, now, |_| Err(
                CompanionApiError::Internal("test".into())
            ))
            .is_err());
        let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let threads = (0..8)
            .map(|_| {
                let (store, secret, code, count) =
                    (store.clone(), secret.clone(), code.clone(), count.clone());
                std::thread::spawn(move || {
                    store
                        .redeem("library", &secret, &code, now, |_| {
                            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                            Ok(())
                        })
                        .unwrap();
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

struct Request {
    scope: String,
    secret_hash: String,
    device_name: String,
    browser_hint: String,
    status: &'static str,
    code: String,
    attempts: u8,
    deadline: Instant,
    requested_at_ms: u128,
    expires_at_ms: u128,
}

impl Drop for Request {
    fn drop(&mut self) {
        self.code.zeroize();
        self.secret_hash.zeroize();
    }
}

#[derive(Clone, Serialize)]
pub(crate) struct AccessRequestStatus {
    pub(crate) status: &'static str,
    pub(crate) expires_in_seconds: u64,
    pub(crate) attempts_remaining: u8,
}

#[derive(Serialize)]
pub(crate) struct HostAccessRequest {
    pub(crate) id: String,
    pub(crate) device_name: String,
    pub(crate) browser_hint: String,
    pub(crate) status: &'static str,
    pub(crate) requested_at_ms: u128,
    pub(crate) expires_at_ms: u128,
    /// Only returned by native commands, never by the Companion HTTP API.
    pub(crate) confirmation_code: Option<String>,
}

pub(crate) enum Redemption<T> {
    Waiting(AccessRequestStatus),
    Granted(T),
}

fn invalid() -> CompanionApiError {
    CompanionApiError::Unauthorized("Invalid access request".into())
}
fn lock_error() -> CompanionApiError {
    CompanionApiError::Internal("Access request store unavailable".into())
}
fn matches_secret(expected: &str, actual: &str) -> bool {
    expected.len() == actual.len()
        && expected
            .bytes()
            .zip(actual.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}
fn refresh(request: &mut Request, now: Instant) {
    if now >= request.deadline && matches!(request.status, "pending" | "approved") {
        request.status = "expired";
        request.code.zeroize();
    }
}
fn public_status(request: &Request, now: Instant) -> AccessRequestStatus {
    AccessRequestStatus {
        status: request.status,
        expires_in_seconds: request.deadline.saturating_duration_since(now).as_secs(),
        attempts_remaining: MAX_ATTEMPTS.saturating_sub(request.attempts),
    }
}
fn host_row(id: &str, request: &Request) -> HostAccessRequest {
    HostAccessRequest {
        id: id.into(),
        device_name: request.device_name.clone(),
        browser_hint: request.browser_hint.clone(),
        status: request.status,
        requested_at_ms: request.requested_at_ms,
        expires_at_ms: request.expires_at_ms,
        confirmation_code: (request.status == "approved").then(|| request.code.clone()),
    }
}
fn requester<'a>(
    store: &'a mut Store,
    scope: &str,
    credential: &str,
    now: Instant,
) -> Result<&'a mut Request, CompanionApiError> {
    let (id, secret) = credential.split_once('.').ok_or_else(invalid)?;
    if id.len() != 32 || secret.len() != 64 {
        return Err(invalid());
    }
    let request = store.requests.get_mut(id).ok_or_else(invalid)?;
    if request.scope != scope || !matches_secret(&request.secret_hash, &hash_secret(secret)) {
        return Err(invalid());
    }
    refresh(request, now);
    Ok(request)
}

impl AccessRecoveryStore {
    pub(crate) fn clear(&self) {
        if let Ok(mut store) = self.0.lock() {
            store.requests.clear();
            store.creations.clear();
        }
    }

    pub(crate) fn create(
        &self,
        scope: &str,
        existing: Option<&str>,
        name: &str,
        browser_hint: &str,
        now: Instant,
    ) -> Result<(AccessRequestStatus, Option<String>), CompanionApiError> {
        let name = name.trim();
        if name.is_empty()
            || name.chars().count() > 80
            || name.chars().any(|c| {
                c.is_control() || matches!(c,'\u{061c}'|'\u{200e}'..='\u{200f}'|'\u{2028}'..='\u{202e}'|'\u{2066}'..='\u{2069}')
            })
        {
            return Err(CompanionApiError::BadRequest("Invalid device name".into()));
        }
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        if let Some(credential) = existing
            && let Ok(request) = requester(&mut store, scope, credential, now)
            && matches!(request.status, "pending" | "approved")
        {
            return Ok((public_status(request, now), None));
        }
        store
            .requests
            .retain(|_, r| now.saturating_duration_since(r.deadline) < Duration::from_secs(60));
        while store
            .creations
            .front()
            .is_some_and(|t| now.saturating_duration_since(*t) >= Duration::from_secs(60))
        {
            store.creations.pop_front();
        }
        if store.requests.len() >= CAPACITY || store.creations.len() >= 10 {
            return Err(CompanionApiError::RateLimited(60));
        }
        let id = random_hex_token(16);
        let secret = random_hex_token(32);
        let requested_at_ms = unix_epoch_millis();
        let request = Request {
            scope: scope.into(),
            secret_hash: hash_secret(&secret),
            device_name: name.into(),
            browser_hint: browser_hint.into(),
            status: "pending",
            code: String::new(),
            attempts: 0,
            deadline: now + PENDING_LIFETIME,
            requested_at_ms,
            expires_at_ms: requested_at_ms + PENDING_LIFETIME.as_millis(),
        };
        let status = public_status(&request, now);
        store.requests.insert(id.clone(), request);
        store.creations.push_back(now);
        Ok((status, Some(format!("{id}.{secret}"))))
    }

    pub(crate) fn status(
        &self,
        scope: &str,
        credential: &str,
        now: Instant,
    ) -> Result<AccessRequestStatus, CompanionApiError> {
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        Ok(public_status(
            requester(&mut store, scope, credential, now)?,
            now,
        ))
    }

    pub(crate) fn cancel(
        &self,
        scope: &str,
        credential: &str,
        now: Instant,
    ) -> Result<AccessRequestStatus, CompanionApiError> {
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        let request = requester(&mut store, scope, credential, now)?;
        if matches!(request.status, "pending" | "approved") {
            request.status = "cancelled";
            request.code.zeroize();
            request.deadline = now;
        }
        Ok(public_status(request, now))
    }

    pub(crate) fn list(
        &self,
        scope: &str,
        now: Instant,
    ) -> Result<Vec<HostAccessRequest>, CompanionApiError> {
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        let mut rows = Vec::new();
        for (id, r) in &mut store.requests {
            refresh(r, now);
            if r.scope == scope && matches!(r.status, "pending" | "approved") {
                rows.push(host_row(id, r));
            }
        }
        rows.sort_by_key(|r| r.requested_at_ms);
        Ok(rows)
    }

    pub(crate) fn decide(
        &self,
        scope: &str,
        id: &str,
        approve: bool,
        now: Instant,
    ) -> Result<HostAccessRequest, CompanionApiError> {
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        let request = store
            .requests
            .get_mut(id)
            .filter(|r| r.scope == scope)
            .ok_or_else(invalid)?;
        refresh(request, now);
        if !matches!(request.status, "pending" | "approved") {
            return Err(CompanionApiError::Conflict);
        }
        if !approve {
            request.status = "rejected";
            request.code.zeroize();
            request.deadline = now;
        } else if request.status == "pending" {
            // Rejection sampling keeps all one million six-digit codes equally likely.
            let value = loop {
                let n = SysRng.try_next_u32().map_err(|_| lock_error())?;
                if n < 4_294_000_000 {
                    break n % 1_000_000;
                }
            };
            request.code = format!("{value:06}");
            request.status = "approved";
            request.deadline = now + CODE_LIFETIME;
            request.expires_at_ms = unix_epoch_millis() + CODE_LIFETIME.as_millis();
        }
        Ok(host_row(id, request))
    }

    /// Keep the lock through credential creation. Concurrent confirmations cannot grant twice.
    /// A database failure leaves the request redeemable; no success is reported prematurely.
    pub(crate) fn redeem<T>(
        &self,
        scope: &str,
        credential: &str,
        code: &str,
        now: Instant,
        grant: impl FnOnce(&str) -> Result<T, CompanionApiError>,
    ) -> Result<Redemption<T>, CompanionApiError> {
        let mut store = self.0.lock().map_err(|_| lock_error())?;
        let request = requester(&mut store, scope, credential, now)?;
        if request.status != "approved" {
            return Ok(Redemption::Waiting(public_status(request, now)));
        }
        if !matches_secret(&hash_secret(&request.code), &hash_secret(code)) {
            request.attempts += 1;
            if request.attempts >= MAX_ATTEMPTS {
                request.status = "locked";
                request.code.zeroize();
                request.deadline = now;
            }
            return Ok(Redemption::Waiting(public_status(request, now)));
        }
        let result = grant(&request.device_name)?;
        request.status = "completed";
        request.code.zeroize();
        request.deadline = now;
        Ok(Redemption::Granted(result))
    }
}
