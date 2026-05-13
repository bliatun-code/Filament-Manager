#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_services;
mod backend;
mod bambu_live;
mod catalog_commands;
mod companion_api;
mod companion_assets;
mod companion_error;
mod companion_http;
mod companion_models;
mod companion_payload;
mod companion_session;
mod companion_state;
mod security;
mod state;
mod trusted_lan_commands;

use app_services::{CompanionService, CompanionSpoolDetail};
use backend::filament_database::{
    ActiveSpoolLoanRow, BackupValidationStats, BambuLiveIntegrationEntryRow,
    BambuLiveIntegrationRow, CatalogResetStats, FilamentDatabase, FilamentMasterCatalogRow,
    ImportDataStats, LibrarySyncSettingsRow, LoanUsageByPersonRow, PrinterOverviewRow, PrinterRow,
    SpoolHistoryEventRow, SpoolLoanDetailsRow, SpoolLoanRow, SpoolUsagePointRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use backend::inventory_engine::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput,
    CreateWishlistItemInput, DeleteSpoolInput, InventoryEngine, LendSpoolInput, PurgeSpoolInput,
    RecordPrintUsageInput, ReturnSpoolLoanInput, ScanSource, UpdateMasterCatalogEntryInput,
    UpdateSpoolDetailsInput, UpdateSpoolRfidTagInput, UpdateWishlistStatusInput, WeightSource,
};
use backend::statistics::{
    FilamentConsumptionRow, InventoryOverview, MaterialUsageRow, StatisticsEngine,
};
use base64::Engine;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use reqwest::header::{CONTENT_TYPE, HOST, ORIGIN, SET_COOKIE};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use state::AppState;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use trusted_lan_commands::CompanionHealthCheckResponse;

#[cfg(target_os = "macos")]
const DOCK_ICON_LIGHT_BYTES: &[u8] = include_bytes!("../icons/dock-light.png");
#[cfg(target_os = "macos")]
const DOCK_ICON_DARK_BYTES: &[u8] = include_bytes!("../icons/dock-dark.png");
#[derive(Serialize, Deserialize)]
struct ScanPayload {
    qr_code: Option<String>,
    detected_color_hex: Option<String>,
    source: Option<String>,
}

#[derive(Serialize)]
struct ExportPayload {
    content: String,
}

#[derive(Serialize, Deserialize)]
struct PrinterSettingsSnapshot {
    active_printer_id: Option<String>,
    printers: Vec<PrinterRow>,
    printer_models: Vec<String>,
    bambu_live_integrations: Vec<BambuLiveIntegrationEntryRow>,
}

#[derive(Serialize, Deserialize)]
struct SaveBambuLiveIntegrationInput {
    printer_id: String,
    enabled: bool,
    host: Option<String>,
    access_code: Option<String>,
    printer_serial: Option<String>,
}

#[derive(Deserialize)]
struct SaveLibrarySyncSettingsInput {
    mode: String,
    device_name: String,
    library_id: String,
    host_base_url: Option<String>,
    host_device_name: Option<String>,
}

#[derive(Deserialize)]
struct ValidateLibrarySyncHostInput {
    base_url: String,
    expected_library_id: Option<String>,
}

#[derive(Deserialize)]
struct LibrarySyncSpoolListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Deserialize)]
struct LibrarySyncFilamentConsumptionInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    printer_id: Option<String>,
}

#[derive(Deserialize)]
struct LibrarySyncSpoolDetailInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    history_limit: Option<i64>,
    usage_limit: Option<i64>,
}

#[derive(Deserialize)]
struct PairLibrarySyncHostInput {
    base_url: String,
    pairing_token_or_url: String,
}

#[derive(Deserialize)]
struct LibrarySyncWeightWriteInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    grams: i64,
}

#[derive(Deserialize)]
struct LibrarySyncUpdateSpoolDetailsInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    qr_code: Option<String>,
    status: String,
    location: Option<String>,
    home_location: Option<Option<String>>,
}

#[derive(Deserialize)]
struct LibrarySyncUpdateSpoolRfidTagInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    rfid_tag: Option<String>,
    rfid_observed_at: Option<String>,
}

