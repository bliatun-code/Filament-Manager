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
pub struct CatalogSpoolBatchInput {
    pub batch_id: String,
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
        self.with_inventory_transaction(|conn| {
            let library_id = get_library_sync_library_id(conn)?;
            if let Some((saved_library, saved_request, receipt)) =
                read_receipt(conn, &input.batch_id)?
            {
                if saved_library != library_id || saved_request != request_json {
                    return Err(conflict());
                }
                return Ok(receipt);
            }
            validate_input(&input)?;

            let mut spool_ids = Vec::with_capacity(input.master_ids.len());
            for master_id in &input.master_ids {
                let master_exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM filament_master_list WHERE id = ?1)",
                    [master_id],
                    |row| row.get(0),
                )?;
                if !master_exists {
                    return Err(invalid("A catalog batch item no longer exists in this library."));
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
            let receipt = CatalogSpoolBatchReceipt {
                batch_id: input.batch_id.clone(),
                spool_ids,
            };
            conn.execute(
                "INSERT INTO catalog_spool_batches (batch_id, library_id, request_json, receipt_json)
                 VALUES (?1, ?2, ?3, ?4)",
                params![input.batch_id, library_id, request_json, json_string(&receipt)?],
            )?;
            Ok(receipt)
        })
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
