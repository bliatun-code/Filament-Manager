use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::inventory_engine::{
    CreateWishlistItemInput, ReceiveWishlistItemInput, UpdateWishlistStatusInput,
};
use crate::companion_error::CompanionApiError;
use crate::companion_models::{
    CreateWishlistItemRequest, ReceiveWishlistItemRequest, UpdateWishlistItemStatusRequest,
    WriteResponse,
};
use crate::companion_payload::normalize_optional_text;
use crate::companion_session::{random_hex_token, unix_epoch_millis};
use crate::companion_state::CompanionApiState;
use axum::extract::{Path, State};
use axum::Json;

pub(super) async fn handle_create_wishlist_item(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateWishlistItemRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("wishlist item create", move |state| {
            let material = payload.material.trim();
            if material.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "material is required".to_string(),
                ));
            }

            let filament_name = payload.filament_name.trim();
            if filament_name.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "filament_name is required".to_string(),
                ));
            }

            let color_name = payload.color_name.trim();
            if color_name.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "color_name is required".to_string(),
                ));
            }

            if let Some(quantity) = payload.quantity
                && quantity <= 0
            {
                return Err(CompanionApiError::BadRequest(
                    "quantity must be greater than zero".to_string(),
                ));
            }

            state
                .service
                .create_wishlist_item(CreateWishlistItemInput {
                    id: format!(
                        "wish_companion_{}_{}",
                        unix_epoch_millis(),
                        random_hex_token(4)
                    ),
                    master_id: normalize_optional_text(payload.master_id.as_deref()),
                    material: material.to_string(),
                    filament_name: filament_name.to_string(),
                    color_name: color_name.to_string(),
                    vendor: Some(
                        payload
                            .vendor
                            .as_deref()
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .unwrap_or("Generic")
                            .to_string(),
                    ),
                    quantity: payload.quantity,
                    note: normalize_optional_text(payload.note.as_deref()),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Wishlist item added".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_update_wishlist_item_status(
    State(state): State<CompanionApiState>,
    Path(item_id): Path<String>,
    Json(payload): Json<UpdateWishlistItemStatusRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("wishlist status update", move |state| {
            let item_id = item_id.trim();
            if item_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "item_id is required".to_string(),
                ));
            }

            let status = payload.status.trim().to_uppercase();
            if status != "WISHLIST" && status != "ON_ORDER" && status != "RECEIVED" {
                return Err(CompanionApiError::BadRequest(
                    "status must be WISHLIST, ON_ORDER, or RECEIVED".to_string(),
                ));
            }

            state
                .service
                .update_wishlist_item_status(UpdateWishlistStatusInput {
                    item_id: item_id.to_string(),
                    status,
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Wishlist status updated".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_receive_wishlist_item(
    State(state): State<CompanionApiState>,
    Path(item_id): Path<String>,
    Json(payload): Json<ReceiveWishlistItemRequest>,
) -> Result<Json<WishlistReceiptResult>, CompanionApiError> {
    state
        .run_blocking("wishlist receipt", move |state| {
            let item_id = item_id.trim();
            if item_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "item_id is required".to_string(),
                ));
            }

            let result = state
                .service
                .receive_wishlist_item(ReceiveWishlistItemInput {
                    item_id: item_id.to_string(),
                    quantity: payload.quantity,
                })
                .map_err(CompanionApiError::from)?;
            Ok(Json(result))
        })
        .await
}

pub(super) async fn handle_delete_wishlist_item(
    State(state): State<CompanionApiState>,
    Path(item_id): Path<String>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("wishlist item delete", move |state| {
            let item_id = item_id.trim();
            if item_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "item_id is required".to_string(),
                ));
            }

            state
                .service
                .delete_wishlist_item(item_id)
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Wishlist item deleted".to_string(),
            }))
        })
        .await
}
