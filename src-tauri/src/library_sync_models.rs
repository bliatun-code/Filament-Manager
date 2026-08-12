use crate::backend::filament_database::{
    LibraryDomainRevisions, PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow,
    WishlistItemRow,
};
use crate::backend::statistics::InventoryOverview;
use crate::optional_update::OptionalUpdate;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub(crate) struct SaveLibrarySyncSettingsInput {
    pub(crate) mode: String,
    pub(crate) device_name: String,
    pub(crate) library_id: String,
    pub(crate) host_base_url: Option<String>,
    pub(crate) host_device_name: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ValidateLibrarySyncHostInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSpoolListInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) limit: Option<i64>,
    pub(crate) offset: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SaveLibrarySyncSpoolCacheInput {
    pub(crate) rows: Vec<SpoolWithMasterRow>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncFilamentConsumptionInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) limit: Option<i64>,
    pub(crate) printer_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSpoolDetailInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) history_limit: Option<i64>,
    pub(crate) usage_limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct PairLibrarySyncHostInput {
    pub(crate) base_url: String,
    pub(crate) pairing_token_or_url: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncWeightWriteInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) grams: i64,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateSpoolDetailsInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) qr_code: Option<String>,
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) location: OptionalUpdate<String>,
    #[serde(default)]
    pub(crate) home_location: OptionalUpdate<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateSpoolOwnershipInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) ownership_type: String,
    pub(crate) owner_name: Option<String>,
    pub(crate) owner_contact: Option<String>,
    pub(crate) ownership_note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateSpoolRfidTagInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) rfid_tag: Option<String>,
    pub(crate) rfid_observed_at: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncAssignPrinterSlotInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) printer_id: String,
    pub(crate) slot_id: String,
    pub(crate) spool_id: Option<String>,
    pub(crate) rfid_override_tray_uuid: Option<String>,
    pub(crate) rfid_override_color_hex: Option<String>,
    pub(crate) clear_live_cache_before_next_refresh: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncRecordPrintUsageInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) printer_id: String,
    pub(crate) spool_id: String,
    pub(crate) grams: i64,
    pub(crate) job_name: Option<String>,
    pub(crate) success: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncAcceptBambuLiveWeightEstimateInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) printer_id: String,
    pub(crate) slot_id: String,
    pub(crate) spool_id: String,
    pub(crate) expected_weight_seen_at: String,
    pub(crate) expected_remaining_grams: i64,
    pub(crate) expected_current_grams: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncReturnLoanInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) loan_id: String,
    pub(crate) returned_grams: i64,
    pub(crate) note: Option<String>,
    pub(crate) inbound: bool,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncLendSpoolInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) borrower_name: String,
    pub(crate) grams_out: i64,
    pub(crate) note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCatalogListInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) limit: Option<i64>,
    pub(crate) search: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateMasterCatalogEntryInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) master_id: String,
    pub(crate) material: String,
    pub(crate) filament_name: String,
    pub(crate) color_name: String,
    pub(crate) hex_color: Option<String>,
    pub(crate) product_url: Option<String>,
    pub(crate) vendor: Option<String>,
    pub(crate) default_weight: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncRefreshCatalogInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) vendor: String,
    pub(crate) material_types: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncWishlistListInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) limit: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct LibrarySyncFullBackupResponse {
    pub(crate) content: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct LibrarySyncDomainRevisionsResponse {
    pub(crate) library_id: String,
    #[serde(flatten)]
    pub(crate) revisions: LibraryDomainRevisions,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateSpoolInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) master_id: Option<String>,
    pub(crate) material: Option<String>,
    pub(crate) filament_name: Option<String>,
    pub(crate) color_name: Option<String>,
    pub(crate) vendor: Option<String>,
    pub(crate) initial_weight_g: Option<i64>,
    pub(crate) location: Option<String>,
    pub(crate) hex_color: Option<String>,
    pub(crate) ownership_type: Option<String>,
    pub(crate) owner_name: Option<String>,
    pub(crate) owner_contact: Option<String>,
    pub(crate) ownership_note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateWishlistItemInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) master_id: Option<String>,
    pub(crate) vendor: String,
    pub(crate) material: String,
    pub(crate) filament_name: String,
    pub(crate) color_name: String,
    pub(crate) quantity: Option<i64>,
    pub(crate) note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncUpdateWishlistStatusInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) item_id: String,
    pub(crate) status: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncReceiveWishlistItemInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) item_id: String,
    pub(crate) quantity: i64,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeleteWishlistItemInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) item_id: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreatePrinterInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) id: String,
    pub(crate) model: String,
    pub(crate) name: String,
    pub(crate) ams_units: Option<i64>,
    pub(crate) slots_per_ams: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSaveBambuLiveIntegrationInput {}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeleteBambuLiveIntegrationInput {}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeletePrinterInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) printer_id: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncDeleteSpoolInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) spool_id: String,
    pub(crate) reason: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct LibrarySyncHostValidationResult {
    pub(crate) base_url: String,
    pub(crate) reachable: bool,
    pub(crate) ok: bool,
    pub(crate) matches_library_id: bool,
    pub(crate) pairing_checked: bool,
    pub(crate) pairing_valid: bool,
    pub(crate) api_version: Option<String>,
    pub(crate) auth_mode: Option<String>,
    pub(crate) access_mode: Option<String>,
    pub(crate) library_id: Option<String>,
    pub(crate) device_name: Option<String>,
    pub(crate) sync_mode: Option<String>,
    pub(crate) message: String,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncSnapshotResponse {
    pub(crate) ok: bool,
    pub(crate) captured_at: String,
    pub(crate) library_id: String,
    pub(crate) device_name: String,
    pub(crate) sync_mode: String,
    pub(crate) inventory: InventoryOverview,
    pub(crate) active_loans: i64,
    pub(crate) printers: i64,
}

#[derive(Deserialize)]
pub(crate) struct LibrarySyncCreateSpoolResponse {
    pub(crate) ok: bool,
    pub(crate) message: String,
    pub(crate) spool_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncRemoteSnapshot {
    pub(crate) captured_at: String,
    pub(crate) library_id: String,
    pub(crate) device_name: String,
    pub(crate) sync_mode: String,
    pub(crate) inventory: InventoryOverview,
    pub(crate) total_spools: i64,
    pub(crate) in_use: i64,
    pub(crate) low_stock: i64,
    pub(crate) active_loans: i64,
    pub(crate) printers: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedSpoolList {
    pub(crate) captured_at: String,
    pub(crate) rows: Vec<SpoolWithMasterRow>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedPrinterOverview {
    pub(crate) captured_at: String,
    pub(crate) rows: Vec<PrinterOverviewRow>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedLoanList {
    pub(crate) captured_at: String,
    pub(crate) rows: Vec<SpoolLoanDetailsRow>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LibrarySyncCachedWishlistList {
    pub(crate) captured_at: String,
    pub(crate) rows: Vec<WishlistItemRow>,
}
