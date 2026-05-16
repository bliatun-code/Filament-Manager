use super::database_alerts::{
    alert_exists_for_spool as alert_exists_for_spool_row, insert_alert as insert_alert_row,
};
use super::database_result::InventoryResult;
use super::database_sync_queue::enqueue_sync_action as enqueue_sync_action_row;
use super::database_time::{
    sqlite_datetime_shift as sqlite_datetime_shift_value, sqlite_now as sqlite_now_value,
};
use super::filament_database::FilamentDatabase;

impl FilamentDatabase {
    pub fn sqlite_now(&self) -> InventoryResult<String> {
        sqlite_now_value(self.connection())
    }

    pub fn sqlite_datetime_shift(&self, base: &str, modifier: &str) -> InventoryResult<String> {
        sqlite_datetime_shift_value(self.connection(), base, modifier)
    }

    pub fn insert_alert(&self, alert_type: &str, payload_json: &str) -> InventoryResult<()> {
        insert_alert_row(self.connection(), alert_type, payload_json)
    }

    pub fn alert_exists_for_spool(
        &self,
        alert_type: &str,
        spool_id: &str,
    ) -> InventoryResult<bool> {
        alert_exists_for_spool_row(self.connection(), alert_type, spool_id)
    }

    pub fn enqueue_sync_action(
        &self,
        action_type: &str,
        payload_json: &str,
    ) -> InventoryResult<String> {
        enqueue_sync_action_row(self.connection(), action_type, payload_json)
    }
}
