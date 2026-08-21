use crate::backend::filament_database::InventoryLocationRow;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct CreateInventoryLocationInput {
    pub(crate) name: String,
    pub(crate) parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct RenameInventoryLocationInput {
    pub(crate) location_id: String,
    pub(crate) name: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct InventoryLocationIdInput {
    pub(crate) location_id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct MergeInventoryLocationsInput {
    pub(crate) source_id: String,
    pub(crate) target_id: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct InventoryLocationListQuery {
    pub(crate) include_archived: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncLocationTargetInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncCreateInventoryLocationInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) name: String,
    pub(crate) parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncRenameInventoryLocationInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) location_id: String,
    pub(crate) name: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncInventoryLocationIdInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) location_id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncMergeInventoryLocationsInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) source_id: String,
    pub(crate) target_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct InventoryLocationListResponse {
    pub(crate) rows: Vec<InventoryLocationRow>,
    pub(crate) mutations_supported: bool,
    pub(crate) captured_at: Option<String>,
}
