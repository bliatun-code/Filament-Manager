use crate::credential_store::{CredentialKey, SecretValue};
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;
use reqwest::header::{CONTENT_TYPE, HOST, ORIGIN, SET_COOKIE};
use serde::{de::DeserializeOwned, Deserialize};
use std::time::Duration;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Mutex, OnceLock},
    time::Instant,
};
use zeroize::{Zeroize, Zeroizing};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use mdns_sd::{HostnameResolutionEvent, ServiceDaemon};

const LIBRARY_SYNC_REQUEST_TIMEOUT: Duration = Duration::from_millis(2500);
#[cfg(any(target_os = "macos", target_os = "windows"))]
const MDNS_RETRY_TIMEOUT: Duration = Duration::from_millis(750);
#[cfg(any(target_os = "macos", target_os = "windows"))]
const MDNS_RESOLUTION_CACHE_TTL: Duration = Duration::from_secs(5);

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[derive(Clone)]
struct CachedMdnsResolution {
    addresses: Vec<SocketAddr>,
    expires_at: Instant,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
static MDNS_RESOLUTION_CACHE: OnceLock<Mutex<HashMap<String, CachedMdnsResolution>>> =
    OnceLock::new();

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

impl Drop for LibrarySyncAuthenticatedSessionState {
    fn drop(&mut self) {
        self.csrf_token.zeroize();
        self.session_id.zeroize();
        self.device_token.zeroize();
    }
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

fn library_sync_http_client_builder(timeout: Duration) -> reqwest::blocking::ClientBuilder {
    // Companion endpoints are deliberately local-only. Never route a paired desktop request
    // through a system or environment proxy: apart from being unnecessary, that can prevent a
    // private `.local` name from reaching the selected LAN host.
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
}

fn build_library_sync_http_client(
    timeout: Duration,
    operation: &str,
) -> Result<reqwest::blocking::Client, String> {
    library_sync_http_client_builder(timeout)
        .build()
        .map_err(|error| format!("Failed to prepare {operation} client: {error}"))
}

/// Sends one private-LAN request without using a proxy. On macOS and Windows, stable `.local`
/// names use a small mDNS cache before the system resolver. Browser mDNS handling can become
/// available before the general resolver used by Reqwest; the resolved TCP address is pinned
/// while the URL, `Host`, and `Origin` stay on the stable local hostname.
pub(crate) fn send_library_sync_request(
    base_url: &str,
    timeout: Duration,
    operation: &str,
    make_request: impl Fn(&reqwest::blocking::Client) -> reqwest::blocking::RequestBuilder,
) -> Result<reqwest::blocking::Response, String> {
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = base_url;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let request_started_at = Instant::now();
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if let Some(client) = build_mdns_local_client(base_url, timeout, operation)? {
        if let Ok(response) = make_request(&client).send() {
            return Ok(response);
        }
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let timeout = remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
        .ok_or_else(|| format!("{operation} timed out while resolving the local host."))?;
    let client = build_library_sync_http_client(timeout, operation)?;
    make_request(&client)
        .send()
        .map_err(|error| format!("{operation} failed: {error}"))
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn remaining_library_sync_request_timeout(
    timeout: Duration,
    elapsed: Duration,
) -> Option<Duration> {
    let remaining = timeout.saturating_sub(elapsed);
    (!remaining.is_zero()).then_some(remaining)
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn stable_local_host_and_port(base_url: &str) -> Option<(String, u16)> {
    let parsed = reqwest::Url::parse(base_url).ok()?;
    let hostname = parsed
        .host_str()?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if !hostname.ends_with(".local") {
        return None;
    }
    Some((hostname, parsed.port_or_known_default()?))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn build_mdns_local_client(
    base_url: &str,
    timeout: Duration,
    operation: &str,
) -> Result<Option<reqwest::blocking::Client>, String> {
    let Some((hostname, port)) = stable_local_host_and_port(base_url) else {
        return Ok(None);
    };
    let request_started_at = Instant::now();
    let resolution_timeout = MDNS_RETRY_TIMEOUT.min(timeout);
    let Some(addresses) =
        resolve_stable_local_hostname_with_mdns(&hostname, port, resolution_timeout)
    else {
        return Ok(None);
    };
    let Some(remaining_timeout) =
        remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
    else {
        return Ok(None);
    };
    library_sync_http_client_builder(remaining_timeout)
        .resolve_to_addrs(&hostname, &addresses)
        .build()
        .map(Some)
        .map_err(|error| format!("Failed to prepare {operation} local-name retry client: {error}"))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn resolve_stable_local_hostname_with_mdns(
    hostname: &str,
    port: u16,
    timeout: Duration,
) -> Option<Vec<SocketAddr>> {
    if timeout.is_zero() {
        return None;
    }
    let cache_key = format!("{hostname}:{port}");
    if let Some(addresses) = cached_mdns_addresses(&cache_key) {
        return Some(addresses);
    }
    let daemon = ServiceDaemon::new().ok()?;
    let fqdn = format!("{hostname}.");
    let receiver = match daemon.resolve_hostname(&fqdn, Some(timeout.as_millis() as u64)) {
        Ok(receiver) => receiver,
        Err(_) => {
            let _ = daemon.shutdown();
            return None;
        }
    };
    let deadline = Instant::now() + timeout;
    let mut resolved = Vec::new();

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining) {
            Ok(HostnameResolutionEvent::AddressesFound(found_hostname, addresses))
                if found_hostname
                    .trim_end_matches('.')
                    .eq_ignore_ascii_case(hostname) =>
            {
                resolved.extend(addresses.into_iter().filter_map(|address| {
                    match address.to_ip_addr() {
                        // The Companion listener is deliberately bound to one selected private IPv4
                        // interface. Do not use a link-local, public, or unrelated IPv6 response.
                        IpAddr::V4(address) if address.is_private() => {
                            Some(SocketAddr::new(IpAddr::V4(address), port))
                        }
                        _ => None,
                    }
                }));
                if !resolved.is_empty() {
                    break;
                }
            }
            Ok(HostnameResolutionEvent::SearchTimeout(_))
            | Ok(HostnameResolutionEvent::SearchStopped(_))
            | Err(_) => break,
            Ok(_) => {}
        }
    }

    let _ = daemon.stop_resolve_hostname(&fqdn);
    let _ = daemon.shutdown();
    resolved.sort_unstable();
    resolved.dedup();
    if resolved.is_empty() {
        None
    } else {
        cache_mdns_addresses(cache_key, resolved.clone());
        Some(resolved)
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn cached_mdns_addresses(cache_key: &str) -> Option<Vec<SocketAddr>> {
    let now = Instant::now();
    let cache = MDNS_RESOLUTION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache.lock().ok()?;
    cache.retain(|_, entry| entry.expires_at > now);
    cache.get(cache_key).map(|entry| entry.addresses.clone())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn cache_mdns_addresses(cache_key: String, addresses: Vec<SocketAddr>) {
    let now = Instant::now();
    let cache = MDNS_RESOLUTION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|_, entry| entry.expires_at > now);
        if cache.len() >= 32 {
            cache.clear();
        }
        cache.insert(
            cache_key,
            CachedMdnsResolution {
                addresses,
                expires_at: now + MDNS_RESOLUTION_CACHE_TTL,
            },
        );
    }
}

pub(crate) fn fetch_library_sync_host_json<T: DeserializeOwned>(
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let request_url = format!("{base_url}{path}");
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host request",
        |client| client.get(&request_url),
    )?;

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
    let host_header = library_sync_host_header_value(base_url)?;
    let request_url = format!("{base_url}/api/v1/auth/pair");
    let request_body = serde_json::json!({ "pairing_token": pairing_token }).to_string();
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host pairing request",
        |client| {
            client
                .post(&request_url)
                .header(HOST, host_header.as_str())
                .header(ORIGIN, base_url)
                .header(CONTENT_TYPE, "application/json")
                .body(request_body.clone())
        },
    )?;

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
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(None, Some(device_token))
        .ok_or_else(|| "Host session renewal requires a paired device token.".to_string())?;
    let request_url = format!("{base_url}/api/v1/auth/renew");
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host session renewal request",
        |client| {
            client
                .post(&request_url)
                .header(HOST, host_header.as_str())
                .header(ORIGIN, base_url)
                .header(reqwest::header::COOKIE, cookie_header.as_str())
        },
    )?;

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

pub(crate) fn load_library_sync_device_token(
    state: &AppState,
    base_url: &str,
) -> Result<String, String> {
    load_library_sync_device_token_optional(state, base_url)?.ok_or_else(|| {
        "Desktop client must be paired with the host before protected sync can run.".to_string()
    })
}

pub(crate) fn load_library_sync_device_token_optional(
    state: &AppState,
    base_url: &str,
) -> Result<Option<String>, String> {
    load_library_sync_device_token_bytes_optional(state, base_url)?
        .map(|token| {
            std::str::from_utf8(token.as_slice())
                .map(str::to_string)
                .map_err(|error| {
                    format!("Desktop client credentials could not be decoded: {error}")
                })
        })
        .transpose()
}

pub(crate) fn load_library_sync_device_token_bytes_optional(
    state: &AppState,
    base_url: &str,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    let key = library_sync_device_token_key(base_url)?;
    Ok(state
        .credentials
        .get(&key)
        .map_err(|error| format!("Failed to read desktop client credentials: {error}"))?
        .map(|token| Zeroizing::new(token.expose_bytes().to_vec())))
}

pub(crate) fn store_library_sync_device_token(
    state: &AppState,
    base_url: &str,
    device_token: &str,
) -> Result<(), String> {
    let normalized = Zeroizing::new(device_token.trim().as_bytes().to_vec());
    store_library_sync_device_token_bytes(state, base_url, normalized.as_slice())
}

pub(crate) fn store_library_sync_device_token_bytes(
    state: &AppState,
    base_url: &str,
    device_token: &[u8],
) -> Result<(), String> {
    let key = library_sync_device_token_key(base_url)?;
    let secret = SecretValue::from_bytes(device_token.to_vec());
    state
        .credentials
        .set(&key, &secret)
        .map_err(|error| format!("Failed to store desktop client credentials: {error}"))?;

    let verification = state
        .credentials
        .get(&key)
        .map_err(|error| format!("Failed to verify desktop client credentials: {error}"))
        .and_then(|stored| {
            stored.ok_or_else(|| {
                "Desktop client credentials were not available after they were stored.".to_string()
            })
        })
        .and_then(|stored| {
            if stored.expose_bytes() == secret.expose_bytes() {
                Ok(())
            } else {
                Err(
                    "Desktop client credentials did not match after secure storage verification."
                        .to_string(),
                )
            }
        });
    if let Err(error) = verification {
        return match state.credentials.delete(&key) {
            Ok(_) => Err(error),
            Err(cleanup_error) => Err(format!(
                "{error} Cleanup of the unverified credential also failed: {cleanup_error}"
            )),
        };
    }
    Ok(())
}

pub(crate) fn delete_library_sync_device_token(
    state: &AppState,
    base_url: &str,
) -> Result<bool, String> {
    let key = library_sync_device_token_key(base_url)?;
    state
        .credentials
        .delete(&key)
        .map_err(|error| format!("Failed to remove desktop client credentials: {error}"))
}

pub(crate) fn library_sync_device_token_key(base_url: &str) -> Result<CredentialKey, String> {
    let normalized_base_url = normalize_library_sync_base_url(base_url)?;
    CredentialKey::library_sync_client_device_token(&normalized_base_url)
        .map_err(|error| format!("Desktop client credential identity is invalid: {error}"))
}

fn current_or_renewed_library_sync_auth(
    state: &AppState,
    base_url: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    current_or_renewed_library_sync_auth_under_gate(state, base_url)
}

fn current_or_renewed_library_sync_auth_under_gate(
    state: &AppState,
    base_url: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let device_token = validated_library_sync_device_token(state, base_url, None)?;
    if let Some(session) = state.library_sync_auth.current()? {
        if session.host_base_url == base_url {
            return Ok(LibrarySyncAuthenticatedSessionState {
                csrf_token: session.csrf_token.clone(),
                session_id: session.session_id.clone(),
                device_token,
            });
        }
    }
    renew_and_cache_library_sync_auth_under_gate(state, base_url, &device_token)
}

pub(crate) fn renew_and_cache_library_sync_auth(
    state: &AppState,
    base_url: &str,
    device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    renew_and_cache_library_sync_auth_with(
        state,
        base_url,
        device_token,
        renew_library_sync_host_session,
    )
}

fn renew_and_cache_library_sync_auth_with(
    state: &AppState,
    base_url: &str,
    device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let current_device_token =
        validated_library_sync_device_token(state, base_url, Some(device_token))?;
    renew_and_cache_library_sync_auth_under_gate_with(state, base_url, &current_device_token, renew)
}

fn renew_and_cache_library_sync_auth_under_gate(
    state: &AppState,
    base_url: &str,
    device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    renew_and_cache_library_sync_auth_under_gate_with(
        state,
        base_url,
        device_token,
        renew_library_sync_host_session,
    )
}

fn renew_and_cache_library_sync_auth_under_gate_with(
    state: &AppState,
    base_url: &str,
    device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let renewed = match renew(base_url, device_token) {
        Ok(renewed) => renewed,
        Err(error) => {
            let _ = state.library_sync_auth.clear();
            return Err(error);
        }
    };
    state.library_sync_auth.replace(
        base_url,
        renewed.session_id.clone(),
        renewed.csrf_token.clone(),
    )?;
    Ok(renewed)
}

fn validated_library_sync_device_token(
    state: &AppState,
    base_url: &str,
    expected_device_token: Option<&str>,
) -> Result<String, String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let current_host = settings
        .host_base_url
        .as_deref()
        .map(str::trim)
        .map(|host| host.trim_end_matches('/'))
        .filter(|host| !host.is_empty());
    if settings.mode != "CLIENT" || current_host != Some(base_url) {
        return Err(
            "Desktop client settings changed before authentication could be renewed.".to_string(),
        );
    }

    let current_device_token = load_library_sync_device_token(state, base_url)?;
    if expected_device_token.is_some_and(|expected| expected != current_device_token) {
        return Err(
            "Desktop client pairing changed before authentication could be renewed.".to_string(),
        );
    }
    Ok(current_device_token)
}

pub(crate) fn get_library_sync_host_json_authenticated<T: DeserializeOwned>(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let initial_auth_state = current_or_renewed_library_sync_auth(state, base_url)?;

    let execute = |session_id: &str,
                   device_token: &str|
     -> Result<reqwest::blocking::Response, String> {
        let host_header = library_sync_host_header_value(base_url)?;
        let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
            .ok_or_else(|| "Desktop sync read is missing session cookies.".to_string())?;
        let request_url = format!("{base_url}{path}");
        send_library_sync_request(
            base_url,
            LIBRARY_SYNC_REQUEST_TIMEOUT,
            "Desktop sync read request",
            |client| {
                client
                    .get(&request_url)
                    .header(HOST, host_header.as_str())
                    .header(ORIGIN, base_url)
                    .header(reqwest::header::COOKIE, cookie_header.as_str())
            },
        )
    };

    let mut response = execute(
        &initial_auth_state.session_id,
        &initial_auth_state.device_token,
    )?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed =
            renew_and_cache_library_sync_auth(state, base_url, &initial_auth_state.device_token)?;
        response = execute(&renewed.session_id, &renewed.device_token)?;
    }

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Desktop sync read request returned {status}."));
    }

