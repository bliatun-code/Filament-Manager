use super::database_core::FilamentDatabase;
use super::database_filament_standards::{
    apply_filament_price_batch, get_filament_standards, save_filament_standards,
};
use super::database_result::InventoryResult;
use super::filament_standards::{
    FilamentPriceBatchInput, FilamentPriceBatchReceipt, FilamentStandardsSettings,
    FilamentStandardsSnapshot,
};

impl FilamentDatabase {
    pub fn get_filament_standards(&self) -> InventoryResult<FilamentStandardsSnapshot> {
        get_filament_standards(self.connection())
    }

    pub fn save_filament_standards(
        &self,
        settings: FilamentStandardsSettings,
    ) -> InventoryResult<FilamentStandardsSnapshot> {
        self.with_inventory_transaction(|connection| save_filament_standards(connection, settings))
    }

    /// Applies one reviewed price selection atomically. All stale-review
    /// checks run before the first spool write.
    pub fn apply_filament_price_batch(
        &self,
        input: FilamentPriceBatchInput,
    ) -> InventoryResult<FilamentPriceBatchReceipt> {
        self.with_inventory_transaction(|connection| apply_filament_price_batch(connection, input))
    }
}
