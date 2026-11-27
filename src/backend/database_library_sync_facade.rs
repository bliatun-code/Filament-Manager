use super::database_core::FilamentDatabase;
#[cfg(any(test, feature = "test-support"))]
use super::database_library_sync_auth::save_library_sync_client_auth_state as save_library_sync_client_auth_state_rows;
use super::database_library_sync_auth::{
    clear_library_sync_client_auth_state as clear_library_sync_client_auth_state_rows,
    finalize_library_sync_client_auth_migration as finalize_library_sync_client_auth_migration_rows,
    get_library_sync_client_auth_state as get_library_sync_client_auth_state_rows,
    save_library_sync_client_auth_metadata as save_library_sync_client_auth_metadata_rows,
    scrub_library_sync_client_auth_secrets as scrub_library_sync_client_auth_secret_rows,
};
use super::database_library_sync_cache::{
    get_library_sync_cached_locations as get_library_sync_cached_location_rows,
    save_library_sync_cached_active_loans as save_library_sync_cached_active_loan_rows,
    save_library_sync_cached_consumption as save_library_sync_cached_consumption_rows,
    save_library_sync_cached_loans as save_library_sync_cached_loan_rows,
    save_library_sync_cached_locations as save_library_sync_cached_location_rows,
    save_library_sync_cached_printers as save_library_sync_cached_printer_rows,
    save_library_sync_cached_snapshot as save_library_sync_cached_snapshot_row,
    save_library_sync_cached_spools as save_library_sync_cached_spool_rows,
    save_library_sync_cached_wishlist as save_library_sync_cached_wishlist_rows,
};
use super::database_library_sync_models::{
    LibrarySyncCacheDomain, LibrarySyncCachedLocationListRow, LibrarySyncCachedSnapshotRow,
    LibrarySyncClientAuthState, LibrarySyncPageStatusRow, LibrarySyncSettingsRow,
};
use super::database_library_sync_settings::{
    get_library_sync_library_id as get_library_sync_library_id_row, get_library_sync_page_status,
    get_library_sync_settings as get_library_sync_setting_rows,
    save_library_sync_settings as save_library_sync_setting_rows,
};
use super::database_library_sync_validation::save_library_sync_validation_state as save_library_sync_validation_state_row;
use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_location_models::InventoryLocationRow;
use super::database_printer_models::PrinterOverviewRow;
use super::database_result::InventoryResult;
use super::database_spool_models::SpoolWithMasterRow;
use super::database_wishlist_models::WishlistItemRow;
use super::statistics::FilamentConsumptionRow;

impl FilamentDatabase {
    pub fn get_library_sync_library_id(&self) -> InventoryResult<String> {
        get_library_sync_library_id_row(self.connection())
    }

    pub fn get_library_sync_page_status(&self) -> InventoryResult<LibrarySyncPageStatusRow> {
        self.with_read_transaction(|db| get_library_sync_page_status(db.connection()))
    }

    pub fn get_library_sync_settings(&self) -> InventoryResult<LibrarySyncSettingsRow> {
        self.with_read_transaction(|db| get_library_sync_setting_rows(db.connection()))
    }

    pub fn get_library_sync_settings_for_domains(
        &self,
        domains: &[LibrarySyncCacheDomain],
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        self.get_library_sync_settings_at_generation(domains, None, None)
    }

    pub fn get_library_sync_settings_at_generation(
        &self,
        domains: &[LibrarySyncCacheDomain],
        expected_generation: Option<u64>,
        fetched_snapshot_at: Option<&str>,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        self.with_read_transaction(|db| {
            super::database_library_sync_settings::read_library_sync_settings(
                db.connection(),
                Some(domains),
                expected_generation,
                fetched_snapshot_at,
            )
        })
    }

    pub fn save_library_sync_settings(
        &self,
        settings: &LibrarySyncSettingsRow,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        let transaction = self.connection().unchecked_transaction()?;
        let saved = save_library_sync_setting_rows(&transaction, settings)?;
        transaction.commit()?;
        Ok(saved)
    }

    pub fn save_library_sync_validation_state(
        &self,
        reachable: bool,
        message: Option<&str>,
        host_device_name: Option<&str>,
    ) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        save_library_sync_validation_state_row(&transaction, reachable, message, host_device_name)?;
        transaction.commit()?;
        Ok(())
    }

    #[cfg(any(test, feature = "test-support"))]
    pub fn save_library_sync_client_auth_state(
        &self,
        session_id: &str,
        device_token: &str,
        csrf_token: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        save_library_sync_client_auth_state_rows(
            &transaction,
            session_id,
            device_token,
            csrf_token,
            expires_at,
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn clear_library_sync_client_auth_state(&self) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        clear_library_sync_client_auth_state_rows(&transaction)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_library_sync_client_auth_metadata(
        &self,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        save_library_sync_client_auth_metadata_rows(&transaction, expires_at)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn finalize_library_sync_client_pairing(
        &self,
        expires_at: Option<&str>,
        message: &str,
        host_device_name: Option<&str>,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        let transaction = self.connection().unchecked_transaction()?;
        save_library_sync_client_auth_metadata_rows(&transaction, expires_at)?;
        scrub_library_sync_client_auth_secret_rows(&transaction)?;
        save_library_sync_validation_state_row(
            &transaction,
            true,
            Some(message),
            host_device_name,
        )?;
        let settings = get_library_sync_setting_rows(&transaction)?;
        transaction.commit()?;
        Ok(settings)
    }

    pub fn scrub_library_sync_client_auth_secrets(&self) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        scrub_library_sync_client_auth_secret_rows(&transaction)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn finalize_library_sync_client_auth_migration(
        &self,
        canonical_host_base_url: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        finalize_library_sync_client_auth_migration_rows(
            self.connection(),
            canonical_host_base_url,
            expires_at,
        )
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
        self.save_library_sync_host_snapshot(snapshot.clone(), false)
    }

    pub fn save_library_sync_host_snapshot(
        &self,
        snapshot: LibrarySyncCachedSnapshotRow,
        dashboard: bool,
    ) -> InventoryResult<()> {
        save_library_sync_cached_snapshot_row(self.connection(), snapshot, dashboard)
    }

    pub fn save_library_sync_cached_spools(
        &self,
        rows: &[SpoolWithMasterRow],
    ) -> InventoryResult<String> {
        save_library_sync_cached_spool_rows(self.connection(), rows)
    }

    pub fn save_library_sync_cached_locations(
        &self,
        rows: &[InventoryLocationRow],
    ) -> InventoryResult<LibrarySyncCachedLocationListRow> {
        save_library_sync_cached_location_rows(self.connection(), rows)
    }

    pub fn get_library_sync_cached_locations(
        &self,
    ) -> InventoryResult<Option<LibrarySyncCachedLocationListRow>> {
        get_library_sync_cached_location_rows(self.connection())
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

    pub fn save_library_sync_cached_active_loans(
        &self,
        rows: &[SpoolLoanDetailsRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_active_loan_rows(self.connection(), rows)
    }

    pub fn save_library_sync_cached_consumption(
        &self,
        rows: &[FilamentConsumptionRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_consumption_rows(self.connection(), rows)
    }

    pub fn save_library_sync_cached_wishlist(
        &self,
        rows: &[WishlistItemRow],
    ) -> InventoryResult<()> {
        save_library_sync_cached_wishlist_rows(self.connection(), rows)
    }
}
