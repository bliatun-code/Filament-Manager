use super::database_core::FilamentDatabase;
use super::database_location_models::{InventoryLocationMergeResult, InventoryLocationRow};
use super::database_locations::{
    archive_location, create_location, delete_location, list_locations, merge_locations,
    rename_location, restore_location,
};
use super::database_result::InventoryResult;

impl FilamentDatabase {
    pub fn list_inventory_locations(
        &self,
        include_archived: bool,
    ) -> InventoryResult<Vec<InventoryLocationRow>> {
        list_locations(self.connection(), include_archived)
    }

    pub fn create_inventory_location(
        &self,
        name: &str,
        parent_id: Option<&str>,
    ) -> InventoryResult<InventoryLocationRow> {
        self.with_inventory_transaction(|conn| create_location(conn, name, parent_id))
    }

    pub fn rename_inventory_location(
        &self,
        location_id: &str,
        name: &str,
    ) -> InventoryResult<InventoryLocationRow> {
        self.with_inventory_transaction(|conn| rename_location(conn, location_id, name))
    }

    pub fn archive_inventory_location(
        &self,
        location_id: &str,
    ) -> InventoryResult<InventoryLocationRow> {
        self.with_inventory_transaction(|conn| archive_location(conn, location_id))
    }

    pub fn restore_inventory_location(
        &self,
        location_id: &str,
    ) -> InventoryResult<InventoryLocationRow> {
        self.with_inventory_transaction(|conn| restore_location(conn, location_id))
    }

    pub fn delete_inventory_location(
        &self,
        location_id: &str,
    ) -> InventoryResult<InventoryLocationRow> {
        self.with_inventory_transaction(|conn| delete_location(conn, location_id))
    }

    pub fn merge_inventory_locations(
        &self,
        source_id: &str,
        target_id: &str,
    ) -> InventoryResult<InventoryLocationMergeResult> {
        self.with_inventory_transaction(|conn| merge_locations(conn, source_id, target_id))
    }
}
