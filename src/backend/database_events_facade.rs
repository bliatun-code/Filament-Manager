use super::database_core::FilamentDatabase;
use super::database_events::{
    ensure_scale as ensure_scale_row, insert_scan_event as insert_scan_event_row,
    insert_spool_history_event as insert_spool_history_event_row,
    insert_weight_reading as insert_weight_reading_row,
    list_spool_history_events as list_spool_history_event_rows,
    list_spool_usage_points as list_spool_usage_point_rows,
};
use super::database_result::InventoryResult;
use super::database_spool_models::{SpoolHistoryEventRow, SpoolUsagePointRow};

impl FilamentDatabase {
    pub fn ensure_scale(&self, scale_id: &str, name: &str, protocol: &str) -> InventoryResult<()> {
        ensure_scale_row(self.connection(), scale_id, name, protocol)
    }

    pub fn insert_weight_reading(
        &self,
        scale_id: &str,
        spool_id: &str,
        grams: i64,
        source: &str,
    ) -> InventoryResult<()> {
        insert_weight_reading_row(self.connection(), scale_id, spool_id, grams, source)
    }

    pub fn insert_scan_event(
        &self,
        spool_id: Option<&str>,
        qr_code: Option<&str>,
        source: &str,
        detected_color_hex: Option<&str>,
    ) -> InventoryResult<()> {
        insert_scan_event_row(
            self.connection(),
            spool_id,
            qr_code,
            source,
            detected_color_hex,
        )
    }

    pub fn insert_spool_history_event(
        &self,
        spool_id: &str,
        event_type: &str,
        payload_json: &str,
    ) -> InventoryResult<()> {
        insert_spool_history_event_row(self.connection(), spool_id, event_type, payload_json)
    }

    pub fn list_spool_history_events(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
        list_spool_history_event_rows(self.connection(), spool_id, limit)
    }

    pub fn list_spool_usage_points(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolUsagePointRow>> {
        list_spool_usage_point_rows(self.connection(), spool_id, limit)
    }
}
