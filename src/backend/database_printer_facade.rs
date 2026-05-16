use super::database_core::FilamentDatabase;
use super::database_print_jobs::insert_print_job as insert_print_job_row;
use super::database_printer_models::{PrinterOverviewRow, PrinterRow};
use super::database_printer_mutations::{
    delete_printer as delete_printer_row, upsert_printer_with_ams as upsert_printer_with_ams_row,
};
use super::database_printer_queries::{
    list_printer_overview as list_printer_overview_rows, list_printers as list_printer_rows,
    printer_exists as printer_exists_row,
};
use super::database_printer_slot_assignment::assign_spool_to_ams_slot as assign_spool_to_ams_slot_row;
use super::database_result::InventoryResult;

impl FilamentDatabase {
    pub fn list_printers(&self) -> InventoryResult<Vec<PrinterRow>> {
        list_printer_rows(self.connection())
    }

    pub fn printer_exists(&self, printer_id: &str) -> InventoryResult<bool> {
        printer_exists_row(self.connection(), printer_id)
    }

    pub fn upsert_printer_with_ams(
        &self,
        printer_id: &str,
        model: &str,
        name: &str,
        ams_units: i64,
        slots_per_unit: i64,
    ) -> InventoryResult<()> {
        upsert_printer_with_ams_row(
            self.connection(),
            printer_id,
            model,
            name,
            ams_units,
            slots_per_unit,
        )
    }

    pub fn delete_printer(&self, printer_id: &str) -> InventoryResult<()> {
        delete_printer_row(self.connection(), printer_id)
    }

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        list_printer_overview_rows(self.connection())
    }

    pub fn assign_spool_to_ams_slot(
        &self,
        printer_id: &str,
        slot_id: &str,
        spool_id: Option<&str>,
        rfid_override_tray_uuid: Option<&str>,
        rfid_override_color_hex: Option<&str>,
        clear_live_cache_before_next_refresh: bool,
    ) -> InventoryResult<()> {
        assign_spool_to_ams_slot_row(
            self.connection(),
            printer_id,
            slot_id,
            spool_id,
            rfid_override_tray_uuid,
            rfid_override_color_hex,
            clear_live_cache_before_next_refresh,
        )
    }

    pub fn insert_print_job(
        &self,
        printer_id: &str,
        spool_id: &str,
        job_name: Option<&str>,
        material_used_g: i64,
        success: bool,
    ) -> InventoryResult<String> {
        insert_print_job_row(
            self.connection(),
            printer_id,
            spool_id,
            job_name,
            material_used_g,
            success,
        )
    }
}
