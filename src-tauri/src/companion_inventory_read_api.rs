use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, FilamentMasterCatalogRow, PrinterOverviewRow, SpoolLoanDetailsRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use crate::companion_error::CompanionApiError;
use crate::companion_http::maybe_apply_qa_delay;
use crate::companion_models::{
    CatalogListQuery, LoanListQuery, PaginationQuery, QrLookupQuery, SpoolDetailQuery,
};
use crate::companion_payload::{build_companion_spool_qr_payload, build_qr_svg, string_response};
use crate::companion_state::CompanionApiState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::Response;
use axum::Json;

pub(super) async fn handle_list_spools(
    State(state): State<CompanionApiState>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<SpoolWithMasterRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let offset = query.offset.unwrap_or(0).max(0);
    let rows = state
        .run_blocking("inventory spool list", move |state| {
            state
                .service
                .list_spools(limit, offset)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_list_catalog_masters(
    State(state): State<CompanionApiState>,
    Query(query): Query<CatalogListQuery>,
) -> Result<Json<Vec<FilamentMasterCatalogRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(1_000).clamp(1, 5_000);
    let search = query.search;
    let rows = state
        .run_blocking("catalog list", move |state| {
            state
                .service
                .list_master_catalog(limit, search.as_deref())
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_list_printer_overview(
    State(state): State<CompanionApiState>,
) -> Result<Json<Vec<PrinterOverviewRow>>, CompanionApiError> {
    let rows = state
        .run_blocking("printer overview", move |state| {
            state
                .service
                .list_printer_overview()
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_list_spool_loans(
    State(state): State<CompanionApiState>,
    Query(query): Query<LoanListQuery>,
) -> Result<Json<Vec<SpoolLoanDetailsRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let include_returned = query.include_returned.unwrap_or(true);
    let direction = query
        .direction
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "OUTBOUND".to_string());
    let rows = state
        .run_blocking("loan list", move |state| {
            state
                .service
                .list_spool_loans(limit, include_returned, Some(&direction))
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_list_active_spool_loans(
    State(state): State<CompanionApiState>,
) -> Result<Json<Vec<ActiveSpoolLoanRow>>, CompanionApiError> {
    let rows = state
        .run_blocking("active loan list", move |state| {
            state
                .service
                .list_active_spool_loans()
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_list_wishlist_items(
    State(state): State<CompanionApiState>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<WishlistItemRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let rows = state
        .run_blocking("wishlist list", move |state| {
            state
                .service
                .list_wishlist_items(limit)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_find_spool_by_qr(
    State(state): State<CompanionApiState>,
    Query(query): Query<QrLookupQuery>,
) -> Result<Json<SpoolWithMasterRow>, CompanionApiError> {
    let qr_code = query
        .qr_code
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CompanionApiError::BadRequest("qr_code is required".to_string()))?;

    let spool = state
        .run_blocking("spool QR lookup", move |state| {
            state
                .service
                .find_spool_by_qr(&qr_code)
                .map_err(CompanionApiError::from)?
                .ok_or_else(|| {
                    CompanionApiError::NotFound("No spool found for that QR code".to_string())
                })
        })
        .await?;
    Ok(Json(spool))
}

pub(super) async fn handle_spool_qr_image_svg(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("spool QR image", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }

            let spool = state
                .service
                .get_spool(spool_id)
                .map_err(CompanionApiError::from)?
                .ok_or_else(|| CompanionApiError::NotFound("Spool not found".to_string()))?;
            let reference = spool.spool.id.clone();
            let payload = build_companion_spool_qr_payload(&state.runtime, &reference);
            let svg = build_qr_svg(&payload)?;
            Ok(string_response("image/svg+xml; charset=utf-8", svg))
        })
        .await
}

pub(super) async fn handle_get_spool_detail(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Path(spool_id): Path<String>,
    Query(query): Query<SpoolDetailQuery>,
) -> Result<Json<CompanionSpoolDetail>, CompanionApiError> {
    if spool_id.trim().is_empty() {
        return Err(CompanionApiError::BadRequest(
            "spool_id is required".to_string(),
        ));
    }

    maybe_apply_qa_delay(&state.runtime, &headers).await?;

    let detail = state
        .run_blocking("spool detail", move |state| {
            state
                .service
                .get_spool_detail(spool_id.trim(), query.history_limit, query.usage_limit)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(detail))
}
