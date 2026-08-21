use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow,
    WishlistItemRow,
};
use crate::backend::statistics::{
    FilamentConsumptionRow, StatisticsPeriod, StatisticsPeriodReport,
};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_checked, prepare_library_sync_host_read,
    save_library_sync_success,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated;
use crate::library_sync_models::{
    LibrarySyncCatalogListInput, LibrarySyncFilamentConsumptionInput,
    LibrarySyncFullBackupResponse, LibrarySyncSpoolDetailInput, LibrarySyncSpoolListInput,
    LibrarySyncStatisticsPeriodInput, LibrarySyncWishlistListInput, ValidateLibrarySyncHostInput,
};
use crate::printer_settings_commands::PrinterSettingsSnapshot;
use crate::state::AppState;
use crate::with_inventory;

const LIBRARY_SYNC_READ_NOT_FOUND_ERROR: &str = "Desktop sync read request returned 404 Not Found.";

fn is_library_sync_read_not_found(error: &str) -> bool {
    error == LIBRARY_SYNC_READ_NOT_FOUND_ERROR
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_spool_detail(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolDetailInput,
) -> Result<CompanionSpoolDetail, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_spool_detail_blocking(&state, input)).await
}

fn fetch_library_sync_spool_detail_blocking(
    state: &AppState,
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
        state,
        &normalized_base_url,
        &format!(
            "/api/v1/spools/{spool_id}?history_limit={history_limit}&usage_limit={usage_limit}"
        ),
    )?;

    save_library_sync_success(state, "Host spool detail refreshed.", None)?;

    Ok(detail)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_spools(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_spools_blocking(&state, input)).await
}

fn fetch_library_sync_spools_blocking(
    state: &AppState,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
    let limit = input.limit.unwrap_or(1000).clamp(1, 2_500);
    let offset = input.offset.unwrap_or(0).max(0);
    let rows: Vec<SpoolWithMasterRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        format!("/api/v1/library/spools?limit={limit}&offset={offset}").as_str(),
    )?;

    save_library_sync_success(
        state,
        "Host spool list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<Vec<PrinterOverviewRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_printer_overview_blocking(&state, input))
        .await
}

fn fetch_library_sync_printer_overview_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<Vec<PrinterOverviewRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let rows: Vec<PrinterOverviewRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/printers",
    )?;

    with_inventory(state, |engine| {
        engine.save_library_sync_cached_printers(&rows)
    })?;
    save_library_sync_success(
        state,
        "Host printer overview refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_printer_settings(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<PrinterSettingsSnapshot, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_printer_settings_blocking(&state, input))
        .await
}

fn fetch_library_sync_printer_settings_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<PrinterSettingsSnapshot, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let snapshot: PrinterSettingsSnapshot = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/printer-settings",
    )?;

    save_library_sync_success(
        state,
        "Host printer settings refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_loans(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_loans_blocking(&state, input)).await
}

fn fetch_library_sync_loans_blocking(
    state: &AppState,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
    let limit = input.limit.unwrap_or(2000).clamp(1, 2_500);
    let rows: Vec<SpoolLoanDetailsRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        format!("/api/v1/library/loans?include_returned=true&direction=ALL&limit={limit}").as_str(),
    )?;

    with_inventory(state, |engine| engine.save_library_sync_cached_loans(&rows))?;
    save_library_sync_success(
        state,
        "Host loan list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_filament_consumption(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncFilamentConsumptionInput,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        fetch_library_sync_filament_consumption_blocking(&state, input)
    })
    .await
}

fn fetch_library_sync_filament_consumption_blocking(
    state: &AppState,
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
    let rows: Vec<FilamentConsumptionRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        format!("/api/v1/library/statistics/filament-consumption?limit={limit}{printer_query}")
            .as_str(),
    )?;

    with_inventory(state, |engine| {
        engine.save_library_sync_cached_consumption(&rows)
    })?;
    save_library_sync_success(
        state,
        "Host filament consumption refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_statistics_period_report(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncStatisticsPeriodInput,
) -> Result<Option<StatisticsPeriodReport>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        fetch_library_sync_statistics_period_report_blocking(&state, input)
    })
    .await
}

fn fetch_library_sync_statistics_period_report_blocking(
    state: &AppState,
    input: LibrarySyncStatisticsPeriodInput,
) -> Result<Option<StatisticsPeriodReport>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health) = prepare_library_sync_host_read(&host_input)?;
    let path = library_sync_statistics_period_path(&input.period);
    let report = match get_library_sync_host_json_authenticated(state, &normalized_base_url, &path)
    {
        Ok(report) => Some(report),
        Err(error) if is_library_sync_read_not_found(&error) => None,
        Err(error) => return Err(error),
    };

    save_library_sync_success(
        state,
        "Host statistics period refreshed.",
        health.device_name.as_deref(),
    )?;
    Ok(report)
}

fn library_sync_statistics_period_path(period: &StatisticsPeriod) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("start_at_utc", period.start_at_utc.trim());
    query.append_pair("end_at_utc", period.end_at_utc.trim());
    format!(
        "/api/v1/library/statistics/period-report?{}",
        query.finish()
    )
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_catalog_masters(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogListInput,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_catalog_masters_blocking(&state, input))
        .await
}

