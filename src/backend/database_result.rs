use super::filament_database::{InventoryError, InventoryResult};

pub(crate) fn require_rows(affected: usize) -> InventoryResult<()> {
    if affected == 0 {
        Err(InventoryError::NotFound)
    } else {
        Ok(())
    }
}
