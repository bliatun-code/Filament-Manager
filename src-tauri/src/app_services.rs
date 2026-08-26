use crate::active_library_gateway::require_authoritative_local_mode;
use crate::backend::database_result::{InventoryError, InventoryResult};
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, BambuLiveIntegrationEntryRow, BambuLiveObservedTrayRow, FilamentDatabase,
    FilamentMasterCatalogRow, FilamentPriceBatchInput, FilamentPriceBatchReceipt,
    FilamentStandardsSettings, FilamentStandardsSnapshot, PrinterOverviewRow, SpoolHistoryEventRow,
    SpoolLoanDetailsRow, SpoolLoanRow, SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow,
    WishlistItemRow, WishlistReceiptResult,
};
use crate::backend::inventory_domain::OwnershipType;
use crate::backend::inventory_engine::{
    AcceptBambuLiveWeightEstimateInput, AssignPrinterSlotInput, CreateManualSpoolInput,
    CreatePrinterInput, CreateSpoolInput, CreateWishlistItemInput, DeleteSpoolInput,
    InventoryBulkMutationInput, InventoryBulkMutationResult, InventoryEngine, LendSpoolInput,
    PurgeSpoolInput, ReceiveWishlistItemInput, RecordPrintUsageInput, ReturnSpoolLoanInput,
    UpdateBorrowedInSpoolInput, UpdateMasterCatalogEntryInput, UpdateSpoolDetailsInput,
    UpdateSpoolOwnershipInput, UpdateWishlistStatusInput, WeightSource,
};
use crate::backend::printer_slot_live_mapping::{
    bambu_live_active_tray_matches_slot, bambu_live_slot_matches_tray, is_external_slot_id,
};
use crate::backend::statistics::InventoryOverview;
use crate::catalog_commands::{
    refresh_bambu_catalog_blocking, refresh_esun_catalog_blocking, CatalogRefreshResult,
};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use serde::{Deserialize, Serialize};

const DEFAULT_SPOOL_HISTORY_LIMIT: i64 = 80;
const DEFAULT_SPOOL_USAGE_LIMIT: i64 = 300;
const BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX: i64 = 255;
const BAMBU_SECONDARY_EXTERNAL_TRAY_INDEX: i64 = 254;

#[derive(Clone)]
pub struct CompanionService {
    db_path: String,
    authority_binding: CompanionAuthorityBinding,
}

#[derive(Clone)]
enum CompanionAuthorityBinding {
    CurrentLibrary,
    ServerLibrary(Option<CompanionAuthorityIdentity>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CompanionAuthorityIdentity {
    library_id: String,
    target_generation: u64,
    credential_profile_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CompanionSpoolDetail {
    pub spool: SpoolWithMasterRow,
    pub history: Vec<SpoolHistoryEventRow>,
    pub usage: Vec<SpoolUsagePointRow>,
    pub active_loan: Option<ActiveSpoolLoanRow>,
}

#[derive(Clone, Debug)]
pub struct CompanionLibrarySnapshot {
    pub sync_settings: crate::backend::filament_database::LibrarySyncSettingsRow,
    pub inventory: InventoryOverview,
    pub active_loans: i64,
    pub printers: i64,
    pub captured_at: String,
}

impl CompanionService {
    pub fn new(db_path: impl Into<String>) -> Self {
        Self {
            db_path: db_path.into(),
            authority_binding: CompanionAuthorityBinding::CurrentLibrary,
        }
    }

    pub(crate) fn new_bound_to_current_library(db_path: impl Into<String>) -> Self {
        let db_path = db_path.into();
        let authority_binding =
            lock_secure_credential_mutation()
                .ok()
                .and_then(|_authority_gate| {
                    let db = FilamentDatabase::open(&db_path).ok()?;
                    capture_companion_authority_identity(&db).ok()
                });
        Self {
            db_path,
            authority_binding: CompanionAuthorityBinding::ServerLibrary(authority_binding),
        }
    }

    pub(crate) fn require_bound_authority(&self) -> InventoryResult<()> {
        let _authority_gate = lock_secure_credential_mutation().map_err(authority_error)?;
        let db = FilamentDatabase::open(&self.db_path)?;
        self.require_authority_under_gate(&db)
    }

    pub(crate) fn require_authority_under_gate(
        &self,
        db: &FilamentDatabase,
    ) -> InventoryResult<()> {
        let current = capture_companion_authority_identity(db)?;
        match &self.authority_binding {
            CompanionAuthorityBinding::CurrentLibrary => Ok(()),
            CompanionAuthorityBinding::ServerLibrary(Some(expected)) if expected == &current => {
                Ok(())
            }
            CompanionAuthorityBinding::ServerLibrary(_) => Err(authority_error(
                "The authoritative library changed after this Companion server started."
                    .to_string(),
            )),
        }
    }

    pub fn list_spools(&self, limit: i64, offset: i64) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        self.with_inventory(|engine| engine.list_spools(limit, offset))
    }

    pub fn list_master_catalog(
        &self,
        limit: i64,
        search: Option<&str>,
    ) -> InventoryResult<Vec<FilamentMasterCatalogRow>> {
        let db = FilamentDatabase::open(&self.db_path)?;
        db.list_master_catalog(limit, search)
    }

    pub fn update_master_catalog_entry(
        &self,
        input: UpdateMasterCatalogEntryInput,
    ) -> InventoryResult<String> {
        self.with_authoritative_inventory(|engine| engine.update_master_catalog_entry(input))
    }

    pub fn refresh_bambu_catalog(
        &self,
        material_types: Option<Vec<String>>,
    ) -> Result<CatalogRefreshResult, String> {
        self.with_authoritative_write(|| {
            refresh_bambu_catalog_blocking(&self.db_path, material_types, None)
        })
    }

    pub fn refresh_esun_catalog(
        &self,
        material_types: Option<Vec<String>>,
    ) -> Result<CatalogRefreshResult, String> {
        self.with_authoritative_write(|| {
            refresh_esun_catalog_blocking(&self.db_path, material_types, None)
        })
    }

    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        self.with_inventory(|engine| engine.list_wishlist_items(limit))
    }

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        let db = FilamentDatabase::open(&self.db_path)?;
        let (rows, integrations) = db.with_read_transaction(|snapshot| {
            Ok((
                snapshot.list_printer_overview()?,
                snapshot.list_bambu_live_integrations()?,
            ))
        })?;
        Ok(enrich_printer_overview_with_live_slots(rows, &integrations))
    }

