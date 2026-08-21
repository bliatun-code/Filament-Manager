use super::database_core::FilamentDatabase;
use super::database_inventory_bulk::execute_inventory_bulk_mutation;
use super::database_inventory_bulk_models::{
    InventoryBulkMutationInput, InventoryBulkMutationResult,
};
use super::database_result::InventoryResult;

impl FilamentDatabase {
    /// Executes a reviewed inventory bulk mutation as exactly one immediate
    /// transaction. The low-level operation validates every review snapshot
    /// before its first write.
    pub fn execute_inventory_bulk_mutation(
        &self,
        input: InventoryBulkMutationInput,
    ) -> InventoryResult<InventoryBulkMutationResult> {
        self.with_inventory_transaction(|connection| {
            execute_inventory_bulk_mutation(connection, input)
        })
    }
}