    let body_text = response
        .text()
        .map_err(|error| format!("Desktop sync read response could not be read: {error}"))?;
    serde_json::from_str(&body_text)
        .map_err(|error| format!("Desktop sync read returned invalid JSON: {error}"))
}

pub(crate) fn post_library_sync_host_write_json<T: serde::Serialize>(
    base_url: &str,
    path: &str,
    session_id: &str,
    device_token: &str,
    csrf_token: &str,
    payload: &T,
    timeout: Duration,
) -> Result<reqwest::blocking::Response, String> {
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
        .ok_or_else(|| "Desktop sync write is missing session cookies.".to_string())?;
    let request_url = format!("{base_url}{path}");
    let request_body = serde_json::to_string(payload)
        .map_err(|error| format!("Failed to encode desktop sync write payload: {error}"))?;
    send_library_sync_request(base_url, timeout, "Desktop sync write request", |client| {
        client
            .post(&request_url)
            .header(HOST, host_header.as_str())
            .header(ORIGIN, base_url)
            .header(reqwest::header::COOKIE, cookie_header.as_str())
            .header("x-csrf-token", csrf_token)
            .header(CONTENT_TYPE, "application/json")
            .body(request_body.clone())
    })
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
    perform_library_sync_host_write_and_parse_with_timeout(
        state,
        base_url,
        path,
        payload,
        Duration::from_millis(2500),
    )
}

pub(crate) fn perform_library_sync_host_write_and_parse_with_timeout<
    T: serde::Serialize,
    R: DeserializeOwned,
>(
    state: &tauri::State<'_, AppState>,
    base_url: &str,
    path: &str,
    payload: &T,
    timeout: Duration,
) -> Result<R, String> {
    let initial_auth_state = current_or_renewed_library_sync_auth(state, base_url)?;

    let mut response = post_library_sync_host_write_json(
        base_url,
        path,
        &initial_auth_state.session_id,
        &initial_auth_state.device_token,
        &initial_auth_state.csrf_token,
        payload,
        timeout,
    )?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed =
            renew_and_cache_library_sync_auth(state, base_url, &initial_auth_state.device_token)?;
        response = post_library_sync_host_write_json(
            base_url,
            path,
            &renewed.session_id,
            &renewed.device_token,
            &renewed.csrf_token,
            payload,
            timeout,
        )?;
    }

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Desktop sync write request returned {status}."));
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
        library_sync_http_client_builder, load_library_sync_device_token,
        load_library_sync_device_token_optional, remaining_library_sync_request_timeout,
        renew_and_cache_library_sync_auth_with, stable_local_host_and_port,
        store_library_sync_device_token, LibrarySyncAuthenticatedSessionState,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::inventory_maintenance_commands::reset_app_data_inner;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use std::{
        io::{Read, Write},
        net::{SocketAddr, TcpListener},
        sync::{mpsc, Arc, Barrier},
        thread,
    };

