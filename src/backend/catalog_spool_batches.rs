//! The installation-local batch journal survives JSON restores but is excluded
//! from portable backups. A replay can therefore return IDs removed by a restore;
//! it must never recreate those rolls. Full app reset clears the journal.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::database_core::FilamentDatabase;
use super::database_library_sync_settings::get_library_sync_library_id;
use super::database_result::{InventoryError, InventoryResult};
use super::inventory_engine::{CreateSpoolInput, InventoryEngine};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CatalogAmsAssignment {
    pub printer_id: String,
    pub slot_id: String,
    pub rfid_tag: String,
    pub observed_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ExistingSpoolRfidInput {
    pub request_id: String,
    pub spool_id: String,
    pub expected_rfid: Option<String>,
    pub assign_empty_slot: bool,
    pub observation: CatalogAmsAssignment,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CatalogSpoolBatchInput {
    pub batch_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ams_assignment: Option<CatalogAmsAssignment>,
    pub master_ids: Vec<String>,
    pub initial_weight_g: i64,
    pub ownership_type: String,
    pub owner_name: Option<String>,
    pub owner_contact: Option<String>,
    pub ownership_note: Option<String>,
    pub location: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CatalogSpoolBatchReceipt {
    pub batch_id: String,
    pub spool_ids: Vec<String>,
}

impl FilamentDatabase {
    /// Commits all catalog rolls, their loans/history, and the immutable receipt
    /// together. A retry first recovers that receipt, even if the rolls or their
    /// catalog/location rows have subsequently changed or been removed.
    pub fn create_catalog_spool_batch(
        &self,
        input: CatalogSpoolBatchInput,
    ) -> InventoryResult<CatalogSpoolBatchReceipt> {
        let input = normalize_input(input)?;
        let request_json = json_string(&input)?;
        self.with_spool_receipt(&input.batch_id, &request_json, |conn| {
            validate_input(&input)?;

            let mut spool_ids = Vec::with_capacity(input.master_ids.len());
            for master_id in &input.master_ids {
                let master_exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM filament_master_list WHERE id = ?1)",
                    [master_id],
                    |row| row.get(0),
                )?;
                if !master_exists {
                    return Err(invalid(
                        "A catalog batch item no longer exists in this library.",
                    ));
                }
                let spool_id = format!("spool_{:032x}", rand::random::<u128>());
                InventoryEngine::create_spool_in_transaction(
                    conn,
                    CreateSpoolInput {
                        id: spool_id.clone(),
                        master_id: master_id.clone(),
                        qr_code: None,
                        status: "IN_STOCK".to_string(),
                        ownership_type: Some(input.ownership_type.clone()),
                        owner_name: input.owner_name.clone(),
                        owner_contact: input.owner_contact.clone(),
                        ownership_note: input.ownership_note.clone(),
                        initial_weight_g: Some(input.initial_weight_g),
                        current_weight_g: Some(input.initial_weight_g),
                        location_id: input.location.clone(),
                        home_location_id: input.location.clone(),
                        purchase_date: None,
                        purchase_price: None,
                        batch_code: None,
                        purchase_currency: None,
                        supplier_reference: None,
                    },
                )
                .map_err(|error| match error {
                    InventoryError::InvalidOperation { message, .. } => invalid(&message),
                    other => other,
                })?;
                spool_ids.push(spool_id);
            }
            if let Some(ams) = &input.ams_assignment {
                self.save_reviewed_ams_rfid(conn, ams, &spool_ids[0], true)?;
            }
            Ok(spool_ids)
        })
    }

    fn with_spool_receipt(
        &self,
        request_id: &str,
        request: &str,
        write: impl FnOnce(&Connection) -> InventoryResult<Vec<String>>,
    ) -> InventoryResult<CatalogSpoolBatchReceipt> {
        self.with_inventory_transaction(|conn| {
            let library_id = get_library_sync_library_id(conn)?;
            if let Some((saved_library, saved_request, receipt)) = read_receipt(conn, request_id)? {
                if saved_library != library_id || saved_request != request {
                    return Err(conflict());
                }
                return Ok(receipt);
            }
            let receipt = CatalogSpoolBatchReceipt {
                batch_id: request_id.into(),
                spool_ids: write(conn)?,
            };
            conn.execute(
                "INSERT INTO catalog_spool_batches (batch_id, library_id, request_json, receipt_json)
                 VALUES (?1, ?2, ?3, ?4)",
                params![request_id, library_id, request, json_string(&receipt)?],
            )?;
            Ok(receipt)
        })
    }

    pub fn register_existing_spool_rfid(
        &self,
        input: ExistingSpoolRfidInput,
    ) -> InventoryResult<CatalogSpoolBatchReceipt> {
        let request_id = normalize_batch_id(&input.request_id)?;
        let request = json_string(&input)?;
        let ams = &input.observation;
        if [
            &ams.printer_id,
            &ams.slot_id,
            &ams.rfid_tag,
            &ams.observed_at,
            &input.spool_id,
        ]
        .iter()
        .any(|v| v.trim().is_empty())
        {
            return Err(invalid("Missing reviewed RFID registration details."));
        }
        self.with_spool_receipt(&request_id, &request, |conn| {
            let current: Option<(Option<String>, String)> = conn.query_row(
                "SELECT rfid_tag, status FROM filament_spools WHERE id = ?1 AND deleted_at IS NULL",
                [&input.spool_id], |row| Ok((row.get(0)?, row.get(1)?)),
            ).optional()?;
            let (rfid, status) = current.ok_or_else(stale_rfid)?;
            let saved_tag = rfid.as_deref().map(str::trim).filter(|tag| !tag.is_empty());
            let status = super::spool_defaults::normalize_spool_status(Some(&status));
            if saved_tag != input.expected_rfid.as_deref()
                || (input.assign_empty_slot && saved_tag.is_some())
                || !matches!(status.as_str(), "ASSIGNED" | "IN_STOCK")
            {
                return Err(stale_rfid());
            }
            super::database_loan_queries::ensure_spool_not_outbound_loan_locked(
                conn,
                &input.spool_id,
            )?;
            let elsewhere: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM ams_slots WHERE spool_id = ?1 AND id <> ?2)",
                params![input.spool_id, ams.slot_id],
                |row| row.get(0),
            )?;
            if elsewhere {
                return Err(stale_rfid());
            }
            self.save_reviewed_ams_rfid(conn, ams, &input.spool_id, input.assign_empty_slot)?;
            Ok(vec![input.spool_id.clone()])
        })
    }

    fn save_reviewed_ams_rfid(
        &self,
        conn: &Connection,
        ams: &CatalogAmsAssignment,
        spool_id: &str,
        assign_empty_slot: bool,
    ) -> InventoryResult<()> {
        use super::inventory_engine::{insert_json_history_event, AssignPrinterSlotInput};
        use super::printer_slot_live_mapping::{bambu_live_slot_matches_tray, is_external_slot_id};
        let slot = self
            .get_printer_overview(&ams.printer_id)?
            .and_then(|printer| printer.slots.into_iter().find(|s| s.slot_id == ams.slot_id))
            .filter(|s| {
                s.spool_id.as_deref()
                    == if assign_empty_slot {
                        None
                    } else {
                        Some(spool_id)
                    }
            })
            .ok_or_else(stale_rfid)?;
        let live = self
            .list_bambu_live_integrations()?
            .into_iter()
            .find(|entry| entry.printer_id == ams.printer_id && entry.config.enabled)
            .and_then(|entry| entry.config.observed_state)
            .ok_or_else(stale_rfid)?;
        let tray = if is_external_slot_id(&slot.ams_id) {
            live.trays
                .iter()
                .find(|tray| tray.tray_index == 255)
                .or_else(|| live.trays.iter().find(|tray| tray.tray_index == 254))
        } else {
            live.trays.iter().find(|tray| {
                bambu_live_slot_matches_tray(
                    &slot.ams_id,
                    slot.slot_index,
                    tray.ams_index,
                    tray.tray_index,
                )
            })
        }
        .ok_or_else(stale_rfid)?;
        let tag = tray
            .tray_uuid
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| tray.observed_rfid_tag.as_deref().map(str::trim));
        if !tray.loaded || tag != Some(ams.rfid_tag.as_str()) {
            return Err(stale_rfid());
        }
        let tag_claimed: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM filament_spools WHERE deleted_at IS NULL AND rfid_tag = ?1 AND id <> ?2)",
            params![ams.rfid_tag, spool_id], |row| row.get(0),
        )?;
        if tag_claimed {
            return Err(stale_rfid());
        }
        // Reopening the manual dialog after a lost reply may already show the committed tag.
        if !assign_empty_slot && slot.spool_rfid_tag.as_deref() == Some(ams.rfid_tag.as_str()) {
            return Ok(());
        }
        super::database_spool_updates::update_spool_rfid_tag(
            conn,
            spool_id,
            Some(&ams.rfid_tag),
            Some(&ams.observed_at),
        )?;
        insert_json_history_event(
            conn,
            spool_id,
            "RFID_TAG_UPDATED",
            serde_json::json!({
                "rfid_tag": ams.rfid_tag, "rfid_observed_at": ams.observed_at
            }),
        )?;
        if !assign_empty_slot {
            return Ok(());
        }
        let input = AssignPrinterSlotInput {
            printer_id: ams.printer_id.clone(),
            slot_id: ams.slot_id.clone(),
            spool_id: Some(spool_id.into()),
            rfid_override_tray_uuid: None,
            rfid_override_color_hex: None,
            clear_live_cache_before_next_refresh: Some(false),
        };
        InventoryEngine::assign_printer_slot_in_transaction(self, conn, input)
    }

    pub fn get_catalog_spool_batch_receipt(
        &self,
        batch_id: &str,
    ) -> InventoryResult<Option<CatalogSpoolBatchReceipt>> {
        let batch_id = normalize_batch_id(batch_id)?;
        self.with_inventory_transaction(|conn| {
            let library_id = get_library_sync_library_id(conn)?;
            read_receipt(conn, &batch_id)?
                .map(|(saved_library, _, receipt)| {
                    if saved_library != library_id {
                        Err(conflict())
                    } else {
                        Ok(receipt)
                    }
                })
                .transpose()
        })
    }
}

