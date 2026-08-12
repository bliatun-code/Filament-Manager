use std::hash::{DefaultHasher, Hash, Hasher};
#[cfg(test)]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use zeroize::Zeroize;

#[derive(Clone)]
pub(crate) struct LibrarySyncRuntimeAuth {
    session: Arc<Mutex<Option<LibrarySyncRuntimeSession>>>,
    recent_renewal_failure: Arc<Mutex<Option<LibrarySyncRenewalFailure>>>,
}

const LIBRARY_SYNC_RENEWAL_FAILURE_TTL: Duration = Duration::from_secs(1);

struct LibrarySyncRenewalFailure {
    host_base_url: String,
    device_token_fingerprint: u64,
    kind: LibrarySyncRenewalFailureKind,
    recorded_at: Instant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LibrarySyncRenewalFailureKind {
    Unauthorized,
    Transient,
}

#[derive(Clone)]
pub(crate) struct LibrarySyncRuntimeSession {
    pub(crate) host_base_url: String,
    pub(crate) session_id: String,
    pub(crate) csrf_token: String,
    pub(crate) device_token: Option<String>,
    #[cfg(test)]
    drop_observer: Option<Arc<AtomicBool>>,
}

impl Drop for LibrarySyncRuntimeSession {
    fn drop(&mut self) {
        self.session_id.zeroize();
        self.csrf_token.zeroize();
        if let Some(device_token) = self.device_token.as_mut() {
            device_token.zeroize();
        }
        #[cfg(test)]
        if let Some(observer) = self.drop_observer.as_ref() {
            observer.store(true, Ordering::SeqCst);
        }
    }
}

impl LibrarySyncRuntimeAuth {
    pub(crate) fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            recent_renewal_failure: Arc::new(Mutex::new(None)),
        }
    }

    pub(crate) fn current(&self) -> Result<Option<LibrarySyncRuntimeSession>, String> {
        self.session
            .lock()
            .map(|session| session.clone())
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())
    }

    #[cfg(test)]
    pub(crate) fn replace(
        &self,
        host_base_url: impl Into<String>,
        session_id: impl Into<String>,
        csrf_token: impl Into<String>,
    ) -> Result<(), String> {
        self.replace_inner(host_base_url, session_id, csrf_token, None)
    }

    pub(crate) fn replace_authenticated(
        &self,
        host_base_url: impl Into<String>,
        session_id: impl Into<String>,
        csrf_token: impl Into<String>,
        device_token: impl Into<String>,
    ) -> Result<(), String> {
        self.replace_inner(
            host_base_url,
            session_id,
            csrf_token,
            Some(device_token.into()),
        )?;
        self.clear_renewal_failure();
        Ok(())
    }

    pub(crate) fn restore(&self, mut session: LibrarySyncRuntimeSession) -> Result<(), String> {
        self.replace_inner(
            std::mem::take(&mut session.host_base_url),
            std::mem::take(&mut session.session_id),
            std::mem::take(&mut session.csrf_token),
            session.device_token.take(),
        )?;
        self.clear_renewal_failure();
        Ok(())
    }

    fn replace_inner(
        &self,
        host_base_url: impl Into<String>,
        session_id: impl Into<String>,
        csrf_token: impl Into<String>,
        device_token: Option<String>,
    ) -> Result<(), String> {
        // Move every secret into its zeroizing owner before validation or locking. This keeps
        // rejected candidates and lock-failure paths from dropping plain secret Strings.
        let candidate = LibrarySyncRuntimeSession {
            host_base_url: host_base_url.into(),
            session_id: session_id.into(),
            csrf_token: csrf_token.into(),
            device_token,
            #[cfg(test)]
            drop_observer: None,
        };
        self.replace_candidate(candidate)
    }

    fn replace_candidate(&self, candidate: LibrarySyncRuntimeSession) -> Result<(), String> {
        if candidate.host_base_url.trim().is_empty()
            || candidate.session_id.trim().is_empty()
            || candidate.csrf_token.trim().is_empty()
            || candidate
                .device_token
                .as_deref()
                .is_some_and(|token| token.trim().is_empty())
        {
            return Err(
                "Desktop client host, session, CSRF token and optional device token must be valid."
                    .to_string(),
            );
        }
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())?;
        *session = Some(candidate);
        Ok(())
    }

    pub(crate) fn clear(&self) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())?;
        *session = None;
        drop(session);
        self.clear_renewal_failure();
        Ok(())
    }

    pub(crate) fn recent_renewal_failure(
        &self,
        host_base_url: &str,
        device_token: &str,
    ) -> Option<LibrarySyncRenewalFailureKind> {
        let mut recent_failure = self
            .recent_renewal_failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let failure = recent_failure.as_ref()?;
        if failure.recorded_at.elapsed() >= LIBRARY_SYNC_RENEWAL_FAILURE_TTL {
            *recent_failure = None;
            return None;
        }
        (failure.host_base_url == host_base_url
            && failure.device_token_fingerprint == library_sync_secret_fingerprint(device_token))
        .then_some(failure.kind)
    }

    pub(crate) fn record_renewal_failure(
        &self,
        host_base_url: &str,
        device_token: &str,
        kind: LibrarySyncRenewalFailureKind,
    ) {
        let mut recent_failure = self
            .recent_renewal_failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *recent_failure = Some(LibrarySyncRenewalFailure {
            host_base_url: host_base_url.to_string(),
            device_token_fingerprint: library_sync_secret_fingerprint(device_token),
            kind,
            recorded_at: Instant::now(),
        });
    }

    pub(crate) fn clear_renewal_failure(&self) {
        let mut recent_failure = self
            .recent_renewal_failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *recent_failure = None;
    }
}

