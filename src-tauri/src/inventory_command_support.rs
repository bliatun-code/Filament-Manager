use crate::app_services::CompanionService;
use crate::backend::database_result::InventoryError;
use crate::state::AppState;
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct ExportPayload {
    pub(crate) content: String,
}

pub(crate) fn companion_service(state: &AppState) -> CompanionService {
    CompanionService::new(state.db_path.clone())
}

pub(crate) fn inventory_error_to_string(error: InventoryError) -> String {
    crate::app_error::inventory_error_to_command_string(error)
}
