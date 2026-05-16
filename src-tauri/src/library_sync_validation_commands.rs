use crate::library_sync_host_client::renew_library_sync_host_session;
use crate::library_sync_models::{LibrarySyncHostValidationResult, ValidateLibrarySyncHostInput};
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;
use std::time::Duration;

#[tauri::command]
pub(crate) fn validate_library_sync_host(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncHostValidationResult, String> {
    let normalized_base_url = input.base_url.trim().trim_end_matches('/').to_string();
    if normalized_base_url.is_empty() {
        return Err("Host URL is required.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(900))
        .build()
        .map_err(|error| format!("Failed to prepare host validation client: {error}"))?;

    let health_url = format!("{}/api/v1/health", normalized_base_url);
    let response = match client.get(&health_url).send() {
        Ok(response) => response,
        Err(error) => {
            let result = LibrarySyncHostValidationResult {
                base_url: normalized_base_url,
                reachable: false,
                ok: false,
                matches_library_id: false,
                pairing_checked: false,
                pairing_valid: false,
                api_version: None,
                auth_mode: None,
                access_mode: None,
                library_id: None,
                device_name: None,
                sync_mode: None,
                message: format!("Host check failed: {error}"),
            };
            with_inventory(&state, |engine| {
                engine.save_library_sync_validation_state(false, Some(&result.message), None)
            })?;
            return Ok(result);
        }
    };

    if !response.status().is_success() {
        let result = LibrarySyncHostValidationResult {
            base_url: normalized_base_url,
            reachable: true,
            ok: false,
            matches_library_id: false,
            pairing_checked: false,
            pairing_valid: false,
            api_version: None,
            auth_mode: None,
            access_mode: None,
            library_id: None,
            device_name: None,
            sync_mode: None,
            message: format!("Host check returned {}.", response.status()),
        };
        with_inventory(&state, |engine| {
            engine.save_library_sync_validation_state(true, Some(&result.message), None)
        })?;
        return Ok(result);
    }

    let response_text = response
        .text()
        .map_err(|error| format!("Host health check body could not be read: {error}"))?;
    let parsed: CompanionHealthCheckResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Host health check returned invalid JSON: {error}"))?;
    let remote_library_id = parsed.library_id.clone();
    let matches_library_id = input
        .expected_library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
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

    let saved_auth_state =
        with_inventory(&state, |engine| engine.get_library_sync_client_auth_state())?;
    let mut pairing_checked = false;
    let mut pairing_valid = false;

    if parsed.ok && matches_library_id {
        if let Some((_, device_token, _, _)) = saved_auth_state {
            pairing_checked = true;
            match renew_library_sync_host_session(&normalized_base_url, &device_token) {
                Ok(renewed) => {
                    pairing_valid = true;
                    with_inventory(&state, |engine| {
                        engine.save_library_sync_client_auth_state(
                            &renewed.session_id,
                            &renewed.device_token,
                            &renewed.csrf_token,
                            None,
                        )
                    })?;
                }
                Err(error) => {
                    message = if error.contains("401") {
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
    }

    let result = LibrarySyncHostValidationResult {
        base_url: normalized_base_url,
        reachable: true,
        ok: parsed.ok,
        matches_library_id,
        pairing_checked,
        pairing_valid,
        api_version: Some(parsed.api_version),
        auth_mode: Some(parsed.auth_mode),
        access_mode: parsed.access_mode,
        library_id: remote_library_id,
        device_name: parsed.device_name,
        sync_mode: parsed.sync_mode,
        message,
    };
    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(
            result.reachable,
            Some(&result.message),
            result.device_name.as_deref(),
        )
    })?;
    Ok(result)
}
