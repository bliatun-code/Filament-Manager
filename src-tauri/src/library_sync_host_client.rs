use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;
use reqwest::header::{CONTENT_TYPE, HOST, ORIGIN, SET_COOKIE};
use serde::{de::DeserializeOwned, Deserialize};
use std::time::Duration;

#[derive(Deserialize)]
struct LibrarySyncAuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
}

pub(crate) struct LibrarySyncAuthenticatedSessionState {
    pub(crate) csrf_token: String,
    pub(crate) session_id: String,
    pub(crate) device_token: String,
}

pub(crate) fn library_sync_host_header_value(base_url: &str) -> Result<String, String> {
    let parsed =
        reqwest::Url::parse(base_url).map_err(|error| format!("Host URL is invalid: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Host URL is missing a hostname.".to_string())?;
    let host_header = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    match parsed.port() {
        Some(port) => Ok(format!("{host_header}:{port}")),
        None => Ok(host_header),
    }
}

pub(crate) fn extract_library_sync_pairing_token(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(parsed) = reqwest::Url::parse(trimmed) {
        if let Some((_, value)) = parsed.query_pairs().find(|(key, _)| key == "pairing") {
            let token = value.trim().to_string();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }
    Some(trimmed.to_string())
}

pub(crate) fn extract_cookie_value_from_set_cookie(set_cookie: &str, name: &str) -> Option<String> {
    let first = set_cookie.split(';').next()?.trim();
    let (cookie_name, cookie_value) = first.split_once('=')?;
    if cookie_name.trim() != name || cookie_value.trim().is_empty() {
        return None;
    }
    Some(cookie_value.trim().to_string())
}

pub(crate) fn fetch_library_sync_host_json<T: DeserializeOwned>(
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|error| format!("Failed to prepare host request client: {error}"))?;

    let response = client
        .get(format!("{base_url}{path}"))
        .send()
        .map_err(|error| format!("Host request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Host request returned {}.", response.status()));
    }

    let response_text = response
        .text()
        .map_err(|error| format!("Host response body could not be read: {error}"))?;

    serde_json::from_str(&response_text)
        .map_err(|error| format!("Host returned invalid JSON: {error}"))
}

pub(crate) fn pair_library_sync_host_session(
    base_url: &str,
    pairing_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()
        .map_err(|error| format!("Failed to prepare host pairing client: {error}"))?;
    let host_header = library_sync_host_header_value(base_url)?;
    let response = client
        .post(format!("{base_url}/api/v1/auth/pair"))
        .header(HOST, host_header)
        .header(ORIGIN, base_url)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::json!({ "pairing_token": pairing_token }).to_string())
        .send()
        .map_err(|error| format!("Host pairing request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Host pairing request returned {}.",
            response.status()
        ));
    }

    let set_cookie_values: Vec<String> = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|header_value| header_value.to_str().ok().map(|value| value.to_string()))
        .collect();
    let mut session_id: Option<String> = None;
    let mut device_token: Option<String> = None;
    for set_cookie in &set_cookie_values {
        if session_id.is_none() {
            session_id = extract_cookie_value_from_set_cookie(set_cookie, "bfm_companion_session");
        }
        if device_token.is_none() {
            device_token =
                extract_cookie_value_from_set_cookie(set_cookie, "bfm_trusted_lan_device");
        }
    }

    let session_id = session_id
        .ok_or_else(|| "Host pairing response did not include a session cookie.".to_string())?;
    let device_token = device_token
        .ok_or_else(|| "Host pairing response did not include a device cookie.".to_string())?;
    let response_text = response
        .text()
        .map_err(|error| format!("Host pairing response could not be read: {error}"))?;
    let parsed: LibrarySyncAuthenticatedSessionResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Host pairing returned invalid JSON: {error}"))?;
    if !parsed.ok {
        return Err("Host pairing reported not ready.".to_string());
    }

    Ok(LibrarySyncAuthenticatedSessionState {
        csrf_token: parsed.csrf_token,
        session_id,
        device_token,
    })
}

