use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_spool_price_lock::lock_spool_price_for_historical_status;
use super::database_spool_updates::{
    set_spool_home_location as set_spool_home_location_row,
    set_spool_location as set_spool_location_row,
    set_spool_purchase_price_batch_locked as set_spool_purchase_price_batch_locked_row,
    set_spool_purchase_price_source as set_spool_purchase_price_source_row,
    update_spool_details as update_spool_details_row,
    update_spool_ownership as update_spool_ownership_row,
    update_spool_ownership_metadata as update_spool_ownership_metadata_row,
    update_spool_purchase_metadata as update_spool_purchase_metadata_row,
    update_spool_rfid_tag as update_spool_rfid_tag_row,
    update_spool_status as update_spool_status_row,
    update_spool_tare_weight as update_spool_tare_weight_row,
    update_spool_weight as update_spool_weight_row,
};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

impl FilamentDatabase {
    pub fn set_spool_purchase_price_batch_locked(
        &self,
        spool_id: &str,
        locked: bool,
    ) -> InventoryResult<()> {
        set_spool_purchase_price_batch_locked_row(self.connection(), spool_id, locked)
    }

    pub fn set_spool_purchase_price_source(
        &self,
        spool_id: &str,
        source: Option<&str>,
    ) -> InventoryResult<()> {
        set_spool_purchase_price_source_row(self.connection(), spool_id, source)
    }

    pub fn update_spool_status(&self, spool_id: &str, status: &str) -> InventoryResult<()> {
        let update = |connection: &rusqlite::Connection| {
            update_spool_status_row(connection, spool_id, status)?;
            lock_spool_price_for_historical_status(
                connection,
                spool_id,
                status,
                "SPOOL_STATUS_UPDATE",
            )?;
            Ok(())
        };
        if self.connection().is_autocommit() {
            self.with_inventory_transaction(update)
        } else {
            update(self.connection())
        }
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        current_weight_g: Option<i64>,
        remaining_g: Option<i64>,
    ) -> InventoryResult<()> {
        update_spool_weight_row(self.connection(), spool_id, current_weight_g, remaining_g)
    }

    pub fn update_spool_tare_weight(
        &self,
        spool_id: &str,
        spool_tare_weight_g: Option<i64>,
    ) -> InventoryResult<()> {
        update_spool_tare_weight_row(self.connection(), spool_id, spool_tare_weight_g)
    }

    pub fn update_spool_rfid_tag(
        &self,
        spool_id: &str,
        rfid_tag: Option<&str>,
        rfid_observed_at: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_rfid_tag_row(self.connection(), spool_id, rfid_tag, rfid_observed_at)
    }

    pub fn set_spool_location(
        &self,
        spool_id: &str,
        location_id: Option<&str>,
    ) -> InventoryResult<()> {
        set_spool_location_row(self.connection(), spool_id, location_id)
    }

    pub fn update_spool_details(
        &self,
        spool_id: &str,
        qr_code: Option<&str>,
        status: &str,
        location_id: Option<&str>,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        let update = |connection: &rusqlite::Connection| {
            update_spool_details_row(
                connection,
                spool_id,
                qr_code,
                status,
                location_id,
                home_location_id,
            )?;
            lock_spool_price_for_historical_status(
                connection,
                spool_id,
                status,
                "SPOOL_DETAILS_UPDATE",
            )?;
            Ok(())
        };
        if self.connection().is_autocommit() {
            self.with_inventory_transaction(update)
        } else {
            update(self.connection())
        }
    }

    pub fn set_spool_home_location(
        &self,
        spool_id: &str,
        home_location_id: Option<&str>,
    ) -> InventoryResult<()> {
        set_spool_home_location_row(self.connection(), spool_id, home_location_id)
    }

    pub fn update_spool_purchase_metadata(
        &self,
        spool_id: &str,
        metadata: &PurchaseReceiptMetadata,
    ) -> InventoryResult<()> {
        update_spool_purchase_metadata_row(self.connection(), spool_id, metadata)
    }

    pub fn update_spool_ownership_metadata(
        &self,
        spool_id: &str,
        owner_name: Option<&str>,
        owner_contact: Option<&str>,
        ownership_note: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_ownership_metadata_row(
            self.connection(),
            spool_id,
            owner_name,
            owner_contact,
            ownership_note,
        )
    }

    pub fn update_spool_ownership(
        &self,
        spool_id: &str,
        ownership_type: &str,
        owner_name: Option<&str>,
        owner_contact: Option<&str>,
        ownership_note: Option<&str>,
    ) -> InventoryResult<()> {
        update_spool_ownership_row(
            self.connection(),
            spool_id,
            ownership_type,
            owner_name,
            owner_contact,
            ownership_note,
        )
    }
}