fn library_sync_secret_fingerprint(secret: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    secret.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::{LibrarySyncRuntimeAuth, LibrarySyncRuntimeSession};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[test]
    fn session_can_be_replaced_read_and_cleared() {
        let auth = LibrarySyncRuntimeAuth::new();
        assert!(auth.current().expect("read empty auth").is_none());

        auth.replace("http://host.local:4278", "session-id", "csrf-token")
            .expect("save runtime auth");
        let saved = auth
            .current()
            .expect("read runtime auth")
            .expect("saved runtime auth");
        assert_eq!(saved.host_base_url, "http://host.local:4278");
        assert_eq!(saved.session_id, "session-id");
        assert_eq!(saved.csrf_token, "csrf-token");
        assert_eq!(saved.device_token, None);

        auth.clear().expect("clear runtime auth");
        assert!(auth.current().expect("read cleared auth").is_none());
    }

    #[test]
    fn incomplete_session_is_rejected_without_replacing_current_state() {
        let auth = LibrarySyncRuntimeAuth::new();
        auth.replace("http://host.local:4278", "session-id", "csrf-token")
            .expect("save initial runtime auth");

        assert!(auth
            .replace("http://host.local:4278", " ", "csrf-next")
            .is_err());
        let saved = auth
            .current()
            .expect("read runtime auth")
            .expect("initial auth remains");
        assert_eq!(saved.session_id, "session-id");
        assert_eq!(saved.csrf_token, "csrf-token");
    }

    #[test]
    fn authenticated_session_keeps_device_token_only_in_runtime_state() {
        let auth = LibrarySyncRuntimeAuth::new();
        auth.replace_authenticated(
            "http://host.local:4278",
            "session-id",
            "csrf-token",
            "device-token",
        )
        .expect("save authenticated runtime auth");

        let saved = auth
            .current()
            .expect("read runtime auth")
            .expect("saved runtime auth");
        assert_eq!(saved.device_token.as_deref(), Some("device-token"));

        auth.clear().expect("clear runtime auth");
        assert!(auth.current().expect("read cleared auth").is_none());
    }

    #[test]
    fn blank_device_token_is_rejected_without_replacing_current_state() {
        let auth = LibrarySyncRuntimeAuth::new();
        auth.replace("http://host.local:4278", "session-id", "csrf-token")
            .expect("save initial runtime auth");

        assert!(auth
            .replace_authenticated("http://host.local:4278", "session-next", "csrf-next", " ",)
            .is_err());
        let saved = auth
            .current()
            .expect("read runtime auth")
            .expect("initial auth remains");
        assert_eq!(saved.session_id, "session-id");
        assert_eq!(saved.device_token, None);
    }

    #[test]
    fn rejected_candidate_is_dropped_through_the_zeroizing_session_owner() {
        let auth = LibrarySyncRuntimeAuth::new();
        let dropped = Arc::new(AtomicBool::new(false));

        auth.replace_candidate(LibrarySyncRuntimeSession {
            host_base_url: "http://host.local:4278".to_string(),
            session_id: " ".to_string(),
            csrf_token: "candidate-csrf".to_string(),
            device_token: Some("candidate-device-token".to_string()),
            drop_observer: Some(Arc::clone(&dropped)),
        })
        .expect_err("invalid candidate must be rejected");

        assert!(dropped.load(Ordering::SeqCst));
    }

    #[test]
    fn lock_failure_drops_candidate_through_the_zeroizing_session_owner() {
        let auth = LibrarySyncRuntimeAuth::new();
        let poisoned = Arc::clone(&auth.session);
        std::thread::spawn(move || {
            let _guard = poisoned.lock().expect("lock runtime auth for poisoning");
            panic!("poison runtime auth lock");
        })
        .join()
        .expect_err("poisoning thread must panic");
        let dropped = Arc::new(AtomicBool::new(false));

        auth.replace_candidate(LibrarySyncRuntimeSession {
            host_base_url: "http://host.local:4278".to_string(),
            session_id: "candidate-session".to_string(),
            csrf_token: "candidate-csrf".to_string(),
            device_token: Some("candidate-device-token".to_string()),
            drop_observer: Some(Arc::clone(&dropped)),
        })
        .expect_err("poisoned runtime state must reject replacement");

        assert!(dropped.load(Ordering::SeqCst));
    }
}
