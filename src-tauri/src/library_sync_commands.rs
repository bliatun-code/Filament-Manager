use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, LibrarySyncSettingsRow, PrinterOverviewRow, SpoolLoanDetailsRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::statistics::FilamentConsumptionRow;
use crate::library_sync_host_client::{
    ensure_library_sync_host_matches, extract_library_sync_pairing_token,
    fetch_library_sync_host_json, get_library_sync_host_json_authenticated,
    pair_library_sync_host_session, perform_library_sync_host_write,
    perform_library_sync_host_write_and_parse, renew_library_sync_host_session,
};
use crate::library_sync_models::*;
use crate::printer_commands::PrinterSettingsSnapshot;
use crate::state::AppState;
use crate::trusted_lan_commands::CompanionHealthCheckResponse;
use crate::with_inventory;
use std::time::Duration;

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

fn prepare_library_sync_host_write(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    prepare_library_sync_host_checked(input)
}

fn prepare_library_sync_host_checked(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    Ok((normalized_base_url, expected_library_id))
}

fn trimmed_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|entry| !entry.is_empty())
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
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/details"),
        &serde_json::json!({
            "qr_code": trimmed_non_empty(input.qr_code.as_deref()),
            "status": input.status.trim(),
            "location": trimmed_non_empty(input.location.as_deref()),
            "home_location": input.home_location.as_ref().map(|value| {
                trimmed_non_empty(value.as_deref())
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/rfid"),
        &serde_json::json!({
            "rfid_tag": trimmed_non_empty(input.rfid_tag.as_deref()),
            "rfid_observed_at": trimmed_non_empty(input.rfid_observed_at.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
            "spool_id": trimmed_non_empty(input.spool_id.as_deref()),
            "rfid_override_tray_uuid": trimmed_non_empty(input.rfid_override_tray_uuid.as_deref()),
            "rfid_override_color_hex": trimmed_non_empty(input.rfid_override_color_hex.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
            "job_name": trimmed_non_empty(input.job_name.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
            "note": trimmed_non_empty(input.note.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
            "note": trimmed_non_empty(input.note.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let path = if trimmed_non_empty(input.owner_name.as_deref()).is_some() {
        "/api/v1/spools/borrowed-in"
    } else if trimmed_non_empty(input.master_id.as_deref()).is_some() {
        "/api/v1/spools/owned"
    } else {
        "/api/v1/spools/manual"
    };

    let response: LibrarySyncCreateSpoolResponse = perform_library_sync_host_write_and_parse(
        &state,
        &normalized_base_url,
        path,
        &serde_json::json!({
            "master_id": trimmed_non_empty(input.master_id.as_deref()),
            "material": trimmed_non_empty(input.material.as_deref()),
            "filament_name": trimmed_non_empty(input.filament_name.as_deref()),
            "color_name": trimmed_non_empty(input.color_name.as_deref()),
            "vendor": trimmed_non_empty(input.vendor.as_deref()),
            "initial_weight_g": input.initial_weight_g,
            "location": trimmed_non_empty(input.location.as_deref()),
            "hex_color": trimmed_non_empty(input.hex_color.as_deref()),
            "owner_name": trimmed_non_empty(input.owner_name.as_deref()),
            "owner_contact": trimmed_non_empty(input.owner_contact.as_deref()),
            "ownership_note": trimmed_non_empty(input.ownership_note.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        "/api/v1/wishlist",
        &serde_json::json!({
            "master_id": trimmed_non_empty(input.master_id.as_deref()),
            "vendor": input.vendor.trim(),
            "material": input.material.trim(),
            "filament_name": input.filament_name.trim(),
            "color_name": input.color_name.trim(),
            "quantity": input.quantity,
            "note": trimmed_non_empty(input.note.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/delete"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/purge"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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
