use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::json;

use super::database_catalog_inputs::ManualMasterInput;
use super::database_catalog_manual::upsert_manual_master;
use super::database_events::insert_spool_history_event;
use super::database_ids::new_id;
use super::database_library_sync_settings::get_library_sync_library_id;
use super::database_locations::resolve_active_generic_location_reference;
use super::database_result::{require_rows, InventoryError, InventoryResult};
use super::database_spool_insert::insert_spool;
use super::database_spool_models::SpoolRow;
use super::database_wishlist_models::{WishlistItemRow, WishlistReceiptResult};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

pub(crate) fn map_wishlist_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<WishlistItemRow> {
    Ok(WishlistItemRow {
        id: row.get(0)?,
        master_id: row.get(1)?,
        material: row.get(2)?,
        filament_name: row.get(3)?,
        color_name: row.get(4)?,
        vendor: row.get(5)?,
        status: row.get(6)?,
        quantity: row.get(7)?,
        note: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(crate) fn list_wishlist_items(
    conn: &Connection,
    limit: i64,
) -> InventoryResult<Vec<WishlistItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity,
                note, created_at, updated_at
         FROM wishlist_items
         ORDER BY updated_at DESC, created_at DESC, id
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], map_wishlist_item)?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn insert_wishlist_item(
    conn: &Connection,
    item: &WishlistItemRow,
) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO wishlist_items (
            id, master_id, material, filament_name, color_name, vendor, status, quantity, note,
            created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))",
        params![
            item.id,
            item.master_id,
            item.material,
            item.filament_name,
            item.color_name,
            item.vendor,
            item.status,
            item.quantity,
            item.note
        ],
    )?;
    Ok(())
}

pub(crate) fn update_wishlist_item_status(
    conn: &Connection,
    item_id: &str,
    status: &str,
) -> InventoryResult<()> {
    let affected = conn.execute(
        "UPDATE wishlist_items
         SET status = ?1,
             updated_at = datetime('now')
         WHERE id = ?2",
        params![status, item_id],
    )?;
    require_rows(affected)
}

const MAX_WISHLIST_RECEIPT_QUANTITY: i64 = 100;

pub fn validate_wishlist_receipt_quantity(quantity: i64) -> InventoryResult<()> {
    if quantity <= 0 {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.quantity_invalid",
            message: "Received quantity must be greater than zero".to_string(),
        });
    }
    if quantity > MAX_WISHLIST_RECEIPT_QUANTITY {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.quantity_too_large",
            message: format!("Receive at most {MAX_WISHLIST_RECEIPT_QUANTITY} rolls at a time"),
        });
    }
    Ok(())
}

pub fn validate_wishlist_receipt_request_id(request_id: &str) -> InventoryResult<()> {
    if request_id.is_empty()
        || request_id.len() > 128
        || !request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.request_id_invalid",
            message:
                "Receipt request ID must contain 1–128 letters, digits, hyphens or underscores"
                    .to_string(),
        });
    }
    Ok(())
}

