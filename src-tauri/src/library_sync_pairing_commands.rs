use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    ensure_stable_local_library_sync_host, library_sync_host_input,
    normalize_library_sync_host_input,
};
use crate::library_sync_host_client::{
    delete_library_sync_device_token, ensure_library_sync_host_matches,
    extract_library_sync_pairing_token, load_library_sync_device_token_bytes_optional,
    pair_library_sync_host_session, store_library_sync_device_token,
    store_library_sync_device_token_bytes, LibrarySyncAuthenticatedSessionState,
};
use crate::library_sync_models::PairLibrarySyncHostInput;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) async fn pair_library_sync_host(
    state: tauri::State<'_, AppState>,
    input: PairLibrarySyncHostInput,
) -> Result<LibrarySyncSettingsRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || pair_library_sync_host_blocking(&state, input)).await
}

fn pair_library_sync_host_blocking(
    state: &AppState,
    input: PairLibrarySyncHostInput,
) -> Result<LibrarySyncSettingsRow, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let host_input = library_sync_host_input(&input.base_url, None);
    let (normalized_base_url, _) = normalize_library_sync_host_input(&host_input)?;
    ensure_stable_local_library_sync_host(&normalized_base_url)?;
    ensure_pairing_target_is_current(state, &normalized_base_url)?;
    let pairing_token = extract_library_sync_pairing_token(&input.pairing_token_or_url)
        .ok_or_else(|| "Pairing token or URL is required.".to_string())?;

    let auth_state = pair_library_sync_host_session(&normalized_base_url, &pairing_token)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, None)?;
    ensure_pairing_target_is_current(state, &normalized_base_url)?;

    persist_library_sync_pairing_under_gate(
        state,
        &normalized_base_url,
        auth_state,
        health.device_name.as_deref(),
    )
}

#[cfg(test)]
fn persist_library_sync_pairing(
    state: &AppState,
    normalized_base_url: &str,
    auth_state: LibrarySyncAuthenticatedSessionState,
    host_device_name: Option<&str>,
) -> Result<LibrarySyncSettingsRow, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    persist_library_sync_pairing_under_gate(
        state,
        normalized_base_url,
        auth_state,
        host_device_name,
    )
}

fn persist_library_sync_pairing_under_gate(
    state: &AppState,
    normalized_base_url: &str,
    mut auth_state: LibrarySyncAuthenticatedSessionState,
    host_device_name: Option<&str>,
) -> Result<LibrarySyncSettingsRow, String> {
    let previous_device_token =
        load_library_sync_device_token_bytes_optional(state, normalized_base_url)?;
    let previous_runtime_auth = state.library_sync_auth.current()?;

    if let Err(error) =
        store_library_sync_device_token(state, normalized_base_url, &auth_state.device_token)
    {
        return Err(with_pairing_rollback(
            error,
            restore_library_sync_pairing_state(
                state,
                normalized_base_url,
                previous_device_token
                    .as_ref()
                    .map(|device_token| device_token.as_slice()),
                previous_runtime_auth,
            ),
        ));
    }
    if let Err(error) = state.library_sync_auth.replace_authenticated(
        normalized_base_url,
        std::mem::take(&mut auth_state.session_id),
        std::mem::take(&mut auth_state.csrf_token),
        std::mem::take(&mut auth_state.device_token),
    ) {
        return Err(with_pairing_rollback(
            error,
            restore_library_sync_pairing_state(
                state,
                normalized_base_url,
                previous_device_token
                    .as_ref()
                    .map(|device_token| device_token.as_slice()),
                previous_runtime_auth,
            ),
        ));
    }

    let saved = with_inventory(state, |engine| {
        engine.finalize_library_sync_client_pairing(
            None,
            "Host desktop pairing completed.",
            host_device_name,
        )
    });
    match saved {
        Ok(mut settings) => {
            settings.client_auth_paired = true;
            Ok(settings)
        }
        Err(error) => Err(with_pairing_rollback(
            error,
            restore_library_sync_pairing_state(
                state,
                normalized_base_url,
                previous_device_token
                    .as_ref()
                    .map(|device_token| device_token.as_slice()),
                previous_runtime_auth,
            ),
        )),
    }
}

