use std::sync::{Arc, Mutex};
use zeroize::Zeroize;

#[derive(Clone)]
pub(crate) struct LibrarySyncRuntimeAuth {
    session: Arc<Mutex<Option<LibrarySyncRuntimeSession>>>,
}

#[derive(Clone)]
pub(crate) struct LibrarySyncRuntimeSession {
    pub(crate) host_base_url: String,
    pub(crate) session_id: String,
    pub(crate) csrf_token: String,
}

impl Drop for LibrarySyncRuntimeSession {
    fn drop(&mut self) {
        self.session_id.zeroize();
        self.csrf_token.zeroize();
    }
}

impl LibrarySyncRuntimeAuth {
    pub(crate) fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
        }
    }

    pub(crate) fn current(&self) -> Result<Option<LibrarySyncRuntimeSession>, String> {
        self.session
            .lock()
            .map(|session| session.clone())
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())
    }

    pub(crate) fn replace(
        &self,
        host_base_url: impl Into<String>,
        session_id: impl Into<String>,
        csrf_token: impl Into<String>,
    ) -> Result<(), String> {
        let host_base_url = host_base_url.into();
        let session_id = session_id.into();
        let csrf_token = csrf_token.into();
        if host_base_url.trim().is_empty()
            || session_id.trim().is_empty()
            || csrf_token.trim().is_empty()
        {
            return Err(
                "Desktop client host, session and CSRF token must all be present.".to_string(),
            );
        }
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())?;
        *session = Some(LibrarySyncRuntimeSession {
            host_base_url,
            session_id,
            csrf_token,
        });
        Ok(())
    }

    pub(crate) fn clear(&self) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Desktop client authentication state is unavailable.".to_string())?;
        *session = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::LibrarySyncRuntimeAuth;

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
}
