use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct InventoryLocationRow {
    pub id: String,
    pub name: String,
    pub location_type: String,
    pub parent_id: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl InventoryLocationRow {
    pub fn is_system_owned(&self) -> bool {
        self.location_type != "GENERIC"
    }

    pub fn is_archived(&self) -> bool {
        self.archived_at.is_some()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InventoryLocationMergeResult {
    pub source_id: String,
    pub target_id: String,
    pub affected_spools: i64,
    pub moved_current_references: i64,
    pub moved_home_references: i64,
    pub moved_parent_references: i64,
}