fn ensure_pairing_target_is_current(
    state: &AppState,
    normalized_base_url: &str,
) -> Result<(), String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let current_host = settings
        .host_base_url
        .as_deref()
        .map(str::trim)
        .map(|host| host.trim_end_matches('/'))
        .filter(|host| !host.is_empty());
    if settings.mode != "CLIENT" || current_host != Some(normalized_base_url) {
        return Err(
            "Desktop client settings changed while pairing. Review the library host and pair again."
                .to_string(),
        );
    }
    Ok(())
}

fn restore_library_sync_pairing_state(
    state: &AppState,
    normalized_base_url: &str,
    previous_device_token: Option<&[u8]>,
    previous_runtime_auth: Option<crate::library_sync_runtime_auth::LibrarySyncRuntimeSession>,
) -> Result<(), String> {
    let credential_result = match previous_device_token {
        Some(device_token) => {
            store_library_sync_device_token_bytes(state, normalized_base_url, device_token)
        }
        None => delete_library_sync_device_token(state, normalized_base_url).map(|_| ()),
    };

    // Never re-enable a reusable in-memory token unless its durable credential was restored.
    // Otherwise a failed Keychain/Credential Manager rollback would remain authenticated until
    // process exit even though the platform credential state is unknown.
    let runtime_result = if credential_result.is_ok() {
        match previous_runtime_auth {
            Some(auth) => state.library_sync_auth.restore(auth),
            None => state.library_sync_auth.clear(),
        }
    } else {
        state.library_sync_auth.clear()
    };

    match (credential_result, runtime_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(credential_error), Ok(())) => Err(credential_error),
        (Ok(()), Err(runtime_error)) => Err(runtime_error),
        (Err(credential_error), Err(runtime_error)) => Err(format!(
            "{credential_error} Runtime-session rollback also failed: {runtime_error}"
        )),
    }
}

