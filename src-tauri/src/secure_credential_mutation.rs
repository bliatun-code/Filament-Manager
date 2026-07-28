use std::sync::{Mutex, MutexGuard};

/// Serializes application workflows that coordinate SQLite state with
/// machine-local credentials or volatile authenticated sessions.
///
/// Keep the lock order uniform everywhere:
/// secure credential mutation gate -> database maintenance/connection ->
/// credential store -> runtime authentication.
static SECURE_CREDENTIAL_MUTATION_GATE: Mutex<()> = Mutex::new(());

pub(crate) fn lock_secure_credential_mutation() -> Result<MutexGuard<'static, ()>, String> {
    SECURE_CREDENTIAL_MUTATION_GATE
        .lock()
        .map_err(|_| "Secure credential settings are temporarily unavailable.".to_string())
}
