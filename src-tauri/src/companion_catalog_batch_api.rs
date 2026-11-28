use crate::backend::database_result::InventoryError;
use crate::backend::inventory_engine::{CatalogSpoolBatchInput, CatalogSpoolBatchReceipt};
use crate::companion_error::CompanionApiError;
use crate::companion_state::CompanionApiState;
use axum::extract::State;
use axum::Json;

pub(super) async fn handle_create_catalog_spool_batch(
    State(state): State<CompanionApiState>,
    Json(input): Json<CatalogSpoolBatchInput>,
) -> Result<Json<CatalogSpoolBatchReceipt>, CompanionApiError> {
    state
        .run_blocking("create catalog spool batch", move |state| {
            state
                .service
                .create_catalog_spool_batch(input)
                .map(Json)
                .map_err(registration_error)
        })
        .await
}

pub(super) async fn handle_register_existing_spool_rfid(
    State(state): State<CompanionApiState>,
    Json(input): Json<crate::backend::inventory_engine::ExistingSpoolRfidInput>,
) -> Result<Json<CatalogSpoolBatchReceipt>, CompanionApiError> {
    state
        .run_blocking("register existing spool RFID", move |state| {
            state
                .service
                .register_existing_spool_rfid(input)
                .map(Json)
                .map_err(registration_error)
        })
        .await
}

fn registration_error(error: InventoryError) -> CompanionApiError {
    match error {
        InventoryError::InvalidOperation {
            code: "inventory.batch.conflict",
            ..
        } => CompanionApiError::CodedConflict("inventory.batch.conflict"),
        InventoryError::InvalidOperation {
            code: "common.forbidden",
            message,
        } => CompanionApiError::Forbidden(message),
        error => CompanionApiError::from(error),
    }
}
