use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::json;

use super::database_catalog_inputs::ManualMasterInput;
use super::database_catalog_manual::upsert_manual_master;
use super::database_events::insert_spool_history_event;
use super::database_ids::new_id;
use super::database_result::{require_rows, InventoryError, InventoryResult};
use super::database_spool_insert::insert_spool;
use super::database_spool_models::SpoolRow;
use super::database_wishlist_models::{WishlistItemRow, WishlistReceiptResult};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

pub(crate) fn list_wishlist_items(
    conn: &Connection,
    limit: i64,
) -> InventoryResult<Vec<WishlistItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity,
                note, created_at, updated_at
         FROM wishlist_items
         ORDER BY updated_at DESC, created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
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
    })?;
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

pub(crate) fn receive_wishlist_item(
    conn: &Connection,
    item_id: &str,
    received_quantity: i64,
    purchase_metadata: PurchaseReceiptMetadata,
) -> InventoryResult<WishlistReceiptResult> {
    if received_quantity <= 0 {
        return Err(InventoryError::InvalidOperation {
            code: "wishlist.receive.quantity_invalid",
            message: "Received quantity must be greater than zero".to_string(),
        });
    }
    let purchase_metadata = purchase_metadata.normalize_for_new()?;

    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
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
        let receipt_payload = serde_json::to_string(&json!({
            "wishlist_item_id": item.id,
            "initial_weight_g": spool.initial_weight_g,
            "purchase_metadata": purchase_metadata,
        }))
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
    transaction.commit()?;

    Ok(WishlistReceiptResult {
        spool_ids,
        received_quantity,
        remaining_quantity,
        status: status.to_string(),
    })
}

fn wishlist_item_by_id(
    conn: &Connection,
    item_id: &str,
) -> InventoryResult<Option<WishlistItemRow>> {
    conn.query_row(
        "SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity,
                note, created_at, updated_at
         FROM wishlist_items
         WHERE id = ?1",
        params![item_id],
        |row| {
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
        },
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
