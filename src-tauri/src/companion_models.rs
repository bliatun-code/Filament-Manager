use crate::backend::filament_database::{BambuLiveIntegrationEntryRow, PrinterRow, SpoolLoanRow};
use crate::backend::statistics::InventoryOverview;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Default)]
pub(crate) struct PaginationQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) offset: Option<i64>,
}

#[derive(Deserialize, Default)]
pub(crate) struct CatalogListQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) search: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct QrLookupQuery {
    pub(crate) qr_code: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct LoanListQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) include_returned: Option<bool>,
    pub(crate) direction: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct CompanionPrinterSettingsResponse {
    pub(crate) active_printer_id: Option<String>,
    pub(crate) printers: Vec<PrinterRow>,
    pub(crate) printer_models: Vec<String>,
    pub(crate) bambu_live_integrations: Vec<BambuLiveIntegrationEntryRow>,
}

#[derive(Deserialize, Default)]
pub(crate) struct FilamentConsumptionQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) printer_id: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct SpoolDetailQuery {
    pub(crate) history_limit: Option<i64>,
    pub(crate) usage_limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateWeightRequest {
    pub(crate) grams: i64,
}

#[derive(Deserialize)]
pub(crate) struct UpdateSpoolTareWeightRequest {
    pub(crate) grams: i64,
}

#[derive(Deserialize)]
pub(crate) struct UpdateSpoolRfidTagRequest {
    pub(crate) rfid_tag: Option<String>,
    pub(crate) rfid_observed_at: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct DeleteSpoolRequest {
    pub(crate) reason: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdatePrinterSlotAssignmentRequest {
    pub(crate) spool_id: Option<String>,
    pub(crate) rfid_override_tray_uuid: Option<String>,
    pub(crate) rfid_override_color_hex: Option<String>,
    pub(crate) clear_live_cache_before_next_refresh: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct RecordPrintUsageRequest {
    pub(crate) grams: i64,
    pub(crate) job_name: Option<String>,
    pub(crate) success: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct CreateSpoolLoanRequest {
    pub(crate) borrower_name: String,
    pub(crate) grams_out: Option<i64>,
    pub(crate) note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateOwnedSpoolRequest {
    pub(crate) master_id: Option<String>,
    pub(crate) material: Option<String>,
    pub(crate) filament_name: Option<String>,
    pub(crate) color_name: Option<String>,
    pub(crate) vendor: Option<String>,
    pub(crate) initial_weight_g: Option<i64>,
    pub(crate) qr_code: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) hex_color: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateBorrowedInSpoolRequest {
    pub(crate) master_id: Option<String>,
    pub(crate) owner_name: String,
    pub(crate) owner_contact: Option<String>,
    pub(crate) ownership_note: Option<String>,
    pub(crate) material: Option<String>,
    pub(crate) filament_name: Option<String>,
    pub(crate) color_name: Option<String>,
    pub(crate) vendor: Option<String>,
    pub(crate) initial_weight_g: Option<i64>,
    pub(crate) qr_code: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) hex_color: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateWishlistItemRequest {
    pub(crate) master_id: Option<String>,
    pub(crate) material: String,
    pub(crate) filament_name: String,
    pub(crate) color_name: String,
    pub(crate) vendor: Option<String>,
    pub(crate) quantity: Option<i64>,
    pub(crate) note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateWishlistItemStatusRequest {
    pub(crate) status: String,
}

#[derive(Deserialize)]
pub(crate) struct SetActivePrinterRequest {
    pub(crate) printer_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateBorrowedInSpoolRequest {
    pub(crate) owner_name: String,
    pub(crate) owner_contact: Option<String>,
    pub(crate) ownership_note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateSpoolDetailsRequest {
    pub(crate) status: String,
    pub(crate) location: Option<String>,
    pub(crate) home_location: Option<Option<String>>,
}

#[derive(Deserialize)]
pub(crate) struct ReturnSpoolLoanRequest {
    pub(crate) returned_grams: i64,
    pub(crate) note: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct PairSessionRequest {
    pub(crate) pairing_token: String,
}

#[derive(Serialize)]
pub(crate) struct CompanionHealthResponse {
    pub(crate) ok: bool,
    pub(crate) api_version: &'static str,
    pub(crate) auth_mode: String,
    pub(crate) access_mode: &'static str,
    pub(crate) library_id: String,
    pub(crate) device_name: String,
    pub(crate) sync_mode: String,
}

#[derive(Serialize)]
pub(crate) struct CompanionLibrarySnapshotResponse {
    pub(crate) ok: bool,
    pub(crate) captured_at: String,
    pub(crate) library_id: String,
    pub(crate) device_name: String,
    pub(crate) sync_mode: String,
    pub(crate) inventory: InventoryOverview,
    pub(crate) active_loans: i64,
    pub(crate) printers: i64,
}

#[derive(Serialize)]
pub(crate) struct WriteResponse {
    pub(crate) ok: bool,
    pub(crate) message: String,
}

#[derive(Serialize)]
pub(crate) struct SessionStatusResponse {
    pub(crate) ok: bool,
    pub(crate) auth_mode: String,
    pub(crate) access_mode: String,
    pub(crate) authenticated: bool,
    pub(crate) csrf_token: Option<String>,
    pub(crate) can_renew: bool,
}

#[derive(Serialize)]
pub(crate) struct LoanWriteResponse {
    pub(crate) ok: bool,
    pub(crate) message: String,
    pub(crate) loan: SpoolLoanRow,
}

#[derive(Serialize)]
pub(crate) struct CreateSpoolResponse {
    pub(crate) ok: bool,
    pub(crate) message: String,
    pub(crate) spool_id: String,
}
