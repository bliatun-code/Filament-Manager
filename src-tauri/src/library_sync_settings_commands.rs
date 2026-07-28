use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_host_client::{
    delete_library_sync_device_token, load_library_sync_device_token_bytes_optional,
    load_library_sync_device_token_optional, store_library_sync_device_token_bytes,
};
use crate::library_sync_models::SaveLibrarySyncSettingsInput;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeSession;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::with_inventory;
use zeroize::Zeroizing;

struct LibrarySyncPairingSnapshot {
    host_base_url: Option<String>,
    device_token: LibrarySyncDeviceTokenSnapshot,
    runtime_auth: Option<LibrarySyncRuntimeSession>,
}

enum LibrarySyncDeviceTokenSnapshot {
    Readable(Option<Zeroizing<Vec<u8>>>),
    Unreadable,
}

#[tauri::command]
pub(crate) fn get_library_sync_settings(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    get_library_sync_settings_inner(&state)
}

#[tauri::command]
pub(crate) fn save_library_sync_settings(
    state: tauri::State<'_, AppState>,
    input: SaveLibrarySyncSettingsInput,
) -> Result<LibrarySyncSettingsRow, String> {
    save_library_sync_settings_inner(&state, input)
}

fn get_library_sync_settings_inner(state: &AppState) -> Result<LibrarySyncSettingsRow, String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    settings_with_secure_pairing_state(state, settings)
}

fn save_library_sync_settings_inner(
    state: &AppState,
    mut input: SaveLibrarySyncSettingsInput,
) -> Result<LibrarySyncSettingsRow, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let previous = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let target_mode_is_client = input.mode.trim().eq_ignore_ascii_case("CLIENT");
    let target_host = if target_mode_is_client {
        input
            .host_base_url
            .as_deref()
            .map(normalize_library_sync_base_url)
            .transpose()?
    } else {
        None
    };
    input.host_base_url = target_host.clone();
    let previous_host = normalized_optional_host(previous.host_base_url.as_deref());
    let host_or_mode_changed =
        !target_mode_is_client || previous_host.as_deref() != target_host.as_deref();

    if host_or_mode_changed {
        let pairing_snapshot = capture_library_sync_pairing(state, previous_host.clone())?;
        if let Err(error) = clear_library_sync_pairing(state, &pairing_snapshot) {
            return Err(with_library_sync_pairing_rollback(
                error,
                restore_library_sync_pairing(state, &pairing_snapshot),
            ));
        }
        let saved = with_inventory(state, |engine| {
            engine.save_library_sync_settings(&settings_row_from_input(input))
        });
        return match saved {
            Ok(saved) => settings_with_secure_pairing_state(state, saved),
            Err(error) => Err(with_library_sync_pairing_rollback(
                error,
                restore_library_sync_pairing(state, &pairing_snapshot),
            )),
        };
    }

    let stale_runtime = state
        .library_sync_auth
        .current()?
        .is_some_and(|runtime| Some(runtime.host_base_url.as_str()) != target_host.as_deref());

    let saved = with_inventory(state, |engine| {
        engine.save_library_sync_settings(&settings_row_from_input(input))
    })?;
    if stale_runtime {
        state.library_sync_auth.clear()?;
    }
    settings_with_secure_pairing_state(state, saved)
}

#[tauri::command]
pub(crate) fn clear_library_sync_client_auth(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    clear_library_sync_client_auth_inner(&state)
}

fn clear_library_sync_client_auth_inner(
    state: &AppState,
) -> Result<LibrarySyncSettingsRow, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let current = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let pairing_snapshot = capture_library_sync_pairing(
        state,
        normalized_optional_host(current.host_base_url.as_deref()),
    )?;
    if let Err(error) = clear_library_sync_pairing(state, &pairing_snapshot) {
        return Err(with_library_sync_pairing_rollback(
            error,
            restore_library_sync_pairing(state, &pairing_snapshot),
        ));
    }

    let settings = with_inventory(state, |engine| {
        engine.clear_library_sync_client_auth_state()?;
        engine.get_library_sync_settings()
    });
    match settings {
        Ok(settings) => settings_with_secure_pairing_state(state, settings),
        Err(error) => Err(with_library_sync_pairing_rollback(
            error,
            restore_library_sync_pairing(state, &pairing_snapshot),
        )),
    }
}

