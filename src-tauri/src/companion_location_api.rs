use crate::backend::filament_database::{InventoryLocationMergeResult, InventoryLocationRow};
use crate::companion_error::CompanionApiError;
use crate::companion_http::require_allowed_host;
use crate::companion_state::CompanionApiState;
use crate::inventory_location_models::{
    CreateInventoryLocationInput, InventoryLocationIdInput, InventoryLocationListQuery,
    MergeInventoryLocationsInput, RenameInventoryLocationInput,
};
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;

pub(super) async fn handle_list_library_locations(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<InventoryLocationListQuery>,
) -> Result<Json<Vec<InventoryLocationRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    list_locations(state, query.include_archived.unwrap_or(false)).await
}

pub(super) async fn handle_list_locations(
    State(state): State<CompanionApiState>,
    Query(query): Query<InventoryLocationListQuery>,
) -> Result<Json<Vec<InventoryLocationRow>>, CompanionApiError> {
    list_locations(state, query.include_archived.unwrap_or(false)).await
}

async fn list_locations(
    state: CompanionApiState,
    include_archived: bool,
) -> Result<Json<Vec<InventoryLocationRow>>, CompanionApiError> {
    let rows = state
        .run_blocking("inventory location list", move |state| {
            state
                .open_db()?
                .list_inventory_locations(include_archived)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(rows))
}

pub(super) async fn handle_create_location(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateInventoryLocationInput>,
) -> Result<Json<InventoryLocationRow>, CompanionApiError> {
    let row = state
        .run_blocking("inventory location create", move |state| {
            state
                .open_db()?
                .create_inventory_location(&payload.name, payload.parent_id.as_deref())
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(row))
}

pub(super) async fn handle_rename_location(
    State(state): State<CompanionApiState>,
    Path(location_id): Path<String>,
    Json(payload): Json<RenameInventoryLocationInput>,
) -> Result<Json<InventoryLocationRow>, CompanionApiError> {
    if !payload.location_id.trim().is_empty() && payload.location_id.trim() != location_id.trim() {
        return Err(CompanionApiError::BadRequest(
            "Location id in the path and body must match.".to_string(),
        ));
    }
    let row = state
        .run_blocking("inventory location rename", move |state| {
            state
                .open_db()?
                .rename_inventory_location(location_id.trim(), &payload.name)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(row))
}

pub(super) async fn handle_archive_location(
    State(state): State<CompanionApiState>,
    Path(location_id): Path<String>,
    Json(payload): Json<InventoryLocationIdInput>,
) -> Result<Json<InventoryLocationRow>, CompanionApiError> {
    verify_location_id(&location_id, &payload.location_id)?;
    let row = state
        .run_blocking("inventory location archive", move |state| {
            state
                .open_db()?
                .archive_inventory_location(location_id.trim())
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(row))
}

pub(super) async fn handle_restore_location(
    State(state): State<CompanionApiState>,
    Path(location_id): Path<String>,
    Json(payload): Json<InventoryLocationIdInput>,
) -> Result<Json<InventoryLocationRow>, CompanionApiError> {
    verify_location_id(&location_id, &payload.location_id)?;
    let row = state
        .run_blocking("inventory location restore", move |state| {
            state
                .open_db()?
                .restore_inventory_location(location_id.trim())
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(row))
}

pub(super) async fn handle_merge_locations(
    State(state): State<CompanionApiState>,
    Json(payload): Json<MergeInventoryLocationsInput>,
) -> Result<Json<InventoryLocationMergeResult>, CompanionApiError> {
    let result = state
        .run_blocking("inventory location merge", move |state| {
            state
                .open_db()?
                .merge_inventory_locations(&payload.source_id, &payload.target_id)
                .map_err(CompanionApiError::from)
        })
        .await?;
    Ok(Json(result))
}

fn verify_location_id(path_id: &str, body_id: &str) -> Result<(), CompanionApiError> {
    if path_id.trim().is_empty() || path_id.trim() != body_id.trim() {
        return Err(CompanionApiError::BadRequest(
            "Location id in the path and body must match.".to_string(),
        ));
    }
    Ok(())
}
