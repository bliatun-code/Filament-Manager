use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_host_client::{
    is_library_sync_pairing_unauthorized_error, load_library_sync_device_token_optional,
    renew_and_cache_library_sync_auth, request_library_sync_health,
};
use crate::library_sync_models::{LibrarySyncHostValidationResult, ValidateLibrarySyncHostInput};
use crate::library_sync_target_guard::{
    capture_current_library_sync_target_if_matching, with_current_library_sync_target_if_current,
    LibrarySyncTargetGuard,
};
use crate::state::AppState;
use std::time::Duration;

#[tauri::command]
pub(crate) async fn validate_library_sync_host(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncHostValidationResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || validate_library_sync_host_blocking(&state, input)).await
}

fn validate_library_sync_host_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncHostValidationResult, String> {
    let normalized_base_url = normalize_library_sync_base_url(&input.base_url)?;
    let validation_target = capture_current_library_sync_target_if_matching(
        state,
        &normalized_base_url,
        input.expected_library_id.as_deref(),
    )?;

    let response = match request_library_sync_health(
        &normalized_base_url,
        Duration::from_millis(900),
        "Host check",
        validation_target.is_some(),
    ) {
        Ok(response) => response,
        Err(error) => {
            let result = LibrarySyncHostValidationResult {
                base_url: normalized_base_url,
                reachable: false,
                ok: false,
                matches_library_id: false,
                pairing_checked: false,
                pairing_valid: false,
                target_generation: None,
                app_version: None,
                api_version: None,
                auth_mode: None,
                access_mode: None,
                library_id: None,
                device_name: None,
                sync_mode: None,
                message: error,
            };
            let _ = save_validation_if_current(
                state,
                validation_target.as_ref(),
                false,
                Some(&result.message),
                None,
            )?;
            return Ok(result);
        }
    };

    if !response.response.status().is_success() {
        let result = LibrarySyncHostValidationResult {
            base_url: normalized_base_url,
            reachable: true,
            ok: false,
            matches_library_id: false,
            pairing_checked: false,
            pairing_valid: false,
            target_generation: None,
            app_version: None,
            api_version: None,
            auth_mode: None,
            access_mode: None,
            library_id: None,
            device_name: None,
            sync_mode: None,
            message: format!("Host check returned {}.", response.response.status()),
        };
        let _ = save_validation_if_current(
            state,
            validation_target.as_ref(),
            true,
            Some(&result.message),
            None,
        )?;
        return Ok(result);
    }

    let (parsed, candidate) = response.read_health()?;
    let remote_library_id = parsed.library_id.clone();
    let matches_library_id = input
        .expected_library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            validation_target
                .as_ref()
                .map(LibrarySyncTargetGuard::library_id)
        })
        .map(|expected| remote_library_id.as_deref() == Some(expected))
        .unwrap_or(true);

    let mut message = if !parsed.ok {
        "Host reported not ready.".to_string()
    } else if !matches_library_id {
        format!(
            "Connected to a different library{}.",
            remote_library_id
                .as_deref()
                .map(|value| format!(" ({value})"))
                .unwrap_or_default()
        )
    } else {
        format!(
            "Host is reachable{}.",
            parsed
                .device_name
                .as_deref()
                .map(|value| format!(" on {value}"))
                .unwrap_or_default()
        )
    };

    let mut pairing_checked = false;
    let mut pairing_valid = false;

    let pairing_target = validation_target
        .clone()
        .and_then(|target| candidate.verify(&parsed, target).ok());
    if let Some(target) = pairing_target.as_ref()
        && with_current_library_sync_target_if_current(state, target, |_| Ok(()))?.is_some()
        && let Some(device_token) =
            load_library_sync_device_token_optional(state, &normalized_base_url)?
    {
        pairing_checked = true;
        match renew_and_cache_library_sync_auth(state, target, &device_token) {
            Ok(_) => {
                pairing_valid = true;
            }
            Err(error) => {
                message = if is_library_sync_pairing_unauthorized_error(&error) {
                    format!(
                        "Host is reachable{}, but desktop client pairing is no longer valid.",
                        parsed
                            .device_name
                            .as_deref()
                            .map(|value| format!(" on {value}"))
                            .unwrap_or_default()
                    )
                } else {
                    format!(
                            "Host is reachable{}, but desktop client pairing could not be verified ({error}).",
                            parsed
                                .device_name
                                .as_deref()
                                .map(|value| format!(" on {value}"))
                                .unwrap_or_default()
                        )
                };
            }
        }
    }

    let mut result = LibrarySyncHostValidationResult {
        base_url: normalized_base_url,
        reachable: true,
        ok: parsed.ok,
        matches_library_id,
        pairing_checked,
        pairing_valid,
        target_generation: None,
        app_version: parsed.app_version,
        api_version: Some(parsed.api_version),
        auth_mode: Some(parsed.auth_mode),
        access_mode: parsed.access_mode,
        library_id: remote_library_id,
        device_name: parsed.device_name,
        sync_mode: parsed.sync_mode,
        message,
    };
    result.target_generation = save_validation_if_current(
        state,
        validation_target.as_ref(),
        result.reachable,
        Some(&result.message),
        result.device_name.as_deref(),
    )?;
    Ok(result)
}