    fn test_state() -> AppState {
        AppState {
            db_path: String::new(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    fn credential_test_state(host: &str) -> AppState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-library-renew-race-{}-{suffix}.sqlite",
            std::process::id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply schema");
        let profile_id = db
            .initialize_fresh_credential_store_profile()
            .expect("initialize credential profile");
        let mut settings = db
            .get_library_sync_settings()
            .expect("read library settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(host.to_string());
        db.save_library_sync_settings(&settings)
            .expect("save client settings");
        drop(db);
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory()
                .scoped_to_profile_id(&profile_id)
                .expect("scope credential store"),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

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
    fn stable_local_retry_keeps_the_hostname_and_uses_the_url_port() {
        assert_eq!(
            stable_local_host_and_port("HTTP://Filament-Manager-A1B2.Local:4278/"),
            Some(("filament-manager-a1b2.local".to_string(), 4278)),
        );
        assert_eq!(
            stable_local_host_and_port("https://host.local"),
            Some(("host.local".to_string(), 443)),
        );
        assert_eq!(stable_local_host_and_port("http://192.168.1.50:4278"), None);
        assert_eq!(stable_local_host_and_port("http://host.example:4278"), None);
    }

    #[test]
    fn local_name_retry_uses_one_total_request_budget() {
        assert_eq!(
            remaining_library_sync_request_timeout(
                Duration::from_millis(2500),
                Duration::from_millis(750),
            ),
            Some(Duration::from_millis(1750)),
        );
        assert_eq!(
            remaining_library_sync_request_timeout(
                Duration::from_millis(2500),
                Duration::from_millis(2500),
            ),
            None,
        );
    }

    #[test]
    fn pinned_local_address_keeps_the_stable_request_hostname() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test host");
        let port = listener.local_addr().expect("read local port").port();
        let expected_host = format!("host: paired-host.local:{port}");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client request");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read client request");
            let received = String::from_utf8_lossy(&request[..read]);
            assert!(
                received.to_ascii_lowercase().contains(&expected_host),
                "{received}"
            );
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .expect("write local response");
        });

        let client = library_sync_http_client_builder(Duration::from_secs(1))
            .resolve_to_addrs(
                "paired-host.local",
                &[SocketAddr::from(([127, 0, 0, 1], port))],
            )
            .build()
            .expect("build pinned client");
        let response = client
            .get(format!("http://paired-host.local:{port}/api/v1/health"))
            .send()
            .expect("complete pinned request");
        assert!(response.status().is_success());
        server.join().expect("join local test host");
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

    #[test]
    fn device_token_round_trips_through_secure_store_with_normalized_host_key() {
        let state = test_state();

        store_library_sync_device_token(
            &state,
            " HTTP://Host.Local:4278/ ",
            " long-lived-device-token ",
        )
        .expect("store device token");

        assert_eq!(
            load_library_sync_device_token(&state, "http://host.local:4278")
                .expect("load device token"),
            "long-lived-device-token"
        );
        assert_eq!(
            load_library_sync_device_token_optional(&state, "http://other.local:4278")
                .expect("load missing token"),
            None
        );
        assert!(
            load_library_sync_device_token_optional(&state, "http://user:password@host.local:4278")
                .is_err(),
            "production credential lookups must reject embedded credentials"
        );
    }

    #[test]
    fn reset_waits_for_in_flight_renewal_and_clears_the_renewed_session() {
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");

        let remote_started = Arc::new(Barrier::new(2));
        let release_remote = Arc::new(Barrier::new(2));
        let renew_started = Arc::clone(&remote_started);
        let renew_release = Arc::clone(&release_remote);
        let renew_state = state.clone();
        let (renewed_tx, renewed_rx) = mpsc::channel();
        let renew = std::thread::spawn(move || {
            let result = renew_and_cache_library_sync_auth_with(
                &renew_state,
                host,
                "device-token",
                move |base_url, device_token| {
                    assert_eq!(base_url, host);
                    assert_eq!(device_token, "device-token");
                    renew_started.wait();
                    renew_release.wait();
                    Ok(LibrarySyncAuthenticatedSessionState {
                        csrf_token: "renewed-csrf".to_string(),
                        session_id: "renewed-session".to_string(),
                        device_token: device_token.to_string(),
                    })
                },
            );
            renewed_tx.send(result).expect("report renewal result");
        });

        remote_started.wait();
        let reset_start = Arc::new(Barrier::new(2));
        let reset_worker_start = Arc::clone(&reset_start);
        let reset_state = state.clone();
        let (reset_tx, reset_rx) = mpsc::channel();
        let reset = std::thread::spawn(move || {
            reset_worker_start.wait();
            reset_tx
                .send(reset_app_data_inner(&reset_state))
                .expect("report reset result");
        });
        reset_start.wait();
        assert!(
            reset_rx.recv_timeout(Duration::from_millis(200)).is_err(),
            "reset completed while renewal still held the credential mutation gate"
        );

        release_remote.wait();
        renewed_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("renewal completed")
            .expect("renewal result");
        renew.join().expect("join renewal");
        reset_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("reset completed")
            .expect("reset result");
        reset.join().expect("join reset");

        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_none());
        assert!(load_library_sync_device_token_optional(&state, host)
            .expect("read reset profile token")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }
}
