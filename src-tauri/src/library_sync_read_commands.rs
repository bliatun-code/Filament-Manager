use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, FilamentStandardsSnapshot, PrinterOverviewRow, SpoolLoanDetailsRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::statistics::{
    FilamentConsumptionRow, StatisticsPeriod, StatisticsPeriodReport,
};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_checked,
    prepare_library_sync_host_read, require_host_filament_price_standards_capability,
    save_library_sync_success,
};
use crate::library_sync_host_client::{
    get_library_sync_host_json_authenticated, library_sync_host_error_code,
};
use crate::library_sync_models::{
    LibrarySyncCatalogListInput, LibrarySyncFilamentConsumptionInput,
    LibrarySyncFullBackupResponse, LibrarySyncSpoolDetailInput, LibrarySyncSpoolListInput,
    LibrarySyncStatisticsPeriodInput, LibrarySyncWishlistListInput, ValidateLibrarySyncHostInput,
};
use crate::library_sync_target_guard::{
    ensure_library_sync_target_current, with_current_library_sync_target,
};
use crate::printer_settings_commands::PrinterSettingsSnapshot;
use crate::state::AppState;

const LIBRARY_SYNC_READ_NOT_FOUND_ERROR: &str = "Desktop sync read request returned 404 Not Found.";

fn is_library_sync_read_not_found(error: &str) -> bool {
    error == LIBRARY_SYNC_READ_NOT_FOUND_ERROR
        || library_sync_host_error_code(error).as_deref() == Some("common.not_found")
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
    let (normalized_base_url, _, target) = prepare_library_sync_host_checked(state, &host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let history_limit = input.history_limit.unwrap_or(80).clamp(1, 250);
    let usage_limit = input.usage_limit.unwrap_or(500).clamp(1, 1_000);
    let spool_id = encode_library_sync_path_segment(spool_id);

    let detail: CompanionSpoolDetail = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        &format!(
            "/api/v1/spools/{spool_id}?history_limit={history_limit}&usage_limit={usage_limit}"
        ),
    )?;

    save_library_sync_success(state, &target, "Host spool detail refreshed.", None)?;

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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &host_input)?;
    let limit = input.limit.unwrap_or(1000).clamp(1, 2_500);
    let offset = input.offset.unwrap_or(0).max(0);
    let rows: Vec<SpoolWithMasterRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        format!("/api/v1/library/spools?limit={limit}&offset={offset}").as_str(),
    )?;

    save_library_sync_success(
        state,
        &target,
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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &input)?;
    let rows: Vec<PrinterOverviewRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/printers",
    )?;

    with_current_library_sync_target(state, &target, |engine| {
        engine.save_library_sync_cached_printers(&rows)
    })?;
    save_library_sync_success(
        state,
        &target,
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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &input)?;
    let snapshot: PrinterSettingsSnapshot = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/printer-settings",
    )?;

    save_library_sync_success(
        state,
        &target,
        "Host printer settings refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn fetch_library_sync_filament_standards(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<FilamentStandardsSnapshot, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_filament_standards_blocking(&state, input))
        .await
}