fn with_pairing_rollback(error: String, rollback: Result<(), String>) -> String {
    match rollback {
        Ok(()) => error,
        Err(rollback_error) => {
            format!("{error} Restoring the previous pairing also failed: {rollback_error}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{persist_library_sync_pairing, restore_library_sync_pairing_state};
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_host_client::{
        load_library_sync_device_token, store_library_sync_device_token_bytes,
        LibrarySyncAuthenticatedSessionState,
    };
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DATABASE: AtomicU64 = AtomicU64::new(1);

    fn test_state() -> AppState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let sequence = NEXT_TEST_DATABASE.fetch_add(1, Ordering::Relaxed);
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-library-pairing-{}-{suffix}-{sequence}.sqlite",
            std::process::id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply test schema");
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    #[test]
    fn pairing_keeps_only_device_token_outside_sqlite() {
        let state = test_state();
        let host = "http://host.local:4278";

        let saved = persist_library_sync_pairing(
            &state,
            host,
            LibrarySyncAuthenticatedSessionState {
                session_id: "session-secret".to_string(),
                device_token: "device-secret".to_string(),
                csrf_token: "csrf-secret".to_string(),
            },
            Some("Studio Mac"),
        )
        .expect("persist secure pairing");

        assert!(saved.client_auth_paired);
        assert_eq!(
            load_library_sync_device_token(&state, host).expect("device token"),
            "device-secret"
        );
        let runtime = state
            .library_sync_auth
            .current()
            .expect("runtime auth")
            .expect("paired runtime auth");
        assert_eq!(runtime.session_id, "session-secret");
        assert_eq!(runtime.csrf_token, "csrf-secret");

        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        assert_eq!(
            db.get_library_sync_client_auth_state()
                .expect("read legacy auth"),
            None
        );
        assert!(
            db.get_library_sync_settings()
                .expect("read settings")
                .client_auth_paired
        );

        drop(db);
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_credential_rollback_does_not_restore_runtime_device_token() {
        let state = test_state();
        let host = "http://host.local:4278";
        let previous_auth = LibrarySyncRuntimeAuth::new();
        previous_auth
            .replace_authenticated(host, "previous-session", "previous-csrf", "previous-device")
            .expect("build previous runtime auth");
        state
            .library_sync_auth
            .replace_authenticated(host, "new-session", "new-csrf", "new-device")
            .expect("seed replacement runtime auth");

        let error = restore_library_sync_pairing_state(
            &state,
            host,
            // An empty secret is rejected by the credential store and deterministically exercises
            // the credential-rollback failure path without depending on a platform backend.
            Some(&[]),
            previous_auth.current().expect("snapshot previous auth"),
        )
        .expect_err("credential rollback must fail");

        assert!(error.contains("credential"));
        assert!(state
            .library_sync_auth
            .current()
            .expect("read fail-closed runtime auth")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn pairing_can_replace_a_corrupt_device_token() {
        let state = test_state();
        let host = "http://host.local:4278";
        store_library_sync_device_token_bytes(&state, host, &[0xff, 0xfe])
            .expect("store corrupt token fixture");

        persist_library_sync_pairing(
            &state,
            host,
            LibrarySyncAuthenticatedSessionState {
                session_id: "session-secret".to_string(),
                device_token: "replacement-device-secret".to_string(),
                csrf_token: "csrf-secret".to_string(),
            },
            Some("Studio Mac"),
        )
        .expect("repair corrupt pairing");

        assert_eq!(
            load_library_sync_device_token(&state, host).expect("replacement token"),
            "replacement-device-secret"
        );

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_database_finalization_restores_database_credential_and_runtime() {
        let state = test_state();
        let host = "http://host.local:4278";
        let before = with_test_database(&state, |db| {
            let mut settings = db.get_library_sync_settings()?;
            settings.mode = "CLIENT".to_string();
            settings.host_base_url = Some(host.to_string());
            db.save_library_sync_settings(&settings)?;
            db.save_library_sync_client_auth_metadata(Some("2099-01-01T00:00:00Z"))?;
            db.save_library_sync_validation_state(
                false,
                Some("Previous validation state."),
                Some("Previous host"),
            )?;
            let snapshot = library_settings_snapshot(db)?;
            db.connection().execute_batch(
                "CREATE TRIGGER fail_pairing_finalization
                 BEFORE UPDATE OF value ON settings
                 WHEN OLD.key = 'library_sync_last_validation_message'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced pairing finalization failure');
                 END;",
            )?;
            Ok(snapshot)
        });
        store_library_sync_device_token_bytes(&state, host, b"previous-device-token")
            .expect("store previous token");
        state
            .library_sync_auth
            .replace_authenticated(
                host,
                "previous-session",
                "previous-csrf",
                "previous-device-token",
            )
            .expect("store previous runtime");

        persist_library_sync_pairing(
            &state,
            host,
            LibrarySyncAuthenticatedSessionState {
                session_id: "replacement-session".to_string(),
                device_token: "replacement-device-token".to_string(),
                csrf_token: "replacement-csrf".to_string(),
            },
            Some("Replacement host"),
        )
        .expect_err("late database failure must reject pairing");

        let after = with_test_database(&state, library_settings_snapshot);
        assert_eq!(after, before);
        assert_eq!(
            load_library_sync_device_token(&state, host).expect("restored device token"),
            "previous-device-token"
        );
        let runtime = state
            .library_sync_auth
            .current()
            .expect("read runtime")
            .expect("restored runtime");
        assert_eq!(runtime.host_base_url, host);
        assert_eq!(runtime.session_id, "previous-session");
        assert_eq!(
            runtime.device_token.as_deref(),
            Some("previous-device-token")
        );
        assert_eq!(runtime.csrf_token, "previous-csrf");

        let _ = std::fs::remove_file(&state.db_path);
    }

    fn library_settings_snapshot(
        db: &FilamentDatabase,
    ) -> crate::backend::database_result::InventoryResult<Vec<(String, String)>> {
        let mut statement = db.connection().prepare(
            "SELECT key, value
                 FROM settings
                 WHERE key LIKE 'library_sync_%'
                 ORDER BY key",
        )?;
        let rows = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn with_test_database<T>(
        state: &AppState,
        action: impl FnOnce(&FilamentDatabase) -> crate::backend::database_result::InventoryResult<T>,
    ) -> T {
        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        action(&db).expect("test database action")
    }
}
