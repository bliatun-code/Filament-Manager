use serde::{Deserialize, Serialize};

use super::inventory_domain::SpoolStatus;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InventoryBulkSpoolPrecondition {
    pub spool_id: String,
    pub expected_status: SpoolStatus,
    pub expected_location_id: Option<String>,
    pub expected_home_location_id: Option<String>,
    pub expected_active_loan: bool,
    pub expected_assigned_to_printer: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "action")]
pub enum InventoryBulkMutationInput {
    #[serde(rename = "MOVE")]
    Move {
        expected_affected_count: i64,
        spools: Vec<InventoryBulkSpoolPrecondition>,
        target_location_id: String,
    },
    #[serde(rename = "STATUS")]
    Status {
        expected_affected_count: i64,
        spools: Vec<InventoryBulkSpoolPrecondition>,
        target_status: SpoolStatus,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InventoryBulkMutationResult {
    pub affected_count: i64,
    pub committed: bool,
    pub history_spool_count: i64,
}