fn settings_with_secure_pairing_state(
    state: &AppState,
    mut settings: LibrarySyncSettingsRow,
) -> Result<LibrarySyncSettingsRow, String> {
    settings.client_auth_paired = if settings.mode == "CLIENT" {
        match normalized_optional_host(settings.host_base_url.as_deref()) {
            Some(host) => match load_library_sync_device_token_optional(state, &host) {
                Ok(device_token) => device_token.is_some(),
                // The SQLite marker is intentionally retained when the platform
                // credential cannot be read. This keeps the repair/remove controls
                // available while authenticated sync itself continues to fail
                // closed when it attempts to load the unusable token.
                Err(_) => settings.client_auth_paired,
            },
            None => false,
        }
    } else {
        false
    };
    Ok(settings)
}

fn normalized_optional_host(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .map(|host| host.trim_end_matches('/'))
        .filter(|host| !host.is_empty())
        .map(str::to_string)
}

fn settings_row_from_input(input: SaveLibrarySyncSettingsInput) -> LibrarySyncSettingsRow {
    LibrarySyncSettingsRow {
        mode: input.mode,
        device_name: input.device_name,
        library_id: input.library_id,
        host_base_url: input.host_base_url,
        host_device_name: input.host_device_name,
        client_auth_paired: false,
        client_auth_paired_at: None,
        client_auth_expires_at: None,
        last_checked_at: None,
        last_reachable_at: None,
        last_validation_message: None,
        cached_snapshot: None,
        cached_spools: None,
        cached_printers: None,
        cached_loans: None,
        cached_wishlist: None,
    }
}

fn capture_library_sync_pairing(
    state: &AppState,
    host_base_url: Option<String>,
) -> Result<LibrarySyncPairingSnapshot, String> {
    let device_token = match host_base_url.as_deref() {
        Some(host) => match load_library_sync_device_token_bytes_optional(state, host) {
            Ok(value) => LibrarySyncDeviceTokenSnapshot::Readable(value),
            // An unreadable platform credential must not trap the user in a
            // broken pairing. Clear/reconfigure may still delete it; should the
            // later database write fail, rollback reports that the unusable
            // original value could not be reconstructed.
            Err(_) => LibrarySyncDeviceTokenSnapshot::Unreadable,
        },
        None => LibrarySyncDeviceTokenSnapshot::Readable(None),
    };
    Ok(LibrarySyncPairingSnapshot {
        host_base_url,
        device_token,
        runtime_auth: state.library_sync_auth.current()?,
    })
}

fn clear_library_sync_pairing(
    state: &AppState,
    previous: &LibrarySyncPairingSnapshot,
) -> Result<(), String> {
    state.library_sync_auth.clear()?;
    if let Some(host) = previous.host_base_url.as_deref() {
        delete_library_sync_device_token(state, host)?;
    }
    Ok(())
}