    pub fn library_snapshot(&self) -> InventoryResult<CompanionLibrarySnapshot> {
        let db = FilamentDatabase::open(&self.db_path)?;
        // The legacy settings getter initializes a missing library ID. Do that
        // before opening the read snapshot so the callback remains read-only.
        db.get_library_sync_library_id()?;
        db.with_read_transaction(|snapshot| {
            Ok(CompanionLibrarySnapshot {
                sync_settings: snapshot.get_library_sync_settings()?,
                inventory: snapshot.inventory_overview()?,
                active_loans: snapshot.list_active_spool_loans()?.len() as i64,
                printers: snapshot.list_printer_overview()?.len() as i64,
                captured_at: snapshot.sqlite_now()?,
            })
        })
    }

    pub fn list_active_spool_loans(&self) -> InventoryResult<Vec<ActiveSpoolLoanRow>> {
        self.with_inventory(|engine| engine.list_active_spool_loans())
    }

    pub fn list_spool_loans(
        &self,
        limit: i64,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        self.with_inventory(|engine| {
            engine.list_spool_loans_for_direction(limit, include_returned, direction)
        })
    }

    pub fn list_spool_history(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolHistoryEventRow>> {
        self.with_inventory(|engine| engine.list_spool_history(spool_id, limit))
    }

    pub fn list_spool_usage(
        &self,
        spool_id: &str,
        limit: i64,
    ) -> InventoryResult<Vec<SpoolUsagePointRow>> {
        self.with_inventory(|engine| engine.list_spool_usage(spool_id, limit))
    }

    pub fn get_spool(&self, spool_id: &str) -> InventoryResult<Option<SpoolWithMasterRow>> {
        self.with_inventory(|engine| engine.get_spool_with_master(spool_id))
    }

    pub fn find_spool_row_by_qr_or_id(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        self.with_inventory(|engine| {
            if let Some(spool) = engine.find_spool_by_qr(qr_code)? {
                Ok(Some(spool))
            } else {
                Ok(engine
                    .get_spool_with_master(qr_code)?
                    .map(|detail| detail.spool))
            }
        })
    }

    pub fn find_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolWithMasterRow>> {
        self.with_inventory(|engine| {
            if let Some(spool) = engine.find_spool_by_qr(qr_code)? {
                engine.get_spool_with_master(&spool.id)
            } else {
                engine.get_spool_with_master(qr_code)
            }
        })
    }

    pub fn get_spool_detail(
        &self,
        spool_id: &str,
        history_limit: Option<i64>,
        usage_limit: Option<i64>,
    ) -> InventoryResult<CompanionSpoolDetail> {
        let history_limit = history_limit
            .unwrap_or(DEFAULT_SPOOL_HISTORY_LIMIT)
            .clamp(1, 250);
        let usage_limit = usage_limit
            .unwrap_or(DEFAULT_SPOOL_USAGE_LIMIT)
            .clamp(1, 1_000);

        let db = FilamentDatabase::open(&self.db_path)?;
        db.with_read_transaction(|snapshot| {
            let spool = snapshot
                .get_spool_with_master_by_id(spool_id)?
                .ok_or(InventoryError::NotFound)?;
            let history = snapshot.list_spool_history_events(spool_id, history_limit)?;
            let usage = snapshot.list_spool_usage_points(spool_id, usage_limit)?;
            let outbound_active_loan = snapshot
                .list_active_spool_loans()?
                .into_iter()
                .find(|row| row.loan.spool_id == spool_id);
            let active_loan = if outbound_active_loan.is_some()
                || !OwnershipType::from_raw(Some(&spool.spool.ownership_type)).is_borrowed_in()
            {
                outbound_active_loan
            } else {
                snapshot.find_active_spool_loan_for_direction(spool_id, "INBOUND")?
            };

            Ok(CompanionSpoolDetail {
                spool,
                history,
                usage,
                active_loan,
            })
        })
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        grams: i64,
        scale_id: Option<&str>,
        source: WeightSource,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| {
            engine.update_spool_weight(spool_id, grams, scale_id, source)
        })
    }

