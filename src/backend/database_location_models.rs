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
    /// Number of database foreign-key edges that currently point at this
    /// location. A spool whose current and home locations are both this row
    /// contributes two references; child locations contribute one each.
    /// `None` means an older cached Host response did not report this value.
    #[serde(default)]
    pub reference_count: Option<i64>,
    /// Authoritative deletion capability from the database that owns the row.
    /// The default is deliberately false so an older cached Host response
    /// cannot accidentally enable permanent deletion in a newer client.
    #[serde(default)]
    pub can_delete: bool,
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

#[cfg(test)]
mod tests {
    use super::InventoryLocationRow;

    #[test]
    fn older_cached_location_rows_fail_closed_for_permanent_deletion() {
        let row: InventoryLocationRow = serde_json::from_value(serde_json::json!({
            "id": "legacy-location",
            "name": "Legacy shelf",
            "location_type": "GENERIC",
            "parent_id": null,
            "x": null,
            "y": null,
            "z": null,
            "archived_at": null,
            "created_at": "",
            "updated_at": ""
        }))
        .expect("deserialize older cached location row");

        assert_eq!(row.reference_count, None);
        assert!(!row.can_delete);
    }
}
