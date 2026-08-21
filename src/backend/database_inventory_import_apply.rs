use rusqlite::{params, Connection};

use super::database_catalog_inputs::ManualMasterInput;
use super::database_catalog_manual::upsert_manual_master;
use super::database_import::{InventoryImportRow, InventoryImportStats};
use super::database_locations::ensure_location;
use super::database_result::{InventoryError, InventoryResult};
use super::database_spool_insert::insert_spool;
use super::database_spool_models::SpoolRow;
use super::database_spool_queries::get_spool_by_id;
use super::database_spool_updates::update_spool_purchase_metadata;
use super::database_text::normalize_optional_text;
use super::spool_defaults::normalize_spool_status;

pub(crate) fn import_inventory_spools_rows(
    conn: &Connection,
    rows: &[InventoryImportRow],
) -> InventoryResult<InventoryImportStats> {
    if rows.is_empty() {
        return Err(InventoryError::Db(
            "Inventory import contains no spool rows".to_string(),
        ));
    }

    conn.execute_batch("BEGIN IMMEDIATE;")?;
    let result = import_inventory_spools_rows_in_transaction(conn, rows);

    match result {
        Ok(stats) => {
            conn.execute_batch("COMMIT;")?;
            Ok(stats)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn import_inventory_spools_rows_in_transaction(
    conn: &Connection,
    rows: &[InventoryImportRow],
) -> InventoryResult<InventoryImportStats> {
    let mut created_count = 0_i64;
    let mut updated_count = 0_i64;

    for (index, row) in rows.iter().enumerate() {
        let normalized = normalize_import_row(row, index)?;
        let location_id = match normalize_optional_text(row.location.as_deref()) {
            Some(location) => Some(ensure_location(conn, &location)?),
            None => None,
        };
        let home_location_id = location_id.clone();
        let qr_code = normalize_optional_text(row.qr_code.as_deref());
        let vendor = normalize_optional_text(row.vendor.as_deref());
        let purchase_metadata = row
            .purchase_metadata
            .clone()
            .map(|metadata| metadata.normalize_for_import())
            .transpose()?;
        let master_id = upsert_manual_master(
            conn,
            ManualMasterInput {
                material: normalized.material,
                filament_name: normalized.filament_name,
                color_name: normalized.color_name,
                hex_color: None,
                product_url: None,
                vendor: vendor.as_deref(),
                default_weight: Some(normalized.initial_weight_g),
            },
        )?;

        if get_spool_by_id(conn, normalized.spool_id)?.is_some() {
            update_imported_spool(
                conn,
                ImportedSpoolUpdate {
                    spool_id: normalized.spool_id,
                    master_id: &master_id,
                    qr_code: qr_code.as_deref(),
                    status: &normalized.status,
                    initial_weight_g: normalized.initial_weight_g,
                    current_weight_g: normalized.current_weight_g,
                    remaining_g: normalized.remaining_g,
                    location_id: location_id.as_deref(),
                    purchase_metadata: purchase_metadata.as_ref(),
                },
            )?;
            updated_count += 1;
        } else {
            insert_spool(
                conn,
                &SpoolRow {
                    id: normalized.spool_id.to_string(),
                    master_id,
                    qr_code,
                    rfid_tag: None,
                    rfid_observed_at: None,
                    status: normalized.status,
                    ownership_type: "OWNED".to_string(),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(normalized.initial_weight_g),
                    current_weight_g: Some(normalized.current_weight_g),
                    remaining_g: Some(normalized.remaining_g),
                    spool_tare_weight_g: None,
                    location_id,
                    home_location_id,
                    purchase_date: purchase_metadata
                        .as_ref()
                        .and_then(|metadata| metadata.purchase_date.clone()),
                    purchase_price: purchase_metadata
                        .as_ref()
                        .and_then(|metadata| metadata.purchase_price),
                    batch_code: purchase_metadata
                        .as_ref()
                        .and_then(|metadata| metadata.batch_code.clone()),
                    last_used_at: None,
                    purchase_currency: purchase_metadata
                        .as_ref()
                        .and_then(|metadata| metadata.purchase_currency.clone()),
                    supplier_reference: purchase_metadata
                        .as_ref()
                        .and_then(|metadata| metadata.supplier_reference.clone()),
                },
            )?;
            created_count += 1;
        }
    }

    Ok(InventoryImportStats {
        imported_count: i64::try_from(rows.len()).unwrap_or(0),
        created_count,
        updated_count,
    })
}

fn update_imported_spool(
    conn: &Connection,
    update: ImportedSpoolUpdate<'_>,
) -> InventoryResult<()> {
    let ImportedSpoolUpdate {
        spool_id,
        master_id,
        qr_code,
        status,
        initial_weight_g,
        current_weight_g,
        remaining_g,
        location_id,
        purchase_metadata,
    } = update;

    conn.execute(
        "UPDATE filament_spools
         SET master_id = ?1,
             qr_code = ?2,
             status = ?3,
             initial_weight_g = ?4,
             current_weight_g = ?5,
             remaining_g = ?6,
             spool_tare_weight_g = NULL,
             location_id = ?7,
             home_location_id = ?8,
             updated_at = datetime('now')
         WHERE id = ?9",
        params![
            master_id,
            qr_code,
            status,
            initial_weight_g,
            current_weight_g,
            remaining_g,
            location_id,
            location_id,
            spool_id
        ],
    )?;
    if let Some(metadata) = purchase_metadata {
        update_spool_purchase_metadata(conn, spool_id, metadata)?;
    }
    Ok(())
}

struct ImportedSpoolUpdate<'a> {
    spool_id: &'a str,
    master_id: &'a str,
    qr_code: Option<&'a str>,
    status: &'a str,
    initial_weight_g: i64,
    current_weight_g: i64,
    remaining_g: i64,
    location_id: Option<&'a str>,
    purchase_metadata: Option<&'a super::purchase_receipt_metadata::PurchaseReceiptMetadata>,
}

fn normalize_import_row<'a>(
    row: &'a InventoryImportRow,
    index: usize,
) -> InventoryResult<NormalizedImportRow<'a>> {
    let spool_id = row.spool_id.trim();
    let material = row.material.trim();
    let filament_name = row.filament_name.trim();
    let color_name = row.color_name.trim();

    if spool_id.is_empty()
        || material.is_empty()
        || filament_name.is_empty()
        || color_name.is_empty()
    {
        return Err(InventoryError::Db(format!(
            "Invalid inventory row at index {}: spool_id, material, filament_name and color_name are required",
            index
        )));
    }

    let remaining_g = row
        .remaining_g
        .or(row.current_weight_g)
        .or(row.initial_weight_g)
        .unwrap_or(1000)
        .max(0);
    let current_weight_g = row.current_weight_g.unwrap_or(remaining_g).max(0);
    let initial_weight_g = row
        .initial_weight_g
        .unwrap_or(remaining_g.max(current_weight_g).max(1000))
        .max(current_weight_g)
        .max(remaining_g)
        .max(1);

    Ok(NormalizedImportRow {
        spool_id,
        material,
        filament_name,
        color_name,
        status: normalize_spool_status(row.status.as_deref()),
        initial_weight_g,
        current_weight_g,
        remaining_g,
    })
}

struct NormalizedImportRow<'a> {
    spool_id: &'a str,
    material: &'a str,
    filament_name: &'a str,
    color_name: &'a str,
    status: String,
    initial_weight_g: i64,
    current_weight_g: i64,
    remaining_g: i64,
}