    pub fn update_spool_tare_weight(&self, spool_id: &str, grams: i64) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_spool_tare_weight(spool_id, grams))
    }

    pub fn delete_spool(&self, input: DeleteSpoolInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.delete_spool(input))
    }

    pub fn purge_spool(&self, input: PurgeSpoolInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.purge_spool(input))
    }

    pub fn create_manual_spool(&self, input: CreateManualSpoolInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.create_manual_spool(input))
    }

    pub fn create_spool(&self, input: CreateSpoolInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.create_spool(input))
    }

    pub fn create_wishlist_item(&self, input: CreateWishlistItemInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.create_wishlist_item(input))
    }

    pub fn update_wishlist_item_status(
        &self,
        input: UpdateWishlistStatusInput,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_wishlist_item_status(input))
    }

    pub fn receive_wishlist_item(
        &self,
        input: ReceiveWishlistItemInput,
    ) -> InventoryResult<WishlistReceiptResult> {
        self.with_authoritative_inventory(|engine| engine.receive_wishlist_item(input))
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.delete_wishlist_item(item_id))
    }

    pub fn update_borrowed_in_spool(
        &self,
        input: UpdateBorrowedInSpoolInput,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_borrowed_in_spool(input))
    }

    pub fn update_spool_ownership(&self, input: UpdateSpoolOwnershipInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_spool_ownership(input))
    }

    pub fn update_spool_details(&self, input: UpdateSpoolDetailsInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_spool_details(input))
    }

    pub fn execute_inventory_bulk_mutation(
        &self,
        input: InventoryBulkMutationInput,
    ) -> InventoryResult<InventoryBulkMutationResult> {
        self.with_authoritative_inventory(|engine| engine.execute_bulk_inventory_mutation(input))
    }

    pub fn get_filament_standards(&self) -> InventoryResult<FilamentStandardsSnapshot> {
        self.with_inventory(|engine| engine.get_filament_standards())
    }

    pub fn save_filament_standards(
        &self,
        settings: FilamentStandardsSettings,
    ) -> InventoryResult<FilamentStandardsSnapshot> {
        self.with_authoritative_inventory(|engine| engine.save_filament_standards(settings))
    }

    pub fn apply_filament_price_batch(
        &self,
        input: FilamentPriceBatchInput,
    ) -> InventoryResult<FilamentPriceBatchReceipt> {
        self.with_authoritative_inventory(|engine| engine.apply_filament_price_batch(input))
    }

    pub fn update_spool_rfid_tag(
        &self,
        input: crate::backend::inventory_engine::UpdateSpoolRfidTagInput,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.update_spool_rfid_tag(input))
    }

    pub fn assign_printer_slot(
        &self,
        printer_id: &str,
        slot_id: &str,
        spool_id: Option<&str>,
        rfid_override_tray_uuid: Option<&str>,
        rfid_override_color_hex: Option<&str>,
        clear_live_cache_before_next_refresh: bool,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| {
            engine.assign_printer_slot(AssignPrinterSlotInput {
                printer_id: printer_id.to_string(),
                slot_id: slot_id.to_string(),
                spool_id: spool_id.map(str::to_string),
                rfid_override_tray_uuid: rfid_override_tray_uuid.map(str::to_string),
                rfid_override_color_hex: rfid_override_color_hex.map(str::to_string),
                clear_live_cache_before_next_refresh: Some(clear_live_cache_before_next_refresh),
            })
        })
    }

    pub fn record_print_usage(&self, input: RecordPrintUsageInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.record_print_usage(input))
    }

    pub fn accept_bambu_live_weight_estimate(
        &self,
        input: AcceptBambuLiveWeightEstimateInput,
    ) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.accept_bambu_live_weight_estimate(input))
    }

    pub fn create_printer(&self, input: CreatePrinterInput) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.create_printer(input))
    }

    pub(crate) fn delete_printer_under_authority_gate(
        &self,
        printer_id: &str,
    ) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.delete_printer(printer_id))
    }

    pub fn set_active_printer(&self, printer_id: Option<&str>) -> InventoryResult<()> {
        self.with_authoritative_inventory(|engine| engine.set_active_printer(printer_id))
    }

    pub fn lend_spool(&self, input: LendSpoolInput) -> InventoryResult<SpoolLoanRow> {
        self.with_authoritative_inventory(|engine| engine.lend_spool(input))
    }

    pub fn return_spool_loan(&self, input: ReturnSpoolLoanInput) -> InventoryResult<SpoolLoanRow> {
        self.with_authoritative_inventory(|engine| engine.return_spool_loan(input))
    }

    pub fn return_inbound_spool_loan(
        &self,
        input: ReturnSpoolLoanInput,
    ) -> InventoryResult<SpoolLoanRow> {
        self.with_authoritative_inventory(|engine| engine.return_inbound_spool_loan(input))
    }

    fn with_inventory<Func, Output>(&self, func: Func) -> InventoryResult<Output>
    where
        Func: FnOnce(InventoryEngine) -> InventoryResult<Output>,
    {
        let db = FilamentDatabase::open(&self.db_path)?;
        let engine = InventoryEngine::new(db);
        func(engine)
    }

    fn with_authoritative_inventory<Func, Output>(&self, func: Func) -> InventoryResult<Output>
    where
        Func: FnOnce(InventoryEngine) -> InventoryResult<Output>,
    {
        let _authority_gate = lock_secure_credential_mutation().map_err(authority_error)?;
        let db = FilamentDatabase::open(&self.db_path)?;
        self.require_authority_under_gate(&db)?;
        func(InventoryEngine::new(db))
    }

    fn with_authoritative_write<Output>(
        &self,
        write: impl FnOnce() -> Result<Output, String>,
    ) -> Result<Output, String> {
        let _authority_gate = lock_secure_credential_mutation()?;
        let db = FilamentDatabase::open(&self.db_path).map_err(|error| error.to_string())?;
        self.require_authority_under_gate(&db)
            .map_err(crate::app_error::inventory_error_to_command_string)?;
        write()
    }
}