#[derive(Deserialize)]
struct LibrarySyncAssignPrinterSlotInput {
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
struct LibrarySyncRecordPrintUsageInput {
    base_url: String,
    expected_library_id: Option<String>,
    printer_id: String,
    spool_id: String,
    grams: i64,
    job_name: Option<String>,
    success: Option<bool>,
}

#[derive(Deserialize)]
struct LibrarySyncReturnLoanInput {
    base_url: String,
    expected_library_id: Option<String>,
    loan_id: String,
    returned_grams: i64,
    note: Option<String>,
    inbound: bool,
}

#[derive(Deserialize)]
struct LibrarySyncLendSpoolInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    borrower_name: String,
    grams_out: i64,
    note: Option<String>,
}

#[derive(Deserialize)]
struct LibrarySyncCatalogListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
    search: Option<String>,
}

#[derive(Deserialize)]
struct LibrarySyncWishlistListInput {
    base_url: String,
    expected_library_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct LibrarySyncCreateSpoolInput {
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
struct LibrarySyncCreateWishlistItemInput {
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
struct LibrarySyncUpdateWishlistStatusInput {
    base_url: String,
    expected_library_id: Option<String>,
    item_id: String,
    status: String,
}

#[derive(Deserialize)]
struct LibrarySyncDeleteWishlistItemInput {
    base_url: String,
    expected_library_id: Option<String>,
    item_id: String,
}

#[derive(Deserialize)]
struct LibrarySyncCreatePrinterInput {
    base_url: String,
    expected_library_id: Option<String>,
    id: String,
    model: String,
    name: String,
    ams_units: Option<i64>,
    slots_per_ams: Option<i64>,
}

#[derive(Deserialize)]
struct LibrarySyncDeletePrinterInput {
    base_url: String,
    expected_library_id: Option<String>,
    printer_id: String,
}

#[derive(Deserialize)]
struct LibrarySyncDeleteSpoolInput {
    base_url: String,
    expected_library_id: Option<String>,
    spool_id: String,
    reason: Option<String>,
}

#[derive(Serialize)]
struct LibrarySyncHostValidationResult {
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
struct LibrarySyncSnapshotResponse {
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
struct LibrarySyncAuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
}

struct LibrarySyncAuthenticatedSessionState {
    csrf_token: String,
    session_id: String,
    device_token: String,
}

#[derive(Deserialize)]
struct LibrarySyncCreateSpoolResponse {
    ok: bool,
    message: String,
    spool_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct LibrarySyncRemoteSnapshot {
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
struct LibrarySyncCachedSpoolList {
    captured_at: String,
    rows: Vec<SpoolWithMasterRow>,
}

#[derive(Serialize, Deserialize, Clone)]
struct LibrarySyncCachedPrinterOverview {
    captured_at: String,
    rows: Vec<PrinterOverviewRow>,
}

#[derive(Serialize, Deserialize, Clone)]
struct LibrarySyncCachedLoanList {
    captured_at: String,
    rows: Vec<SpoolLoanDetailsRow>,
}

#[tauri::command]
fn list_spools(
    state: tauri::State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    companion_service(&state)
        .list_spools(limit, offset)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_wishlist_items(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<WishlistItemRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_inventory(&state, |engine| engine.list_wishlist_items(capped))
}

#[tauri::command]
fn get_printer_settings(
    state: tauri::State<'_, AppState>,
) -> Result<PrinterSettingsSnapshot, String> {
    let bambu_live_integrations = with_db(&state, |db| db.list_bambu_live_integrations())?;
    with_inventory(&state, |engine| {
        Ok(PrinterSettingsSnapshot {
            active_printer_id: engine.get_active_printer()?,
            printers: engine.list_printers()?,
            printer_models: supported_printer_models(),
            bambu_live_integrations,
        })
    })
}

#[tauri::command]
fn list_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PrinterOverviewRow>, String> {
    companion_service(&state)
        .list_printer_overview()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn create_printer(
    state: tauri::State<'_, AppState>,
    input: CreatePrinterInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_printer(input))
}

#[tauri::command]
fn save_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    input: SaveBambuLiveIntegrationInput,
) -> Result<(), String> {
    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    with_inventory(&state, |engine| {
        let exists = engine
            .list_printers()?
            .into_iter()
            .any(|printer| printer.id == printer_id);
        if !exists {
            return Err(crate::backend::filament_database::InventoryError::NotFound);
        }
        Ok(())
    })?;
    with_db(&state, |db| {
        db.save_bambu_live_integration(
            printer_id,
            &BambuLiveIntegrationRow {
                enabled: input.enabled,
                host: input
                    .host
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                access_code: input
                    .access_code
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                printer_serial: input
                    .printer_serial
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                last_error: None,
                observed_state: None,
            },
        )
    })
}

#[tauri::command]
fn delete_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    with_db(&state, |db| db.delete_bambu_live_integration(&printer_id))
}

#[tauri::command]
fn delete_printer(state: tauri::State<'_, AppState>, printer_id: String) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_printer(&printer_id))
}

#[tauri::command]
fn set_active_printer(
    state: tauri::State<'_, AppState>,
    printer_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.set_active_printer(printer_id.as_deref())
    })
}

#[tauri::command]
fn set_dock_icon_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let normalized = theme.trim().to_lowercase();
        let icon_bytes = if normalized == "dark" {
            DOCK_ICON_DARK_BYTES
        } else {
            DOCK_ICON_LIGHT_BYTES
        };
        apply_macos_dock_icon(&app, icon_bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = theme;
        Ok(())
    }
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app.package_info().version.to_string())
}

#[tauri::command]
fn get_library_sync_settings(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| engine.get_library_sync_settings())
}

