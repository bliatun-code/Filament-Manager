use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
pub(crate) struct CompanionHealthCheckResponse {
    pub(crate) ok: bool,
    pub(crate) api_version: String,
    pub(crate) auth_mode: String,
    pub(crate) access_mode: Option<String>,
    pub(crate) library_id: Option<String>,
    pub(crate) device_name: Option<String>,
    pub(crate) sync_mode: Option<String>,
}

pub(crate) fn verify_companion_health_url(
    base_url: &str,
    expected_auth_mode: &str,
    companion_label: &str,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .map_err(|error| format!("Failed to prepare {companion_label} health check: {error}"))?;

    let health_url = format!("{}/api/v1/health", base_url.trim_end_matches('/'));
    let response = client
        .get(&health_url)
        .send()
        .map_err(|error| format!("{companion_label} health check failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "{companion_label} health check returned {}.",
            response.status()
        ));
    }

    let response_text = response.text().map_err(|error| {
        format!("{companion_label} health check body could not be read: {error}")
    })?;
    let payload =
        serde_json::from_str::<CompanionHealthCheckResponse>(&response_text).map_err(|error| {
            format!("{companion_label} health check returned invalid JSON: {error}")
        })?;

    if !payload.ok {
        return Err(format!(
            "{companion_label} health check reported not ready."
        ));
    }
    if payload.api_version.trim() != "v1" {
        return Err(format!(
            "{companion_label} health check returned unexpected API version {}.",
            payload.api_version
        ));
    }
    if payload.auth_mode.trim() != expected_auth_mode {
        return Err(format!(
            "{companion_label} health check returned unexpected auth mode {}.",
            payload.auth_mode
        ));
    }

    Ok(())
}
