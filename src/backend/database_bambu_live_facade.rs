use rusqlite::{Transaction, TransactionBehavior};
use serde_json::Value;

use super::database_bambu_live_settings::{
    delete_bambu_live_integration as delete_bambu_live_integration_row,
    list_bambu_live_integrations as list_bambu_live_integration_rows,
    recover_bambu_live_connection_if_current as recover_bambu_live_connection_if_current_row,
    save_bambu_live_integration as save_bambu_live_integration_row,
    update_bambu_live_observation_if_current as update_bambu_live_observation_if_current_row,
};
use super::database_core::FilamentDatabase;
use super::database_printer_live_events::{
    insert_printer_live_event as insert_printer_live_event_row,
    insert_printer_live_event_unless_recent_duplicate as insert_printer_live_event_unless_recent_duplicate_row,
};
use super::database_printer_models::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveTlsIdentityRow,
};
use super::database_printer_queries::printer_exists as printer_exists_row;
use super::database_result::InventoryResult;

impl FilamentDatabase {
    pub fn save_bambu_live_integration(
        &self,
        printer_id: &str,
        config: &BambuLiveIntegrationRow,
    ) -> InventoryResult<()> {
        save_bambu_live_integration_row(self.connection(), printer_id, config)
    }

    /// Saves one integration as a single SQLite transaction.
    ///
    /// Credential migration uses this variant so a failed revision update can
    /// never leave the plaintext scrub committed while the caller rolls back a
    /// newly-created platform credential.
    pub fn save_bambu_live_integration_atomically(
        &self,
        printer_id: &str,
        config: &BambuLiveIntegrationRow,
    ) -> InventoryResult<()> {
        let transaction = self.connection().unchecked_transaction()?;
        save_bambu_live_integration_row(&transaction, printer_id, config)?;
        transaction.commit()?;
        Ok(())
    }

    /// Saves a live integration only while its owning printer still exists.
    ///
    /// The immediate transaction closes the gap between the existence check and
    /// the settings write, so a concurrent printer deletion cannot be followed
    /// by recreation of an orphan live-integration row.
    pub fn save_bambu_live_integration_for_existing_printer_atomically(
        &self,
        printer_id: &str,
        config: &BambuLiveIntegrationRow,
    ) -> InventoryResult<()> {
        let transaction =
            Transaction::new_unchecked(self.connection(), TransactionBehavior::Immediate)?;
        if !printer_exists_row(&transaction, printer_id.trim())? {
            return Err(super::database_result::InventoryError::NotFound);
        }
        save_bambu_live_integration_row(&transaction, printer_id, config)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_bambu_live_integration(&self, printer_id: &str) -> InventoryResult<()> {
        delete_bambu_live_integration_row(self.connection(), printer_id)
    }

    pub fn list_bambu_live_integrations(
        &self,
    ) -> InventoryResult<Vec<BambuLiveIntegrationEntryRow>> {
        list_bambu_live_integration_rows(self.connection())
    }

    pub fn update_bambu_live_observation_if_current(
        &self,
        printer_id: &str,
        expected_config: &BambuLiveIntegrationRow,
        observed_state: Option<BambuLiveObservedStateRow>,
        last_error: Option<String>,
        observed_tls_identity: Option<&BambuLiveTlsIdentityRow>,
    ) -> InventoryResult<bool> {
        update_bambu_live_observation_if_current_row(
            self.connection(),
            printer_id,
            expected_config,
            observed_state,
            last_error,
            observed_tls_identity,
        )
    }

    /// Updates a previously trusted printer endpoint only while the connection
    /// configuration that was checked on the network is still current.
    ///
    /// The caller is responsible for proving the new endpoint with the saved
    /// serial and SPKI pin before calling this method. Keeping the conditional
    /// write in SQLite prevents a slow discovery result from replacing a newer
    /// user edit or credential replacement.
    pub fn recover_bambu_live_connection_if_current(
        &self,
        printer_id: &str,
        expected_config: &BambuLiveIntegrationRow,
        recovered_host: &str,
        observed_tls_identity: &BambuLiveTlsIdentityRow,
    ) -> InventoryResult<bool> {
        recover_bambu_live_connection_if_current_row(
            self.connection(),
            printer_id,
            expected_config,
            recovered_host,
            observed_tls_identity,
        )
    }

    pub fn insert_printer_live_event(
        &self,
        printer_id: &str,
        event_type: &str,
        payload_json: &Value,
    ) -> InventoryResult<()> {
        insert_printer_live_event_row(self.connection(), printer_id, event_type, payload_json)
    }

    pub fn insert_printer_live_event_unless_recent_duplicate(
        &self,
        printer_id: &str,
        event_type: &str,
        payload_json: &Value,
        dedupe_key: &str,
        dedupe_window_seconds: i64,
    ) -> InventoryResult<bool> {
        insert_printer_live_event_unless_recent_duplicate_row(
            self.connection(),
            printer_id,
            event_type,
            payload_json,
            dedupe_key,
            dedupe_window_seconds,
        )
    }
}
