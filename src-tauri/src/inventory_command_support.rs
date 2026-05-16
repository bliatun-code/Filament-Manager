use crate::app_services::CompanionService;
use crate::backend::database_result::InventoryError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub(crate) struct ExportPayload {
    pub(crate) content: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ScanPayload {
    pub(crate) qr_code: Option<String>,
    pub(crate) detected_color_hex: Option<String>,
    pub(crate) source: Option<String>,
}

pub(crate) fn companion_service(state: &AppState) -> CompanionService {
    CompanionService::new(state.db_path.clone())
}

pub(crate) fn inventory_error_to_string(error: InventoryError) -> String {
    format!("{error:?}")
}
