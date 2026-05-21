use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow,
    WishlistItemRow,
};
use crate::backend::statistics::FilamentConsumptionRow;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_checked, prepare_library_sync_host_read,
    save_library_sync_success,
};
use crate::library_sync_host_client::{
    fetch_library_sync_host_json, get_library_sync_host_json_authenticated,
};
use crate::library_sync_models::{
    LibrarySyncCatalogListInput, LibrarySyncFilamentConsumptionInput, LibrarySyncSpoolDetailInput,
    LibrarySyncSpoolListInput, LibrarySyncWishlistListInput, ValidateLibrarySyncHostInput,
};
use crate::printer_settings_commands::PrinterSettingsSnapshot;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn fetch_library_sync_spool_detail(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolDetailInput,
) -> Result<CompanionSpoolDetail, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&host_input)?;

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

    save_library_sync_success(&state, "Host spool detail refreshed.", None)?;

    Ok(detail)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_spools(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
    let limit = input.limit.unwrap_or(1200).clamp(1, 2_500);
    let offset = input.offset.unwrap_or(0).max(0);
    let rows: Vec<SpoolWithMasterRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/spools?limit={limit}&offset={offset}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_spools(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host spool list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<Vec<PrinterOverviewRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let rows: Vec<PrinterOverviewRow> =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printers")?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_printers(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host printer overview refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_settings(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<PrinterSettingsSnapshot, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let snapshot: PrinterSettingsSnapshot =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printer-settings")?;

    save_library_sync_success(
        &state,
        "Host printer settings refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_loans(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
    let limit = input.limit.unwrap_or(2000).clamp(1, 2_500);
    let rows: Vec<SpoolLoanDetailsRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/loans?include_returned=true&direction=ALL&limit={limit}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_loans(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host loan list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_filament_consumption(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncFilamentConsumptionInput,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
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

    save_library_sync_success(
        &state,
        "Host filament consumption refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_catalog_masters(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogListInput,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&host_input)?;

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
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&host_input)?;

    let limit = input.limit.unwrap_or(500).clamp(1, 2_500);
    let primary_rows: Result<Vec<WishlistItemRow>, String> = fetch_library_sync_host_json(
        &normalized_base_url,
        &format!("/api/v1/library/wishlist?limit={limit}"),
    );
    match primary_rows {
        Ok(rows) => {
            with_inventory(&state, |engine| {
                engine.save_library_sync_cached_wishlist(&rows)
            })?;
            Ok(rows)
        }
        Err(error) if error.contains("404") => {
            let rows: Vec<WishlistItemRow> = get_library_sync_host_json_authenticated(
                &state,
                &normalized_base_url,
                &format!("/api/v1/wishlist?limit={limit}"),
            )?;
            with_inventory(&state, |engine| {
                engine.save_library_sync_cached_wishlist(&rows)
            })?;
            Ok(rows)
        }
        Err(error) => Err(error),
    }
}