fn save_validation_if_current(
    state: &AppState,
    target: Option<&LibrarySyncTargetGuard>,
    reachable: bool,
    message: Option<&str>,
    device_name: Option<&str>,
) -> Result<Option<u64>, String> {
    let Some(target) = target else {
        return Ok(None);
    };
    with_current_library_sync_target_if_current(state, target, |engine| {
        engine.save_library_sync_validation_state(reachable, message, device_name)?;
        Ok(target.generation())
    })
}

#[cfg(test)]
mod tests {
    use super::{save_validation_if_current, validate_library_sync_host_blocking};
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_host_client::store_library_sync_device_token;
    use crate::library_sync_models::ValidateLibrarySyncHostInput;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::library_sync_target_guard::capture_library_sync_target;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };

    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    fn test_validation_state(base_url: &str) -> (AppState, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "filament-version-validation-{}-{}.sqlite",
            std::process::id(),
            crate::document_commands::chrono_id()
        ));
        let db = FilamentDatabase::open(&path).unwrap();
        db.apply_schema().unwrap();
        let mut settings = db.get_library_sync_settings().unwrap();
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(base_url.to_string());
        settings.library_id = "library-a".to_string();
        db.save_library_sync_settings(&settings).unwrap();
        drop(db);
        let state = AppState {
            db_path: path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        (state, path)
    }

    #[test]
    fn host_version_validation_generation_is_withheld_after_an_a_to_b_to_a_target_change() {
        let (state, path) = test_validation_state("http://host-a.local:4278");
        let guard =
            capture_library_sync_target(&state, "http://host-a.local:4278", Some("library-a"))
                .unwrap();
        assert_eq!(
            save_validation_if_current(&state, Some(&guard), true, Some("matched"), None).unwrap(),
            Some(guard.generation())
        );

        let db = FilamentDatabase::open(&path).unwrap();
        let mut settings = db.get_library_sync_settings().unwrap();
        settings.host_base_url = Some("http://host-b.local:4278".to_string());
        settings.library_id = "library-b".to_string();
        let mut returned_to_a = db.save_library_sync_settings(&settings).unwrap();
        returned_to_a.host_base_url = Some("http://host-a.local:4278".to_string());
        returned_to_a.library_id = "library-a".to_string();
        let current = db.save_library_sync_settings(&returned_to_a).unwrap();
        assert_eq!(current.target_generation, guard.generation() + 2);
        drop(db);

        assert_eq!(
            save_validation_if_current(
                &state,
                Some(&guard),
                true,
                Some("stale version check"),
                None
            )
            .unwrap(),
            None
        );
        let db = FilamentDatabase::open(&path).unwrap();
        assert_ne!(
            db.get_library_sync_settings()
                .unwrap()
                .last_validation_message
                .as_deref(),
            Some("stale version check")
        );
        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn validation_does_not_renew_against_a_different_library_when_expected_id_is_omitted() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let (state, path) = test_validation_state(&base_url);
        store_library_sync_device_token(&state, &base_url, "device-secret").unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(&mut stream);
            let mut request_line = String::new();
            reader.read_line(&mut request_line).unwrap();
            assert_eq!(request_line.trim_end(), "GET /api/v1/health HTTP/1.1");
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                assert!(!line.to_ascii_lowercase().starts_with("cookie:"));
            }
            let body = r#"{"ok":true,"api_version":"v1","capabilities":[],"auth_mode":"pairing-session","access_mode":"trusted-lan","library_id":"library-b","sync_mode":"HOST"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });
        let result = validate_library_sync_host_blocking(
            &state,
            ValidateLibrarySyncHostInput {
                base_url,
                expected_library_id: None,
            },
        )
        .unwrap();
        server.join().unwrap();
        assert!(result.reachable);
        assert!(!result.matches_library_id);
        assert!(!result.pairing_checked);
        assert_eq!(result.library_id.as_deref(), Some("library-b"));
        assert!(state.library_sync_auth.current().unwrap().is_none());
        let _ = std::fs::remove_file(path);
    }
}
