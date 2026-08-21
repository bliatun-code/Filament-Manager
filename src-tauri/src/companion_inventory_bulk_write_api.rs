use crate::backend::inventory_engine::{InventoryBulkMutationInput, InventoryBulkMutationResult};
use crate::companion_error::CompanionApiError;
use crate::companion_state::CompanionApiState;
use axum::extract::State;
use axum::Json;

pub(super) async fn handle_execute_inventory_bulk_mutation(
    State(state): State<CompanionApiState>,
    Json(input): Json<InventoryBulkMutationInput>,
) -> Result<Json<InventoryBulkMutationResult>, CompanionApiError> {
    state
        .run_blocking("inventory bulk mutation", move |state| {
            state
                .service
                .execute_inventory_bulk_mutation(input)
                .map(Json)
                .map_err(CompanionApiError::from)
        })
        .await
}