fn capture_companion_authority_identity(
    db: &FilamentDatabase,
) -> InventoryResult<CompanionAuthorityIdentity> {
    let settings = db.get_library_sync_settings()?;
    require_authoritative_local_mode(&settings.mode).map_err(authority_error)?;
    Ok(CompanionAuthorityIdentity {
        library_id: settings.library_id.trim().to_string(),
        target_generation: settings.target_generation,
        credential_profile_id: db.get_or_create_credential_store_profile_id()?,
    })
}

fn authority_error(message: String) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "common.forbidden",
        message,
    }
}

fn enrich_printer_overview_with_live_slots(
    mut rows: Vec<PrinterOverviewRow>,
    integrations: &[BambuLiveIntegrationEntryRow],
) -> Vec<PrinterOverviewRow> {
    for printer in &mut rows {
        let live_config = integrations
            .iter()
            .find(|entry| entry.printer_id == printer.printer.id)
            .map(|entry| &entry.config);
        let observed_state = live_config.and_then(|config| config.observed_state.as_ref());
        for slot in &mut printer.slots {
            let tray = observed_state.and_then(|state| find_observed_tray_for_slot(slot, state));
            apply_live_tray_to_slot(slot, tray, observed_state);
        }
    }
    rows
}

fn slot_is_external(slot: &crate::backend::filament_database::PrinterAmsSlotRow) -> bool {
    is_external_slot_id(&slot.ams_id)
}