fn fetch_library_sync_catalog_masters_blocking(
    state: &AppState,
    input: LibrarySyncCatalogListInput,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&host_input)?;

    let limit = input.limit.unwrap_or(1_000).clamp(1, 5_000);
    let primary_path = library_sync_catalog_masters_path(
        "/api/v1/library/catalog/masters",
        limit,
        input.search.as_deref(),
    );
    let fallback_path = library_sync_catalog_masters_path(
        "/api/v1/catalog/masters",
        limit,
        input.search.as_deref(),
    );
    match get_library_sync_host_json_authenticated(state, &normalized_base_url, &primary_path) {
        Ok(rows) => Ok(rows),
        Err(error) if is_library_sync_read_not_found(&error) => {
            get_library_sync_host_json_authenticated(state, &normalized_base_url, &fallback_path)
        }
        Err(error) => Err(error),
    }
}

fn library_sync_catalog_masters_path(base_path: &str, limit: i64, search: Option<&str>) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("limit", &limit.to_string());
    if let Some(search) = search {
        query.append_pair("search", search);
    }
    format!("{base_path}?{}", query.finish())
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_wishlist_items(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWishlistListInput,
) -> Result<Vec<WishlistItemRow>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_wishlist_items_blocking(&state, input))
        .await
}

fn fetch_library_sync_wishlist_items_blocking(
    state: &AppState,
    input: LibrarySyncWishlistListInput,
) -> Result<Vec<WishlistItemRow>, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&host_input)?;

    let limit = input.limit.unwrap_or(500).clamp(1, 2_500);
    let primary_rows: Result<Vec<WishlistItemRow>, String> =
        get_library_sync_host_json_authenticated(
            state,
            &normalized_base_url,
            &format!("/api/v1/library/wishlist?limit={limit}"),
        );
    match primary_rows {
        Ok(rows) => {
            with_inventory(state, |engine| {
                engine.save_library_sync_cached_wishlist(&rows)
            })?;
            Ok(rows)
        }
        Err(error) if is_library_sync_read_not_found(&error) => {
            let rows: Vec<WishlistItemRow> = get_library_sync_host_json_authenticated(
                state,
                &normalized_base_url,
                &format!("/api/v1/wishlist?limit={limit}"),
            )?;
            with_inventory(state, |engine| {
                engine.save_library_sync_cached_wishlist(&rows)
            })?;
            Ok(rows)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_full_backup_json(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncFullBackupResponse, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_full_backup_json_blocking(&state, input))
        .await
}

fn fetch_library_sync_full_backup_json_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncFullBackupResponse, String> {
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&input)?;
    let payload: LibrarySyncFullBackupResponse = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/backup/full",
    )?;
    save_library_sync_success(state, "Host full backup exported.", None)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::{
        is_library_sync_read_not_found, library_sync_catalog_masters_path,
        library_sync_statistics_period_path, StatisticsPeriod,
    };

    #[test]
    fn read_not_found_classification_accepts_exact_http_status_error() {
        assert!(is_library_sync_read_not_found(
            "Desktop sync read request returned 404 Not Found."
        ));
    }

    #[test]
    fn read_not_found_classification_rejects_transport_and_hostname_text() {
        assert!(!is_library_sync_read_not_found(
            "Desktop sync read request failed to connect to filament-404.local."
        ));
        assert!(!is_library_sync_read_not_found(
            "Desktop sync read request failed for http://192.168.1.20:404."
        ));
    }

    #[test]
    fn statistics_period_path_trims_and_encodes_utc_boundaries() {
        assert_eq!(
            library_sync_statistics_period_path(&StatisticsPeriod {
                start_at_utc: " 2026-08-01T00:00:00Z ".to_string(),
                end_at_utc: "2026-09-01T00:00:00Z".to_string(),
            }),
            "/api/v1/library/statistics/period-report?start_at_utc=2026-08-01T00%3A00%3A00Z&end_at_utc=2026-09-01T00%3A00%3A00Z"
        );
    }

    #[test]
    fn catalog_master_path_omits_absent_search() {
        assert_eq!(
            library_sync_catalog_masters_path("/api/v1/library/catalog/masters", 5_000, None,),
            "/api/v1/library/catalog/masters?limit=5000"
        );
    }

    #[test]
    fn catalog_master_path_encodes_spaces_for_fallback_route() {
        assert_eq!(
            library_sync_catalog_masters_path("/api/v1/catalog/masters", 5_000, Some("PLA Basic"),),
            "/api/v1/catalog/masters?limit=5000&search=PLA+Basic"
        );
    }

    #[test]
    fn catalog_master_path_encodes_query_delimiters() {
        assert_eq!(
            library_sync_catalog_masters_path(
                "/api/v1/library/catalog/masters",
                250,
                Some("PLA & PETG"),
            ),
            "/api/v1/library/catalog/masters?limit=250&search=PLA+%26+PETG"
        );
    }

    #[test]
    fn catalog_master_path_encodes_unicode() {
        assert_eq!(
            library_sync_catalog_masters_path(
                "/api/v1/library/catalog/masters",
                5_000,
                Some("blå"),
            ),
            "/api/v1/library/catalog/masters?limit=5000&search=bl%C3%A5"
        );
    }
}
