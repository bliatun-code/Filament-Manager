use crate::backend::bambu_live_settings::bambu_live_integration_setting_key;
use crate::backend::database_catalog_manual::upsert_manual_master as upsert_manual_master_row;
use crate::backend::database_events::{
    ensure_scale as ensure_scale_row, insert_spool_history_event as insert_spool_history_event_row,
    insert_weight_reading as insert_weight_reading_row,
};
pub use crate::backend::database_inventory_bulk_models::{
    InventoryBulkMutationInput, InventoryBulkMutationResult, InventoryBulkSpoolPrecondition,
};
use crate::backend::database_loan_create::{
    create_inbound_spool_loan_in_transaction, create_spool_loan_in_transaction,
};
use crate::backend::database_loan_queries::{
    find_active_spool_loan_for_direction as find_active_spool_loan_for_direction_row,
    spool_has_active_loan as spool_has_active_loan_row,
};
use crate::backend::database_loan_return::{
    return_inbound_spool_loan_in_transaction, return_spool_loan_in_transaction,
};
use crate::backend::database_loan_update::{
    close_inbound_spool_loan_without_returning_spool as close_inbound_spool_loan_without_returning_spool_row,
    update_active_inbound_spool_loan_counterparty as update_active_inbound_spool_loan_counterparty_row,
};
use crate::backend::database_locations::{
    location_reference_matches, resolve_active_generic_location_reference,
};
use crate::backend::database_print_jobs::insert_print_job as insert_print_job_row;
use crate::backend::database_printer_queries::printer_exists as printer_exists_row;
use crate::backend::database_printer_slot_assignment::assign_spool_to_ams_slot_in_transaction;
use crate::backend::database_result::{InventoryError, InventoryResult};
use crate::backend::database_revision::{
    bump_library_domain_revision as bump_library_domain_revision_row, PRINTERS_REVISION_DOMAIN,
};
use crate::backend::database_settings::{
    delete_setting as delete_setting_row, get_setting as get_setting_row,
    set_setting as set_setting_row,
};
use crate::backend::database_spool_assignment::{
    spool_assigned_to_printer as spool_assigned_to_printer_row,
    spool_assigned_to_specific_printer as spool_assigned_to_specific_printer_row,
};
use crate::backend::database_spool_delete::soft_delete_spool_in_transaction;
use crate::backend::database_spool_insert::insert_spool as insert_spool_row;
use crate::backend::database_spool_queries::{
    get_spool_by_id as get_spool_by_id_row,
    get_spool_with_master_by_id as get_spool_with_master_by_id_row,
};
use crate::backend::database_spool_updates::{
    set_spool_home_location as set_spool_home_location_row,
    set_spool_location as set_spool_location_row,
    set_spool_purchase_price_batch_locked as set_spool_purchase_price_batch_locked_row,
    update_spool_details as update_spool_details_row,
    update_spool_ownership as update_spool_ownership_row,
    update_spool_ownership_metadata as update_spool_ownership_metadata_row,
    update_spool_purchase_metadata as update_spool_purchase_metadata_row,
    update_spool_rfid_tag as update_spool_rfid_tag_row,
    update_spool_status as update_spool_status_row,
    update_spool_tare_weight as update_spool_tare_weight_row,
    update_spool_weight as update_spool_weight_row,
};
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, CatalogResetStats, FilamentDatabase, LibrarySyncCachedSnapshotRow,
    LibrarySyncSettingsRow, LoanUsageByPersonRow, ManualMasterInput, MasterCatalogUpdateInput,
    PrinterOverviewRow, PrinterRow, SpoolHistoryEventRow, SpoolLoanDetailsRow, SpoolLoanRow,
    SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow, WishlistItemRow, WishlistReceiptResult,
};
use crate::backend::filament_standards::PURCHASE_PRICE_SOURCE_MANUAL;
pub use crate::backend::filament_standards::{
    FilamentPriceBatchInput, FilamentPriceBatchReceipt, FilamentStandardsSettings,
    FilamentStandardsSnapshot,
};
use crate::backend::inventory_domain::{LoanDirection, OwnershipType, SpoolStatus};
use crate::backend::inventory_printer_slot_live::derive_assign_printer_slot_live_context;
use crate::backend::printer_slot_live_mapping::bambu_live_slot_matches_tray;
pub use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::backend::statistics::FilamentConsumptionRow;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

type LibrarySyncClientAuthState = (String, String, String, Option<String>);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum WeightSource {
    Auto,
    Manual,
}

