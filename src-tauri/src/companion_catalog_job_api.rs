use crate::backend::catalog_refresh_jobs::{CatalogRefreshJobInput, CatalogRefreshJobSnapshot};
use crate::catalog_refresh_jobs::{get_job, start_job};
use crate::companion_error::CompanionApiError;
use crate::companion_state::CompanionApiState;
use axum::extract::{Path, State};
use axum::Json;

fn job_error(error: String) -> CompanionApiError {
    let code = serde_json::from_str::<serde_json::Value>(&error)
        .ok()
        .and_then(|value| value.get("code")?.as_str().map(str::to_string));
    match code.as_deref() {
        Some("common.unavailable") => CompanionApiError::Conflict,
        Some("common.invalid_request") => {
            CompanionApiError::CodedBadRequest("common.invalid_request")
        }
        Some("common.forbidden") => CompanionApiError::Forbidden(error),
        _ => CompanionApiError::Internal(error),
    }
}

pub(super) async fn handle_start_catalog_refresh_job(
    State(state): State<CompanionApiState>,
    Json(input): Json<CatalogRefreshJobInput>,
) -> Result<Json<CatalogRefreshJobSnapshot>, CompanionApiError> {
    state
        .run_blocking("start catalog job", move |state| {
            start_job(state.service, input).map(Json).map_err(job_error)
        })
        .await
}

pub(super) async fn handle_active_catalog_refresh_job(
    State(state): State<CompanionApiState>,
) -> Result<Json<Option<CatalogRefreshJobSnapshot>>, CompanionApiError> {
    state
        .run_blocking("active catalog job", move |state| {
            get_job(&state.service, None).map(Json).map_err(job_error)
        })
        .await
}

pub(super) async fn handle_get_catalog_refresh_job(
    State(state): State<CompanionApiState>,
    Path(job_id): Path<String>,
) -> Result<Json<Option<CatalogRefreshJobSnapshot>>, CompanionApiError> {
    state
        .run_blocking("get catalog job", move |state| {
            get_job(&state.service, Some(&job_id))
                .map(Json)
                .map_err(job_error)
        })
        .await
}