pub(crate) fn receive_wishlist_item(
    conn: &Connection,
    item_id: &str,
    received_quantity: i64,
    purchase_metadata: PurchaseReceiptMetadata,
    home_location: Option<&str>,
    request_id: Option<&str>,
) -> InventoryResult<WishlistReceiptResult> {
    validate_wishlist_receipt_quantity(received_quantity)?;
    if let Some(request_id) = request_id {
        validate_wishlist_receipt_request_id(request_id)?;
    }
    let purchase_metadata = purchase_metadata.normalize_for_new()?;
    let home_location = home_location
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let request = if let Some(request_id) = request_id {
        let library_id = get_library_sync_library_id(&transaction)?;
        let request_json = json!({
            "item_id": item_id,
            "quantity": received_quantity,
            "purchase_metadata": purchase_metadata,
            "home_location": home_location,
        })
        .to_string();
        if let Some(receipt) =
            read_wishlist_receipt_request(&transaction, request_id, &library_id, &request_json)?
        {
            return Ok(receipt);
        }
        Some((request_id, library_id, request_json))
    } else {
        None
    };

    let item = wishlist_item_by_id(&transaction, item_id)?.ok_or(InventoryError::NotFound)?;
    if item.status == "RECEIVED" || item.quantity <= 0 {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.already_received",
            message: "This wishlist item has already been fully received".to_string(),
        });
    }
    if received_quantity > item.quantity {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.quantity_exceeds_remaining",
            message: format!(
                "Cannot receive {received_quantity} rolls when only {} remain",
                item.quantity
            ),
        });
    }

    let home_location_id = home_location
        .map(|value| resolve_active_generic_location_reference(&transaction, value))
        .transpose()?;
    let (master_id, default_weight, vendor) = resolve_receipt_master(&transaction, &item)?;
    let spool_id_base = new_id();
    let mut spool_ids = Vec::with_capacity(received_quantity as usize);
    for index in 0..received_quantity {
        let spool_id = format!("spool_{spool_id_base}_{}", index + 1);
        let spool = SpoolRow {
            id: spool_id.clone(),
            master_id: master_id.clone(),
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(default_weight),
            current_weight_g: Some(default_weight),
            remaining_g: Some(default_weight),
            spool_tare_weight_g: default_spool_tare_for_vendor(&vendor),
            location_id: home_location_id.clone(),
            home_location_id: home_location_id.clone(),
            purchase_date: purchase_metadata.purchase_date.clone(),
            purchase_price: purchase_metadata.purchase_price,
            batch_code: purchase_metadata.batch_code.clone(),
            last_used_at: None,
            purchase_currency: purchase_metadata.purchase_currency.clone(),
            supplier_reference: purchase_metadata.supplier_reference.clone(),
            purchase_price_batch_locked: false,
            purchase_price_source: purchase_metadata
                .purchase_price
                .map(|_| "MANUAL".to_string()),
        };
        insert_spool(&transaction, &spool)?;
        let payload = serde_json::to_string(&json!({
            "status": spool.status,
            "ownership_type": spool.ownership_type,
            "wishlist_item_id": item.id,
        }))
        .map_err(|error| InventoryError::Db(error.to_string()))?;
        insert_spool_history_event(&transaction, &spool_id, "CREATED", &payload)?;
        let mut receipt_payload = json!({
            "wishlist_item_id": item.id,
            "initial_weight_g": spool.initial_weight_g,
            "purchase_metadata": purchase_metadata,
        });
        if let Some(home_location_id) = home_location_id.as_ref() {
            receipt_payload["home_location_id"] = json!(home_location_id);
            receipt_payload["location_id"] = json!(home_location_id);
        }
        let receipt_payload = serde_json::to_string(&receipt_payload)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        insert_spool_history_event(
            &transaction,
            &spool_id,
            "PURCHASE_RECEIPT_RECORDED",
            &receipt_payload,
        )?;
        spool_ids.push(spool_id);
    }

    let remaining_quantity = item.quantity - received_quantity;
    let status = if remaining_quantity == 0 {
        "RECEIVED"
    } else if item.status == "ON_ORDER" {
        "ON_ORDER"
    } else {
        "WISHLIST"
    };
    let affected = transaction.execute(
        "UPDATE wishlist_items
         SET quantity = ?1,
             status = ?2,
             updated_at = datetime('now')
         WHERE id = ?3 AND quantity = ?4",
        params![remaining_quantity, status, item.id, item.quantity],
    )?;
    require_rows(affected)?;
    let receipt = WishlistReceiptResult {
        spool_ids,
        received_quantity,
        remaining_quantity,
        status: status.to_string(),
    };
    if let Some((request_id, library_id, request_json)) = request {
        let receipt_json = serde_json::to_string(&receipt)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        transaction.execute(
            "INSERT INTO wishlist_receipt_requests (request_id, library_id, request_json, receipt_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![request_id, library_id, request_json, receipt_json],
        )?;
    }
    transaction.commit()?;
    Ok(receipt)
}

fn read_wishlist_receipt_request(
    conn: &Connection,
    request_id: &str,
    library_id: &str,
    request_json: &str,
) -> InventoryResult<Option<WishlistReceiptResult>> {
    let saved: Option<(String, String, String)> = conn
        .query_row(
            "SELECT library_id, request_json, receipt_json
             FROM wishlist_receipt_requests WHERE request_id = ?1",
            [request_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((saved_library_id, saved_request, receipt_json)) = saved else {
        return Ok(None);
    };
    if saved_library_id != library_id || saved_request != request_json {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.request_conflict",
            message: "This receipt request ID belongs to a different receipt or library"
                .to_string(),
        });
    }
    serde_json::from_str(&receipt_json)
        .map(Some)
        .map_err(|error| InventoryError::Db(error.to_string()))
}

pub(crate) fn wishlist_item_by_id(
    conn: &Connection,
    item_id: &str,
) -> InventoryResult<Option<WishlistItemRow>> {
    conn.query_row(
        "SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity,
                note, created_at, updated_at
         FROM wishlist_items
         WHERE id = ?1",
        params![item_id],
        map_wishlist_item,
    )
    .optional()
    .map_err(InventoryError::from)
}

fn resolve_receipt_master(
    conn: &Connection,
    item: &WishlistItemRow,
) -> InventoryResult<(String, i64, String)> {
    if let Some(master_id) = item.master_id.as_deref() {
        let linked_master = conn
            .query_row(
                "SELECT id, default_weight, vendor
                 FROM filament_master_list
                 WHERE id = ?1",
                params![master_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?.max(1),
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        if let Some(linked_master) = linked_master {
            return Ok(linked_master);
        }
    }

    let master_id = upsert_manual_master(
        conn,
        ManualMasterInput {
            material: &item.material,
            filament_name: &item.filament_name,
            color_name: &item.color_name,
            hex_color: None,
            product_url: None,
            vendor: Some(&item.vendor),
            default_weight: Some(1000),
        },
    )?;
    Ok((master_id, 1000, item.vendor.clone()))
}

fn default_spool_tare_for_vendor(vendor: &str) -> Option<i64> {
    let normalized = vendor.trim().to_ascii_lowercase();
    if normalized.contains("bambu") {
        return Some(250);
    }
    if normalized.contains("esun") {
        return Some(224);
    }
    None
}

pub(crate) fn delete_wishlist_item(conn: &Connection, item_id: &str) -> InventoryResult<()> {
    let affected = conn.execute(
        "DELETE FROM wishlist_items
         WHERE id = ?1",
        params![item_id],
    )?;
    require_rows(affected)
}
