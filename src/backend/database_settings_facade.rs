use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_settings::{
    delete_setting as delete_setting_row, get_setting as get_setting_row,
    set_setting as set_setting_row,
};

impl FilamentDatabase {
    pub fn set_setting(&self, key: &str, value: &str) -> InventoryResult<()> {
        set_setting_row(self.connection(), key, value)
    }

    pub fn delete_setting(&self, key: &str) -> InventoryResult<()> {
        delete_setting_row(self.connection(), key)
    }

    pub fn get_setting(&self, key: &str) -> InventoryResult<Option<String>> {
        get_setting_row(self.connection(), key)
    }
}