fn fetch_library_sync_filament_standards_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<FilamentStandardsSnapshot, String> {
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &input)?;
    require_host_filament_price_standards_capability(&health.capabilities, true)?;
    let snapshot: FilamentStandardsSnapshot = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/filament-standards",
    )?;

    save_library_sync_success(
        state,
        &target,
        "Host filament standards refreshed.",
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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &host_input)?;
    let limit = input.limit.unwrap_or(2000).clamp(1, 2_500);
    let rows: Vec<SpoolLoanDetailsRow> = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        format!("/api/v1/library/loans?include_returned=true&direction=ALL&limit={limit}").as_str(),
    )?;

    with_current_library_sync_target(state, &target, |engine| {
        engine.save_library_sync_cached_loans(&rows)
    })?;
    save_library_sync_success(
        state,
        &target,
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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &host_input)?;
    let limit = input.limit.unwrap_or(500).clamp(1, 2_000);
    let printer_id = input
        .printer_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let path = library_sync_filament_consumption_path(limit, printer_id);
    let rows: Vec<FilamentConsumptionRow> =
        get_library_sync_host_json_authenticated(state, &normalized_base_url, &path)?;

    with_current_library_sync_target(state, &target, |engine| {
        engine.save_library_sync_cached_consumption(&rows)
    })?;
    save_library_sync_success(
        state,
        &target,
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
    let (normalized_base_url, health, target) = prepare_library_sync_host_read(state, &host_input)?;
    let path = library_sync_statistics_period_path(&input.period);
    // The period report predates value/cost reporting, so this read must not be
    // capability-gated. Serde maps a legacy Host's missing `value_cost` field to
    // `None`, preserving the rest of the report without a fabricated fallback.
    let report = match get_library_sync_host_json_authenticated(state, &normalized_base_url, &path)
    {
        Ok(report) => Some(report),
        Err(error) if is_library_sync_read_not_found(&error) => None,
        Err(error) => return Err(error),
    };

    save_library_sync_success(
        state,
        &target,
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

fn library_sync_filament_consumption_path(limit: i64, printer_id: Option<&str>) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("limit", &limit.to_string());
    if let Some(printer_id) = printer_id {
        query.append_pair("printer_id", printer_id);
    }
    format!(
        "/api/v1/library/statistics/filament-consumption?{}",
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
    let (normalized_base_url, _, target) = prepare_library_sync_host_checked(state, &host_input)?;

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
    let rows = match get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        &primary_path,
    ) {
        Ok(rows) => Ok(rows),
        Err(error) if is_library_sync_read_not_found(&error) => {
            get_library_sync_host_json_authenticated(state, &normalized_base_url, &fallback_path)
        }
        Err(error) => Err(error),
    }?;
    ensure_library_sync_target_current(state, &target)?;
    Ok(rows)
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
    let (normalized_base_url, _, target) = prepare_library_sync_host_checked(state, &host_input)?;

    let limit = input.limit.unwrap_or(500).clamp(1, 2_500);
    let primary_rows: Result<Vec<WishlistItemRow>, String> =
        get_library_sync_host_json_authenticated(
            state,
            &normalized_base_url,
            &format!("/api/v1/library/wishlist?limit={limit}"),
        );
    match primary_rows {
        Ok(rows) => {
            with_current_library_sync_target(state, &target, |engine| {
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
            with_current_library_sync_target(state, &target, |engine| {
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
    let (normalized_base_url, _, target) = prepare_library_sync_host_checked(state, &input)?;
    let payload: LibrarySyncFullBackupResponse = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/backup/full",
    )?;
    save_library_sync_success(state, &target, "Host full backup exported.", None)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::{
        fetch_library_sync_catalog_masters_blocking,
        fetch_library_sync_statistics_period_report_blocking,
        fetch_library_sync_wishlist_items_blocking, is_library_sync_read_not_found,
        library_sync_catalog_masters_path, library_sync_filament_consumption_path,
        library_sync_statistics_period_path, StatisticsPeriod, StatisticsPeriodReport,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_models::{
        LibrarySyncCatalogListInput, LibrarySyncStatisticsPeriodInput, LibrarySyncWishlistListInput,
    };
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct FakeHostResponse {
        expected_request_prefix: &'static str,
        status: &'static str,
        body: String,
    }

    fn spawn_fake_host(responses: Vec<FakeHostResponse>) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Host");
        let address = listener.local_addr().expect("read fake Host address");
        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept fake Host request");
                let mut request = [0_u8; 16 * 1024];
                let read = stream.read(&mut request).expect("read fake Host request");
                let request = String::from_utf8_lossy(&request[..read]);
                assert!(
                    request.starts_with(response.expected_request_prefix),
                    "unexpected fake Host request: {request}"
                );
                let wire = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response.status,
                    response.body.len(),
                    response.body,
                );
                stream
                    .write_all(wire.as_bytes())
                    .expect("write fake Host response");
            }
        });
        (format!("http://{address}"), handle)
    }

    fn fake_host_state(base_url: &str) -> (AppState, std::path::PathBuf) {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-read-fallback-test-{}-{suffix}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open fake Host database");
        db.apply_schema().expect("apply fake Host schema");
        let mut settings = db.get_library_sync_settings().expect("load settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(base_url.to_string());
        settings.library_id = "library-test".to_string();
        db.save_library_sync_settings(&settings)
            .expect("save Client target");
        drop(db);
        let state = AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        state
            .library_sync_auth
            .replace_authenticated(base_url, "session", "csrf", "device")
            .expect("seed fake Host authentication");
        (state, db_path)
    }

    fn fake_health() -> String {
        json!({
            "ok": true,
            "api_version": "v1",
            "capabilities": [],
            "auth_mode": "pairing-session",
            "access_mode": "trusted-lan",
            "library_id": "library-test",
            "device_name": "Legacy Host",
            "sync_mode": "HOST",
        })
        .to_string()
    }

    fn not_found_envelope() -> String {
        json!({
            "ok": false,
            "code": "common.not_found",
            "message": "route not found",
            "safe_detail": null,
            "diagnostic_id": "fm-read-404",
        })
        .to_string()
    }

    #[test]
    fn read_not_found_classification_accepts_exact_http_status_error() {
        assert!(is_library_sync_read_not_found(
            "Desktop sync read request returned 404 Not Found."
        ));
        assert!(is_library_sync_read_not_found(&not_found_envelope()));
    }

    #[test]
    fn read_not_found_classification_rejects_transport_and_hostname_text() {
        assert!(!is_library_sync_read_not_found(
            "Desktop sync read request failed to connect to filament-404.local."
        ));
        assert!(!is_library_sync_read_not_found(
            "Desktop sync read request failed for http://192.168.1.20:404."
        ));
        assert!(!is_library_sync_read_not_found(
            r#"{"code":"COMMON.NOT_FOUND","safe_detail":null,"diagnostic_id":null}"#
        ));
        assert!(!is_library_sync_read_not_found(
            r#"{"code":"common.not_found","safe_detail":"unsafe\nline","diagnostic_id":null}"#
        ));
    }

    #[test]
    fn structured_not_found_keeps_all_three_legacy_read_fallbacks_working() {
        let health = fake_health();
        let not_found = not_found_envelope();
        let (base_url, server) = spawn_fake_host(vec![
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: health.clone(),
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/library/statistics/period-report?",
                status: "404 Not Found",
                body: not_found.clone(),
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: health.clone(),
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/library/catalog/masters?limit=1000 HTTP/1.1",
                status: "404 Not Found",
                body: not_found.clone(),
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/catalog/masters?limit=1000 HTTP/1.1",
                status: "200 OK",
                body: "[]".to_string(),
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: health,
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/library/wishlist?limit=500 HTTP/1.1",
                status: "404 Not Found",
                body: not_found,
            },
            FakeHostResponse {
                expected_request_prefix: "GET /api/v1/wishlist?limit=500 HTTP/1.1",
                status: "200 OK",
                body: "[]".to_string(),
            },
        ]);
        let (state, db_path) = fake_host_state(&base_url);
        let expected_library_id = Some("library-test".to_string());

        let period = fetch_library_sync_statistics_period_report_blocking(
            &state,
            LibrarySyncStatisticsPeriodInput {
                base_url: base_url.clone(),
                expected_library_id: expected_library_id.clone(),
                period: StatisticsPeriod {
                    start_at_utc: "2026-08-01T00:00:00Z".to_string(),
                    end_at_utc: "2026-09-01T00:00:00Z".to_string(),
                },
            },
        )
        .expect("legacy period fallback");
        assert!(period.is_none());

        let masters = fetch_library_sync_catalog_masters_blocking(
            &state,
            LibrarySyncCatalogListInput {
                base_url: base_url.clone(),
                expected_library_id: expected_library_id.clone(),
                limit: None,
                search: None,
            },
        )
        .expect("legacy catalog fallback");
        assert!(masters.is_empty());

        let wishlist = fetch_library_sync_wishlist_items_blocking(
            &state,
            LibrarySyncWishlistListInput {
                base_url,
                expected_library_id,
                limit: None,
            },
        )
        .expect("legacy wishlist fallback");
        assert!(wishlist.is_empty());

        server.join().expect("join fake Host");
        let _ = std::fs::remove_file(db_path);
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
    fn filament_consumption_printer_filter_cannot_escape_its_query_value() {
        assert_eq!(
            library_sync_filament_consumption_path(500, Some("printer & next=#%")),
            "/api/v1/library/statistics/filament-consumption?limit=500&printer_id=printer+%26+next%3D%23%25"
        );
    }

    #[test]
    fn legacy_host_period_report_without_value_cost_remains_available() {
        let report: StatisticsPeriodReport = serde_json::from_value(json!({
            "period": {
                "start_at_utc": "2026-08-01T00:00:00Z",
                "end_at_utc": "2026-09-01T00:00:00Z"
            },
            "total_used_g": 125,
            "owned_used_g": 100,
            "borrowed_in_used_g": 25,
            "total_jobs": 2,
            "successful_jobs": 1,
            "failed_jobs": 1,
            "printer_usage": [],
            "filament_consumption": []
        }))
        .expect("a legacy Host period report must remain parseable");

        assert!(report.value_cost.is_none());
        assert!(serde_json::to_value(report)
            .expect("the legacy report must remain forwardable")
            .get("value_cost")
            .is_some_and(serde_json::Value::is_null));
    }

    #[test]
    fn modern_host_period_report_preserves_value_cost_coverage_and_trace() {
        let value_cost = json!({
            "inventory_value": {
                "totals": [
                    {
                        "currency": "NOK",
                        "ownership_type": "OWNED",
                        "amount": 314.25
                    }
                ],
                "coverage": {
                    "total_rows": 2,
                    "valued_rows": 1,
                    "unvalued_rows": 1,
                    "covered_grams": 750,
                    "uncovered_grams": 250,
                    "missing_reasons": [
                        { "reason": "purchase_price_missing", "rows": 1, "grams": 250 }
                    ],
                    "trace_total_rows": 2,
                    "trace_returned_rows": 2,
                    "trace_truncated": false
                }
            },
            "material_cost": {
                "totals": [
                    {
                        "currency": "EUR",
                        "ownership_type": "BORROWED_IN",
                        "amount": 7.5
                    }
                ],
                "coverage": {
                    "total_rows": 1,
                    "valued_rows": 1,
                    "unvalued_rows": 0,
                    "covered_grams": 150,
                    "uncovered_grams": 0,
                    "missing_reasons": [],
                    "trace_total_rows": 1,
                    "trace_returned_rows": 1,
                    "trace_truncated": false
                }
            },
            "inventory_trace": [
                {
                    "spool_id": "spool-owned",
                    "material": "PLA",
                    "filament_name": "Basic",
                    "color_name": "Blue",
                    "vendor": "Example",
                    "status": "IN_STOCK",
                    "ownership_type": "OWNED",
                    "remaining_g": 750,
                    "initial_weight_g": 1000,
                    "purchase_price": 419.0,
                    "purchase_currency": "NOK",
                    "amount": 314.25,
                    "missing_reasons": []
                },
                {
                    "spool_id": "spool-missing-price",
                    "material": "PETG",
                    "filament_name": "Matte",
                    "color_name": "Black",
                    "vendor": "Example",
                    "status": "ASSIGNED",
                    "ownership_type": "OWNED",
                    "remaining_g": 250,
                    "initial_weight_g": 1000,
                    "purchase_price": null,
                    "purchase_currency": null,
                    "amount": null,
                    "missing_reasons": ["purchase_price_missing"]
                }
            ],
            "material_cost_trace": [
                {
                    "usage_id": "manual:job-1",
                    "source": "MANUAL",
                    "spool_id": "spool-borrowed",
                    "printer_id": "printer-1",
                    "job_name": "Bracket",
                    "status": "FAILED",
                    "used_at": "2026-08-15 12:30:00",
                    "material": "PETG",
                    "filament_name": "Strong",
                    "color_name": "Orange",
                    "vendor": "Example",
                    "ownership_type": "BORROWED_IN",
                    "used_g": 150,
                    "initial_weight_g": 1000,
                    "purchase_price": 50.0,
                    "purchase_currency": "EUR",
                    "amount": 7.5,
                    "missing_reasons": []
                }
            ]
        });
        let payload = json!({
            "period": {
                "start_at_utc": "2026-08-01T00:00:00Z",
                "end_at_utc": "2026-09-01T00:00:00Z"
            },
            "total_used_g": 150,
            "owned_used_g": 0,
            "borrowed_in_used_g": 150,
            "total_jobs": 1,
            "successful_jobs": 0,
            "failed_jobs": 1,
            "printer_usage": [],
            "filament_consumption": [],
            "value_cost": value_cost.clone()
        });

        let report: StatisticsPeriodReport = serde_json::from_value(payload)
            .expect("a modern Host value/cost report must be parseable");
        let forwarded = serde_json::to_value(report)
            .expect("the Client transport report must remain serializable");

        assert_eq!(forwarded["value_cost"], value_cost);
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