#[tauri::command]
fn save_library_sync_settings(
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
fn validate_library_sync_host(
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
fn fetch_library_sync_snapshot(
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
            &backend::filament_database::LibrarySyncCachedSnapshotRow {
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
fn fetch_library_sync_spool_detail(
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
fn fetch_library_sync_spools(
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
fn fetch_cached_library_sync_spools(
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
fn fetch_library_sync_printer_overview(
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
fn fetch_library_sync_printer_settings(
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
fn fetch_cached_library_sync_printer_overview(
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
fn fetch_library_sync_loans(
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
fn fetch_library_sync_filament_consumption(
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
fn fetch_library_sync_catalog_masters(
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
fn fetch_library_sync_wishlist_items(
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
fn fetch_cached_library_sync_loans(
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
fn pair_library_sync_host(
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
fn clear_library_sync_client_auth(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySyncSettingsRow, String> {
    with_inventory(&state, |engine| {
        engine.clear_library_sync_client_auth_state()?;
        engine.get_library_sync_settings()
    })
}

#[tauri::command]
fn update_library_sync_host_spool_weight(
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
fn update_library_sync_host_spool_tare_weight(
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
fn update_library_sync_host_spool_details(
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
fn update_library_sync_host_spool_rfid_tag(
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
fn assign_library_sync_host_printer_slot(
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
fn record_library_sync_host_print_usage(
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
fn return_library_sync_host_loan(
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
fn assign_printer_slot(
    state: tauri::State<'_, AppState>,
    input: AssignPrinterSlotInput,
) -> Result<(), String> {
    companion_service(&state)
        .assign_printer_slot(
            input.printer_id.trim(),
            input.slot_id.trim(),
            input
                .spool_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_tray_uuid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input.clear_live_cache_before_next_refresh.unwrap_or(false),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn record_print_usage(
    state: tauri::State<'_, AppState>,
    input: RecordPrintUsageInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.record_print_usage(input))
}

#[tauri::command]
fn reset_app_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_inventory(&state, |engine| engine.reset_app_state())
}

#[tauri::command]
fn reset_catalog_data(state: tauri::State<'_, AppState>) -> Result<CatalogResetStats, String> {
    with_inventory(&state, |engine| engine.reset_catalogs())
}

#[tauri::command]
fn list_master_catalog(
    state: tauri::State<'_, AppState>,
    limit: i64,
    search: Option<String>,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    with_db(&state, |db| {
        db.list_master_catalog(limit, search.as_deref())
    })
}

#[tauri::command]
fn lend_library_sync_host_spool(
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
fn create_library_sync_host_spool(
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
fn create_library_sync_host_wishlist_item(
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
fn update_library_sync_host_wishlist_item_status(
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
fn delete_library_sync_host_wishlist_item(
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
fn delete_library_sync_host_spool(
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
fn purge_library_sync_host_spool(
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
fn create_library_sync_host_printer(
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
fn delete_library_sync_host_printer(
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

#[tauri::command]
fn create_spool(state: tauri::State<'_, AppState>, input: CreateSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_spool(input))
}

#[tauri::command]
fn create_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: CreateWishlistItemInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_wishlist_item(input))
}

#[tauri::command]
fn create_manual_spool(
    state: tauri::State<'_, AppState>,
    input: CreateManualSpoolInput,
) -> Result<(), String> {
    companion_service(&state)
        .create_manual_spool(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_weight(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    grams: i64,
    scale_id: Option<String>,
    source: Option<String>,
) -> Result<(), String> {
    let weight_source = match source.as_deref() {
        Some("AUTO") => WeightSource::Auto,
        _ => WeightSource::Manual,
    };
    companion_service(&state)
        .update_spool_weight(&spool_id, grams, scale_id.as_deref(), weight_source)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    grams: i64,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_tare_weight(&spool_id, grams)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_status(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    status: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.update_spool_status(&spool_id, &status)
    })
}

#[tauri::command]
fn update_spool_details(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolDetailsInput,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_details(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolRfidTagInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_spool_rfid_tag(input))
}

#[tauri::command]
fn update_master_catalog_entry(
    state: tauri::State<'_, AppState>,
    input: UpdateMasterCatalogEntryInput,
) -> Result<String, String> {
    with_inventory(&state, |engine| engine.update_master_catalog_entry(input))
}

#[tauri::command]
fn delete_spool(state: tauri::State<'_, AppState>, input: DeleteSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_spool(input))
}

#[tauri::command]
fn purge_spool(state: tauri::State<'_, AppState>, input: PurgeSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.purge_spool(input))
}

#[tauri::command]
fn list_spool_history(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolHistoryEventRow>, String> {
    let capped = limit.unwrap_or(50).clamp(1, 250);
    companion_service(&state)
        .list_spool_history(&spool_id, capped)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_spool_usage(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolUsagePointRow>, String> {
    let capped = limit.unwrap_or(300).clamp(1, 1_000);
    companion_service(&state)
        .list_spool_usage(&spool_id, capped)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_active_spool_loans(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ActiveSpoolLoanRow>, String> {
    companion_service(&state)
        .list_active_spool_loans()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_loan_usage_by_person(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    direction: Option<String>,
) -> Result<Vec<LoanUsageByPersonRow>, String> {
    let capped = limit.unwrap_or(30).clamp(1, 200);
    with_inventory(&state, |engine| {
        engine.list_loan_usage_by_person(capped, direction.as_deref())
    })
}

#[tauri::command]
fn list_spool_loans(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    include_returned: Option<bool>,
    direction: Option<String>,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 10_000);
    companion_service(&state)
        .list_spool_loans(
            capped,
            include_returned.unwrap_or(true),
            direction.as_deref(),
        )
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: UpdateWishlistStatusInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_wishlist_item_status(input))
}

#[tauri::command]
fn lend_spool(
    state: tauri::State<'_, AppState>,
    input: LendSpoolInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .lend_spool(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn return_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn return_inbound_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_inbound_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn export_loans_csv(
    state: tauri::State<'_, AppState>,
    include_returned: Option<bool>,
    direction: Option<String>,
) -> Result<ExportPayload, String> {
    let content = with_inventory(&state, |engine| {
        engine
            .export_loans_csv_for_direction(include_returned.unwrap_or(true), direction.as_deref())
    })?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn delete_wishlist_item(state: tauri::State<'_, AppState>, item_id: String) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_wishlist_item(&item_id))
}

#[tauri::command]
fn assign_location(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    location_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.assign_location(&spool_id, location_id.as_deref())
    })
}

#[tauri::command]
fn find_spool_by_qr(
    state: tauri::State<'_, AppState>,
    qr_code: String,
) -> Result<Option<backend::filament_database::SpoolRow>, String> {
    companion_service(&state)
        .find_spool_row_by_qr_or_id(&qr_code)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn record_scan_event(
    state: tauri::State<'_, AppState>,
    payload: ScanPayload,
) -> Result<(), String> {
    let source = match payload.source.as_deref() {
        Some("MOBILE") => ScanSource::Mobile,
        _ => ScanSource::Desktop,
    };
    with_inventory(&state, |engine| {
        engine.record_scan(
            None,
            payload.qr_code.as_deref(),
            source,
            payload.detected_color_hex.as_deref(),
        )
    })
}

#[tauri::command]
fn export_inventory_csv(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_csv())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn export_inventory_json(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn export_full_backup_json(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_full_backup_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn import_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    with_db(&state, |db| db.import_full_backup_json(&content))
}

#[tauri::command]
fn import_data_file(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<ImportDataStats, String> {
    with_db(&state, |db| db.import_data_content(&content))
}

#[tauri::command]
fn validate_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<BackupValidationStats, String> {
    with_db(&state, |db| db.validate_full_backup_json(&content))
}

#[tauri::command]
fn inventory_overview(state: tauri::State<'_, AppState>) -> Result<InventoryOverview, String> {
    with_stats(&state, |stats| stats.inventory_overview())
}

#[tauri::command]
fn top_materials(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<MaterialUsageRow>, String> {
    with_stats(&state, |stats| stats.top_materials(limit))
}

#[tauri::command]
fn list_filament_consumption(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    printer_id: Option<String>,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_stats(&state, |stats| {
        stats.filament_consumption(capped, printer_id.as_deref())
    })
}

#[tauri::command]
fn check_low_stock(state: tauri::State<'_, AppState>, threshold: i64) -> Result<usize, String> {
    with_inventory(&state, |engine| engine.check_low_stock_alerts(threshold))
}

#[tauri::command]
fn enqueue_sync_action(
    state: tauri::State<'_, AppState>,
    action_type: String,
    payload_json: String,
) -> Result<String, String> {
    with_inventory(&state, |engine| {
        engine.enqueue_sync_action(&action_type, &payload_json)
    })
}

#[tauri::command]
fn print_label_html(
    app: tauri::AppHandle,
    html: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let path = write_label_to_disk(&app, &html)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
}

#[tauri::command]
fn print_label_pdf(
    app: tauri::AppHandle,
    pdf_base64: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(pdf_base64.trim())
        .map_err(|error| format!("Invalid PDF payload: {error}"))?;
    let path = write_pdf_to_disk(&app, &bytes)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_macos_dock_icon(app: &tauri::AppHandle, icon_bytes: &'static [u8]) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let result = (|| {
            let mtm = MainThreadMarker::new()
                .ok_or_else(|| "Dock icon update must run on main thread".to_string())?;
            let app_instance = NSApp(mtm);
            let icon_data = unsafe {
                NSData::dataWithBytes_length(icon_bytes.as_ptr().cast::<c_void>(), icon_bytes.len())
            };
            let image = NSImage::initWithData(NSImage::alloc(), &icon_data)
                .ok_or_else(|| "Failed to decode dock icon image".to_string())?;
            unsafe {
                app_instance.setApplicationIconImage(Some(&image));
            }
            Ok(())
        })();
        let _ = sender.send(result);
    })
    .map_err(|error| format!("Failed to schedule dock icon update: {error}"))?;
    receiver
        .recv()
        .map_err(|error| format!("Dock icon update did not complete: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = ensure_db(app)?;
            let trusted_lan_runtime =
                trusted_lan_commands::load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
            let companion = state::CompanionRuntimeState::new(trusted_lan_runtime);
            let state = AppState {
                db_path: db_path.to_string_lossy().to_string(),
                companion,
            };
            app.manage(state.clone());

            let lan_state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = companion_api::reconcile_trusted_lan_server(lan_state).await {
                    eprintln!("Trusted-LAN companion failed: {error}");
                }
            });

            let bambu_live_state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                bambu_live::run_live_observer(bambu_live_state).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_spools,
            list_wishlist_items,
            get_printer_settings,
            list_printer_overview,
            trusted_lan_commands::get_trusted_lan_companion_status,
            trusted_lan_commands::list_trusted_lan_interfaces,
            trusted_lan_commands::update_trusted_lan_companion_config,
            trusted_lan_commands::create_trusted_lan_pairing,
            trusted_lan_commands::list_trusted_lan_paired_browsers,
            trusted_lan_commands::revoke_trusted_lan_paired_browser,
            trusted_lan_commands::revoke_all_trusted_lan_paired_browsers,
            list_master_catalog,
            catalog_commands::refresh_bambu_catalog,
            catalog_commands::refresh_esun_catalog,
            catalog_commands::esun_search_filaments,
            catalog_commands::esun_fetch_product_detail,
            create_spool,
            create_wishlist_item,
            create_manual_spool,
            create_printer,
            save_bambu_live_integration,
            delete_bambu_live_integration,
            delete_printer,
            set_active_printer,
            set_dock_icon_theme,
            get_app_version,
            get_library_sync_settings,
            save_library_sync_settings,
            validate_library_sync_host,
            fetch_library_sync_snapshot,
            fetch_library_sync_spool_detail,
            fetch_library_sync_spools,
            fetch_library_sync_catalog_masters,
            fetch_library_sync_wishlist_items,
            fetch_cached_library_sync_spools,
            fetch_library_sync_printer_overview,
            fetch_library_sync_printer_settings,
            fetch_cached_library_sync_printer_overview,
            fetch_library_sync_loans,
            fetch_library_sync_filament_consumption,
            fetch_cached_library_sync_loans,
            pair_library_sync_host,
            clear_library_sync_client_auth,
            create_library_sync_host_spool,
            create_library_sync_host_wishlist_item,
            create_library_sync_host_printer,
            update_library_sync_host_wishlist_item_status,
            delete_library_sync_host_wishlist_item,
            delete_library_sync_host_spool,
            delete_library_sync_host_printer,
            purge_library_sync_host_spool,
            update_library_sync_host_spool_weight,
            update_library_sync_host_spool_tare_weight,
            update_library_sync_host_spool_details,
            update_library_sync_host_spool_rfid_tag,
            assign_library_sync_host_printer_slot,
            record_library_sync_host_print_usage,
            return_library_sync_host_loan,
            lend_library_sync_host_spool,
            assign_printer_slot,
            record_print_usage,
            update_spool_weight,
            update_spool_tare_weight,
            update_spool_status,
            update_spool_details,
            update_spool_rfid_tag,
            update_master_catalog_entry,
            delete_spool,
            purge_spool,
            list_spool_history,
            list_spool_usage,
            list_active_spool_loans,
            list_loan_usage_by_person,
            list_spool_loans,
            update_wishlist_item_status,
            delete_wishlist_item,
            lend_spool,
            return_spool_loan,
            return_inbound_spool_loan,
            export_loans_csv,
            assign_location,
            find_spool_by_qr,
            record_scan_event,
            export_inventory_csv,
            export_inventory_json,
            export_full_backup_json,
            import_full_backup_json,
            import_data_file,
            validate_full_backup_json,
            inventory_overview,
            reset_app_data,
            reset_catalog_data,
            top_materials,
            list_filament_consumption,
            check_low_stock,
            enqueue_sync_action,
            print_label_html,
            print_label_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

fn supported_printer_models() -> Vec<String> {
    vec![
        "Bambu Lab X1 Carbon",
        "Bambu Lab X1E",
        "Bambu Lab P1S",
        "Bambu Lab P1P",
        "Bambu Lab A1",
        "Bambu Lab A1 mini",
        "Bambu Lab H2D",
        "Prusa CORE One",
        "Prusa CORE One+",
        "Prusa XL",
        "Prusa XL (Single Toolhead)",
        "Prusa XL (Dual Toolhead)",
        "Prusa XL (Five Toolhead)",
        "Prusa MK4S",
        "Prusa MK4",
        "Prusa MK3.9S",
        "Prusa MK3.9",
        "Prusa MK3.5S",
        "Prusa MK3.5",
        "Prusa MINI+",
        "Prusa i3 MK3S+",
        "Creality K1",
        "Creality K1 Max",
        "Anycubic Kobra 2",
        "Custom model",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn ensure_db(app: &tauri::App) -> Result<PathBuf, String> {
    if let Ok(env_path) = std::env::var("BAMBU_DB_PATH") {
        let path = PathBuf::from(env_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let db = FilamentDatabase::open(&path).map_err(|error| format!("DB open: {error:?}"))?;
        db.apply_schema()
            .map_err(|error| format!("DB schema: {error:?}"))?;
        return Ok(path);
    }

    let app_dir = resolve_app_storage_dir_for_app(app)?;
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    let db_path = app_dir.join("bambu.db");
    let db = FilamentDatabase::open(&db_path).map_err(|error| format!("DB open: {error:?}"))?;
    db.apply_schema()
        .map_err(|error| format!("DB schema: {error:?}"))?;
    Ok(db_path)
}

fn write_label_to_disk(app: &tauri::AppHandle, html: &str) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.html", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, html.as_bytes())?;
    Ok(path)
}

fn write_pdf_to_disk(app: &tauri::AppHandle, bytes: &[u8]) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.pdf", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, bytes)?;
    Ok(path)
}

fn resolve_app_storage_dir_for_app(app: &tauri::App) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let app_local_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(resolve_windows_storage_dir(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(app_data_dir)
    }
}

fn resolve_app_storage_dir_for_handle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let app_local_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(resolve_windows_storage_dir(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(app_data_dir)
    }
}

#[cfg(target_os = "windows")]
fn resolve_windows_storage_dir(roaming_dir: PathBuf, local_dir: PathBuf) -> PathBuf {
    let roaming_db_path = roaming_dir.join("bambu.db");
    let local_db_path = local_dir.join("bambu.db");
    if local_db_path.exists() {
        return local_dir;
    }
    if roaming_db_path.exists() {
        return roaming_dir;
    }
    local_dir
}

fn write_generated_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension(format!("{}.tmp", chrono_id()));
    let mut file = File::create(&temp_path).map_err(|error| error.to_string())?;
    file.write_all(contents)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    std::fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_generated_document(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        open::that(path).map_err(|error| {
            format!("Failed to open generated file in the default Windows handler: {error}")
        })?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(path).map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn chrono_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    nanos.to_string()
}

fn companion_service(state: &AppState) -> CompanionService {
    CompanionService::new(state.db_path.clone())
}

fn inventory_error_to_string(error: backend::filament_database::InventoryError) -> String {
    format!("{error:?}")
}

fn with_inventory<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(InventoryEngine) -> backend::filament_database::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    let engine = InventoryEngine::new(db);
    func(engine).map_err(|error| format!("{:?}", error))
}

fn with_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(&FilamentDatabase) -> backend::filament_database::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    func(&db).map_err(|error| format!("{:?}", error))
}

fn with_stats<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(StatisticsEngine) -> Result<Output, rusqlite::Error>,
{
    let stats = StatisticsEngine::open(&state.db_path).map_err(|error| error.to_string())?;
    func(stats).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{chrono_id, write_generated_file};
    use crate::backend::filament_database::{FilamentDatabase, TrustedLanSettingsRow};
    use crate::trusted_lan_commands::load_trusted_lan_runtime;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-main-{test_name}-{nanos}.db"))
    }

    #[test]
    fn trusted_lan_runtime_keeps_enabled_state_from_settings() {
        let db_path = temp_db_path("trusted-lan-dark-startup");
        let result = (|| -> Result<(), String> {
            {
                let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
                db.apply_schema().map_err(|error| error.to_string())?;
                db.save_trusted_lan_settings(&TrustedLanSettingsRow {
                    enabled: true,
                    selected_interface_name: Some("Wi-Fi".to_string()),
                    selected_interface_address: Some("192.168.1.50".to_string()),
                    listen_port: 4278,
                })
                .map_err(|error| error.to_string())?;
            }

            let runtime = load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
            let snapshot = runtime.snapshot();
            assert!(snapshot.enabled);
            assert_eq!(snapshot.selected_interface_name.as_deref(), Some("Wi-Fi"));
            assert_eq!(
                snapshot.selected_interface_address.as_deref(),
                Some("192.168.1.50")
            );
            assert_eq!(snapshot.listen_port, 4278);
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn generated_file_write_persists_contents() {
        let path = std::env::temp_dir().join(format!("filament-manager-write-{}.txt", chrono_id()));
        let result = (|| -> Result<(), String> {
            write_generated_file(&path, b"hello windows rc")?;
            let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
            assert_eq!(contents, "hello windows rc");
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_storage_prefers_existing_db_location() {
        use super::resolve_windows_storage_dir;

        let base =
            std::env::temp_dir().join(format!("filament-manager-windows-storage-{}", chrono_id()));
        let roaming_dir = base.join("roaming");
        let local_dir = base.join("local");
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&roaming_dir).map_err(|error| error.to_string())?;
            std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

            let selected_without_db =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_without_db, local_dir);

            std::fs::write(roaming_dir.join("bambu.db"), b"roaming-db")
                .map_err(|error| error.to_string())?;
            let selected_with_roaming =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_with_roaming, roaming_dir);

            std::fs::write(local_dir.join("bambu.db"), b"local-db")
                .map_err(|error| error.to_string())?;
            let selected_with_local =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_with_local, local_dir);

            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
