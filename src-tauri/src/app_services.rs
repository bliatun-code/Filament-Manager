use crate::backend::filament_database::{
    ActiveSpoolLoanRow, BambuLiveIntegrationEntryRow, BambuLiveObservedTrayRow, FilamentDatabase,
    FilamentMasterCatalogRow, InventoryError, InventoryResult, PrinterOverviewRow,
    SpoolHistoryEventRow, SpoolLoanDetailsRow, SpoolLoanRow, SpoolRow, SpoolUsagePointRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::inventory_engine::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput,
    CreateWishlistItemInput, DeleteSpoolInput, InventoryEngine, LendSpoolInput, PurgeSpoolInput,
    RecordPrintUsageInput, ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput,
    UpdateSpoolDetailsInput, UpdateWishlistStatusInput, WeightSource,
};
use serde::{Deserialize, Serialize};

const DEFAULT_SPOOL_HISTORY_LIMIT: i64 = 80;
const DEFAULT_SPOOL_USAGE_LIMIT: i64 = 300;

#[derive(Clone)]
pub struct CompanionService {
    db_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CompanionSpoolDetail {
    pub spool: SpoolWithMasterRow,
    pub history: Vec<SpoolHistoryEventRow>,
    pub usage: Vec<SpoolUsagePointRow>,
    pub active_loan: Option<ActiveSpoolLoanRow>,
}

impl CompanionService {
    pub fn new(db_path: impl Into<String>) -> Self {
        Self {
            db_path: db_path.into(),
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

    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        self.with_inventory(|engine| engine.list_wishlist_items(limit))
    }

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        let db = FilamentDatabase::open(&self.db_path)?;
        let rows = db.list_printer_overview()?;
        let integrations = db.list_bambu_live_integrations()?;
        Ok(enrich_printer_overview_with_live_slots(rows, &integrations))
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

        let spool = self
            .with_inventory(|engine| engine.get_spool_with_master(spool_id))?
            .ok_or(InventoryError::NotFound)?;
        let history = self.list_spool_history(spool_id, history_limit)?;
        let usage = self.list_spool_usage(spool_id, usage_limit)?;
        let outbound_active_loan = self
            .list_active_spool_loans()?
            .into_iter()
            .find(|row| row.loan.spool_id == spool_id);
        let active_loan = if outbound_active_loan.is_some()
            || !spool
                .spool
                .ownership_type
                .eq_ignore_ascii_case("BORROWED_IN")
        {
            outbound_active_loan
        } else {
            let db = FilamentDatabase::open(&self.db_path)?;
            db.find_active_spool_loan_for_direction(spool_id, "INBOUND")?
        };

        Ok(CompanionSpoolDetail {
            spool,
            history,
            usage,
            active_loan,
        })
    }