fn restore_library_sync_pairing(
    state: &AppState,
    previous: &LibrarySyncPairingSnapshot,
) -> Result<(), String> {
    let credential_result = match (previous.host_base_url.as_deref(), &previous.device_token) {
        (Some(host), LibrarySyncDeviceTokenSnapshot::Readable(Some(device_token))) => {
            store_library_sync_device_token_bytes(state, host, device_token)
        }
        (Some(host), LibrarySyncDeviceTokenSnapshot::Readable(None)) => {
            delete_library_sync_device_token(state, host).map(|_| ())
        }
        (Some(_), LibrarySyncDeviceTokenSnapshot::Unreadable) => Err(
            "The previous desktop client credential was unreadable and could not be restored."
                .to_string(),
        ),
        (None, _) => Ok(()),
    };
    let runtime_result = match previous.runtime_auth.as_ref() {
        Some(runtime) => state.library_sync_auth.replace(
            runtime.host_base_url.clone(),
            runtime.session_id.clone(),
            runtime.csrf_token.clone(),
        ),
        None => state.library_sync_auth.clear(),
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

fn with_library_sync_pairing_rollback(error: String, rollback: Result<(), String>) -> String {
    match rollback {
        Ok(()) => error,
        Err(rollback_error) => {
            format!("{error} Restoring the previous pairing also failed: {rollback_error}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        clear_library_sync_client_auth_inner, get_library_sync_settings_inner,
        save_library_sync_settings_inner, settings_with_secure_pairing_state,
    };
    use crate::backend::filament_database::{FilamentDatabase, LibrarySyncSettingsRow};
    use crate::credential_store::CredentialStore;
    use crate::library_sync_host_client::{
        load_library_sync_device_token_bytes_optional, load_library_sync_device_token_optional,
        store_library_sync_device_token, store_library_sync_device_token_bytes,
    };
    use crate::library_sync_models::SaveLibrarySyncSettingsInput;
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
            "filament-manager-library-settings-{}-{suffix}-{sequence}.sqlite",
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

    fn client_settings(host: &str, paired: bool) -> LibrarySyncSettingsRow {
        LibrarySyncSettingsRow {
            mode: "CLIENT".to_string(),
            device_name: "Client".to_string(),
            library_id: "library-id".to_string(),
            host_base_url: Some(host.to_string()),
            host_device_name: Some("Host".to_string()),
            client_auth_paired: paired,
            client_auth_paired_at: None,
            client_auth_expires_at: None,
            last_checked_at: None,
            last_reachable_at: None,
            last_validation_message: None,
            cached_snapshot: None,
            cached_spools: None,
            cached_printers: None,
            cached_loans: None,
            cached_wishlist: None,
        }
    }

    #[test]
    fn paired_flag_is_derived_from_secure_store_instead_of_sqlite_marker() {
        let state = test_state();
        let host = "http://host.local:4278";

        assert!(
            !settings_with_secure_pairing_state(&state, client_settings(host, true))
                .expect("read unpaired settings")
                .client_auth_paired
        );

        store_library_sync_device_token(&state, host, "device-token").expect("store token");
        assert!(
            settings_with_secure_pairing_state(&state, client_settings(host, false))
                .expect("read paired settings")
                .client_auth_paired
        );

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn changing_client_host_removes_old_token_and_runtime_session() {
        let state = test_state();
        let old_host = "http://old-host.local:4278";
        let new_host = "http://new-host.local:4278";
        with_test_database(&state, |db| {
            db.save_library_sync_settings(&client_settings(old_host, false))
        });
        store_library_sync_device_token(&state, old_host, "device-token").expect("store token");
        state
            .library_sync_auth
            .replace(old_host, "session", "csrf")
            .expect("save runtime session");

        let saved = save_library_sync_settings_inner(
            &state,
            SaveLibrarySyncSettingsInput {
                mode: "CLIENT".to_string(),
                device_name: "Client".to_string(),
                library_id: "library-id".to_string(),
                host_base_url: Some(format!("{new_host}/")),
                host_device_name: None,
            },
        )
        .expect("change host");

        assert_eq!(saved.host_base_url.as_deref(), Some(new_host));
        assert!(!saved.client_auth_paired);
        assert!(load_library_sync_device_token_optional(&state, old_host)
            .expect("read old token")
            .is_none());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime")
            .is_none());
        assert!(
            !get_library_sync_settings_inner(&state)
                .expect("read settings")
                .client_auth_paired
        );

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_host_or_mode_change_restores_device_token_runtime_and_database_settings() {
        for (case_name, mode, target_host) in [
            ("host-change", "CLIENT", Some("http://new-host.local:4278")),
            ("mode-change", "HOST", None),
        ] {
            let state = test_state();
            let old_host = "http://old-host.local:4278";
            with_test_database(&state, |db| {
                db.save_library_sync_settings(&client_settings(old_host, false))?;
                db.connection().execute_batch(
                    "CREATE TRIGGER fail_library_settings_save
                     BEFORE UPDATE ON settings
                     WHEN OLD.key = 'library_sync_mode'
                     BEGIN
                       SELECT RAISE(ABORT, 'forced library settings failure');
                     END;",
                )?;
                Ok(())
            });
            store_library_sync_device_token(&state, old_host, "device-token").expect("store token");
            state
                .library_sync_auth
                .replace(old_host, "session", "csrf")
                .expect("save runtime session");

            save_library_sync_settings_inner(
                &state,
                SaveLibrarySyncSettingsInput {
                    mode: mode.to_string(),
                    device_name: "Client".to_string(),
                    library_id: "library-id".to_string(),
                    host_base_url: target_host.map(str::to_string),
                    host_device_name: None,
                },
            )
            .expect_err(case_name);

            assert_eq!(
                load_library_sync_device_token_optional(&state, old_host)
                    .expect("read restored token")
                    .as_deref(),
                Some("device-token"),
                "{case_name}"
            );
            let runtime = state
                .library_sync_auth
                .current()
                .expect("read runtime")
                .expect("runtime restored");
            assert_eq!(runtime.host_base_url, old_host, "{case_name}");
            assert_eq!(runtime.session_id, "session", "{case_name}");
            assert_eq!(runtime.csrf_token, "csrf", "{case_name}");

            let persisted = with_test_database(&state, |db| db.get_library_sync_settings());
            assert_eq!(persisted.mode, "CLIENT", "{case_name}");
            assert_eq!(
                persisted.host_base_url.as_deref(),
                Some(old_host),
                "{case_name}"
            );
            let _ = std::fs::remove_file(&state.db_path);
        }
    }

    #[test]
    fn clearing_pairing_removes_token_runtime_and_database_marker() {
        let state = test_state();
        let host = "http://host.local:4278";
        with_test_database(&state, |db| {
            db.save_library_sync_settings(&client_settings(host, false))?;
            db.save_library_sync_client_auth_metadata(None)
        });
        store_library_sync_device_token(&state, host, "device-token").expect("store token");
        state
            .library_sync_auth
            .replace(host, "session", "csrf")
            .expect("save runtime session");

        let cleared =
            clear_library_sync_client_auth_inner(&state).expect("clear secure client pairing");

        assert!(!cleared.client_auth_paired);
        assert!(cleared.client_auth_paired_at.is_none());
        assert!(load_library_sync_device_token_optional(&state, host)
            .expect("read removed token")
            .is_none());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_clear_pairing_restores_device_token_runtime_and_database_marker() {
        let state = test_state();
        let host = "http://host.local:4278";
        with_test_database(&state, |db| {
            db.save_library_sync_settings(&client_settings(host, false))?;
            db.save_library_sync_client_auth_metadata(None)?;
            db.connection().execute_batch(
                "CREATE TRIGGER fail_library_pairing_clear
                 BEFORE DELETE ON settings
                 WHEN OLD.key = 'library_sync_client_auth_configured'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced library pairing clear failure');
                 END;",
            )?;
            Ok(())
        });
        store_library_sync_device_token(&state, host, "device-token").expect("store token");
        state
            .library_sync_auth
            .replace(host, "session", "csrf")
            .expect("save runtime session");

        clear_library_sync_client_auth_inner(&state)
            .expect_err("forced database failure must fail clear");

        assert_eq!(
            load_library_sync_device_token_optional(&state, host)
                .expect("read restored token")
                .as_deref(),
            Some("device-token")
        );
        let runtime = state
            .library_sync_auth
            .current()
            .expect("read runtime")
            .expect("runtime restored");
        assert_eq!(runtime.host_base_url, host);
        assert_eq!(runtime.session_id, "session");
        assert_eq!(runtime.csrf_token, "csrf");
        let persisted = with_test_database(&state, |db| db.get_library_sync_settings());
        assert!(persisted.client_auth_paired);

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn corrupt_device_token_does_not_block_settings_or_explicit_pairing_clear() {
        let state = test_state();
        let host = "http://host.local:4278";
        with_test_database(&state, |db| {
            db.save_library_sync_settings(&client_settings(host, false))?;
            db.save_library_sync_client_auth_metadata(None)
        });
        store_library_sync_device_token_bytes(&state, host, &[0xff, 0xfe])
            .expect("store corrupt token fixture");

        let settings =
            get_library_sync_settings_inner(&state).expect("settings remain available for repair");
        assert!(settings.client_auth_paired);
        assert!(load_library_sync_device_token_optional(&state, host).is_err());

        let cleared = clear_library_sync_client_auth_inner(&state)
            .expect("explicit clear removes corrupt credential");
        assert!(!cleared.client_auth_paired);
        assert!(load_library_sync_device_token_bytes_optional(&state, host)
            .expect("read cleared raw token")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }

    fn with_test_database<T>(
        state: &AppState,
        action: impl FnOnce(&FilamentDatabase) -> crate::backend::database_result::InventoryResult<T>,
    ) -> T {
        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        action(&db).expect("test database action")
    }
}
