use super::database_reset::{
    reset_app_state_data as reset_app_state_data_rows,
    reset_catalog_data as reset_catalog_data_rows,
};
use super::database_reset_models::CatalogResetStats;
use super::database_result::InventoryResult;
use super::filament_database::FilamentDatabase;

impl FilamentDatabase {
    pub fn reset_app_state_data(&self) -> InventoryResult<()> {
        reset_app_state_data_rows(self.connection())
    }

    pub fn reset_catalog_data(&self) -> InventoryResult<CatalogResetStats> {
        reset_catalog_data_rows(self.connection())
    }
}