    pub fn update_spool_weight(
        &self,
        spool_id: &str,
        grams: i64,
        scale_id: Option<&str>,
        source: WeightSource,
    ) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_spool_weight(spool_id, grams, scale_id, source))
    }

    pub fn update_spool_tare_weight(&self, spool_id: &str, grams: i64) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_spool_tare_weight(spool_id, grams))
    }

    pub fn delete_spool(&self, input: DeleteSpoolInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.delete_spool(input))
    }

    pub fn purge_spool(&self, input: PurgeSpoolInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.purge_spool(input))
    }

    pub fn create_manual_spool(&self, input: CreateManualSpoolInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.create_manual_spool(input))
    }

    pub fn create_spool(&self, input: CreateSpoolInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.create_spool(input))
    }

    pub fn create_wishlist_item(&self, input: CreateWishlistItemInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.create_wishlist_item(input))
    }

    pub fn update_wishlist_item_status(
        &self,
        input: UpdateWishlistStatusInput,
    ) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_wishlist_item_status(input))
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.delete_wishlist_item(item_id))
    }

    pub fn update_borrowed_in_spool(
        &self,
        input: UpdateBorrowedInSpoolInput,
    ) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_borrowed_in_spool(input))
    }

    pub fn update_spool_details(&self, input: UpdateSpoolDetailsInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_spool_details(input))
    }

    pub fn update_spool_rfid_tag(
        &self,
        input: crate::backend::inventory_engine::UpdateSpoolRfidTagInput,
    ) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.update_spool_rfid_tag(input))
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
        self.with_inventory(|engine| {
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
        self.with_inventory(|engine| engine.record_print_usage(input))
    }

    pub fn create_printer(&self, input: CreatePrinterInput) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.create_printer(input))
    }

    pub fn delete_printer(&self, printer_id: &str) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.delete_printer(printer_id))
    }

    pub fn set_active_printer(&self, printer_id: Option<&str>) -> InventoryResult<()> {
        self.with_inventory(|engine| engine.set_active_printer(printer_id))
    }

    pub fn lend_spool(&self, input: LendSpoolInput) -> InventoryResult<SpoolLoanRow> {
        self.with_inventory(|engine| engine.lend_spool(input))
    }

    pub fn return_spool_loan(&self, input: ReturnSpoolLoanInput) -> InventoryResult<SpoolLoanRow> {
        self.with_inventory(|engine| engine.return_spool_loan(input))
    }

    pub fn return_inbound_spool_loan(
        &self,
        input: ReturnSpoolLoanInput,
    ) -> InventoryResult<SpoolLoanRow> {
        self.with_inventory(|engine| engine.return_inbound_spool_loan(input))
    }

    fn with_inventory<Func, Output>(&self, func: Func) -> InventoryResult<Output>
    where
        Func: FnOnce(InventoryEngine) -> InventoryResult<Output>,
    {
        let db = FilamentDatabase::open(&self.db_path)?;
        let engine = InventoryEngine::new(db);
        func(engine)
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
            if slot.ams_id.ends_with("_ext") {
                continue;
            }
            let tray = observed_state.and_then(|state| {
                state
                    .trays
                    .iter()
                    .find(|candidate| candidate.tray_index == slot.slot_index - 1)
            });
            apply_live_tray_to_slot(slot, tray, observed_state);
        }
    }
    rows
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
    slot.live_filament_type = tray.and_then(|value| value.filament_type.clone());
    slot.live_filament_name = tray.and_then(|value| value.filament_name.clone());
    slot.live_color_hex = tray.and_then(|value| value.color_hex.clone());
    slot.live_tray_weight_g = tray.and_then(|value| value.tray_weight_g);
    slot.live_remaining_percent = tray.and_then(|value| value.remaining_percent);
    slot.live_last_identity_seen_at = tray.and_then(|value| value.last_identity_seen_at.clone());
    slot.live_match_status = tray.and_then(|value| value.match_status.clone());
    slot.live_match_note = tray.and_then(|value| value.match_note.clone());
    slot.live_matched_inventory_spool_id =
        tray.and_then(|value| value.matched_inventory_spool_id.clone());
    slot.live_matched_inventory_mode = tray.and_then(|value| value.matched_inventory_mode.clone());
    slot.live_printer_last_seen_at = observed_state.and_then(|state| state.last_seen_at.clone());
    slot.live_mqtt_connected = observed_state.map(|state| state.mqtt_connected);
    slot.live_ams_read_done_bits =
        observed_state.and_then(|state| state.ams_read_done_bits.clone());
    slot.live_ams_bambu_bits = observed_state.and_then(|state| state.ams_bambu_bits.clone());
    slot.live_is_active = observed_state.map(|state| {
        state.active_tray_index == Some(slot.slot_index - 1)
            && (state.progress_percent.is_some() || state.remaining_minutes.is_some())
    });
}

