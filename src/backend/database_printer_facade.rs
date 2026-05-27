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
use super::database_printer_usage_sessions::{
    correct_live_usage_for_observed_weight_increase as correct_live_usage_for_observed_weight_increase_row,
    finish_live_usage_session as finish_live_usage_session_row,
    live_usage_session_has_spool_usage as live_usage_session_has_spool_usage_row,
    live_usage_session_is_active as live_usage_session_is_active_row,
    live_usage_session_recently_completed_successfully as live_usage_session_recently_completed_successfully_row,
    live_usage_session_spool_used_g as live_usage_session_spool_used_g_row,
    record_live_usage_delta as record_live_usage_delta_row,
    record_recent_completed_live_usage_delta as record_recent_completed_live_usage_delta_row,
    touch_live_usage_session as touch_live_usage_session_row, LiveUsageDeltaInput,
    LiveUsageDeltaResult, LiveUsageObservedWeightCorrectionInput,
    LiveUsageObservedWeightCorrectionResult, LiveUsageRecentCompletedDeltaInput,
    LiveUsageRecentCompletedSessionInput, LiveUsageSessionInput,
};
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

    pub fn record_live_usage_delta(
        &self,
        input: LiveUsageDeltaInput<'_>,
    ) -> InventoryResult<LiveUsageDeltaResult> {
        record_live_usage_delta_row(self.connection(), input)
    }

    pub fn record_recent_completed_live_usage_delta(
        &self,
        input: LiveUsageRecentCompletedDeltaInput<'_>,
    ) -> InventoryResult<Option<LiveUsageDeltaResult>> {
        record_recent_completed_live_usage_delta_row(self.connection(), input)
    }

    pub fn touch_live_usage_session(
        &self,
        input: LiveUsageSessionInput<'_>,
    ) -> InventoryResult<String> {
        touch_live_usage_session_row(self.connection(), input)
    }

    pub fn finish_live_usage_session(
        &self,
        printer_id: &str,
        session_key: &str,
        observed_at: Option<&str>,
        success: bool,
    ) -> InventoryResult<()> {
        finish_live_usage_session_row(
            self.connection(),
            printer_id,
            session_key,
            observed_at,
            success,
        )
    }

    pub fn live_usage_session_is_active(
        &self,
        printer_id: &str,
        session_key: &str,
    ) -> InventoryResult<bool> {
        live_usage_session_is_active_row(self.connection(), printer_id, session_key)
    }

    pub fn live_usage_session_has_spool_usage(
        &self,
        printer_id: &str,
        session_key: &str,
        spool_id: &str,
    ) -> InventoryResult<bool> {
        live_usage_session_has_spool_usage_row(self.connection(), printer_id, session_key, spool_id)
    }

    pub fn live_usage_session_spool_used_g(
        &self,
        printer_id: &str,
        session_key: &str,
        spool_id: &str,
    ) -> InventoryResult<Option<i64>> {
        live_usage_session_spool_used_g_row(self.connection(), printer_id, session_key, spool_id)
    }

    pub fn live_usage_session_recently_completed_successfully(
        &self,
        input: LiveUsageRecentCompletedSessionInput<'_>,
    ) -> InventoryResult<bool> {
        live_usage_session_recently_completed_successfully_row(self.connection(), input)
    }

    pub fn correct_live_usage_for_observed_weight_increase(
        &self,
        input: LiveUsageObservedWeightCorrectionInput<'_>,
    ) -> InventoryResult<Option<LiveUsageObservedWeightCorrectionResult>> {
        correct_live_usage_for_observed_weight_increase_row(self.connection(), input)
    }
}