pub(crate) fn renew_library_sync_host_session(
    base_url: &str,
    device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()
        .map_err(|error| format!("Failed to prepare host session renewal client: {error}"))?;
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(None, Some(device_token))
        .ok_or_else(|| "Host session renewal requires a paired device token.".to_string())?;
    let response = client
        .post(format!("{base_url}/api/v1/auth/renew"))
        .header(HOST, host_header)
        .header(ORIGIN, base_url)
        .header(reqwest::header::COOKIE, cookie_header)
        .send()
        .map_err(|error| format!("Host session renewal request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Host session renewal request returned {}.",
            response.status()
        ));
    }

    let set_cookie_values: Vec<String> = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|header_value| header_value.to_str().ok().map(|value| value.to_string()))
        .collect();
    let session_id = set_cookie_values
        .iter()
        .find_map(|set_cookie| {
            extract_cookie_value_from_set_cookie(set_cookie, "bfm_companion_session")
        })
        .ok_or_else(|| {
            "Host session renewal response did not include a session cookie.".to_string()
        })?;
    let response_text = response
        .text()
        .map_err(|error| format!("Host session renewal response could not be read: {error}"))?;
    let parsed: LibrarySyncAuthenticatedSessionResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Host session renewal returned invalid JSON: {error}"))?;
    if !parsed.ok {
        return Err("Host session renewal reported not ready.".to_string());
    }

    Ok(LibrarySyncAuthenticatedSessionState {
        csrf_token: parsed.csrf_token,
        session_id,
        device_token: device_token.to_string(),
    })
}

pub(crate) fn get_library_sync_host_json_authenticated<T: DeserializeOwned>(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(900))
        .build()
        .map_err(|error| format!("Failed to prepare host read client: {error}"))?;
    let initial_auth_state =
        with_inventory(state, |engine| engine.get_library_sync_client_auth_state())?.ok_or_else(
            || {
                "Desktop client must be paired with the host before protected sync reads can run."
                    .to_string()
            },
        )?;

    let execute = |session_id: &str,
                   device_token: &str|
     -> Result<reqwest::blocking::Response, String> {
        let host_header = library_sync_host_header_value(base_url)?;
        let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
            .ok_or_else(|| "Desktop sync read is missing session cookies.".to_string())?;
        client
            .get(format!("{base_url}{path}"))
            .header(HOST, host_header)
            .header(ORIGIN, base_url)
            .header(reqwest::header::COOKIE, cookie_header)
            .send()
            .map_err(|error| format!("Desktop sync read request failed: {error}"))
    };

    let mut response = execute(&initial_auth_state.0, &initial_auth_state.1)?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed = renew_library_sync_host_session(base_url, &initial_auth_state.1)?;
        with_inventory(state, |engine| {
            engine.save_library_sync_client_auth_state(
                &renewed.session_id,
                &renewed.device_token,
                &renewed.csrf_token,
                None,
            )
        })?;
        response = execute(&renewed.session_id, &renewed.device_token)?;
    }

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().unwrap_or_default();
        return Err(if body_text.trim().is_empty() {
            format!("Desktop sync read request returned {status}.")
        } else {
            format!(
                "Desktop sync read request returned {status}: {}",
                body_text.trim()
            )
        });
    }

    let body_text = response
        .text()
        .map_err(|error| format!("Desktop sync read response could not be read: {error}"))?;
    serde_json::from_str(&body_text)
        .map_err(|error| format!("Desktop sync read returned invalid JSON: {error}"))
}

pub(crate) fn post_library_sync_host_write_json<T: serde::Serialize>(
    client: &reqwest::blocking::Client,
    base_url: &str,
    path: &str,
    session_id: &str,
    device_token: &str,
    csrf_token: &str,
    payload: &T,
) -> Result<reqwest::blocking::Response, String> {
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
        .ok_or_else(|| "Desktop sync write is missing session cookies.".to_string())?;
    client
        .post(format!("{base_url}{path}"))
        .header(HOST, host_header)
        .header(ORIGIN, base_url)
        .header(reqwest::header::COOKIE, cookie_header)
        .header("x-csrf-token", csrf_token)
        .header(CONTENT_TYPE, "application/json")
        .body(
            serde_json::to_string(payload)
                .map_err(|error| format!("Failed to encode desktop sync write payload: {error}"))?,
        )
        .send()
        .map_err(|error| format!("Desktop sync write request failed: {error}"))
}

