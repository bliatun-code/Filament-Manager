use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, LibrarySyncSettingsRow, PrinterOverviewRow, SpoolLoanDetailsRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::statistics::{FilamentConsumptionRow, InventoryOverview};
use crate::state::AppState;
use crate::trusted_lan_commands::CompanionHealthCheckResponse;
use crate::{with_inventory, PrinterSettingsSnapshot};
use reqwest::header::{CONTENT_TYPE, HOST, ORIGIN, SET_COOKIE};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize)]
pub(crate) struct SaveLibrarySyncSettingsInput {
    mode: String,
    device_name: String,
    library_id: String,
    host_base_url: Option<String>,
    host_device_name: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ValidateLibrarySyncHostInput {
    base_url: String,
    expected_library_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSpoolListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncFilamentConsumptionInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    printer_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSpoolDetailInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    history_limit: Option<i64>,
    usage_limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct PairLibrarySyncHostInput {
    base_url: String,
    pairing_token_or_url: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncWeightWriteInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    grams: i64,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateSpoolDetailsInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    qr_code: Option<String>,
    status: String,
    location: Option<String>,
    home_location: Option<Option<String>>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateSpoolRfidTagInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    rfid_tag: Option<String>,
    rfid_observed_at: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncAssignPrinterSlotInput {
    base_url: String,
    expected_library_id: Option<String>,
    printer_id: String,
    slot_id: String,
    spool_id: Option<String>,
    rfid_override_tray_uuid: Option<String>,
    rfid_override_color_hex: Option<String>,
    clear_live_cache_before_next_refresh: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncRecordPrintUsageInput {
    base_url: String,
    expected_library_id: Option<String>,
    printer_id: String,
    spool_id: String,
    grams: i64,
    job_name: Option<String>,
    success: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncReturnLoanInput {
    base_url: String,
    expected_library_id: Option<String>,
    loan_id: String,
    returned_grams: i64,
    note: Option<String>,
    inbound: bool,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncLendSpoolInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    borrower_name: String,
    grams_out: i64,
    note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCatalogListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    search: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncWishlistListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateSpoolInput {
    base_url: String,
    expected_library_id: Option<String>,
    master_id: Option<String>,
    material: Option<String>,
    filament_name: Option<String>,
    color_name: Option<String>,
    vendor: Option<String>,
    initial_weight_g: Option<i64>,
    location: Option<String>,
    hex_color: Option<String>,
    owner_name: Option<String>,
    owner_contact: Option<String>,
    ownership_note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateWishlistItemInput {
    base_url: String,
    expected_library_id: Option<String>,
    master_id: Option<String>,
    vendor: String,
    material: String,
    filament_name: String,
    color_name: String,
    quantity: Option<i64>,
    note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateWishlistStatusInput {
    base_url: String,
    expected_library_id: Option<String>,
    item_id: String,
    status: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeleteWishlistItemInput {
    base_url: String,
    expected_library_id: Option<String>,
    item_id: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreatePrinterInput {
    base_url: String,
    expected_library_id: Option<String>,
    id: String,
    model: String,
    name: String,
    ams_units: Option<i64>,
    slots_per_ams: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeletePrinterInput {
    base_url: String,
    expected_library_id: Option<String>,
    printer_id: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeleteSpoolInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    reason: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct LibrarySyncHostValidationResult {
    base_url: String,
    reachable: bool,
    ok: bool,
    matches_library_id: bool,
    pairing_checked: bool,
    pairing_valid: bool,
    api_version: Option<String>,
    auth_mode: Option<String>,
    access_mode: Option<String>,
    library_id: Option<String>,
    device_name: Option<String>,
    sync_mode: Option<String>,
    message: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSnapshotResponse {
    ok: bool,
    captured_at: String,
    library_id: String,
    device_name: String,
    sync_mode: String,
    inventory: InventoryOverview,
    active_loans: i64,
    printers: i64,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncAuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
}

pub(crate) struct LibrarySyncAuthenticatedSessionState {
    csrf_token: String,
    session_id: String,
    device_token: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateSpoolResponse {
    ok: bool,
    message: String,
    spool_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncRemoteSnapshot {
    captured_at: String,
    library_id: String,
    device_name: String,
    sync_mode: String,
    inventory: InventoryOverview,
    total_spools: i64,
    in_use: i64,
    low_stock: i64,
    active_loans: i64,
    printers: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedSpoolList {
    captured_at: String,
    rows: Vec<SpoolWithMasterRow>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedPrinterOverview {
    captured_at: String,
    rows: Vec<PrinterOverviewRow>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedLoanList {
    captured_at: String,
    rows: Vec<SpoolLoanDetailsRow>,
}

#[tauri::command]
pub(crate) fn get_library_sync_settings(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| engine.get_library_sync_settings())
}

#[tauri::command]
pub(crate) fn save_library_sync_settings(
    state: tauri::State<'_, AppState>,
    input: SaveLibrarySyncSettingsInput,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| {
        engine.save_library_sync_settings(&LibrarySyncSettingsRow {
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
        })
    })
}

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

fn normalize_library_sync_host_input(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    let normalized_base_url = input.base_url.trim().trim_end_matches('/').to_string();
    if normalized_base_url.is_empty() {
        return Err("Host URL is required.".to_string());
    }
    let expected_library_id = input
        .expected_library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok((normalized_base_url, expected_library_id))
}

fn library_sync_host_header_value(base_url: &str) -> Result<String, String> {
    let parsed =
        reqwest::Url::parse(base_url).map_err(|error| format!("Host URL is invalid: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Host URL is missing a hostname.".to_string())?;
    match parsed.port() {
        Some(port) => Ok(format!("{host}:{port}")),
        None => Ok(host.to_string()),
    }
}

fn extract_library_sync_pairing_token(raw: &str) -> Option<String> {
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

fn extract_cookie_value_from_set_cookie(set_cookie: &str, name: &str) -> Option<String> {
    let first = set_cookie.split(';').next()?.trim();
    let (cookie_name, cookie_value) = first.split_once('=')?;
    if cookie_name.trim() != name || cookie_value.trim().is_empty() {
        return None;
    }
    Some(cookie_value.trim().to_string())
}

fn fetch_library_sync_host_json<T: DeserializeOwned>(
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

fn pair_library_sync_host_session(
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

fn renew_library_sync_host_session(
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

fn get_library_sync_host_json_authenticated<T: DeserializeOwned>(
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

fn post_library_sync_host_write_json<T: serde::Serialize>(
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

fn perform_library_sync_host_write<T: serde::Serialize>(
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

fn perform_library_sync_host_write_and_parse<T: serde::Serialize, R: DeserializeOwned>(
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

fn ensure_library_sync_host_matches(
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

#[tauri::command]
pub(crate) fn fetch_library_sync_snapshot(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncRemoteSnapshot, String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(&input)?;
    let parsed: LibrarySyncSnapshotResponse =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/snapshot")?;

    if !parsed.ok {
        return Err("Host snapshot reported not ready.".to_string());
    }

    if let Some(expected_library_id) = expected_library_id {
        if parsed.library_id != expected_library_id {
            return Err(format!(
                "Host snapshot belongs to a different library ({}).",
                parsed.library_id
            ));
        }
    }

    let snapshot = LibrarySyncRemoteSnapshot {
        captured_at: parsed.captured_at,
        library_id: parsed.library_id,
        device_name: parsed.device_name,
        sync_mode: parsed.sync_mode,
        inventory: parsed.inventory.clone(),
        total_spools: parsed.inventory.total_spools,
        in_use: parsed.inventory.in_use,
        low_stock: parsed.inventory.low_stock,
        active_loans: parsed.active_loans,
        printers: parsed.printers,
    };

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_snapshot(
            &crate::backend::filament_database::LibrarySyncCachedSnapshotRow {
                captured_at: snapshot.captured_at.clone(),
                library_id: snapshot.library_id.clone(),
                device_name: snapshot.device_name.clone(),
                sync_mode: snapshot.sync_mode.clone(),
                inventory: snapshot.inventory.clone(),
                total_spools: snapshot.total_spools,
                in_use: snapshot.in_use,
                low_stock: snapshot.low_stock,
                active_loans: snapshot.active_loans,
                printers: snapshot.printers,
            },
        )?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host snapshot refreshed."),
            Some(&snapshot.device_name),
        )
    })?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_spool_detail(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolDetailInput,
) -> Result<CompanionSpoolDetail, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let history_limit = input.history_limit.unwrap_or(80).clamp(1, 250);
    let usage_limit = input.usage_limit.unwrap_or(500).clamp(1, 1_000);

    let detail: CompanionSpoolDetail = get_library_sync_host_json_authenticated(
        &state,
        &normalized_base_url,
        &format!(
            "/api/v1/spools/{spool_id}?history_limit={history_limit}&usage_limit={usage_limit}"
        ),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool detail refreshed."), None)
    })?;

    Ok(detail)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_spools(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    let limit = input.limit.unwrap_or(1200).clamp(1, 2_500);
    let offset = input.offset.unwrap_or(0).max(0);
    let rows: Vec<SpoolWithMasterRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/spools?limit={limit}&offset={offset}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_spools(&rows)?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host spool list refreshed."),
            health.device_name.as_deref(),
        )
    })?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_spools(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedSpoolList>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_spools
        .map(|cached| LibrarySyncCachedSpoolList {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<Vec<PrinterOverviewRow>, String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(&input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    let rows: Vec<PrinterOverviewRow> =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printers")?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_printers(&rows)?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host printer overview refreshed."),
            health.device_name.as_deref(),
        )
    })?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_settings(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<PrinterSettingsSnapshot, String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(&input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    let snapshot: PrinterSettingsSnapshot =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printer-settings")?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(
            true,
            Some("Host printer settings refreshed."),
            health.device_name.as_deref(),
        )
    })?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedPrinterOverview>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_printers
        .map(|cached| LibrarySyncCachedPrinterOverview {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn fetch_library_sync_loans(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    let limit = input.limit.unwrap_or(2000).clamp(1, 2_500);
    let rows: Vec<SpoolLoanDetailsRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/loans?include_returned=true&direction=ALL&limit={limit}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_loans(&rows)?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host loan list refreshed."),
            health.device_name.as_deref(),
        )
    })?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_filament_consumption(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncFilamentConsumptionInput,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    let limit = input.limit.unwrap_or(500).clamp(1, 2_000);
    let printer_id = input
        .printer_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let printer_query = printer_id
        .map(|value| format!("&printer_id={value}"))
        .unwrap_or_default();
    let rows: Vec<FilamentConsumptionRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/statistics/filament-consumption?limit={limit}{printer_query}")
            .as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(
            true,
            Some("Host filament consumption refreshed."),
            health.device_name.as_deref(),
        )
    })?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_catalog_masters(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogListInput,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let limit = input.limit.unwrap_or(1_000).clamp(1, 5_000);
    let _search = input.search;
    match fetch_library_sync_host_json(
        &normalized_base_url,
        &format!("/api/v1/library/catalog/masters?limit={limit}"),
    ) {
        Ok(rows) => Ok(rows),
        Err(error) if error.contains("404") => get_library_sync_host_json_authenticated(
            &state,
            &normalized_base_url,
            &format!("/api/v1/catalog/masters?limit={limit}"),
        ),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn fetch_library_sync_wishlist_items(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWishlistListInput,
) -> Result<Vec<WishlistItemRow>, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let limit = input.limit.unwrap_or(500).clamp(1, 2_500);
    match fetch_library_sync_host_json(
        &normalized_base_url,
        &format!("/api/v1/library/wishlist?limit={limit}"),
    ) {
        Ok(rows) => Ok(rows),
        Err(error) if error.contains("404") => get_library_sync_host_json_authenticated(
            &state,
            &normalized_base_url,
            &format!("/api/v1/wishlist?limit={limit}"),
        ),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_loans(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibrarySyncCachedLoanList>, String> {
    let settings = with_inventory(&state, |engine| engine.get_library_sync_settings())?;
    Ok(settings
        .cached_loans
        .map(|cached| LibrarySyncCachedLoanList {
            captured_at: cached.captured_at,
            rows: cached.rows,
        }))
}

#[tauri::command]
pub(crate) fn pair_library_sync_host(
    state: tauri::State<'_, AppState>,
    input: PairLibrarySyncHostInput,
) -> Result<LibrarySyncSettingsRow, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: None,
    };
    let (normalized_base_url, _) = normalize_library_sync_host_input(&validation_input)?;
    let pairing_token = extract_library_sync_pairing_token(&input.pairing_token_or_url)
        .ok_or_else(|| "Pairing token or URL is required.".to_string())?;

    let auth_state = pair_library_sync_host_session(&normalized_base_url, &pairing_token)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, None)?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_client_auth_state(
            &auth_state.session_id,
            &auth_state.device_token,
            &auth_state.csrf_token,
            None,
        )?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host desktop pairing completed."),
            health.device_name.as_deref(),
        )?;
        engine.get_library_sync_settings()
    })
}

#[tauri::command]
pub(crate) fn clear_library_sync_client_auth(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| {
        engine.clear_library_sync_client_auth_state()?;
        engine.get_library_sync_settings()
    })
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool weight updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/tare-weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(
            true,
            Some("Host spool tare weight updated."),
            None,
        )
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_details(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolDetailsInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/details"),
        &serde_json::json!({
            "qr_code": input.qr_code.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "status": input.status.trim(),
            "location": input.location.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "home_location": input.home_location.as_ref().map(|value| {
                value.as_deref().map(str::trim).filter(|entry| !entry.is_empty())
            }),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool details updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolRfidTagInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/rfid"),
        &serde_json::json!({
            "rfid_tag": input
                .rfid_tag
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            "rfid_observed_at": input
                .rfid_observed_at
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool RFID updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn assign_library_sync_host_printer_slot(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAssignPrinterSlotInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let printer_id = input.printer_id.trim();
    let slot_id = input.slot_id.trim();
    if printer_id.is_empty() || slot_id.is_empty() {
        return Err("Printer id and slot id are required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/slots/{slot_id}/assignment"),
        &serde_json::json!({
            "spool_id": input.spool_id.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "rfid_override_tray_uuid": input
                .rfid_override_tray_uuid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            "rfid_override_color_hex": input
                .rfid_override_color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            "clear_live_cache_before_next_refresh": input.clear_live_cache_before_next_refresh.unwrap_or(false),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host printer slot updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn record_library_sync_host_print_usage(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRecordPrintUsageInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let printer_id = input.printer_id.trim();
    let spool_id = input.spool_id.trim();
    if printer_id.is_empty() || spool_id.is_empty() {
        return Err("Printer id and spool id are required.".to_string());
    }
    if input.grams <= 0 {
        return Err("Used grams must be greater than zero.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/spools/{spool_id}/usage"),
        &serde_json::json!({
            "grams": input.grams,
            "job_name": input.job_name.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "success": input.success.unwrap_or(true),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host print usage recorded."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn return_library_sync_host_loan(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let loan_id = input.loan_id.trim();
    if loan_id.is_empty() {
        return Err("Loan id is required.".to_string());
    }
    let path = if input.inbound {
        format!("/api/v1/loans/{loan_id}/hand-back")
    } else {
        format!("/api/v1/loans/{loan_id}/return")
    };

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &path,
        &serde_json::json!({
            "returned_grams": input.returned_grams.max(0),
            "note": input.note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host loan updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn lend_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("spool_id is required".to_string());
    }
    let borrower_name = input.borrower_name.trim();
    if borrower_name.is_empty() {
        return Err("borrower_name is required".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/lend"),
        &serde_json::json!({
            "borrower_name": borrower_name,
            "grams_out": input.grams_out.max(0),
            "note": input.note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(
            true,
            Some("Host loan-out write completed."),
            None,
        )
    })?;

    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateSpoolInput,
) -> Result<String, String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let path = if input
        .owner_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        "/api/v1/spools/borrowed-in"
    } else if input
        .master_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        "/api/v1/spools/owned"
    } else {
        "/api/v1/spools/manual"
    };

    let response: LibrarySyncCreateSpoolResponse = perform_library_sync_host_write_and_parse(
        &state,
        &normalized_base_url,
        path,
        &serde_json::json!({
            "master_id": input.master_id.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "material": input.material.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "filament_name": input.filament_name.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "color_name": input.color_name.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "vendor": input.vendor.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "initial_weight_g": input.initial_weight_g,
            "location": input.location.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "hex_color": input.hex_color.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "owner_name": input.owner_name.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "owner_contact": input.owner_contact.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "ownership_note": input.ownership_note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;
    if !response.ok {
        return Err(response.message);
    }

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some(&response.message), None)
    })?;

    Ok(response.spool_id)
}

#[tauri::command]
pub(crate) fn create_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        "/api/v1/wishlist",
        &serde_json::json!({
            "master_id": input.master_id.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            "vendor": input.vendor.trim(),
            "material": input.material.trim(),
            "filament_name": input.filament_name.trim(),
            "color_name": input.color_name.trim(),
            "quantity": input.quantity,
            "note": input.note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host wishlist item created."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateWishlistStatusInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/status"),
        &serde_json::json!({ "status": input.status.trim() }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host wishlist item updated."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteWishlistItemInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/delete"),
        &serde_json::json!({}),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host wishlist item deleted."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/delete"),
        &serde_json::json!({
            "reason": input.reason.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool removed."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn purge_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/purge"),
        &serde_json::json!({
            "reason": input.reason.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host spool purged."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreatePrinterInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let id = input.id.trim();
    let model = input.model.trim();
    let name = input.name.trim();
    if id.is_empty() || model.is_empty() || name.is_empty() {
        return Err("Printer id, model and name are required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        "/api/v1/printers",
        &serde_json::json!({
            "id": id,
            "model": model,
            "name": name,
            "ams_units": input.ams_units,
            "slots_per_ams": input.slots_per_ams,
        }),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host printer saved."), None)
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeletePrinterInput,
) -> Result<(), String> {
    let validation_input = ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    };
    let (normalized_base_url, expected_library_id) =
        normalize_library_sync_host_input(&validation_input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;

    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/delete"),
        &serde_json::json!({}),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_validation_state(true, Some("Host printer deleted."), None)
    })?;
    Ok(())
}

fn build_library_sync_cookie_header(
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
