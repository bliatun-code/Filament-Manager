use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_time::{
    sqlite_datetime_shift as sqlite_datetime_shift_value, sqlite_now as sqlite_now_value,
};

impl FilamentDatabase {
    pub fn sqlite_now(&self) -> InventoryResult<String> {
        sqlite_now_value(self.connection())
    }

    pub fn sqlite_datetime_shift(&self, base: &str, modifier: &str) -> InventoryResult<String> {
        sqlite_datetime_shift_value(self.connection(), base, modifier)
    }
}
