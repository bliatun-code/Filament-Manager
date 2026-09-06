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
                .map_err(|error| match error {
                    InventoryError::InvalidOperation {
                        code: "inventory.batch.conflict",
                        ..
                    } => CompanionApiError::CodedConflict("inventory.batch.conflict"),
                    InventoryError::InvalidOperation {
                        code: "common.forbidden",
                        message,
                    } => CompanionApiError::Forbidden(message),
                    error => CompanionApiError::from(error),
                })
        })
        .await
}