pub(crate) fn perform_library_sync_host_write<T: serde::Serialize>(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<(), String> {
    perform_library_sync_host_write_and_parse::<T, serde_json::Value>(
        state, base_url, path, payload,
    )
    .map(|_| ())
}

pub(crate) fn perform_library_sync_host_write_and_parse<
    T: serde::Serialize,
    R: DeserializeOwned,
>(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()
        .map_err(|error| format!("Failed to prepare desktop sync write client: {error}"))?;
    let initial_auth_state =
        with_inventory(state, |engine| engine.get_library_sync_client_auth_state())?.ok_or_else(
            || {
                "Desktop client must be paired with the host before protected sync actions can run."
                    .to_string()
            },
        )?;

    let mut response = post_library_sync_host_write_json(
        &client,
        base_url,
        path,
        &initial_auth_state.0,
        &initial_auth_state.1,
        &initial_auth_state.2,
        payload,
    )?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed = renew_library_sync_host_session(base_url, &initial_auth_state.1)?;
        with_inventory(state, |engine| {
            engine.save_library_sync_client_auth_state(
                &renewed.session_id,
                &renewed.device_token,
                &renewed.csrf_token,
                None,
            )
        })?;
        response = post_library_sync_host_write_json(
            &client,
            base_url,
            path,
            &renewed.session_id,
            &renewed.device_token,
            &renewed.csrf_token,
            payload,
        )?;
    }

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().unwrap_or_default();
        return Err(if body_text.trim().is_empty() {
            format!("Desktop sync write request returned {status}.")
        } else {
            format!(
                "Desktop sync write request returned {status}: {}",
                body_text.trim()
            )
        });
    }

    let body_text = response
        .text()
        .map_err(|error| format!("Desktop sync write response could not be read: {error}"))?;
    serde_json::from_str(&body_text)
        .map_err(|error| format!("Desktop sync write returned invalid JSON: {error}"))
}

pub(crate) fn ensure_library_sync_host_matches(
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<CompanionHealthCheckResponse, String> {
    let parsed: CompanionHealthCheckResponse =
        fetch_library_sync_host_json(base_url, "/api/v1/health")?;

    if !parsed.ok {
        return Err("Host reported not ready.".to_string());
    }

    if let Some(expected_library_id) = expected_library_id {
        let remote_library_id = parsed
            .library_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Host health response did not include a library ID.".to_string())?;

        if remote_library_id != expected_library_id {
            return Err(format!(
                "Connected to a different library ({}).",
                remote_library_id
            ));
        }
    }

    Ok(parsed)
}

pub(crate) fn build_library_sync_cookie_header(
    session_id: Option<&str>,
    device_token: Option<&str>,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(session_id) = session_id.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("bfm_companion_session={session_id}"));
    }
    if let Some(device_token) = device_token
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(format!("bfm_trusted_lan_device={device_token}"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_library_sync_cookie_header, extract_cookie_value_from_set_cookie,
        extract_library_sync_pairing_token, library_sync_host_header_value,
    };

    #[test]
    fn host_header_value_keeps_ports_and_formats_ipv6_hosts() {
        assert_eq!(
            library_sync_host_header_value("http://192.168.1.10:4278").unwrap(),
            "192.168.1.10:4278"
        );
        assert_eq!(
            library_sync_host_header_value("http://host.local").unwrap(),
            "host.local"
        );
        assert_eq!(
            library_sync_host_header_value("http://[::1]:4278").unwrap(),
            "[::1]:4278"
        );
    }

    #[test]
    fn pairing_token_accepts_raw_tokens_and_pairing_urls() {
        assert_eq!(
            extract_library_sync_pairing_token("http://192.168.1.10:4278/companion?pairing=abc123")
                .as_deref(),
            Some("abc123")
        );
        assert_eq!(
            extract_library_sync_pairing_token(" raw-token ").as_deref(),
            Some("raw-token")
        );
        assert_eq!(extract_library_sync_pairing_token(" "), None);
    }

    #[test]
    fn cookie_helpers_trim_and_omit_empty_values() {
        assert_eq!(
            extract_cookie_value_from_set_cookie(
                "bfm_companion_session = abc ; Path=/",
                "bfm_companion_session"
            ),
            Some("abc".to_string())
        );
        assert_eq!(
            extract_cookie_value_from_set_cookie(
                "bfm_companion_session=abc; Path=/",
                "bfm_companion_session"
            )
            .as_deref(),
            Some("abc")
        );
        assert_eq!(
            build_library_sync_cookie_header(Some(" session "), Some(" device ")).as_deref(),
            Some("bfm_companion_session=session; bfm_trusted_lan_device=device")
        );
        assert_eq!(build_library_sync_cookie_header(Some(" "), None), None);
    }
}
