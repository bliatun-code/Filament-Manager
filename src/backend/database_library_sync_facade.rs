use super::database_core::FilamentDatabase;
use super::database_library_sync_auth::{
    clear_library_sync_client_auth_state as clear_library_sync_client_auth_state_rows,
    get_library_sync_client_auth_state as get_library_sync_client_auth_state_rows,
    save_library_sync_client_auth_state as save_library_sync_client_auth_state_rows,
};
use super::database_library_sync_cache::{
    save_library_sync_cached_loans as save_library_sync_cached_loan_rows,
    save_library_sync_cached_printers as save_library_sync_cached_printer_rows,
    save_library_sync_cached_snapshot as save_library_sync_cached_snapshot_row,
    save_library_sync_cached_spools as save_library_sync_cached_spool_rows,
};
use super::database_library_sync_models::{
    LibrarySyncCachedSnapshotRow, LibrarySyncClientAuthState, LibrarySyncSettingsRow,
};
use super::database_library_sync_settings::{
    get_library_sync_settings as get_library_sync_setting_rows,
    save_library_sync_settings as save_library_sync_setting_rows,
};
use super::database_library_sync_validation::save_library_sync_validation_state as save_library_sync_validation_state_row;
use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_printer_models::PrinterOverviewRow;
use super::database_result::InventoryResult;
use super::database_spool_models::SpoolWithMasterRow;

impl FilamentDatabase {
    pub fn get_library_sync_settings(&self) -> InventoryResult<LibrarySyncSettingsRow> {
        get_library_sync_setting_rows(self.connection())
    }

    pub fn save_library_sync_settings(
        &self,
        settings: &LibrarySyncSettingsRow,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        save_library_sync_setting_rows(self.connection(), settings)
    }

    pub fn save_library_sync_validation_state(
        &self,
        reachable: bool,
        message: Option<&str>,
        host_device_name: Option<&str>,
    ) -> InventoryResult<()> {
        save_library_sync_validation_state_row(
            self.connection(),
            reachable,
            message,
            host_device_name,
        )
    }

    pub fn save_library_sync_client_auth_state(
        &self,
        session_id: &str,
        device_token: &str,
        csrf_token: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        save_library_sync_client_auth_state_rows(
            self.connection(),
            session_id,
            device_token,
            csrf_token,
            expires_at,
        )
    }

    pub fn clear_library_sync_client_auth_state(&self) -> InventoryResult<()> {
        clear_library_sync_client_auth_state_rows(self.connection())
    }

    pub fn get_library_sync_client_auth_state(
        &self,
    ) -> InventoryResult<Option<LibrarySyncClientAuthState>> {
        get_library_sync_client_auth_state_rows(self.connection())
    }

    pub fn save_library_sync_cached_snapshot(
        &self,
        snapshot: &LibrarySyncCachedSnapshotRow,
    ) -> InventoryResult<()> {
        save_library_sync_cached_snapshot_row(self.connection(), snapshot)
    }

    pub fn save_library_sync_cached_spools(
        &self,
        rows: &[SpoolWithMasterRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_spool_rows(self.connection(), rows)
    }

    pub fn save_library_sync_cached_printers(
        &self,
        rows: &[PrinterOverviewRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_printer_rows(self.connection(), rows)
    }

    pub fn save_library_sync_cached_loans(
        &self,
        rows: &[SpoolLoanDetailsRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_loan_rows(self.connection(), rows)
    }
}
