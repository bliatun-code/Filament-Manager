use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_host_client::{
    load_library_sync_device_token_optional, renew_and_cache_library_sync_auth,
};
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
    let normalized_base_url = normalize_library_sync_base_url(&input.base_url)?;

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(900))
        .redirect(reqwest::redirect::Policy::none())
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

    let mut pairing_checked = false;
    let mut pairing_valid = false;

    if parsed.ok && matches_library_id {
        if let Some(device_token) =
            load_library_sync_device_token_optional(&state, &normalized_base_url)?
        {
            pairing_checked = true;
            match renew_and_cache_library_sync_auth(&state, &normalized_base_url, &device_token) {
                Ok(_) => {
                    pairing_valid = true;
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