fn find_observed_tray_for_slot<'a>(
    slot: &crate::backend::filament_database::PrinterAmsSlotRow,
    observed_state: &'a crate::backend::filament_database::BambuLiveObservedStateRow,
) -> Option<&'a BambuLiveObservedTrayRow> {
    if slot_is_external(slot) {
        return observed_state
            .trays
            .iter()
            .find(|candidate| candidate.tray_index == BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX)
            .or_else(|| {
                observed_state
                    .trays
                    .iter()
                    .find(|candidate| candidate.tray_index == BAMBU_SECONDARY_EXTERNAL_TRAY_INDEX)
            });
    }

    observed_state.trays.iter().find(|candidate| {
        bambu_live_slot_matches_tray(
            &slot.ams_id,
            slot.slot_index,
            candidate.ams_index,
            candidate.tray_index,
        )
    })
}

fn live_active_tray_matches_slot(
    slot: &crate::backend::filament_database::PrinterAmsSlotRow,
    active_ams_index: Option<i64>,
    active_tray_index: Option<i64>,
) -> bool {
    bambu_live_active_tray_matches_slot(
        &slot.ams_id,
        slot.slot_index,
        active_ams_index,
        active_tray_index,
    )
}

fn apply_live_tray_to_slot(
    slot: &mut crate::backend::filament_database::PrinterAmsSlotRow,
    tray: Option<&BambuLiveObservedTrayRow>,
    observed_state: Option<&crate::backend::filament_database::BambuLiveObservedStateRow>,
) {
    slot.live_loaded = tray.map(|value| value.loaded);
    slot.live_observed_rfid_tag = tray.and_then(|value| value.observed_rfid_tag.clone());
    slot.live_tray_uuid = tray.and_then(|value| value.tray_uuid.clone());
    slot.live_chip_id = tray.and_then(|value| value.chip_id.clone());
    slot.live_tray_info_idx = tray.and_then(|value| value.tray_info_idx.clone());
    slot.live_tray_id_name = tray.and_then(|value| value.tray_id_name.clone());
    slot.live_nozzle_temp_min_c = tray.and_then(|value| value.nozzle_temp_min_c);
    slot.live_nozzle_temp_max_c = tray.and_then(|value| value.nozzle_temp_max_c);
    slot.live_filament_type = tray.and_then(|value| value.filament_type.clone());
    slot.live_filament_name = tray.and_then(|value| value.filament_name.clone());
    slot.live_color_hex = tray.and_then(|value| value.color_hex.clone());
    slot.live_tray_weight_g = tray.and_then(|value| value.tray_weight_g);
    slot.live_remaining_percent = tray.and_then(|value| value.remaining_percent);
    slot.live_remaining_grams = tray.and_then(|value| value.remaining_grams);
    slot.live_weight_seen_at = tray.and_then(|value| value.last_weight_seen_at.clone());
    slot.live_last_identity_seen_at = tray.and_then(|value| value.last_identity_seen_at.clone());
    slot.live_match_status = tray.and_then(|value| value.match_status.clone());
    slot.live_match_note = tray.and_then(|value| value.match_note.clone());
    slot.live_matched_inventory_spool_id =
        tray.and_then(|value| value.matched_inventory_spool_id.clone());
    slot.live_matched_inventory_mode = tray.and_then(|value| value.matched_inventory_mode.clone());
    slot.live_progress_percent = observed_state.and_then(|state| state.progress_percent);
    slot.live_remaining_minutes = observed_state.and_then(|state| state.remaining_minutes);
    slot.live_nozzle_temp_c = observed_state.and_then(|state| state.nozzle_temp_c);
    slot.live_bed_temp_c = observed_state.and_then(|state| state.bed_temp_c);
    slot.live_ams_humidity_index = observed_state.and_then(|state| state.ams_humidity_index);
    slot.live_ams_temperature_c = observed_state.and_then(|state| state.ams_temperature_c);
    slot.live_printer_last_seen_at = observed_state.and_then(|state| state.last_seen_at.clone());
    slot.live_mqtt_connected = observed_state.map(|state| state.mqtt_connected);
    slot.live_ams_exist_bits = observed_state.and_then(|state| state.ams_exist_bits.clone());
    slot.live_ams_read_done_bits =
        observed_state.and_then(|state| state.ams_read_done_bits.clone());
    slot.live_ams_bambu_bits = observed_state.and_then(|state| state.ams_bambu_bits.clone());
    slot.live_is_active = observed_state.map(|state| {
        live_active_tray_matches_slot(slot, state.active_ams_index, state.active_tray_index)
            && (state.progress_percent.is_some() || state.remaining_minutes.is_some())
    });
}

#[cfg(test)]
#[path = "app_services_tests.rs"]
mod tests;
