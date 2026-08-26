use crate::backend::filament_database::{
    FilamentDatabase, FilamentMasterCatalogRow, FilamentStandardsSnapshot, LibrarySyncSettingsRow,
    PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::statistics::{FilamentConsumptionRow, StatisticsEngine, StatisticsPeriod};
use crate::companion_error::CompanionApiError;
use crate::companion_http::require_allowed_host;
use crate::companion_models::{
    CatalogListQuery, CompanionHealthResponse, CompanionLibrarySnapshotResponse,
    CompanionPrinterSettingsResponse, FilamentConsumptionQuery, LoanListQuery, PaginationQuery,
    FILAMENT_PRICE_STANDARDS_CAPABILITY, INVENTORY_BULK_MUTATION_CAPABILITY,
    INVENTORY_LOCATIONS_CAPABILITY, LOAN_METADATA_CAPABILITY, PURCHASE_RECEIPT_METADATA_CAPABILITY,
    SPOOL_COMMON_DETAILS_V2_CAPABILITY, STATISTICS_VALUE_COST_REPORT_CAPABILITY,
};
use crate::companion_state::CompanionApiState;
use crate::library_sync_models::{
    LibrarySyncDomainRevisionsResponse, LibrarySyncFullBackupResponse,
};
use crate::printer_settings_commands::sanitized_bambu_live_integrations;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::Json;

pub(super) async fn handle_health(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionHealthResponse>, CompanionApiError> {
    state
        .run_blocking("health check", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            let sync_settings = read_library_sync_settings(&state)?;
            Ok(Json(CompanionHealthResponse {
                ok: true,
                api_version: "v1",
                capabilities: &[
                    LOAN_METADATA_CAPABILITY,
                    INVENTORY_BULK_MUTATION_CAPABILITY,
                    INVENTORY_LOCATIONS_CAPABILITY,
                    SPOOL_COMMON_DETAILS_V2_CAPABILITY,
                    PURCHASE_RECEIPT_METADATA_CAPABILITY,
                    STATISTICS_VALUE_COST_REPORT_CAPABILITY,
                    FILAMENT_PRICE_STANDARDS_CAPABILITY,
                ],
                auth_mode: state.runtime.auth_mode().to_string(),
                access_mode: "trusted-lan",
                library_id: sync_settings.library_id,
                device_name: sync_settings.device_name,
                sync_mode: sync_settings.mode,
            }))
        })
        .await
}

pub(super) async fn handle_library_filament_standards(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<FilamentStandardsSnapshot>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let snapshot = state
        .run_blocking("library filament standards", move |state| {
            state
                .service
                .get_filament_standards()
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(snapshot))
}

pub(super) async fn handle_library_snapshot(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionLibrarySnapshotResponse>, CompanionApiError> {
    state
        .run_blocking("library snapshot", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            let snapshot = state
                .service
                .library_snapshot()
                .map_err(CompanionApiError::from)?;

            Ok(Json(CompanionLibrarySnapshotResponse {
                ok: true,
                captured_at: snapshot.captured_at,
                library_id: snapshot.sync_settings.library_id,
                device_name: snapshot.sync_settings.device_name,
                sync_mode: snapshot.sync_settings.mode,
                inventory: snapshot.inventory,
                active_loans: snapshot.active_loans,
                printers: snapshot.printers,
            }))
        })
        .await
}

pub(super) async fn handle_library_domain_revisions(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<LibrarySyncDomainRevisionsResponse>, CompanionApiError> {
    state
        .run_blocking("library domain revisions", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            let db = FilamentDatabase::open(&state.db_path).map_err(CompanionApiError::from)?;
            // Initialize the stable library ID before entering the read-only
            // snapshot; the getter may persist it on a brand-new database.
            db.get_library_sync_library_id()
                .map_err(CompanionApiError::from)?;
            let (library_id, revisions) = db
                .with_read_transaction(|snapshot| {
                    Ok((
                        snapshot.get_library_sync_library_id()?,
                        snapshot.library_domain_revisions()?,
                    ))
                })
                .map_err(CompanionApiError::from)?;
            Ok(Json(LibrarySyncDomainRevisionsResponse {
                library_id,
                revisions,
            }))
        })
        .await
}

pub(super) async fn handle_library_spools(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<SpoolWithMasterRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let offset = query.offset.unwrap_or(0).max(0);
    let rows = state
        .run_blocking("library spool list", move |state| {
            state
                .service
                .list_spools(limit, offset)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_export_full_backup(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<LibrarySyncFullBackupResponse>, CompanionApiError> {
    state
        .run_blocking("full backup export", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            let db = FilamentDatabase::open(&state.db_path)
                .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
            let content = db
                .export_full_backup_json()
                .map_err(|error| CompanionApiError::Internal(format!("{error:?}")))?;
            Ok(Json(LibrarySyncFullBackupResponse { content }))
        })
        .await
}

pub(super) async fn handle_library_printers(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PrinterOverviewRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let rows = state
        .run_blocking("library printer list", move |state| {
            state
                .service
                .list_printer_overview()
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_library_printer_settings(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionPrinterSettingsResponse>, CompanionApiError> {
    state
        .run_blocking("library printer settings", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            let db = FilamentDatabase::open(&state.db_path).map_err(CompanionApiError::from)?;
            let (bambu_live_integrations, printers) = db
                .with_read_transaction(|snapshot| {
                    Ok((
                        snapshot.list_bambu_live_integrations()?,
                        snapshot.list_printers()?,
                    ))
                })
                .map_err(CompanionApiError::from)?;
            let bambu_live_integrations = sanitized_bambu_live_integrations(
                bambu_live_integrations,
                &state.credentials,
                true,
            )
            .map_err(CompanionApiError::Internal)?;

            Ok(Json(CompanionPrinterSettingsResponse {
                active_printer_id: None,
                printers,
                printer_models: Vec::new(),
                bambu_live_integrations,
            }))
        })
        .await
}

pub(super) async fn handle_library_loans(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<LoanListQuery>,
) -> Result<Json<Vec<SpoolLoanDetailsRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let include_returned = query.include_returned.unwrap_or(true);
    let direction = query
        .direction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("ALL");
    let direction = direction.to_string();
    let rows = state
        .run_blocking("library loan list", move |state| {
            state
                .service
                .list_spool_loans(limit, include_returned, Some(&direction))
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_library_filament_consumption(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<FilamentConsumptionQuery>,
) -> Result<Json<Vec<FilamentConsumptionRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(500).clamp(1, 2_000);
    let printer_id = query
        .printer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let rows = state
        .run_blocking("library filament consumption", move |state| {
            let stats = StatisticsEngine::open(&state.db_path)
                .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
            stats
                .filament_consumption(limit, printer_id.as_deref())
                .map_err(|error| CompanionApiError::Internal(error.to_string()))
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_library_statistics_period_report(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(period): Query<StatisticsPeriod>,
) -> Result<Json<crate::backend::statistics::StatisticsPeriodReport>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let report = state
        .run_blocking("library statistics period report", move |state| {
            let stats = StatisticsEngine::open(&state.db_path)
                .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
            stats.period_report(&period).map_err(|error| match error {
                crate::backend::statistics::StatisticsPeriodError::InvalidPeriod(message) => {
                    CompanionApiError::BadRequest(message)
                }
                crate::backend::statistics::StatisticsPeriodError::Database(error) => {
                    CompanionApiError::Internal(error.to_string())
                }
            })
        })
        .await?;
    Ok(Json(report))
}

pub(super) async fn handle_library_catalog_masters(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<CatalogListQuery>,
) -> Result<Json<Vec<FilamentMasterCatalogRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(1_000).clamp(1, 5_000);
    let search = query.search;
    let rows = state
        .run_blocking("library catalog list", move |state| {
            state
                .service
                .list_master_catalog(limit, search.as_deref())
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_library_wishlist_items(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<WishlistItemRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(500).clamp(1, 2_000);
    let rows = state
        .run_blocking("library wishlist list", move |state| {
            state
                .service
                .list_wishlist_items(limit)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

fn read_library_sync_settings(
    state: &CompanionApiState,
) -> Result<LibrarySyncSettingsRow, CompanionApiError> {
    let db = FilamentDatabase::open(&state.db_path).map_err(CompanionApiError::from)?;
    db.get_library_sync_settings()
        .map_err(CompanionApiError::from)
}
