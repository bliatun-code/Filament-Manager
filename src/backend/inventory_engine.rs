use crate::backend::filament_database::{
    ActiveSpoolLoanRow, CatalogResetStats, FilamentDatabase, InventoryError, InventoryResult,
    LoanUsageByPersonRow, PrinterOverviewRow, PrinterRow, SpoolHistoryEventRow,
    SpoolLoanDetailsRow, SpoolLoanRow, SpoolRow, SpoolUsagePointRow, SpoolWithMasterRow,
    WishlistItemRow,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

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

    pub fn list_printer_overview(&self) -> InventoryResult<Vec<PrinterOverviewRow>> {
        self.db.list_printer_overview()
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
        let spool = SpoolRow {
            id: input.id,
            master_id: input.master_id,
            qr_code: input.qr_code,
            status: input.status,
            ownership_type: ownership_type.clone(),
            owner_name: owner_name.clone(),
            owner_contact: owner_contact.clone(),
            ownership_note: ownership_note.clone(),
            initial_weight_g: input.initial_weight_g,
            current_weight_g: input.current_weight_g,
            remaining_g,
            spool_tare_weight_g: None,
            location_id: input.location_id,
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
        let master_id = self.db.upsert_manual_master(
            &input.material,
            &input.filament_name,
            &input.color_name,
            input.hex_color.as_deref(),
            input.product_url.as_deref(),
            input.vendor.as_deref(),
            input.default_weight_g,
        )?;
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

        self.db.update_master_catalog_entry(
            input.master_id.trim(),
            material,
            filament_name,
            color_name,
            input.hex_color.as_deref(),
            input.product_url.as_deref(),
            input.vendor.as_deref(),
            input.default_weight,
        )
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
        self.db
            .insert_weight_reading(
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
        if status.eq_ignore_ascii_case("IN_USE") && !self.db.spool_assigned_to_printer(spool_id)? {
            return Err(InventoryError::Db(
                "assign spool to a printer slot before setting IN_USE".to_string(),
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
        self.log_spool_event(
            spool_id,
            "LOCATION_UPDATED",
            json!({ "location": resolved }),
        )
    }

    pub fn update_spool_details(&self, input: UpdateSpoolDetailsInput) -> InventoryResult<()> {
        if input.status.eq_ignore_ascii_case("IN_USE")
            && !self.db.spool_assigned_to_printer(&input.spool_id)?
        {
            return Err(InventoryError::Db(
                "assign spool to a printer slot before setting IN_USE".to_string(),
            ));
        }
        let resolved_location = match input.location.as_deref() {
            Some(value) if !value.trim().is_empty() => Some(self.db.ensure_location(value)?),
            _ => None,
        };
        self.db.update_spool_details(
            &input.spool_id,
            input.qr_code.as_deref(),
            &input.status,
            resolved_location.as_deref(),
        )?;
        self.log_spool_event(
            &input.spool_id,
            "DETAILS_UPDATED",
            json!({
                "status": input.status,
                "qr_code": input.qr_code,
                "location": resolved_location
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
            return Err(crate::backend::filament_database::InventoryError::Db(
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

    pub fn assign_printer_slot(&self, input: AssignPrinterSlotInput) -> InventoryResult<()> {
        self.db.assign_spool_to_ams_slot(
            &input.printer_id,
            &input.slot_id,
            input.spool_id.as_deref(),
        )?;

        if let Some(spool_id) = input.spool_id {
            self.log_spool_event(
                &spool_id,
                "ASSIGNED_TO_AMS",
                json!({
                    "printer_id": input.printer_id,
                    "slot_id": input.slot_id
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
            "IN_USE"
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
        let payload_json = serde_json::to_string(&payload).map_err(|error| {
            crate::backend::filament_database::InventoryError::Db(error.to_string())
        })?;
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
        .replace('-', "_")
        .replace(' ', "_");
    match normalized.as_str() {
        "BORROWED_IN" => "BORROWED_IN".to_string(),
        _ => "OWNED".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, InventoryEngine,
        ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput, WeightSource,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-engine-{test_name}-{nanos}.db"))
    }

    #[test]
    fn create_manual_borrowed_in_spool_registers_inbound_loan() {
        let db_path = temp_db_path("create-manual-borrowed-in");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "borrowed_spool_1".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "Sky Blue".to_string(),
                    hex_color: Some("#88ccff".to_string()),
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("borrowed-qr-1".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Alice".to_string()),
                    owner_contact: Some("alice@example.com".to_string()),
                    ownership_note: Some("Return after the prototype batch".to_string()),
                    initial_weight_g: Some(850),
                    location: Some("Shelf A".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let created_spool = engine
                .db
                .get_spool_by_id("borrowed_spool_1")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "expected borrowed spool to exist".to_string())?;
            assert_eq!(created_spool.ownership_type, "BORROWED_IN");
            assert_eq!(created_spool.owner_name.as_deref(), Some("Alice"));
            assert_eq!(
                created_spool.owner_contact.as_deref(),
                Some("alice@example.com")
            );

            let backup = engine
                .db
                .export_full_backup_json()
                .map_err(|error| error.to_string())?;
            let parsed: serde_json::Value =
                serde_json::from_str(&backup).map_err(|error| error.to_string())?;
            let loan_rows = parsed
                .get("tables")
                .and_then(|tables| tables.get("spool_loans"))
                .and_then(|rows| rows.as_array())
                .ok_or_else(|| "expected spool_loans table in backup export".to_string())?;
            let borrowed_in_loan = loan_rows
                .iter()
                .find(|row| {
                    row.get("spool_id")
                        .and_then(|value| value.as_str())
                        .map(|value| value == "borrowed_spool_1")
                        .unwrap_or(false)
                })
                .ok_or_else(|| "expected inbound loan row for borrowed spool".to_string())?;

            assert_eq!(
                borrowed_in_loan
                    .get("loan_direction")
                    .and_then(|value| value.as_str()),
                Some("INBOUND")
            );
            assert_eq!(
                borrowed_in_loan
                    .get("loan_status")
                    .and_then(|value| value.as_str()),
                Some("ACTIVE")
            );
            assert_eq!(
                borrowed_in_loan
                    .get("counterparty_name")
                    .and_then(|value| value.as_str()),
                Some("Alice")
            );
            assert_eq!(
                borrowed_in_loan
                    .get("grams_out")
                    .and_then(|value| value.as_i64()),
                Some(850)
            );

            let outbound_loans = engine
                .list_spool_loans(20, true)
                .map_err(|error| error.to_string())?;
            assert!(outbound_loans.is_empty());

            let active_outbound_loans = engine
                .list_active_spool_loans()
                .map_err(|error| error.to_string())?;
            assert!(active_outbound_loans.is_empty());

            let lend_result = engine.lend_spool(super::LendSpoolInput {
                spool_id: "borrowed_spool_1".to_string(),
                borrower_name: "Bob".to_string(),
                grams_out: Some(850),
                note: None,
            });
            assert!(lend_result.is_err());

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("create_manual_borrowed_in_spool_registers_inbound_loan test failed: {message}");
        }
    }

    #[test]
    fn return_borrowed_in_spool_hands_back_and_hides_from_inventory() {
        let db_path = temp_db_path("return-borrowed-in");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_printer(CreatePrinterInput {
                    id: "printer_1".to_string(),
                    model: "P1S".to_string(),
                    name: "Bambu Lab P1S".to_string(),
                    ams_units: Some(1),
                    slots_per_ams: Some(4),
                })
                .map_err(|error| error.to_string())?;

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "borrowed_spool_2".to_string(),
                    material: "PETG".to_string(),
                    filament_name: "Translucent".to_string(),
                    color_name: "Orange".to_string(),
                    hex_color: Some("#ff9a3d".to_string()),
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("borrowed-qr-2".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Carla".to_string()),
                    owner_contact: Some("carla@example.com".to_string()),
                    ownership_note: Some("Return once fit-checks are done".to_string()),
                    initial_weight_g: Some(820),
                    location: Some("Shelf B".to_string()),
                })
                .map_err(|error| error.to_string())?;

            engine
                .assign_printer_slot(AssignPrinterSlotInput {
                    printer_id: "printer_1".to_string(),
                    slot_id: "printer_1_ext_slot_1".to_string(),
                    spool_id: Some("borrowed_spool_2".to_string()),
                })
                .map_err(|error| error.to_string())?;

            engine
                .update_spool_weight("borrowed_spool_2", 610, None, WeightSource::Manual)
                .map_err(|error| error.to_string())?;

            let inbound_loans = engine
                .list_spool_loans_for_direction(20, true, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_loans.len(), 1);

            let returned = engine
                .return_inbound_spool_loan(ReturnSpoolLoanInput {
                    loan_id: inbound_loans[0].loan.id.clone(),
                    returned_grams: 610,
                    note: Some("Owner picked it up".to_string()),
                })
                .map_err(|error| error.to_string())?;

            assert_eq!(returned.loan_direction, "INBOUND");
            assert_eq!(returned.loan_status, "RETURNED");
            assert_eq!(returned.returned_grams, Some(610));
            assert_eq!(returned.consumed_grams, Some(210));

            let hidden_from_inventory = engine
                .list_spools(20, 0)
                .map_err(|error| error.to_string())?;
            assert!(hidden_from_inventory.is_empty());

            let stored_spool = engine
                .db
                .get_spool_by_id("borrowed_spool_2")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| {
                    "expected handed-back spool row to remain for history".to_string()
                })?;
            assert_eq!(stored_spool.status, "DELETED");
            assert_eq!(stored_spool.remaining_g, Some(610));

            let qr_lookup = engine
                .find_spool_by_qr("borrowed-qr-2")
                .map_err(|error| error.to_string())?;
            assert!(qr_lookup.is_none());

            let inbound_history = engine
                .list_spool_loans_for_direction(20, true, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_history.len(), 1);
            assert_eq!(inbound_history[0].loan.loan_status, "RETURNED");

            let outbound_history = engine
                .list_spool_loans(20, true)
                .map_err(|error| error.to_string())?;
            assert!(outbound_history.is_empty());

            let printer_overview = engine
                .list_printer_overview()
                .map_err(|error| error.to_string())?;
            let ext_slot = printer_overview[0]
                .slots
                .iter()
                .find(|slot| slot.slot_id == "printer_1_ext_slot_1")
                .ok_or_else(|| "expected printer ext slot to exist".to_string())?;
            assert!(ext_slot.spool_id.is_none());

            let history_rows = engine
                .list_spool_history("borrowed_spool_2", 20)
                .map_err(|error| error.to_string())?;
            assert!(history_rows
                .iter()
                .any(|row| row.event_type == "BORROWED_IN_RETURNED"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "return_borrowed_in_spool_hands_back_and_hides_from_inventory test failed: {message}"
            );
        }
    }

    #[test]
    fn update_borrowed_in_spool_updates_spool_and_active_inbound_loan() {
        let db_path = temp_db_path("update-borrowed-in");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);

            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "borrowed_spool_3".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Matte".to_string(),
                    color_name: "Black".to_string(),
                    hex_color: Some("#111111".to_string()),
                    product_url: None,
                    vendor: Some("Generic".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some("borrowed-qr-3".to_string()),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("BORROWED_IN".to_string()),
                    owner_name: Some("Alice".to_string()),
                    owner_contact: Some("alice@example.com".to_string()),
                    ownership_note: Some("Prototype batch".to_string()),
                    initial_weight_g: Some(910),
                    location: Some("Shelf C".to_string()),
                })
                .map_err(|error| error.to_string())?;

            engine
                .update_borrowed_in_spool(UpdateBorrowedInSpoolInput {
                    spool_id: "borrowed_spool_3".to_string(),
                    owner_name: "Carla".to_string(),
                    owner_contact: Some("carla@example.com".to_string()),
                    ownership_note: Some("Return after print-fit review".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let updated_spool = engine
                .db
                .get_spool_with_master_by_id("borrowed_spool_3")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "expected updated borrowed-in spool".to_string())?;
            assert_eq!(updated_spool.spool.owner_name.as_deref(), Some("Carla"));
            assert_eq!(
                updated_spool.spool.owner_contact.as_deref(),
                Some("carla@example.com")
            );
            assert_eq!(
                updated_spool.spool.ownership_note.as_deref(),
                Some("Return after print-fit review")
            );

            let inbound_loans = engine
                .list_spool_loans_for_direction(20, false, Some("INBOUND"))
                .map_err(|error| error.to_string())?;
            assert_eq!(inbound_loans.len(), 1);
            assert_eq!(inbound_loans[0].loan.counterparty_name, "Carla");
            assert_eq!(
                inbound_loans[0].loan.counterparty_contact.as_deref(),
                Some("carla@example.com")
            );
            assert_eq!(
                inbound_loans[0].loan.counterparty_note.as_deref(),
                Some("Return after print-fit review")
            );

            let history_rows = engine
                .list_spool_history("borrowed_spool_3", 20)
                .map_err(|error| error.to_string())?;
            assert!(history_rows
                .iter()
                .any(|row| row.event_type == "DETAILS_UPDATED"));

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("update_borrowed_in_spool_updates_spool_and_active_inbound_loan test failed: {message}");
        }
    }
}
