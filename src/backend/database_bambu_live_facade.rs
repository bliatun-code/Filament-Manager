use serde_json::Value;

use super::database_bambu_live_settings::{
    delete_bambu_live_integration as delete_bambu_live_integration_row,
    list_bambu_live_integrations as list_bambu_live_integration_rows,
    save_bambu_live_integration as save_bambu_live_integration_row,
};
use super::database_printer_live_events::insert_printer_live_event as insert_printer_live_event_row;
use super::database_printer_models::{BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow};
use super::database_result::InventoryResult;
use super::filament_database::FilamentDatabase;

impl FilamentDatabase {
    pub fn save_bambu_live_integration(
        &self,
        printer_id: &str,
        config: &BambuLiveIntegrationRow,
    ) -> InventoryResult<()> {
        save_bambu_live_integration_row(self.connection(), printer_id, config)
    }

    pub fn delete_bambu_live_integration(&self, printer_id: &str) -> InventoryResult<()> {
        delete_bambu_live_integration_row(self.connection(), printer_id)
    }

    pub fn list_bambu_live_integrations(
        &self,
    ) -> InventoryResult<Vec<BambuLiveIntegrationEntryRow>> {
        list_bambu_live_integration_rows(self.connection())
    }

    pub fn insert_printer_live_event(
        &self,
        printer_id: &str,
        event_type: &str,
        payload_json: &Value,
    ) -> InventoryResult<()> {
        insert_printer_live_event_row(self.connection(), printer_id, event_type, payload_json)
    }
}
