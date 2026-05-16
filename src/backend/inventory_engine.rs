use crate::backend::database_result::{InventoryError, InventoryResult};
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, BambuLiveIntegrationRow, BambuLiveObservedTrayRow, CatalogResetStats,
    FilamentDatabase, LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow, LoanUsageByPersonRow,
    ManualMasterInput, MasterCatalogUpdateInput, PrinterOverviewRow, PrinterRow,
    SpoolHistoryEventRow, SpoolLoanDetailsRow, SpoolLoanRow, SpoolRow, SpoolUsagePointRow,
    SpoolWithMasterRow, WishlistItemRow,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

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
pub enum ScanSource {
    Desktop,
    Mobile,
}

impl ScanSource {
    fn as_str(&self) -> &'static str {
        match self {
            ScanSource::Desktop => "DESKTOP",
            ScanSource::Mobile => "MOBILE",
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
pub struct UpdateSpoolDetailsInput {
    pub spool_id: String,
    pub qr_code: Option<String>,
    pub status: String,
    pub location: Option<String>,
    pub home_location: Option<Option<String>>,
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
pub struct LendSpoolInput {
    pub spool_id: String,
    pub borrower_name: String,
    pub grams_out: Option<i64>,
    pub note: Option<String>,
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
        let ownership_type = normalize_ownership_type(input.ownership_type.as_deref());
        let owner_name = normalize_optional_input_text(input.owner_name.as_deref());
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());
        if ownership_type == "BORROWED_IN" && owner_name.is_none() {
            return Err(InventoryError::Db(
                "borrowed-in spools require an owner/counterparty name".to_string(),
            ));
        }
        let remaining_g = compute_remaining(input.initial_weight_g, input.current_weight_g);
        let location_id = match input.location_id.as_deref() {
            Some(value) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            _ => None,
        };
        let home_location_id = match input.home_location_id.as_deref() {
            Some(value) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            _ => location_id.clone(),
        };
        let spool = SpoolRow {
            id: input.id,
            master_id: input.master_id,
            qr_code: input.qr_code,
            rfid_tag: None,
            rfid_observed_at: None,
            status: input.status,
            ownership_type: ownership_type.clone(),
            owner_name: owner_name.clone(),
            owner_contact: owner_contact.clone(),
            ownership_note: ownership_note.clone(),
            initial_weight_g: input.initial_weight_g,
            current_weight_g: input.current_weight_g,
            remaining_g,
            spool_tare_weight_g: None,
            location_id: location_id.clone(),
            home_location_id,
            purchase_date: input.purchase_date,
            purchase_price: input.purchase_price,
            batch_code: input.batch_code,
            last_used_at: None,
        };
        self.db.insert_spool(&spool)?;
        self.log_spool_event(
            &spool_id,
            "CREATED",
            json!({
                "status": spool.status,
                "ownership_type": spool.ownership_type,
            }),
        )?;
        if ownership_type == "BORROWED_IN" {
            let loan = self.db.create_inbound_spool_loan(
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
            self.log_spool_event(
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
    }

    pub fn create_manual_spool(&self, input: CreateManualSpoolInput) -> InventoryResult<()> {
        let spool_id = input.id.clone();
        let ownership_type = normalize_ownership_type(input.ownership_type.as_deref());
        let owner_name = normalize_optional_input_text(input.owner_name.as_deref());
        let owner_contact = normalize_optional_input_text(input.owner_contact.as_deref());
        let ownership_note = normalize_optional_input_text(input.ownership_note.as_deref());
        if ownership_type == "BORROWED_IN" && owner_name.is_none() {
            return Err(InventoryError::Db(
                "borrowed-in spools require an owner/counterparty name".to_string(),
            ));
        }
        let master_id = self.db.upsert_manual_master(ManualMasterInput {
            material: &input.material,
            filament_name: &input.filament_name,
            color_name: &input.color_name,
            hex_color: input.hex_color.as_deref(),
            product_url: input.product_url.as_deref(),
            vendor: input.vendor.as_deref(),
            default_weight: input.default_weight_g,
        })?;
        let initial_weight = input
            .initial_weight_g
            .or(input.default_weight_g)
            .or(Some(1000));
        let status = input.status.unwrap_or_else(|| "IN_STOCK".to_string());
        let vendor_label = input.vendor.clone().unwrap_or_else(|| "Manual".to_string());
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
        };
        self.db.insert_spool(&spool)?;
        if let Some(location) = input.location.as_deref() {
            if !location.trim().is_empty() {
                self.assign_location(&spool_id, Some(location))?;
            }
        }
        self.log_spool_event(
            &spool_id,
            "CREATED",
            json!({
                "status": spool.status,
                "ownership_type": spool.ownership_type,
                "vendor": vendor_label,
            }),
        )?;
        if ownership_type == "BORROWED_IN" {
            let loan = self.db.create_inbound_spool_loan(
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
            self.log_spool_event(
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
                    "vendor": input
                        .vendor
                        .clone()
                        .unwrap_or_else(|| "Manual".to_string()),
                }),
            )?;
        }
        Ok(())
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
        let spool_with_master = self
            .db
            .get_spool_with_master_by_id(spool_id)?
            .ok_or(InventoryError::NotFound)?;
        let tare_g = resolve_spool_tare_weight_g(
            spool_with_master.spool.spool_tare_weight_g,
            Some(spool_with_master.master.vendor.as_str()),
        );
        let filament_grams = (grams - tare_g).max(0);
        let remaining_g = Some(filament_grams);
        let effective_scale_id = scale_id.unwrap_or("manual-entry");
        self.db
            .ensure_scale(effective_scale_id, "Manual Entry", "MANUAL")?;
        self.db
            .update_spool_weight(spool_id, Some(filament_grams), remaining_g)?;
        self.db.insert_weight_reading(
            effective_scale_id,
            spool_id,
            filament_grams,
            source.as_str(),
        )?;
        self.log_spool_event(
            spool_id,
            "WEIGHT_UPDATED",
            json!({
                "measured_grams": grams,
                "tare_weight_g": tare_g,
                "grams": filament_grams,
                "source": source.as_str()
            }),
        )
    }

    pub fn update_spool_tare_weight(&self, spool_id: &str, grams: i64) -> InventoryResult<()> {
        if grams < 0 {
            return Err(InventoryError::Db(
                "spool tare weight must be zero or greater".to_string(),
            ));
        }
        self.db.update_spool_tare_weight(spool_id, Some(grams))?;
        self.log_spool_event(
            spool_id,
            "TARE_WEIGHT_UPDATED",
            json!({ "tare_weight_g": grams }),
        )?;
        Ok(())
    }

    pub fn update_spool_status(&self, spool_id: &str, status: &str) -> InventoryResult<()> {
        if (status.eq_ignore_ascii_case("IN_USE") || status.eq_ignore_ascii_case("ASSIGNED"))
            && !self.db.spool_assigned_to_printer(spool_id)?
        {
            return Err(InventoryError::Db(
                "assign spool to a printer slot before setting ASSIGNED".to_string(),
            ));
        }
        self.db.update_spool_status(spool_id, status)?;
        self.log_spool_event(spool_id, "STATUS_UPDATED", json!({ "status": status }))?;
        if status.eq_ignore_ascii_case("EMPTY") {
            self.log_spool_event(spool_id, "USED_UP", json!({ "status": status }))?;
        }
        Ok(())
    }

    pub fn assign_location(
        &self,
        spool_id: &str,
        location_id: Option<&str>,
    ) -> InventoryResult<()> {
        let resolved = match location_id {
            Some(value) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            _ => None,
        };
        self.db.set_spool_location(spool_id, resolved.as_deref())?;
        self.db
            .set_spool_home_location(spool_id, resolved.as_deref())?;
        self.log_spool_event(
            spool_id,
            "LOCATION_UPDATED",
            json!({ "location": resolved }),
        )
    }

    pub fn update_spool_details(&self, input: UpdateSpoolDetailsInput) -> InventoryResult<()> {
        if (input.status.eq_ignore_ascii_case("IN_USE")
            || input.status.eq_ignore_ascii_case("ASSIGNED"))
            && !self.db.spool_assigned_to_printer(&input.spool_id)?
        {
            return Err(InventoryError::Db(
                "assign spool to a printer slot before setting ASSIGNED".to_string(),
            ));
        }
        let resolved_location = match input.location.as_deref() {
            Some(value) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            _ => None,
        };
        let existing_spool = self
            .db
            .get_spool_by_id(&input.spool_id)?
            .ok_or(InventoryError::NotFound)?;
        let has_active_loan = self.db.spool_has_active_loan(&input.spool_id)?;
        let resolved_home_location = match &input.home_location {
            Some(Some(value)) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            Some(_) => None,
            None => existing_spool.home_location_id.clone(),
        };
        let should_preserve_current_location =
            self.db.spool_assigned_to_printer(&input.spool_id)?
                || has_active_loan
                || existing_spool.status.eq_ignore_ascii_case("BORROWED");
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
        self.db.update_spool_details(
            &input.spool_id,
            input.qr_code.as_deref(),
            &input.status,
            effective_location.as_deref(),
            resolved_home_location.as_deref(),
        )?;
        self.log_spool_event(
            &input.spool_id,
            "DETAILS_UPDATED",
            json!({
                "status": input.status,
                "qr_code": input.qr_code,
                "location": effective_location,
                "home_location": resolved_home_location
            }),
        )
    }

    pub fn update_spool_rfid_tag(&self, input: UpdateSpoolRfidTagInput) -> InventoryResult<()> {
        let spool_id = input.spool_id.trim();
        if spool_id.is_empty() {
            return Err(InventoryError::Db("spool id is required".to_string()));
        }
        let normalized_rfid = normalize_optional_input_text(input.rfid_tag.as_deref());
        let normalized_observed_at =
            normalize_optional_input_text(input.rfid_observed_at.as_deref());
        self.db.update_spool_rfid_tag(
            spool_id,
            normalized_rfid.as_deref(),
            normalized_observed_at.as_deref(),
        )?;
        self.log_spool_event(
            spool_id,
            "RFID_TAG_UPDATED",
            json!({
                "rfid_tag": normalized_rfid,
                "rfid_observed_at": normalized_observed_at,
            }),
        )
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

        let spool = self
            .db
            .get_spool_with_master_by_id(spool_id)?
            .ok_or(InventoryError::NotFound)?;
        if !spool
            .spool
            .ownership_type
            .eq_ignore_ascii_case("BORROWED_IN")
        {
            return Err(InventoryError::Db(
                "this flow only supports borrowed-in spools".to_string(),
            ));
        }

        self.db.update_spool_ownership_metadata(
            spool_id,
            Some(owner_name.as_str()),
            owner_contact.as_deref(),
            ownership_note.as_deref(),
        )?;
        self.db.update_active_inbound_spool_loan_counterparty(
            spool_id,
            owner_name.as_str(),
            owner_contact.as_deref(),
            ownership_note.as_deref(),
        )?;
        self.log_spool_event(
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
    }

    pub fn delete_spool(&self, input: DeleteSpoolInput) -> InventoryResult<()> {
        let snapshot = self.db.get_spool_by_id(&input.spool_id)?;
        self.db.soft_delete_spool(&input.spool_id)?;
        self.log_spool_event(
            &input.spool_id,
            "DELETED",
            json!({
                "reason": input.reason,
                "snapshot": snapshot
            }),
        )
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
        self.db
            .update_wishlist_item_status(&input.item_id, &input.status)
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
        match printer_id {
            Some(id) if !id.trim().is_empty() => {
                let exists = self
                    .db
                    .list_printers()?
                    .into_iter()
                    .any(|printer| printer.id == id);
                if !exists {
                    return Err(InventoryError::NotFound);
                }
                self.db.set_setting("active_printer_id", id)
            }
            _ => self.db.delete_setting("active_printer_id"),
        }
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

    fn resolve_live_unknown_override(
        &self,
        printer_id: &str,
        slot_index: i64,
        ams_id: &str,
    ) -> InventoryResult<Option<(String, String)>> {
        if ams_id.ends_with("_ext") {
            return Ok(None);
        }

        let integration = self
            .db
            .list_bambu_live_integrations()?
            .into_iter()
            .find(|entry| entry.printer_id == printer_id)
            .map(|entry| entry.config);

        Ok(integration
            .as_ref()
            .and_then(|config| self.find_live_unknown_override_for_slot(config, slot_index)))
    }

    fn find_live_unknown_override_for_slot(
        &self,
        config: &BambuLiveIntegrationRow,
        slot_index: i64,
    ) -> Option<(String, String)> {
        let tray = config
            .observed_state
            .as_ref()?
            .trays
            .iter()
            .find(|candidate| candidate.tray_index == slot_index - 1)?;
        self.live_unknown_override_from_tray(tray)
    }

    fn live_unknown_override_from_tray(
        &self,
        tray: &BambuLiveObservedTrayRow,
    ) -> Option<(String, String)> {
        if !tray.loaded || tray.match_status.as_deref() != Some("unknown_rfid") {
            return None;
        }

        let tray_uuid = Self::normalize_optional_text(tray.tray_uuid.as_deref())?;
        let color_hex = Self::normalize_optional_text(tray.color_hex.as_deref())?;
        Some((tray_uuid, color_hex))
    }

    fn derive_assign_printer_slot_live_context(
        &self,
        input: &AssignPrinterSlotInput,
    ) -> InventoryResult<(Option<String>, Option<String>, bool)> {
        let requested_spool_id = Self::normalize_optional_text(input.spool_id.as_deref());
        let explicit_override_tray_uuid =
            Self::normalize_optional_text(input.rfid_override_tray_uuid.as_deref());
        let explicit_override_color_hex =
            Self::normalize_optional_text(input.rfid_override_color_hex.as_deref());
        let explicit_clear = input.clear_live_cache_before_next_refresh.unwrap_or(false);

        let printer = match self
            .db
            .list_printer_overview()?
            .into_iter()
            .find(|row| row.printer.id == input.printer_id)
        {
            Some(row) => row,
            None => {
                return Ok((
                    explicit_override_tray_uuid,
                    explicit_override_color_hex,
                    explicit_clear,
                ));
            }
        };

        let slot = match printer
            .slots
            .into_iter()
            .find(|slot| slot.slot_id == input.slot_id)
        {
            Some(slot) => slot,
            None => {
                return Ok((
                    explicit_override_tray_uuid,
                    explicit_override_color_hex,
                    explicit_clear,
                ));
            }
        };

        let current_slot_spool_id = Self::normalize_optional_text(slot.spool_id.as_deref());
        let slot_has_spool = current_slot_spool_id.is_some();
        let is_ext_slot = slot.ams_id.ends_with("_ext");
        let effective_clear =
            explicit_clear || (requested_spool_id.is_none() && slot_has_spool && !is_ext_slot);

        if requested_spool_id.is_none() || is_ext_slot {
            return Ok((
                explicit_override_tray_uuid,
                explicit_override_color_hex,
                effective_clear,
            ));
        }

        let mut effective_override_tray_uuid = explicit_override_tray_uuid;
        let mut effective_override_color_hex = explicit_override_color_hex;

        if effective_override_tray_uuid.is_none() || effective_override_color_hex.is_none() {
            if let Some((derived_tray_uuid, derived_color_hex)) = self
                .resolve_live_unknown_override(&input.printer_id, slot.slot_index, &slot.ams_id)?
            {
                if effective_override_tray_uuid.is_none() {
                    effective_override_tray_uuid = Some(derived_tray_uuid);
                }
                if effective_override_color_hex.is_none() {
                    effective_override_color_hex = Some(derived_color_hex);
                }
            }
        }

        let manual_reassignment_needs_live_suppression = !is_ext_slot
            && requested_spool_id != current_slot_spool_id
            && requested_spool_id.is_some()
            && effective_override_tray_uuid.is_none()
            && effective_override_color_hex.is_none();

        Ok((
            effective_override_tray_uuid,
            effective_override_color_hex,
            effective_clear || manual_reassignment_needs_live_suppression,
        ))
    }

    pub fn assign_printer_slot(&self, mut input: AssignPrinterSlotInput) -> InventoryResult<()> {
        let (effective_override_tray_uuid, effective_override_color_hex, effective_clear) =
            self.derive_assign_printer_slot_live_context(&input)?;
        input.rfid_override_tray_uuid = effective_override_tray_uuid;
        input.rfid_override_color_hex = effective_override_color_hex;
        input.clear_live_cache_before_next_refresh = Some(effective_clear);

        self.db.assign_spool_to_ams_slot(
            &input.printer_id,
            &input.slot_id,
            input.spool_id.as_deref(),
            input.rfid_override_tray_uuid.as_deref(),
            input.rfid_override_color_hex.as_deref(),
            effective_clear,
        )?;

        if let Some(spool_id) = input.spool_id {
            self.log_spool_event(
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
    }

    pub fn record_print_usage(&self, input: RecordPrintUsageInput) -> InventoryResult<()> {
        if !self.db.printer_exists(&input.printer_id)? {
            return Err(InventoryError::NotFound);
        }
        if !self
            .db
            .spool_assigned_to_specific_printer(&input.spool_id, &input.printer_id)?
        {
            return Err(InventoryError::Db(
                "spool must be assigned to selected printer slot before recording usage"
                    .to_string(),
            ));
        }

        let spool = self
            .db
            .get_spool_by_id(&input.spool_id)?
            .ok_or(InventoryError::NotFound)?;

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

        self.db.insert_print_job(
            &input.printer_id,
            &input.spool_id,
            input.job_name.as_deref(),
            used_grams,
            input.success.unwrap_or(true),
        )?;
        self.db
            .ensure_scale("print-job", "Print Job Usage", "VIRTUAL")?;
        self.db
            .update_spool_weight(&input.spool_id, Some(next_remaining), Some(next_remaining))?;
        self.db
            .insert_weight_reading("print-job", &input.spool_id, next_remaining, "PRINT_JOB")?;
        self.db.update_spool_status(&input.spool_id, next_status)?;
        self.log_spool_event(
            &input.spool_id,
            "PRINT_JOB_RECORDED",
            json!({
                "printer_id": input.printer_id,
                "used_grams": used_grams,
                "remaining_g": next_remaining,
                "job_name": input.job_name,
                "success": input.success.unwrap_or(true),
            }),
        )?;
        Ok(())
    }

    pub fn lend_spool(&self, input: LendSpoolInput) -> InventoryResult<SpoolLoanRow> {
        let spool = self
            .db
            .get_spool_by_id(&input.spool_id)?
            .ok_or(InventoryError::NotFound)?;
        if spool.ownership_type.eq_ignore_ascii_case("BORROWED_IN") {
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
        let loan = self.db.create_spool_loan(
            &input.spool_id,
            &input.borrower_name,
            grams_out,
            input.note.as_deref(),
        )?;
        self.log_spool_event(
            &input.spool_id,
            "LOANED_OUT",
            json!({
                "loan_id": loan.id,
                "loan_direction": loan.loan_direction,
                "borrower_name": loan.borrower_name,
                "counterparty_name": loan.counterparty_name,
                "grams_out": loan.grams_out,
                "note": loan.lent_note,
            }),
        )?;
        Ok(loan)
    }

    pub fn return_spool_loan(&self, input: ReturnSpoolLoanInput) -> InventoryResult<SpoolLoanRow> {
        let loan = self.db.return_spool_loan(
            &input.loan_id,
            input.returned_grams,
            input.note.as_deref(),
        )?;
        self.log_spool_event(
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
    }

    pub fn return_inbound_spool_loan(
        &self,
        input: ReturnSpoolLoanInput,
    ) -> InventoryResult<SpoolLoanRow> {
        let loan = self.db.return_inbound_spool_loan(
            &input.loan_id,
            input.returned_grams,
            input.note.as_deref(),
        )?;
        self.log_spool_event(
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

    pub fn record_scan(
        &self,
        spool_id: Option<&str>,
        qr_code: Option<&str>,
        source: ScanSource,
        detected_color_hex: Option<&str>,
    ) -> InventoryResult<()> {
        self.db
            .insert_scan_event(spool_id, qr_code, source.as_str(), detected_color_hex)
    }

    pub fn find_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        self.db.get_spool_by_qr(qr_code)
    }

    pub fn check_low_stock_alerts(&self, threshold: i64) -> InventoryResult<usize> {
        let spools = self.db.list_low_stock_spools(threshold)?;
        let mut created = 0;
        for spool in spools {
            if self.db.alert_exists_for_spool("LOW_FILAMENT", &spool.id)? {
                continue;
            }
            let payload = format!(
                "{{\"spool_id\":\"{}\",\"remaining_g\":{}}}",
                spool.id,
                spool.remaining_g.unwrap_or(0)
            );
            self.db.insert_alert("LOW_FILAMENT", &payload)?;
            created += 1;
        }
        Ok(created)
    }

    pub fn enqueue_sync_action(
        &self,
        action_type: &str,
        payload_json: &str,
    ) -> InventoryResult<String> {
        self.db.enqueue_sync_action(action_type, payload_json)
    }

    fn log_spool_event(
        &self,
        spool_id: &str,
        event_type: &str,
        payload: serde_json::Value,
    ) -> InventoryResult<()> {
        let payload_json = serde_json::to_string(&payload)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.db
            .insert_spool_history_event(spool_id, event_type, &payload_json)
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

fn normalize_optional_input_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.to_string())
}

fn normalize_ownership_type(value: Option<&str>) -> String {
    let normalized = value
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .unwrap_or("OWNED")
        .to_uppercase()
        .replace(['-', ' '], "_");
    match normalized.as_str() {
        "BORROWED_IN" => "BORROWED_IN".to_string(),
        _ => "OWNED".to_string(),
    }
}

#[cfg(test)]
#[path = "inventory_engine_tests.rs"]
mod tests;