impl WeightSource {
    fn as_str(&self) -> &'static str {
        match self {
            WeightSource::Auto => "AUTO",
            WeightSource::Manual => "MANUAL",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateSpoolInput {
    pub id: String,
    pub master_id: String,
    pub qr_code: Option<String>,
    pub status: String,
    pub ownership_type: Option<String>,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
    pub initial_weight_g: Option<i64>,
    pub current_weight_g: Option<i64>,
    pub location_id: Option<String>,
    pub home_location_id: Option<String>,
    pub purchase_date: Option<String>,
    pub purchase_price: Option<f64>,
    pub batch_code: Option<String>,
    #[serde(default)]
    pub purchase_currency: Option<String>,
    #[serde(default)]
    pub supplier_reference: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateManualSpoolInput {
    pub id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub vendor: Option<String>,
    pub default_weight_g: Option<i64>,
    pub qr_code: Option<String>,
    pub status: Option<String>,
    pub ownership_type: Option<String>,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
    pub initial_weight_g: Option<i64>,
    pub location: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSpoolDetailsOwnershipInput {
    pub ownership_type: String,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSpoolDetailsInput {
    pub spool_id: String,
    pub qr_code: Option<String>,
    pub status: String,
    pub location: Option<String>,
    pub home_location: Option<Option<String>>,
    #[serde(default)]
    pub spool_tare_weight_g: Option<i64>,
    #[serde(default)]
    pub ownership: Option<UpdateSpoolDetailsOwnershipInput>,
    #[serde(default)]
    pub purchase_metadata: Option<PurchaseReceiptMetadata>,
    /// When present, updates whether standards batches may change this spool's
    /// purchase price. Missing on older local/Host request payloads.
    #[serde(default)]
    pub purchase_price_batch_locked: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSpoolRfidTagInput {
    pub spool_id: String,
    pub rfid_tag: Option<String>,
    pub rfid_observed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateBorrowedInSpoolInput {
    pub spool_id: String,
    pub owner_name: String,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSpoolOwnershipInput {
    pub spool_id: String,
    pub ownership_type: String,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateMasterCatalogEntryInput {
    pub master_id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub vendor: Option<String>,
    pub default_weight: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteSpoolInput {
    pub spool_id: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PurgeSpoolInput {
    pub spool_id: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateWishlistItemInput {
    pub id: String,
    pub master_id: Option<String>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: Option<String>,
    pub quantity: Option<i64>,
    pub note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateWishlistStatusInput {
    pub item_id: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReceiveWishlistItemInput {
    pub item_id: String,
    pub quantity: i64,
    #[serde(default)]
    pub purchase_metadata: Option<PurchaseReceiptMetadata>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreatePrinterInput {
    pub id: String,
    pub model: String,
    pub name: String,
    pub ams_units: Option<i64>,
    pub slots_per_ams: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssignPrinterSlotInput {
    pub printer_id: String,
    pub slot_id: String,
    pub spool_id: Option<String>,
    pub rfid_override_tray_uuid: Option<String>,
    pub rfid_override_color_hex: Option<String>,
    pub clear_live_cache_before_next_refresh: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecordPrintUsageInput {
    pub printer_id: String,
    pub spool_id: String,
    pub grams: i64,
    pub job_name: Option<String>,
    pub success: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AcceptBambuLiveWeightEstimateInput {
    pub printer_id: String,
    pub slot_id: String,
    pub spool_id: String,
    pub expected_weight_seen_at: String,
    pub expected_remaining_grams: i64,
    pub expected_current_grams: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LendSpoolInput {
    pub spool_id: String,
    pub borrower_name: String,
    pub counterparty_contact: Option<String>,
    pub grams_out: Option<i64>,
    pub note: Option<String>,
    pub expected_return_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReturnSpoolLoanInput {
    pub loan_id: String,
    pub returned_grams: i64,
    pub note: Option<String>,
}

pub struct InventoryEngine {
    db: FilamentDatabase,
}

impl InventoryEngine {
    pub fn new(db: FilamentDatabase) -> Self {
        Self { db }
    }

    pub fn execute_bulk_inventory_mutation(
        &self,
        input: InventoryBulkMutationInput,
    ) -> InventoryResult<InventoryBulkMutationResult> {
        self.db.execute_inventory_bulk_mutation(input)
    }

    pub fn get_filament_standards(&self) -> InventoryResult<FilamentStandardsSnapshot> {
        self.db.get_filament_standards()
    }

    pub fn save_filament_standards(
        &self,
        settings: FilamentStandardsSettings,
    ) -> InventoryResult<FilamentStandardsSnapshot> {
        self.db.save_filament_standards(settings)
    }

    pub fn apply_filament_price_batch(
        &self,
        input: FilamentPriceBatchInput,
    ) -> InventoryResult<FilamentPriceBatchReceipt> {
        self.db.apply_filament_price_batch(input)
    }

    pub fn list_spools(&self, limit: i64, offset: i64) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        self.db.list_spools_with_master(limit, offset)
    }

    pub fn get_spool_with_master(
        &self,
        spool_id: &str,
    ) -> InventoryResult<Option<SpoolWithMasterRow>> {
        self.db.get_spool_with_master_by_id(spool_id)
    }

    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        self.db.list_wishlist_items(limit)
    }

    pub fn list_printers(&self) -> InventoryResult<Vec<PrinterRow>> {
        self.db.list_printers()
    }

    pub fn get_library_sync_settings(&self) -> InventoryResult<LibrarySyncSettingsRow> {
        self.db.get_library_sync_settings()
    }

    pub fn save_library_sync_settings(
        &self,
        settings: &LibrarySyncSettingsRow,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        self.db.save_library_sync_settings(settings)
    }

    pub fn save_library_sync_validation_state(
        &self,
        reachable: bool,
        message: Option<&str>,
        host_device_name: Option<&str>,
    ) -> InventoryResult<()> {
        self.db
            .save_library_sync_validation_state(reachable, message, host_device_name)
    }

    pub fn save_library_sync_cached_snapshot(
        &self,
        snapshot: &LibrarySyncCachedSnapshotRow,
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_snapshot(snapshot)
    }

    pub fn save_library_sync_cached_spools(
        &self,
        rows: &[SpoolWithMasterRow],
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_spools(rows)
    }

    pub fn save_library_sync_cached_printers(
        &self,
        rows: &[PrinterOverviewRow],
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_printers(rows)
    }

    pub fn save_library_sync_cached_loans(
        &self,
        rows: &[SpoolLoanDetailsRow],
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_loans(rows)
    }

    pub fn save_library_sync_cached_consumption(
        &self,
        rows: &[FilamentConsumptionRow],
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_consumption(rows)
    }

    pub fn save_library_sync_cached_wishlist(
        &self,
        rows: &[WishlistItemRow],
    ) -> InventoryResult<()> {
        self.db.save_library_sync_cached_wishlist(rows)
    }

    #[cfg(any(test, feature = "test-support"))]
    pub fn save_library_sync_client_auth_state(
        &self,
        session_id: &str,
        device_token: &str,
        csrf_token: &str,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        self.db.save_library_sync_client_auth_state(
            session_id,
            device_token,
            csrf_token,
            expires_at,
        )
    }

    pub fn clear_library_sync_client_auth_state(&self) -> InventoryResult<()> {
        self.db.clear_library_sync_client_auth_state()
    }

    pub fn save_library_sync_client_auth_metadata(
        &self,
        expires_at: Option<&str>,
    ) -> InventoryResult<()> {
        self.db.save_library_sync_client_auth_metadata(expires_at)
    }

    pub fn finalize_library_sync_client_pairing(
        &self,
        expires_at: Option<&str>,
        message: &str,
        host_device_name: Option<&str>,
    ) -> InventoryResult<LibrarySyncSettingsRow> {
        self.db
            .finalize_library_sync_client_pairing(expires_at, message, host_device_name)
    }

    pub fn scrub_library_sync_client_auth_secrets(&self) -> InventoryResult<()> {
        self.db.scrub_library_sync_client_auth_secrets()
    }

    pub fn get_library_sync_client_auth_state(
        &self,
    ) -> InventoryResult<Option<LibrarySyncClientAuthState>> {
        self.db.get_library_sync_client_auth_state()
    }

    pub fn list_active_spool_loans(&self) -> InventoryResult<Vec<ActiveSpoolLoanRow>> {
        self.db.list_active_spool_loans()
    }

    pub fn list_loan_usage_by_person(
        &self,
        limit: i64,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<LoanUsageByPersonRow>> {
        self.db
            .list_loan_usage_by_person_for_direction(limit, direction)
    }

    #[cfg(test)]
    pub fn list_spool_loans(
        &self,
        limit: i64,
        include_returned: bool,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        self.db.list_spool_loans(limit, include_returned)
    }

    pub fn list_spool_loans_for_direction(
        &self,
        limit: i64,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        self.db
            .list_spool_loans_for_direction(limit, include_returned, direction)
    }

    pub fn create_spool(&self, input: CreateSpoolInput) -> InventoryResult<()> {
        let spool_id = input.id.clone();
        let purchase_metadata = PurchaseReceiptMetadata {
            purchase_price: input.purchase_price,
            purchase_currency: input.purchase_currency.clone(),
            purchase_date: input.purchase_date.clone(),
            batch_code: input.batch_code.clone(),
            supplier_reference: input.supplier_reference.clone(),
        }
        .normalize_for_new()?;
        let ownership_type_kind = OwnershipType::from_raw(input.ownership_type.as_deref());
        let ownership_type = ownership_type_kind.as_str().to_string();
        let status = SpoolStatus::from_raw(Some(&input.status))
            .as_str()
            .to_string();
        let owner_name = normalize_optional_input_text(input.owner_name.as_deref());
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());
        if ownership_type_kind.is_borrowed_in() && owner_name.is_none() {
            return Err(InventoryError::Db(
                "borrowed-in spools require an owner/counterparty name".to_string(),
            ));
        }
        let remaining_g = compute_remaining(input.initial_weight_g, input.current_weight_g);
        let requested_location = input.location_id;
        let requested_home_location = input.home_location_id;
        let mut spool = SpoolRow {
            id: input.id,
            master_id: input.master_id,
            qr_code: input.qr_code,
            rfid_tag: None,
            rfid_observed_at: None,
            status,
            ownership_type: ownership_type.clone(),
            owner_name: owner_name.clone(),
            owner_contact: owner_contact.clone(),
            ownership_note: ownership_note.clone(),
            initial_weight_g: input.initial_weight_g,
            current_weight_g: input.current_weight_g,
            remaining_g,
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: purchase_metadata.purchase_date.clone(),
            purchase_price: purchase_metadata.purchase_price,
            batch_code: purchase_metadata.batch_code.clone(),
            last_used_at: None,
            purchase_currency: purchase_metadata.purchase_currency.clone(),
            supplier_reference: purchase_metadata.supplier_reference.clone(),
            purchase_price_batch_locked: false,
            purchase_price_source: purchase_metadata
                .purchase_price
                .map(|_| PURCHASE_PRICE_SOURCE_MANUAL.to_string()),
        };

        self.db.with_inventory_transaction(|conn| {
            spool.location_id = match requested_location.as_deref() {
                Some(value) if !value.trim().is_empty() => {
                    Some(resolve_active_generic_location_reference(conn, value)?)
                }
                _ => None,
            };
            spool.home_location_id = match requested_home_location.as_deref() {
                Some(value) if !value.trim().is_empty() => {
                    Some(resolve_active_generic_location_reference(conn, value)?)
                }
                _ => spool.location_id.clone(),
            };

            insert_spool_row(conn, &spool)?;
            insert_json_history_event(
                conn,
                &spool_id,
                "CREATED",
                json!({
                    "status": spool.status,
                    "ownership_type": spool.ownership_type,
                }),
            )?;
            if !purchase_metadata.is_empty() {
                insert_json_history_event(
                    conn,
                    &spool_id,
                    "PURCHASE_RECEIPT_RECORDED",
                    json!({
                        "source": "DIRECT_CREATE",
                        "initial_weight_g": spool.initial_weight_g,
                        "purchase_metadata": purchase_metadata,
                    }),
                )?;
            }
            if ownership_type_kind.is_borrowed_in() {
                let loan = create_inbound_spool_loan_in_transaction(
                    conn,
                    &spool_id,
                    owner_name.as_deref().unwrap_or(""),
                    owner_contact.as_deref(),
                    ownership_note.as_deref(),
                    spool
                        .remaining_g
                        .or(spool.current_weight_g)
                        .or(spool.initial_weight_g)
                        .unwrap_or(0),
                )?;
                insert_json_history_event(
                    conn,
                    &spool_id,
                    "BORROWED_IN_REGISTERED",
                    json!({
                        "loan_id": loan.id,
                        "ownership_type": spool.ownership_type,
                        "owner_name": spool.owner_name,
                        "owner_contact": spool.owner_contact,
                        "ownership_note": spool.ownership_note,
                        "loan_direction": loan.loan_direction,
                        "counterparty_name": loan.counterparty_name,
                        "grams_out": loan.grams_out,
                    }),
                )?;
            }
            Ok(())
        })
    }

    pub fn create_manual_spool(&self, input: CreateManualSpoolInput) -> InventoryResult<()> {
        let spool_id = input.id.clone();
        let ownership_type_kind = OwnershipType::from_raw(input.ownership_type.as_deref());
        let ownership_type = ownership_type_kind.as_str().to_string();
        let owner_name = normalize_optional_input_text(input.owner_name.as_deref());
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());
        if ownership_type_kind.is_borrowed_in() && owner_name.is_none() {
            return Err(InventoryError::Db(
                "borrowed-in spools require an owner/counterparty name".to_string(),
            ));
        }
        let initial_weight = input
            .initial_weight_g
            .or(input.default_weight_g)
            .or(Some(1000));
        let status = SpoolStatus::from_raw(input.status.as_deref())
            .as_str()
            .to_string();
        let vendor_label = input.vendor.clone().unwrap_or_else(|| "Manual".to_string());
        self.db.with_inventory_transaction(|conn| {
            let master_id = upsert_manual_master_row(
                conn,
                ManualMasterInput {
                    material: &input.material,
                    filament_name: &input.filament_name,
                    color_name: &input.color_name,
                    hex_color: input.hex_color.as_deref(),
                    product_url: input.product_url.as_deref(),
                    vendor: input.vendor.as_deref(),
                    default_weight: input.default_weight_g,
                },
            )?;
            let spool = SpoolRow {
                id: spool_id.clone(),
                master_id,
                qr_code: input.qr_code,
                rfid_tag: None,
                rfid_observed_at: None,
                status,
                ownership_type: ownership_type.clone(),
                owner_name: owner_name.clone(),
                owner_contact: owner_contact.clone(),
                ownership_note: ownership_note.clone(),
                initial_weight_g: initial_weight,
                current_weight_g: initial_weight,
                remaining_g: initial_weight,
                spool_tare_weight_g: default_spool_tare_for_vendor(Some(vendor_label.as_str())),
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
                purchase_currency: None,
                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            };
            insert_spool_row(conn, &spool)?;

            if let Some(location) = input.location.as_deref()
                && !location.trim().is_empty()
            {
                let location_id = resolve_active_generic_location_reference(conn, location)?;
                set_spool_location_row(conn, &spool_id, Some(&location_id))?;
                set_spool_home_location_row(conn, &spool_id, Some(&location_id))?;
                insert_json_history_event(
                    conn,
                    &spool_id,
                    "LOCATION_UPDATED",
                    json!({ "location": location_id }),
                )?;
            }

            insert_json_history_event(
                conn,
                &spool_id,
                "CREATED",
                json!({
                    "status": spool.status,
                    "ownership_type": spool.ownership_type,
                    "vendor": vendor_label,
                }),
            )?;
            if ownership_type_kind.is_borrowed_in() {
                let loan = create_inbound_spool_loan_in_transaction(
                    conn,
                    &spool_id,
                    owner_name.as_deref().unwrap_or(""),
                    owner_contact.as_deref(),
                    ownership_note.as_deref(),
                    spool
                        .remaining_g
                        .or(spool.current_weight_g)
                        .or(spool.initial_weight_g)
                        .unwrap_or(0),
                )?;
                insert_json_history_event(
                    conn,
                    &spool_id,
                    "BORROWED_IN_REGISTERED",
                    json!({
                        "loan_id": loan.id,
                        "ownership_type": spool.ownership_type,
                        "owner_name": spool.owner_name,
                        "owner_contact": spool.owner_contact,
                        "ownership_note": spool.ownership_note,
                        "loan_direction": loan.loan_direction,
                        "counterparty_name": loan.counterparty_name,
                        "grams_out": loan.grams_out,
                        "vendor": input.vendor,
                    }),
                )?;
            }
            Ok(())
        })
    }

    pub fn update_master_catalog_entry(
        &self,
        input: UpdateMasterCatalogEntryInput,
    ) -> InventoryResult<String> {
        let material = input.material.trim();
        let filament_name = input.filament_name.trim();
        let color_name = input.color_name.trim();
        if input.master_id.trim().is_empty()
            || material.is_empty()
            || filament_name.is_empty()
            || color_name.is_empty()
        {
            return Err(InventoryError::Db(
                "master id, material, filament name and color are required".to_string(),
            ));
        }

        self.db
            .update_master_catalog_entry(MasterCatalogUpdateInput {
                master_id: input.master_id.trim(),
                material,
                filament_name,
                color_name,
                hex_color: input.hex_color.as_deref(),
                product_url: input.product_url.as_deref(),
                vendor: input.vendor.as_deref(),
                default_weight: input.default_weight,
            })
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        grams: i64,
        scale_id: Option<&str>,
        source: WeightSource,
    ) -> InventoryResult<()> {
        let effective_scale_id = scale_id.unwrap_or("manual-entry");
        self.db.with_inventory_transaction(|conn| {
            let spool_with_master =
                get_spool_with_master_by_id_row(conn, spool_id)?.ok_or(InventoryError::NotFound)?;
            let tare_g = resolve_spool_tare_weight_g(
                spool_with_master.spool.spool_tare_weight_g,
                Some(spool_with_master.master.vendor.as_str()),
            );
            let filament_grams = (grams - tare_g).max(0);

            ensure_scale_row(conn, effective_scale_id, "Manual Entry", "MANUAL")?;
            update_spool_weight_row(conn, spool_id, Some(filament_grams), Some(filament_grams))?;
            insert_weight_reading_row(
                conn,
                effective_scale_id,
                spool_id,
                filament_grams,
                source.as_str(),
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "WEIGHT_UPDATED",
                json!({
                    "measured_grams": grams,
                    "tare_weight_g": tare_g,
                    "grams": filament_grams,
                    "source": source.as_str()
                }),
            )
        })
    }

    pub fn update_spool_tare_weight(&self, spool_id: &str, grams: i64) -> InventoryResult<()> {
        if grams < 0 {
            return Err(InventoryError::Db(
                "spool tare weight must be zero or greater".to_string(),
            ));
        }
        self.db.with_inventory_transaction(|conn| {
            update_spool_tare_weight_row(conn, spool_id, Some(grams))?;
            insert_json_history_event(
                conn,
                spool_id,
                "TARE_WEIGHT_UPDATED",
                json!({ "tare_weight_g": grams }),
            )
        })
    }

    pub fn update_spool_status(&self, spool_id: &str, status: &str) -> InventoryResult<()> {
        let status_kind = SpoolStatus::from_raw(Some(status));
        let normalized_status = status_kind.as_str();
        self.db.with_inventory_transaction(|conn| {
            if status_kind.is_assigned() && !spool_assigned_to_printer_row(conn, spool_id)? {
                return Err(InventoryError::Db(
                    "assign spool to a printer slot before setting ASSIGNED".to_string(),
                ));
            }
            update_spool_status_row(conn, spool_id, normalized_status)?;
            insert_json_history_event(
                conn,
                spool_id,
                "STATUS_UPDATED",
                json!({ "status": normalized_status }),
            )?;
            if status_kind == SpoolStatus::Empty {
                insert_json_history_event(
                    conn,
                    spool_id,
                    "USED_UP",
                    json!({ "status": normalized_status }),
                )?;
            }
            Ok(())
        })
    }

    pub fn assign_location(
        &self,
        spool_id: &str,
        location_id: Option<&str>,
    ) -> InventoryResult<()> {
        self.db.with_inventory_transaction(|conn| {
            let resolved = match location_id {
                Some(value) if !value.trim().is_empty() => {
                    Some(resolve_active_generic_location_reference(conn, value)?)
                }
                _ => None,
            };
            set_spool_location_row(conn, spool_id, resolved.as_deref())?;
            set_spool_home_location_row(conn, spool_id, resolved.as_deref())?;
            insert_json_history_event(
                conn,
                spool_id,
                "LOCATION_UPDATED",
                json!({ "location": resolved }),
            )
        })
    }

    pub fn update_spool_details(&self, input: UpdateSpoolDetailsInput) -> InventoryResult<()> {
        if input.spool_id.trim().is_empty() {
            return Err(InventoryError::Db("spool id is required".to_string()));
        }
        if input.spool_tare_weight_g.is_some_and(|grams| grams < 0) {
            return Err(InventoryError::Db(
                "spool tare weight must be zero or greater".to_string(),
            ));
        }
        let status_kind = SpoolStatus::from_raw(Some(&input.status));
        let status = status_kind.as_str().to_string();
        let ownership = input.ownership.map(|ownership| {
            (
                OwnershipType::from_raw(Some(ownership.ownership_type.as_str())),
                normalize_optional_input_text(ownership.owner_name.as_deref()),
                normalize_optional_input_text(ownership.owner_contact.as_deref()),
                normalize_optional_input_text(ownership.ownership_note.as_deref()),
            )
        });
        let requested_purchase_metadata = input.purchase_metadata;
        let requested_purchase_price_batch_locked = input.purchase_price_batch_locked;
        self.db.with_inventory_transaction(|conn| {
            if status_kind.is_assigned() && !spool_assigned_to_printer_row(conn, &input.spool_id)? {
                return Err(InventoryError::Db(
                    "assign spool to a printer slot before setting ASSIGNED".to_string(),
                ));
            }
            let existing_spool =
                get_spool_by_id_row(conn, &input.spool_id)?.ok_or(InventoryError::NotFound)?;
            let normalized_purchase_metadata = requested_purchase_metadata
                .map(|metadata| metadata.normalize_for_edit(&existing_spool))
                .transpose()?;
            let resolved_location = resolve_location_update(
                conn,
                input.location.as_deref(),
                existing_spool.location_id.as_deref(),
            )?;
            let has_active_loan = spool_has_active_loan_row(conn, &input.spool_id)?;
            let resolved_home_location = match &input.home_location {
                Some(Some(value)) if !value.trim().is_empty() => resolve_location_update(
                    conn,
                    Some(value.as_str()),
                    existing_spool.home_location_id.as_deref(),
                )?,
                Some(_) => None,
                None => existing_spool.home_location_id.clone(),
            };
            let should_preserve_current_location =
                spool_assigned_to_printer_row(conn, &input.spool_id)?
                    || has_active_loan
                    || SpoolStatus::from_raw(Some(&existing_spool.status)) == SpoolStatus::Borrowed;
            let should_sync_home_to_current_location = input.home_location.is_some()
                && !should_preserve_current_location
                && match (&resolved_location, &existing_spool.location_id) {
                    (Some(requested), Some(existing)) => requested == existing,
                    (None, None) => true,
                    (None, Some(existing)) => existing.trim().is_empty(),
                    _ => false,
                };
            let effective_location =
                if should_preserve_current_location && input.home_location.is_some() {
                    existing_spool.location_id.clone()
                } else if should_sync_home_to_current_location {
                    resolved_home_location.clone()
                } else {
                    resolved_location.clone()
                };
            let common_details_changed = existing_spool.qr_code != input.qr_code
                || existing_spool.status != status
                || existing_spool.location_id != effective_location
                || existing_spool.home_location_id != resolved_home_location;
            if common_details_changed {
                update_spool_details_row(
                    conn,
                    &input.spool_id,
                    input.qr_code.as_deref(),
                    &status,
                    effective_location.as_deref(),
                    resolved_home_location.as_deref(),
                )?;
                insert_json_history_event(
                    conn,
                    &input.spool_id,
                    "DETAILS_UPDATED",
                    json!({
                        "status": status,
                        "qr_code": input.qr_code,
                        "location": effective_location,
                        "home_location": resolved_home_location
                    }),
                )?;
            }
            if let Some(purchase_metadata) = normalized_purchase_metadata {
                let before = PurchaseReceiptMetadata::from_spool(&existing_spool);
                if before != purchase_metadata {
                    update_spool_purchase_metadata_row(conn, &input.spool_id, &purchase_metadata)?;
                    insert_json_history_event(
                        conn,
                        &input.spool_id,
                        "PURCHASE_METADATA_UPDATED",
                        json!({
                            "before": before,
                            "after": purchase_metadata,
                            "initial_weight_g": existing_spool.initial_weight_g,
                        }),
                    )?;
                }
            }
            if requested_purchase_price_batch_locked
                .is_some_and(|locked| locked != existing_spool.purchase_price_batch_locked)
            {
                let locked = requested_purchase_price_batch_locked
                    .expect("lock presence was checked before update");
                set_spool_purchase_price_batch_locked_row(conn, &input.spool_id, locked)?;
                insert_json_history_event(
                    conn,
                    &input.spool_id,
                    "PURCHASE_PRICE_BATCH_LOCK_UPDATED",
                    json!({
                        "before": existing_spool.purchase_price_batch_locked,
                        "after": locked,
                    }),
                )?;
            }
            if let Some(grams) = input.spool_tare_weight_g {
                update_spool_tare_weight_row(conn, &input.spool_id, Some(grams))?;
                insert_json_history_event(
                    conn,
                    &input.spool_id,
                    "TARE_WEIGHT_UPDATED",
                    json!({ "tare_weight_g": grams }),
                )?;
            }
            if let Some((ownership_type, owner_name, owner_contact, ownership_note)) = ownership {
                Self::update_spool_ownership_in_transaction(
                    conn,
                    &input.spool_id,
                    ownership_type,
                    owner_name,
                    owner_contact,
                    ownership_note,
                )?;
            }
            Ok(())
        })
    }

    pub fn update_spool_rfid_tag(&self, input: UpdateSpoolRfidTagInput) -> InventoryResult<()> {
        let spool_id = input.spool_id.trim();
        if spool_id.is_empty() {
            return Err(InventoryError::Db("spool id is required".to_string()));
        }
        let normalized_rfid = normalize_optional_input_text(input.rfid_tag.as_deref());
        let normalized_observed_at =
            normalize_optional_input_text(input.rfid_observed_at.as_deref());
        self.db.with_inventory_transaction(|conn| {
            update_spool_rfid_tag_row(
                conn,
                spool_id,
                normalized_rfid.as_deref(),
                normalized_observed_at.as_deref(),
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "RFID_TAG_UPDATED",
                json!({
                    "rfid_tag": normalized_rfid,
                    "rfid_observed_at": normalized_observed_at,
                }),
            )
        })
    }

    pub fn update_borrowed_in_spool(
        &self,
        input: UpdateBorrowedInSpoolInput,
    ) -> InventoryResult<()> {
        let spool_id = input.spool_id.trim();
        if spool_id.is_empty() {
            return Err(InventoryError::Db("spool id is required".to_string()));
        }

        let owner_name = normalize_optional_input_text(Some(input.owner_name.as_str())).ok_or(
            InventoryError::Db("borrowed-in spools require an owner/counterparty name".to_string()),
        )?;
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());

        self.db.with_inventory_transaction(|conn| {
            let spool =
                get_spool_with_master_by_id_row(conn, spool_id)?.ok_or(InventoryError::NotFound)?;
            if !OwnershipType::from_raw(Some(&spool.spool.ownership_type)).is_borrowed_in() {
                return Err(InventoryError::Db(
                    "this flow only supports borrowed-in spools".to_string(),
                ));
            }

            update_spool_ownership_metadata_row(
                conn,
                spool_id,
                Some(owner_name.as_str()),
                owner_contact.as_deref(),
                ownership_note.as_deref(),
            )?;
            update_active_inbound_spool_loan_counterparty_row(
                conn,
                spool_id,
                owner_name.as_str(),
                owner_contact.as_deref(),
                ownership_note.as_deref(),
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "DETAILS_UPDATED",
                json!({
                    "status": spool.spool.status,
                    "qr_code": spool.spool.qr_code,
                    "location": spool.spool.location_id,
                    "ownership_type": spool.spool.ownership_type,
                    "owner_name": owner_name,
                    "owner_contact": owner_contact,
                    "ownership_note": ownership_note,
                }),
            )
        })
    }

    fn update_spool_ownership_in_transaction(
        conn: &rusqlite::Connection,
        spool_id: &str,
        next_ownership_type_kind: OwnershipType,
        owner_name: Option<String>,
        owner_contact: Option<String>,
        ownership_note: Option<String>,
    ) -> InventoryResult<()> {
        let spool =
            get_spool_with_master_by_id_row(conn, spool_id)?.ok_or(InventoryError::NotFound)?;
        let previous_ownership_type_kind =
            OwnershipType::from_raw(Some(&spool.spool.ownership_type));
        let previous_ownership_type = previous_ownership_type_kind.as_str().to_string();

        if next_ownership_type_kind.is_borrowed_in() {
            let owner_name = owner_name.ok_or(InventoryError::Db(
                "borrowed-in spools require an owner/counterparty name".to_string(),
            ))?;
            if previous_ownership_type_kind.is_borrowed_in() {
                update_spool_ownership_metadata_row(
                    conn,
                    spool_id,
                    Some(owner_name.as_str()),
                    owner_contact.as_deref(),
                    ownership_note.as_deref(),
                )?;
                update_active_inbound_spool_loan_counterparty_row(
                    conn,
                    spool_id,
                    owner_name.as_str(),
                    owner_contact.as_deref(),
                    ownership_note.as_deref(),
                )?;
                return insert_json_history_event(
                    conn,
                    spool_id,
                    "DETAILS_UPDATED",
                    json!({
                        "status": spool.spool.status,
                        "qr_code": spool.spool.qr_code,
                        "location": spool.spool.location_id,
                        "ownership_type": spool.spool.ownership_type,
                        "owner_name": owner_name,
                        "owner_contact": owner_contact,
                        "ownership_note": ownership_note,
                    }),
                );
            }
            if spool_has_active_loan_row(conn, spool_id)? {
                return Err(InventoryError::Db(
                    "finish active loan history before changing ownership".to_string(),
                ));
            }

            update_spool_ownership_row(
                conn,
                spool_id,
                OwnershipType::BorrowedIn.as_str(),
                Some(owner_name.as_str()),
                owner_contact.as_deref(),
                ownership_note.as_deref(),
            )?;
            let grams_out = spool
                .spool
                .remaining_g
                .or(spool.spool.current_weight_g)
                .or(spool.spool.initial_weight_g)
                .unwrap_or(0);
            let loan = create_inbound_spool_loan_in_transaction(
                conn,
                spool_id,
                owner_name.as_str(),
                owner_contact.as_deref(),
                ownership_note.as_deref(),
                grams_out,
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "OWNERSHIP_UPDATED",
                json!({
                    "previous_ownership_type": previous_ownership_type,
                    "ownership_type": OwnershipType::BorrowedIn.as_str(),
                    "owner_name": owner_name,
                    "owner_contact": owner_contact,
                    "ownership_note": ownership_note,
                }),
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "BORROWED_IN_REGISTERED",
                json!({
                    "loan_id": loan.id,
                    "ownership_type": OwnershipType::BorrowedIn.as_str(),
                    "owner_name": owner_name,
                    "owner_contact": owner_contact,
                    "ownership_note": ownership_note,
                    "loan_direction": loan.loan_direction,
                    "counterparty_name": loan.counterparty_name,
                    "grams_out": loan.grams_out,
                }),
            )?;
            return Ok(());
        }

        if find_active_spool_loan_for_direction_row(
            conn,
            spool_id,
            LoanDirection::Outbound.as_str(),
        )?
        .is_some()
        {
            return Err(InventoryError::Db(
                "return loaned-out spool before changing ownership".to_string(),
            ));
        }

        let active_inbound = find_active_spool_loan_for_direction_row(
            conn,
            spool_id,
            LoanDirection::Inbound.as_str(),
        )?;
        update_spool_ownership_row(
            conn,
            spool_id,
            OwnershipType::Owned.as_str(),
            None,
            None,
            None,
        )?;
        insert_json_history_event(
            conn,
            spool_id,
            "OWNERSHIP_UPDATED",
            json!({
                "previous_ownership_type": previous_ownership_type,
                "ownership_type": OwnershipType::Owned.as_str(),
                "owner_name": null,
                "owner_contact": null,
                "ownership_note": null,
            }),
        )?;
        if let Some(active_inbound) = active_inbound {
            let returned_grams = spool
                .spool
                .remaining_g
                .or(spool.spool.current_weight_g)
                .or(spool.spool.initial_weight_g)
                .unwrap_or(0);
            let loan = close_inbound_spool_loan_without_returning_spool_row(
                conn,
                &active_inbound.loan.id,
                returned_grams,
                Some("Ownership changed to owned"),
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "BORROWED_IN_ACQUIRED",
                json!({
                    "loan_id": loan.id,
                    "loan_direction": loan.loan_direction,
                    "counterparty_name": loan.counterparty_name,
                    "returned_grams": loan.returned_grams,
                    "consumed_grams": loan.consumed_grams,
                }),
            )?;
        }
        Ok(())
    }

    pub fn update_spool_ownership(&self, input: UpdateSpoolOwnershipInput) -> InventoryResult<()> {
        let spool_id = input.spool_id.trim();
        if spool_id.is_empty() {
            return Err(InventoryError::Db("spool id is required".to_string()));
        }
        let next_ownership_type_kind = OwnershipType::from_raw(Some(input.ownership_type.as_str()));
        let owner_name = normalize_optional_input_text(input.owner_name.as_deref());
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());

        self.db.with_inventory_transaction(|conn| {
            Self::update_spool_ownership_in_transaction(
                conn,
                spool_id,
                next_ownership_type_kind,
                owner_name,
                owner_contact,
                ownership_note,
            )
        })
    }

    pub fn delete_spool(&self, input: DeleteSpoolInput) -> InventoryResult<()> {
        self.db.with_inventory_transaction(|conn| {
            let snapshot = get_spool_by_id_row(conn, &input.spool_id)?;
            soft_delete_spool_in_transaction(conn, &input.spool_id)?;
            insert_json_history_event(
                conn,
                &input.spool_id,
                "DELETED",
                json!({
                    "reason": input.reason,
                    "snapshot": snapshot
                }),
            )
        })
    }

    pub fn purge_spool(&self, input: PurgeSpoolInput) -> InventoryResult<()> {
        let _ = input.reason;
        self.db.purge_spool(&input.spool_id)
    }

    pub fn list_spool_history(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
        self.db.list_spool_history_events(spool_id, limit)
    }

    pub fn list_spool_usage(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolUsagePointRow>> {
        self.db.list_spool_usage_points(spool_id, limit)
    }

    pub fn create_wishlist_item(&self, input: CreateWishlistItemInput) -> InventoryResult<()> {
        let material = input.material.trim();
        let filament_name = input.filament_name.trim();
        let color_name = input.color_name.trim();
        if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
            return Err(InventoryError::Db(
                "material, filament name and color are required".to_string(),
            ));
        }
        let vendor = input
            .vendor
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Manual")
            .to_string();

        let item = WishlistItemRow {
            id: input.id,
            master_id: input.master_id,
            material: material.to_string(),
            filament_name: filament_name.to_string(),
            color_name: color_name.to_string(),
            vendor,
            status: "WISHLIST".to_string(),
            quantity: input.quantity.unwrap_or(1).max(1),
            note: input
                .note
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            created_at: String::new(),
            updated_at: String::new(),
        };
        self.db.insert_wishlist_item(&item)
    }

    pub fn update_wishlist_item_status(
        &self,
        input: UpdateWishlistStatusInput,
    ) -> InventoryResult<()> {
        let status = input.status.trim().to_uppercase();
        if status != "WISHLIST" && status != "ON_ORDER" && status != "RECEIVED" {
            return Err(InventoryError::InvalidOperation {
                code: "wishlist.status.invalid",
                message: "Wishlist status must be WISHLIST, ON_ORDER, or RECEIVED".to_string(),
            });
        }
        if status == "RECEIVED" {
            return Err(InventoryError::InvalidOperation {
                code: "wishlist.status.received_requires_receipt",
                message: "Receive the remaining rolls to mark a wishlist item as received"
                    .to_string(),
            });
        }
        self.db.update_wishlist_item_status(&input.item_id, &status)
    }

    pub fn receive_wishlist_item(
        &self,
        input: ReceiveWishlistItemInput,
    ) -> InventoryResult<WishlistReceiptResult> {
        self.db.receive_wishlist_item(
            input.item_id.trim(),
            input.quantity,
            input.purchase_metadata.unwrap_or_default(),
        )
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        self.db.delete_wishlist_item(item_id)
    }

    pub fn create_printer(&self, input: CreatePrinterInput) -> InventoryResult<()> {
        self.db.upsert_printer_with_ams(
            &input.id,
            &input.model,
            &input.name,
            input.ams_units.unwrap_or(0),
            input.slots_per_ams.unwrap_or(4),
        )
    }

    pub fn delete_printer(&self, printer_id: &str) -> InventoryResult<()> {
        self.db.delete_printer(printer_id)
    }

    pub fn set_active_printer(&self, printer_id: Option<&str>) -> InventoryResult<()> {
        let normalized_printer_id = Self::normalize_optional_text(printer_id);
        self.db.with_inventory_transaction(|conn| {
            if get_setting_row(conn, "active_printer_id")? == normalized_printer_id {
                return Ok(());
            }

            match normalized_printer_id.as_deref() {
                Some(id) => {
                    if !printer_exists_row(conn, id)? {
                        return Err(InventoryError::NotFound);
                    }
                    set_setting_row(conn, "active_printer_id", id)?;
                }
                None => delete_setting_row(conn, "active_printer_id")?,
            }
            bump_library_domain_revision_row(conn, PRINTERS_REVISION_DOMAIN)
        })
    }

    pub fn get_active_printer(&self) -> InventoryResult<Option<String>> {
        self.db.get_setting("active_printer_id")
    }

    fn normalize_optional_text(value: Option<&str>) -> Option<String> {
        value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }

    pub fn assign_printer_slot(&self, mut input: AssignPrinterSlotInput) -> InventoryResult<()> {
        let (effective_override_tray_uuid, effective_override_color_hex, effective_clear) =
            derive_assign_printer_slot_live_context(&self.db, &input)?;
        input.rfid_override_tray_uuid = effective_override_tray_uuid;
        input.rfid_override_color_hex = effective_override_color_hex;
        input.clear_live_cache_before_next_refresh = Some(effective_clear);

        self.db.with_inventory_transaction(|conn| {
            assign_spool_to_ams_slot_in_transaction(
                conn,
                &input.printer_id,
                &input.slot_id,
                input.spool_id.as_deref(),
                input.rfid_override_tray_uuid.as_deref(),
                input.rfid_override_color_hex.as_deref(),
                effective_clear,
            )?;

            if let Some(spool_id) = input.spool_id {
                insert_json_history_event(
                    conn,
                    &spool_id,
                    "ASSIGNED_TO_AMS",
                    json!({
                        "printer_id": input.printer_id,
                        "slot_id": input.slot_id,
                        "rfid_override_tray_uuid": input.rfid_override_tray_uuid,
                        "rfid_override_color_hex": input.rfid_override_color_hex,
                        "clear_live_cache_before_next_refresh": input.clear_live_cache_before_next_refresh,
                    }),
                )?;
            }

            Ok(())
        })
    }

    pub fn record_print_usage(&self, input: RecordPrintUsageInput) -> InventoryResult<()> {
        self.db.with_inventory_transaction(|conn| {
            if !printer_exists_row(conn, &input.printer_id)? {
                return Err(InventoryError::NotFound);
            }
            if !spool_assigned_to_specific_printer_row(conn, &input.spool_id, &input.printer_id)? {
                return Err(InventoryError::Db(
                    "spool must be assigned to selected printer slot before recording usage"
                        .to_string(),
                ));
            }

            let spool =
                get_spool_by_id_row(conn, &input.spool_id)?.ok_or(InventoryError::NotFound)?;
            let used_grams = input.grams.max(1);
            let base_remaining = spool
                .remaining_g
                .or(spool.current_weight_g)
                .or(spool.initial_weight_g)
                .unwrap_or(0);
            let next_remaining = (base_remaining - used_grams).max(0);
            let next_status = if next_remaining == 0 {
                "EMPTY"
            } else {
                "ASSIGNED"
            };
            let success = input.success.unwrap_or(true);

            insert_print_job_row(
                conn,
                &input.printer_id,
                &input.spool_id,
                input.job_name.as_deref(),
                used_grams,
                success,
            )?;
            ensure_scale_row(conn, "print-job", "Print Job Usage", "VIRTUAL")?;
            update_spool_weight_row(
                conn,
                &input.spool_id,
                Some(next_remaining),
                Some(next_remaining),
            )?;
            insert_weight_reading_row(
                conn,
                "print-job",
                &input.spool_id,
                next_remaining,
                "PRINT_JOB",
            )?;
            update_spool_status_row(conn, &input.spool_id, next_status)?;
            insert_json_history_event(
                conn,
                &input.spool_id,
                "PRINT_JOB_RECORDED",
                json!({
                    "printer_id": input.printer_id,
                    "used_grams": used_grams,
                    "remaining_g": next_remaining,
                    "job_name": input.job_name,
                    "success": success,
                }),
            )
        })
    }

    pub fn accept_bambu_live_weight_estimate(
        &self,
        input: AcceptBambuLiveWeightEstimateInput,
    ) -> InventoryResult<()> {
        let printer_id = required_ams_accept_text(&input.printer_id, "printer id")?;
        let slot_id = required_ams_accept_text(&input.slot_id, "slot id")?;
        let spool_id = required_ams_accept_text(&input.spool_id, "spool id")?;
        let expected_weight_seen_at =
            required_ams_accept_text(&input.expected_weight_seen_at, "weight timestamp")?;
        if input.expected_remaining_grams < 0 || input.expected_current_grams.is_some_and(|v| v < 0)
        {
            return Err(ams_weight_accept_rejected(
                "The weight snapshot is invalid. Refresh printer data and try again.",
            ));
        }

        self.db.with_inventory_transaction(|conn| {
            let slot: Option<(String, i64, Option<String>, Option<String>)> = conn
                .query_row(
                    "SELECT s.ams_id, s.slot_index, s.spool_id, s.live_cache_cleared_at
                     FROM ams_slots s
                     JOIN ams_units u ON u.id = s.ams_id
                     WHERE s.id = ?1 AND u.printer_id = ?2
                     LIMIT 1",
                    params![slot_id, printer_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .optional()?;
            let (ams_id, slot_index, assigned_spool_id, live_cache_cleared_at) =
                slot.ok_or(InventoryError::NotFound)?;
            if assigned_spool_id.as_deref() != Some(spool_id) {
                return Err(ams_weight_accept_rejected(
                    "The loaded spool changed. Refresh printer data and try again.",
                ));
            }

            let spool = get_spool_by_id_row(conn, spool_id)?.ok_or(InventoryError::NotFound)?;
            let current_grams = spool.remaining_g.or(spool.current_weight_g);
            let setting = get_setting_row(conn, &bambu_live_integration_setting_key(printer_id))?
                .ok_or_else(|| {
                    ams_weight_accept_rejected(
                        "Live printer data is unavailable. Refresh printer data and try again.",
                    )
                })?;
            let integration = serde_json::from_str::<
                crate::backend::filament_database::BambuLiveIntegrationRow,
            >(&setting)
            .map_err(|_| {
                ams_weight_accept_rejected(
                    "Live printer data is invalid. Refresh printer data and try again.",
                )
            })?;
            if !integration.enabled {
                return Err(ams_weight_accept_rejected(
                    "Live printer data is disabled. Refresh printer data and try again.",
                ));
            }
            let observed = integration.observed_state.as_ref().ok_or_else(|| {
                ams_weight_accept_rejected(
                    "Live printer data is unavailable. Refresh printer data and try again.",
                )
            })?;
            if !observed.online || !observed.mqtt_connected {
                return Err(ams_weight_accept_rejected(
                    "The printer is not currently connected. Refresh live data and try again.",
                ));
            }
            require_fresh_ams_accept_timestamp(observed.last_seen_at.as_deref())?;
            if observed
                .ams_reading_bits
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "0")
                .is_some()
            {
                return Err(ams_weight_accept_rejected(
                    "The AMS is still reading its slots. Wait for live data to settle and try again.",
                ));
            }
            let tray = observed
                .trays
                .iter()
                .find(|tray| {
                    bambu_live_slot_matches_tray(
                        &ams_id,
                        slot_index,
                        tray.ams_index,
                        tray.tray_index,
                    )
                })
                .ok_or_else(|| {
                    ams_weight_accept_rejected(
                        "The live AMS slot is unavailable. Refresh printer data and try again.",
                    )
                })?;

            if !tray.loaded
                || tray.match_status.as_deref() != Some("clear_match")
                || tray.matched_inventory_mode.as_deref() != Some("exact_rfid")
                || tray.matched_inventory_spool_id.as_deref() != Some(spool_id)
            {
                return Err(ams_weight_accept_rejected(
                    "The live AMS slot no longer has an exact RFID match. Refresh printer data and try again.",
                ));
            }
            let identity_seen_at = tray.last_identity_seen_at.as_deref().ok_or_else(|| {
                ams_weight_accept_rejected(
                    "The live AMS identity has no timestamp. Refresh printer data and try again.",
                )
            })?;
            require_fresh_ams_accept_timestamp(Some(identity_seen_at))?;

            let live_identity = normalized_ams_identity(tray.tray_uuid.as_deref())
                .or_else(|| normalized_ams_identity(tray.observed_rfid_tag.as_deref()))
                .ok_or_else(|| {
                    ams_weight_accept_rejected(
                        "The live AMS identity is unavailable. Refresh printer data and try again.",
                    )
                })?;
            let spool_rfid = normalized_ams_identity(spool.rfid_tag.as_deref()).ok_or_else(|| {
                ams_weight_accept_rejected(
                    "The inventory spool no longer has the matching RFID. Refresh printer data and try again.",
                )
            })?;
            if !live_identity.eq_ignore_ascii_case(spool_rfid) {
                return Err(ams_weight_accept_rejected(
                    "The inventory RFID changed. Refresh printer data and try again.",
                ));
            }
            let mut eligible_match_ids = conn.prepare(
                "SELECT id FROM filament_spools
                 WHERE deleted_at IS NULL
                   AND trim(rfid_tag) COLLATE NOCASE = trim(?1) COLLATE NOCASE
                   AND REPLACE(REPLACE(UPPER(TRIM(COALESCE(status, ''))), '-', '_'), ' ', '_')
                       NOT IN ('LOST', 'MISSING', 'DELETED', 'BORROWED', 'LOANED_OUT', 'LOANED')
                 ORDER BY id
                 LIMIT 2",
            )?;
            let eligible_match_ids = eligible_match_ids
                .query_map(params![live_identity], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            if eligible_match_ids.as_slice() != [spool_id] {
                return Err(ams_weight_accept_rejected(
                    "The RFID match is no longer unique. Refresh printer data and try again.",
                ));
            }

            let weight_seen_at = tray.last_weight_seen_at.as_deref().ok_or_else(|| {
                ams_weight_accept_rejected(
                    "The AMS weight estimate is unavailable. Refresh printer data and try again.",
                )
            })?;
            require_fresh_ams_accept_timestamp(Some(weight_seen_at))?;
            if live_cache_cleared_at.as_deref().is_some_and(|cleared_at| {
                ams_accept_timestamp_is_at_or_before(identity_seen_at, cleared_at)
                    || ams_accept_timestamp_is_at_or_before(weight_seen_at, cleared_at)
            }) {
                return Err(ams_weight_accept_rejected(
                    "The live AMS snapshot predates a manual slot change. Refresh printer data and try again.",
                ));
            }
            let remaining_percent = tray.remaining_percent.filter(|value| (0..=100).contains(value));
            let tray_weight_g = tray.tray_weight_g.filter(|value| (1..=100_000).contains(value));
            let derived_remaining_grams = remaining_percent
                .zip(tray_weight_g)
                .and_then(|(percent, weight)| {
                    weight
                        .checked_mul(percent)?
                        .checked_add(50)
                        .map(|grams| grams / 100)
                })
                .ok_or_else(|| {
                    ams_weight_accept_rejected(
                        "The AMS weight estimate is invalid. Refresh printer data and try again.",
                    )
                })?;
            if tray.remaining_grams != Some(derived_remaining_grams)
                || weight_seen_at != expected_weight_seen_at
                || derived_remaining_grams != input.expected_remaining_grams
            {
                return Err(ams_weight_accept_rejected(
                    "The AMS weight estimate changed. Refresh printer data and try again.",
                ));
            }

            if current_grams == Some(derived_remaining_grams) {
                return Ok(());
            }
            if current_grams != input.expected_current_grams {
                return Err(ams_weight_accept_rejected(
                    "The stored spool weight changed. Refresh printer data and try again.",
                ));
            }

            ensure_scale_row(conn, "bambu-ams", "Bambu AMS", "VIRTUAL")?;
            update_spool_weight_row(
                conn,
                spool_id,
                Some(derived_remaining_grams),
                Some(derived_remaining_grams),
            )?;
            update_spool_status_row(conn, spool_id, "ASSIGNED")?;
            insert_weight_reading_row(
                conn,
                "bambu-ams",
                spool_id,
                derived_remaining_grams,
                "BAMBU_AMS_ACCEPTED",
            )?;
            insert_json_history_event(
                conn,
                spool_id,
                "WEIGHT_CORRECTED",
                json!({
                    "source": "BAMBU_AMS_ACCEPTED",
                    "reason": "accepted_ams_estimate",
                    "previous_grams": current_grams,
                    "grams": derived_remaining_grams,
                    "printer_id": printer_id,
                    "slot_id": slot_id,
                    "remaining_percent": remaining_percent,
                    "tray_weight_g": tray_weight_g,
                    "observed_at": weight_seen_at,
                }),
            )
        })
    }

    pub fn lend_spool(&self, input: LendSpoolInput) -> InventoryResult<SpoolLoanRow> {
        self.db.with_inventory_transaction(|conn| {
            let spool =
                get_spool_by_id_row(conn, &input.spool_id)?.ok_or(InventoryError::NotFound)?;
            if OwnershipType::from_raw(Some(&spool.ownership_type)).is_borrowed_in() {
                return Err(InventoryError::Db(
                    "borrowed-in spools cannot be loaned out".to_string(),
                ));
            }
            let grams_out = input
                .grams_out
                .unwrap_or_else(|| {
                    spool
                        .remaining_g
                        .or(spool.current_weight_g)
                        .or(spool.initial_weight_g)
                        .unwrap_or(0)
                })
                .max(0);
            let loan = create_spool_loan_in_transaction(
                conn,
                &input.spool_id,
                &input.borrower_name,
                input.counterparty_contact.as_deref(),
                grams_out,
                input.note.as_deref(),
                input.expected_return_at.as_deref(),
            )?;
            insert_json_history_event(
                conn,
                &input.spool_id,
                "LOANED_OUT",
                json!({
                    "loan_id": loan.id,
                    "loan_direction": loan.loan_direction,
                    "borrower_name": loan.borrower_name,
                    "counterparty_name": loan.counterparty_name,
                    "counterparty_contact": loan.counterparty_contact,
                    "grams_out": loan.grams_out,
                    "note": loan.lent_note,
                    "expected_return_at": loan.expected_return_at,
                }),
            )?;
            Ok(loan)
        })
    }

    pub fn return_spool_loan(&self, input: ReturnSpoolLoanInput) -> InventoryResult<SpoolLoanRow> {
        self.db.with_inventory_transaction(|conn| {
            let loan = return_spool_loan_in_transaction(
                conn,
                &input.loan_id,
                input.returned_grams,
                input.note.as_deref(),
            )?;
            insert_json_history_event(
                conn,
                &loan.spool_id,
                "LOAN_RETURNED",
                json!({
                    "loan_id": loan.id,
                    "loan_direction": loan.loan_direction,
                    "borrower_name": loan.borrower_name,
                    "counterparty_name": loan.counterparty_name,
                    "grams_out": loan.grams_out,
                    "returned_grams": loan.returned_grams,
                    "consumed_grams": loan.consumed_grams,
                    "note": loan.return_note,
                }),
            )?;
            Ok(loan)
        })
    }

    pub fn return_inbound_spool_loan(
        &self,
        input: ReturnSpoolLoanInput,
    ) -> InventoryResult<SpoolLoanRow> {
        self.db.with_inventory_transaction(|conn| {
            let loan = return_inbound_spool_loan_in_transaction(
                conn,
                &input.loan_id,
                input.returned_grams,
                input.note.as_deref(),
            )?;
            insert_json_history_event(
                conn,
                &loan.spool_id,
                "BORROWED_IN_RETURNED",
                json!({
                    "loan_id": loan.id,
                    "loan_direction": loan.loan_direction,
                    "borrower_name": loan.borrower_name,
                    "counterparty_name": loan.counterparty_name,
                    "returned_grams": loan.returned_grams,
                    "consumed_grams": loan.consumed_grams,
                    "note": loan.return_note,
                }),
            )?;
            Ok(loan)
        })
    }

    pub fn reset_app_state(&self) -> InventoryResult<()> {
        self.db.reset_app_state_data()
    }

    pub fn reset_catalogs(&self) -> InventoryResult<CatalogResetStats> {
        self.db.reset_catalog_data()
    }

    pub fn export_loans_csv(&self, include_returned: bool) -> InventoryResult<String> {
        self.db.export_loans_csv(include_returned)
    }

    pub fn export_loans_csv_for_direction(
        &self,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<String> {
        let normalized = direction
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("OUTBOUND")
            .to_uppercase();
        if normalized == "OUTBOUND" {
            return self.export_loans_csv(include_returned);
        }
        self.db
            .export_loans_csv_for_direction(include_returned, direction)
    }

    pub fn find_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        self.db.get_spool_by_qr(qr_code)
    }
}

fn resolve_location_update(
    conn: &rusqlite::Connection,
    requested: Option<&str>,
    existing_id: Option<&str>,
) -> InventoryResult<Option<String>> {
    let Some(requested) = requested.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if let Some(existing_id) = existing_id
        && location_reference_matches(conn, existing_id, requested)?
    {
        return Ok(Some(existing_id.to_string()));
    }
    Ok(Some(resolve_active_generic_location_reference(
        conn, requested,
    )?))
}

fn insert_json_history_event(
    conn: &rusqlite::Connection,
    spool_id: &str,
    event_type: &str,
    payload: serde_json::Value,
) -> InventoryResult<()> {
    let payload_json =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    insert_spool_history_event_row(conn, spool_id, event_type, &payload_json)
}

fn required_ams_accept_text<'a>(value: &'a str, field: &str) -> InventoryResult<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        Err(ams_weight_accept_rejected(&format!(
            "The {field} is required. Refresh printer data and try again."
        )))
    } else {
        Ok(value)
    }
}

fn normalized_ams_identity(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn require_fresh_ams_accept_timestamp(value: Option<&str>) -> InventoryResult<()> {
    let observed_at = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
        .ok_or_else(|| {
            ams_weight_accept_rejected(
                "The live AMS observation has no valid timestamp. Refresh printer data and try again.",
            )
        })?;
    let age = OffsetDateTime::now_utc() - observed_at;
    if age < -TimeDuration::seconds(5) || age > TimeDuration::minutes(10) {
        return Err(ams_weight_accept_rejected(
            "The live AMS observation is stale. Refresh printer data and try again.",
        ));
    }
    Ok(())
}

fn ams_accept_timestamp_is_at_or_before(observed_at: &str, cleared_at: &str) -> bool {
    let observed_at = OffsetDateTime::parse(observed_at.trim(), &Rfc3339);
    let cleared_at = OffsetDateTime::parse(cleared_at.trim(), &Rfc3339).or_else(|_| {
        OffsetDateTime::parse(
            &format!("{}Z", cleared_at.trim().replace(' ', "T")),
            &Rfc3339,
        )
    });
    match (observed_at, cleared_at) {
        (Ok(observed_at), Ok(cleared_at)) => observed_at <= cleared_at,
        _ => true,
    }
}

fn ams_weight_accept_rejected(message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "bambu_live.weight_estimate_changed",
        message: message.to_string(),
    }
}

fn compute_remaining(initial_weight_g: Option<i64>, current_weight_g: Option<i64>) -> Option<i64> {
    if let Some(current) = current_weight_g {
        Some(current)
    } else {
        initial_weight_g
    }
}

fn default_spool_tare_for_vendor(vendor: Option<&str>) -> Option<i64> {
    let normalized = vendor.unwrap_or("").trim().to_ascii_lowercase();
    if normalized.contains("bambu") {
        return Some(250);
    }
    if normalized.contains("esun") {
        return Some(224);
    }
    None
}

fn resolve_spool_tare_weight_g(explicit_tare: Option<i64>, vendor: Option<&str>) -> i64 {
    explicit_tare
        .or_else(|| default_spool_tare_for_vendor(vendor))
        .unwrap_or(0)
        .max(0)
}

pub(super) fn normalize_optional_input_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.to_string())
}

#[cfg(test)]
#[path = "inventory_engine_tests.rs"]
mod tests;