fn stale_rfid() -> InventoryError {
    InventoryError::InvalidOperation {
        code: "printers.slot_operation_stale",
        message: "The reviewed AMS slot, spool or RFID has changed.".into(),
    }
}

fn read_receipt(
    conn: &Connection,
    batch_id: &str,
) -> InventoryResult<Option<(String, String, CatalogSpoolBatchReceipt)>> {
    let row: Option<(String, String, String)> = conn
        .query_row(
            "SELECT library_id, request_json, receipt_json FROM catalog_spool_batches WHERE batch_id = ?1",
            [batch_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    row.map(|(library, request, receipt)| {
        let receipt = serde_json::from_str(&receipt)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        Ok((library, request, receipt))
    })
    .transpose()
}

fn json_string(value: &impl Serialize) -> InventoryResult<String> {
    serde_json::to_string(value).map_err(|error| InventoryError::Db(error.to_string()))
}

fn normalize_input(mut input: CatalogSpoolBatchInput) -> InventoryResult<CatalogSpoolBatchInput> {
    input.batch_id = normalize_batch_id(&input.batch_id)?;
    for master_id in &mut input.master_ids {
        *master_id = master_id.trim().to_string();
    }
    input.ownership_type = input.ownership_type.trim().to_uppercase();
    input.owner_name = optional_text(input.owner_name);
    input.owner_contact = optional_text(input.owner_contact);
    input.ownership_note = optional_text(input.ownership_note);
    input.location = optional_text(input.location);
    if input.ownership_type == "OWNED" {
        input.owner_name = None;
        input.owner_contact = None;
        input.ownership_note = None;
    }
    Ok(input)
}

fn validate_input(input: &CatalogSpoolBatchInput) -> InventoryResult<()> {
    if let Some(ams) = &input.ams_assignment
        && (input.master_ids.len() != 1
            || [
                &ams.printer_id,
                &ams.slot_id,
                &ams.rfid_tag,
                &ams.observed_at,
            ]
            .iter()
            .any(|v| v.trim().is_empty()))
    {
        return Err(invalid(
            "An AMS registration requires one catalog item and a reviewed printer, slot and RFID.",
        ));
    }
    if !(1..=100).contains(&input.master_ids.len()) {
        return Err(invalid(
            "A catalog batch must contain between 1 and 100 rolls.",
        ));
    }
    if input.master_ids.iter().any(String::is_empty) {
        return Err(invalid("Every catalog batch roll requires a catalog ID."));
    }
    if input.initial_weight_g < 0 {
        return Err(invalid("Initial weight must be zero or greater."));
    }
    if !matches!(input.ownership_type.as_str(), "OWNED" | "BORROWED_IN") {
        return Err(invalid(
            "Catalog batch ownership must be OWNED or BORROWED_IN.",
        ));
    }
    if input.ownership_type == "BORROWED_IN" && input.owner_name.is_none() {
        return Err(invalid("Borrowed-in catalog rolls require an owner name."));
    }
    Ok(())
}

fn normalize_batch_id(value: &str) -> InventoryResult<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(invalid(
            "A catalog batch ID must contain 1–128 letters, digits, hyphens or underscores.",
        ));
    }
    Ok(value.to_string())
}

fn optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn invalid(message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "inventory.batch.invalid",
        message: message.to_string(),
    }
}

fn conflict() -> InventoryError {
    InventoryError::InvalidOperation {
        code: "inventory.batch.conflict",
        message: "The catalog batch ID already belongs to a different request or library."
            .to_string(),
    }
}

#[cfg(test)]
#[path = "catalog_spool_batches_tests.rs"]
mod tests;