#[cfg(test)]
mod tests {
    use super::CompanionService;
    use crate::backend::filament_database::{
        BambuLiveIntegrationRow, BambuLiveObservedStateRow, BambuLiveObservedTrayRow,
        FilamentDatabase, ManualMasterInput, SpoolRow,
    };
    use crate::backend::inventory_engine::{
        CreateManualSpoolInput, CreatePrinterInput, InventoryEngine, LendSpoolInput,
        ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput, UpdateSpoolDetailsInput, WeightSource,
    };
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-companion-{test_name}-{nanos}.db"))
    }

    #[test]
    fn companion_service_returns_spool_detail_and_updates_weight() {
        let db_path = temp_db_path("spool-detail");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());

            let before = service
                .get_spool_detail("spool_1", Some(50), Some(200))
                .map_err(|error| error.to_string())?;
            assert_eq!(before.spool.spool.id, "spool_1");
            assert!(!before.history.is_empty());

            service
                .update_spool_weight("spool_1", 780, None, WeightSource::Manual)
                .map_err(|error| error.to_string())?;

            let after = service
                .get_spool_detail("spool_1", Some(50), Some(200))
                .map_err(|error| error.to_string())?;
            assert_eq!(after.spool.spool.remaining_g, Some(780));
            assert!(after
                .history
                .iter()
                .any(|row| row.event_type == "WEIGHT_UPDATED"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_returns_spool_detail_and_updates_weight failed: {message}");
        }
    }

    #[test]
    fn companion_service_creates_borrowed_in_manual_spool() {
        let db_path = temp_db_path("borrowed-in-create");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            service
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_borrowed_1".to_string(),
                    material: "PETG".to_string(),
                    filament_name: "Prototype".to_string(),
                    color_name: "Blue".to_string(),
                    hex_color: None,
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(850),
                    qr_code: None,
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Carla".to_string()),
                    owner_contact: Some("carla@example.com".to_string()),
                    ownership_note: Some("Return after fit-checks".to_string()),
                    initial_weight_g: Some(850),
                    location: Some("Borrowed Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let detail = service
                .get_spool_detail("spool_borrowed_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.spool.spool.ownership_type, "BORROWED_IN");
            assert_eq!(detail.spool.spool.owner_name.as_deref(), Some("Carla"));
            assert_eq!(detail.spool.spool.remaining_g, Some(850));
            assert_eq!(
                detail
                    .active_loan
                    .as_ref()
                    .map(|row| row.loan.loan_direction.as_str()),
                Some("INBOUND")
            );
            assert!(detail
                .history
                .iter()
                .any(|row| row.event_type == "BORROWED_IN_REGISTERED"));

            let inbound_loans = service
                .list_spool_loans(20, false, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_loans.len(), 1);
            assert_eq!(inbound_loans[0].loan.spool_id, "spool_borrowed_1");
            assert_eq!(inbound_loans[0].loan.loan_direction, "INBOUND");
            assert_eq!(inbound_loans[0].loan.loan_status, "ACTIVE");

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_creates_borrowed_in_manual_spool failed: {message}");
        }
    }

    #[test]
    fn companion_service_finds_old_active_inbound_loan_in_spool_detail() {
        let db_path = temp_db_path("borrowed-in-detail-old-active-loan");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PETG",
                    filament_name: "Shared",
                    color_name: "Blue",
                    hex_color: Some("#2563EB"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            let make_spool = |id: &str| SpoolRow {
                id: id.to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Carla".to_string()),
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            };

            db.insert_spool(&make_spool("target_borrowed_spool"))
                .map_err(|error| error.to_string())?;
            db.create_inbound_spool_loan("target_borrowed_spool", "Carla", None, None, 1000)
                .map_err(|error| error.to_string())?;

            std::thread::sleep(Duration::from_secs(1));

            for index in 0..251 {
                let spool_id = format!("recent_borrowed_spool_{index}");
                db.insert_spool(&make_spool(&spool_id))
                    .map_err(|error| error.to_string())?;
                db.create_inbound_spool_loan(&spool_id, "Carla", None, None, 1000)
                    .map_err(|error| error.to_string())?;
            }

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let detail = service
                .get_spool_detail("target_borrowed_spool", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            let active_loan = detail
                .active_loan
                .ok_or_else(|| "missing old active inbound loan in spool detail".to_string())?;
            assert_eq!(active_loan.loan.spool_id, "target_borrowed_spool");
            assert_eq!(active_loan.loan.loan_direction, "INBOUND");

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "companion_service_finds_old_active_inbound_loan_in_spool_detail failed: {message}"
            );
        }
    }

    #[test]
    fn companion_service_finds_spool_by_qr() {
        let db_path = temp_db_path("find-by-qr");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_qr_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("lookup-qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let matched = service
                .find_spool_by_qr("lookup-qr-1")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "expected QR lookup to find spool".to_string())?;

            assert_eq!(matched.spool.id, "spool_qr_1");
            assert_eq!(matched.spool.qr_code.as_deref(), Some("lookup-qr-1"));
            assert_eq!(matched.master.filament_name, "Basic");
            assert!(service
                .find_spool_by_qr("missing-qr")
                .map_err(|error| error.to_string())?
                .is_none());

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_finds_spool_by_qr failed: {message}");
        }
    }

    #[test]
    fn companion_service_finds_spool_row_by_id_when_qr_code_is_missing() {
        let db_path = temp_db_path("find-row-by-qr-or-id");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_qr_2".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "Black".to_string(),
                    hex_color: Some("#111111".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: None,
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let matched = service
                .find_spool_row_by_qr_or_id("spool_qr_2")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "expected QR/id lookup to find spool".to_string())?;

            assert_eq!(matched.id, "spool_qr_2");
            assert_eq!(matched.qr_code, None);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "companion_service_finds_spool_row_by_id_when_qr_code_is_missing failed: {message}"
            );
        }
    }

    #[test]
    fn companion_service_finds_spool_detail_by_id_when_qr_code_is_missing() {
        let db_path = temp_db_path("find-detail-by-qr-or-id");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_qr_3".to_string(),
                    material: "PETG".to_string(),
                    filament_name: "Tough".to_string(),
                    color_name: "Blue".to_string(),
                    hex_color: Some("#2563EB".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: None,
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let matched = service
                .find_spool_by_qr("spool_qr_3")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "expected QR/id lookup to find spool detail".to_string())?;

            assert_eq!(matched.spool.id, "spool_qr_3");
            assert_eq!(matched.spool.qr_code, None);
            assert_eq!(matched.master.material, "PETG");

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_finds_spool_detail_by_id_when_qr_code_is_missing failed: {message}");
        }
    }

    #[test]
    fn companion_service_updates_borrowed_in_spool_metadata() {
        let db_path = temp_db_path("borrowed-in-update");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_borrowed_edit_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Sample".to_string(),
                    color_name: "Green".to_string(),
                    hex_color: None,
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("borrowed-edit-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Carla".to_string()),
                    owner_contact: Some("carla@example.com".to_string()),
                    ownership_note: Some("Original owner note".to_string()),
                    initial_weight_g: Some(1000),
                    location: Some("Borrowed Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            service
                .update_borrowed_in_spool(UpdateBorrowedInSpoolInput {
                    spool_id: "spool_borrowed_edit_1".to_string(),
                    owner_name: "Nora".to_string(),
                    owner_contact: Some("nora@example.com".to_string()),
                    ownership_note: Some("Return after finishing the sample set".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let detail = service
                .get_spool_detail("spool_borrowed_edit_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.spool.spool.owner_name.as_deref(), Some("Nora"));
            assert_eq!(
                detail.spool.spool.owner_contact.as_deref(),
                Some("nora@example.com")
            );
            assert_eq!(
                detail.spool.spool.ownership_note.as_deref(),
                Some("Return after finishing the sample set")
            );
            assert!(detail
                .history
                .iter()
                .any(|row| row.event_type == "DETAILS_UPDATED"));

            let inbound_loans = service
                .list_spool_loans(20, false, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_loans.len(), 1);
            assert_eq!(inbound_loans[0].loan.spool_id, "spool_borrowed_edit_1");
            assert_eq!(inbound_loans[0].loan.counterparty_name, "Nora");
            assert_eq!(
                inbound_loans[0].loan.counterparty_contact.as_deref(),
                Some("nora@example.com")
            );
            assert_eq!(
                inbound_loans[0].loan.counterparty_note.as_deref(),
                Some("Return after finishing the sample set")
            );
            assert_eq!(
                inbound_loans[0].loan.lent_note.as_deref(),
                Some("Return after finishing the sample set")
            );

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_updates_borrowed_in_spool_metadata failed: {message}");
        }
    }

    #[test]
    fn companion_service_updates_spool_details() {
        let db_path = temp_db_path("spool-details-update");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_detail_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "Silver".to_string(),
                    hex_color: Some("#cccccc".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("detail-qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf A".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            service
                .update_spool_details(UpdateSpoolDetailsInput {
                    spool_id: "spool_detail_1".to_string(),
                    qr_code: Some("detail-qr-2".to_string()),
                    status: "LOST".to_string(),
                    location: Some("Archive Bin".to_string()),
                    home_location: None,
                })
                .map_err(|error| error.to_string())?;

            let detail = service
                .get_spool_detail("spool_detail_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.spool.spool.status, "LOST");
            assert_eq!(
                detail.spool.spool.location_id.as_deref(),
                Some("Archive Bin")
            );
            assert_eq!(detail.spool.spool.qr_code.as_deref(), Some("detail-qr-2"));
            assert!(detail
                .history
                .iter()
                .any(|row| row.event_type == "DETAILS_UPDATED"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_updates_spool_details failed: {message}");
        }
    }

    #[test]
    fn companion_service_assigns_and_clears_printer_slot() {
        let db_path = temp_db_path("assign-slot");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;
            engine
                .create_printer(CreatePrinterInput {
                    id: "printer_1".to_string(),
                    model: "Bambu X1C".to_string(),
                    name: "Bench Printer".to_string(),
                    ams_units: Some(1),
                    slots_per_ams: Some(1),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let printer = service
                .list_printer_overview()
                .map_err(|error| error.to_string())?
                .into_iter()
                .find(|row| row.printer.id == "printer_1")
                .ok_or_else(|| "missing printer overview".to_string())?;
            let slot_id = printer
                .slots
                .first()
                .map(|slot| slot.slot_id.clone())
                .ok_or_else(|| "missing printer slot".to_string())?;

            service
                .assign_printer_slot("printer_1", &slot_id, Some("spool_1"), None, None, false)
                .map_err(|error| error.to_string())?;

            let after_assign = service
                .get_spool_detail("spool_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(after_assign.spool.spool.status, "ASSIGNED");
            assert_eq!(
                after_assign.spool.spool.location_id,
                Some(format!("Printer:Bench Printer:{slot_id}"))
            );

            service
                .assign_printer_slot("printer_1", &slot_id, None, None, None, false)
                .map_err(|error| error.to_string())?;

            let cleared_printer = service
                .list_printer_overview()
                .map_err(|error| error.to_string())?
                .into_iter()
                .find(|row| row.printer.id == "printer_1")
                .ok_or_else(|| "missing printer overview after clear".to_string())?;
            assert!(cleared_printer
                .slots
                .iter()
                .all(|slot| slot.slot_id != slot_id || slot.spool_id.is_none()));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_assigns_and_clears_printer_slot failed: {message}");
        }
    }

    #[test]
    fn companion_service_list_printer_overview_exposes_live_slot_snapshot() {
        let db_path = temp_db_path("printer-live-overview");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_printer(CreatePrinterInput {
                    id: "printer_1".to_string(),
                    model: "Bambu X1C".to_string(),
                    name: "Bench Printer".to_string(),
                    ams_units: Some(1),
                    slots_per_ams: Some(1),
                })
                .map_err(|error| error.to_string())?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.save_bambu_live_integration(
                "printer_1",
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.168.1.10".to_string()),
                    access_code: None,
                    printer_serial: Some("SERIAL-1".to_string()),
                    last_error: None,
                    observed_state: Some(BambuLiveObservedStateRow {
                        online: true,
                        last_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                        mqtt_connected: true,
                        progress_percent: Some(27),
                        remaining_minutes: Some(18),
                        active_tray_index: Some(0),
                        nozzle_temp_c: None,
                        bed_temp_c: None,
                        ams_humidity_index: None,
                        ams_temperature_c: None,
                        ams_reading_bits: None,
                        ams_read_done_bits: None,
                        ams_bambu_bits: None,
                        raw_status_note: None,
                        raw_payload_json: None,
                        trays: vec![BambuLiveObservedTrayRow {
                            tray_index: 0,
                            loaded: true,
                            filament_type: Some("PLA".to_string()),
                            filament_name: Some("Unknown".to_string()),
                            color_hex: Some("#00FF00".to_string()),
                            tray_weight_g: Some(1000),
                            remaining_percent: Some(82),
                            remaining_grams: Some(820),
                            observed_rfid_tag: None,
                            tray_uuid: Some("tray-uuid-unknown".to_string()),
                            chip_id: None,
                            tray_info_idx: None,
                            tray_id_name: None,
                            last_identity_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                            last_empty_seen_at: None,
                            empty_observation_count: Some(0),
                            matched_inventory_spool_id: None,
                            matched_inventory_mode: None,
                            match_status: Some("unknown_rfid".to_string()),
                            match_note: Some("RFID not registered".to_string()),
                        }],
                    }),
                },
            )
            .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let overview = service
                .list_printer_overview()
                .map_err(|error| error.to_string())?;
            let slot = overview[0]
                .slots
                .iter()
                .find(|row| row.slot_id == "printer_1_ams_1_slot_1")
                .ok_or_else(|| "missing printer slot".to_string())?;

            assert_eq!(slot.live_tray_uuid.as_deref(), Some("tray-uuid-unknown"));
            assert_eq!(slot.live_color_hex.as_deref(), Some("#00FF00"));
            assert_eq!(slot.live_match_status.as_deref(), Some("unknown_rfid"));
            assert_eq!(
                slot.live_last_identity_seen_at.as_deref(),
                Some("2026-04-16T14:00:00Z")
            );
            assert_eq!(slot.live_is_active, Some(true));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_list_printer_overview_exposes_live_slot_snapshot failed: {message}");
        }
    }

    #[test]
    fn companion_service_hands_back_borrowed_in_spool() {
        let db_path = temp_db_path("borrowed-in-hand-back");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_borrowed_return_1".to_string(),
                    material: "PETG".to_string(),
                    filament_name: "Borrowed".to_string(),
                    color_name: "Black".to_string(),
                    hex_color: None,
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(820),
                    qr_code: Some("borrowed-return-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Carla".to_string()),
                    owner_contact: Some("carla@example.com".to_string()),
                    ownership_note: Some("Return after fixture print".to_string()),
                    initial_weight_g: Some(820),
                    location: Some("Borrowed Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let detail = service
                .get_spool_detail("spool_borrowed_return_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            let loan_id = detail
                .active_loan
                .as_ref()
                .map(|row| row.loan.id.clone())
                .ok_or_else(|| "missing active inbound loan".to_string())?;

            let returned = service
                .return_inbound_spool_loan(ReturnSpoolLoanInput {
                    loan_id,
                    returned_grams: 760,
                    note: Some("Handed back after fixture print".to_string()),
                })
                .map_err(|error| error.to_string())?;
            assert_eq!(returned.loan_direction, "INBOUND");
            assert_eq!(returned.loan_status, "RETURNED");
            assert_eq!(returned.returned_grams, Some(760));

            let hidden_spool = service
                .get_spool("spool_borrowed_return_1")
                .map_err(|error| error.to_string())?;
            assert!(hidden_spool.is_none());

            let inbound_loans = service
                .list_spool_loans(20, true, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_loans.len(), 1);
            assert_eq!(
                inbound_loans[0].loan.return_note.as_deref(),
                Some("Handed back after fixture print")
            );

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_hands_back_borrowed_in_spool failed: {message}");
        }
    }

    #[test]
    fn companion_service_lends_spool() {
        let db_path = temp_db_path("lend-spool");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let loan = service
                .lend_spool(LendSpoolInput {
                    spool_id: "spool_1".to_string(),
                    borrower_name: "Alice".to_string(),
                    grams_out: Some(720),
                    note: Some("Prototype batch".to_string()),
                })
                .map_err(|error| error.to_string())?;
            assert_eq!(loan.borrower_name, "Alice");
            assert_eq!(loan.grams_out, 720);

            let detail = service
                .get_spool_detail("spool_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.spool.spool.status, "BORROWED");
            assert_eq!(detail.spool.spool.remaining_g, Some(720));
            assert_eq!(
                detail.spool.spool.location_id.as_deref(),
                Some("Loaned to: Alice")
            );
            assert!(detail.active_loan.is_some());
            assert!(detail
                .history
                .iter()
                .any(|row| row.event_type == "LOANED_OUT"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_lends_spool failed: {message}");
        }
    }

    #[test]
    fn companion_service_returns_outbound_loan() {
        let db_path = temp_db_path("return-loan");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());
            let loan = service
                .lend_spool(LendSpoolInput {
                    spool_id: "spool_1".to_string(),
                    borrower_name: "Alice".to_string(),
                    grams_out: Some(720),
                    note: None,
                })
                .map_err(|error| error.to_string())?;

            let returned = service
                .return_spool_loan(ReturnSpoolLoanInput {
                    loan_id: loan.id.clone(),
                    returned_grams: 660,
                    note: Some("Returned after test print".to_string()),
                })
                .map_err(|error| error.to_string())?;
            assert_eq!(returned.loan_status, "RETURNED");
            assert_eq!(returned.returned_grams, Some(660));

            let detail = service
                .get_spool_detail("spool_1", Some(20), Some(50))
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.spool.spool.status, "IN_STOCK");
            assert_eq!(detail.spool.spool.remaining_g, Some(660));
            assert!(detail.active_loan.is_none());
            assert!(detail
                .history
                .iter()
                .any(|row| row.event_type == "LOAN_RETURNED"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_returns_outbound_loan failed: {message}");
        }
    }

    #[test]
    fn companion_service_lists_outbound_loan_history() {
        let db_path = temp_db_path("loan-history");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    hex_color: Some("#ffffff".to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let service = CompanionService::new(db_path.to_string_lossy().to_string());

            let loan = service
                .lend_spool(LendSpoolInput {
                    spool_id: "spool_1".to_string(),
                    borrower_name: "Alice".to_string(),
                    grams_out: Some(700),
                    note: Some("Prototype loan".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let active_only = service
                .list_spool_loans(20, false, Some("OUTBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(active_only.len(), 1);
            assert_eq!(active_only[0].loan.id, loan.id);
            assert_eq!(active_only[0].loan.loan_status, "ACTIVE");

            service
                .return_spool_loan(ReturnSpoolLoanInput {
                    loan_id: loan.id.clone(),
                    returned_grams: 660,
                    note: Some("Returned later".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let completed = service
                .list_spool_loans(20, true, Some("OUTBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(completed.len(), 1);
            assert_eq!(completed[0].loan.id, loan.id);
            assert_eq!(completed[0].loan.loan_status, "RETURNED");

            let active_after_return = service
                .list_spool_loans(20, false, Some("OUTBOUND"))
                .map_err(|error| error.to_string())?;
            assert!(active_after_return.is_empty());

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_service_lists_outbound_loan_history failed: {message}");
        }
    }
}
