use rusqlite::{params, Connection};

use super::database_catalog_inputs::ManualMasterInput;
use super::database_catalog_manual::upsert_manual_master;
use super::database_import::{InventoryImportRow, InventoryImportStats};
use super::database_loan_create::create_inbound_spool_loan_in_transaction;
use super::database_loan_queries::spool_has_active_loan;
use super::database_locations::{ensure_location, get_location};
use super::database_result::{InventoryError, InventoryResult};
use super::database_spool_insert::insert_spool;
use super::database_spool_models::SpoolRow;
use super::database_spool_price_lock::lock_spool_price_for_historical_status;
use super::database_spool_queries::get_spool_by_id;
use super::database_spool_updates::update_spool_purchase_metadata;
use super::database_text::normalize_optional_text;
use super::filament_standards::PURCHASE_PRICE_SOURCE_MANUAL;
use super::loan_defaults::{ACTIVE_LOAN_PREDICATE_SQL, LOAN_DIRECTION_SELECT_SQL};
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
        let requested_spool_id = row.spool_id.trim();
        let existing_spool = if requested_spool_id.is_empty() {
            None
        } else {
            get_spool_by_id(conn, requested_spool_id)?
        };
        let existing_master_defaults = existing_spool
            .as_ref()
            .map(|spool| {
                conn.query_row(
                    "SELECT vendor, default_weight
                     FROM filament_master_list
                     WHERE id = ?1",
                    [spool.master_id.as_str()],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
                )
            })
            .transpose()?;
        let mut normalized = normalize_import_row(
            row,
            index,
            existing_spool.as_ref(),
            existing_master_defaults.as_ref().map(|(_, weight)| *weight),
        )?;
        let existing_managed_status = if existing_spool.is_some() {
            managed_relation_status(conn, normalized.spool_id)?
        } else {
            None
        };
        let existing_has_active_loan = existing_spool
            .as_ref()
            .map(|_| spool_has_active_loan(conn, normalized.spool_id))
            .transpose()?
            .unwrap_or(false);
        let resolved_ownership = resolve_imported_ownership(
            row,
            existing_spool.as_ref(),
            existing_has_active_loan,
            index,
        )?;
        let resolved_locations = resolve_imported_locations(
            conn,
            row,
            normalized.status.as_str(),
            existing_spool.as_ref(),
            existing_managed_status.as_deref(),
        )?;
        if let Some(status) = existing_managed_status {
            // The local AMS slot or active outbound loan is authoritative.
            // A lightweight inventory file cannot replace that relation.
            normalized.status = status;
        } else if matches!(normalized.status.as_str(), "ASSIGNED" | "BORROWED") {
            // Lightweight inventory exports do not contain the AMS-slot or
            // active-loan relation that owns these statuses. On a different
            // library, importing either status would create a dangling
            // assignment even when the source location is empty.
            normalized.status = "IN_STOCK".to_string();
        }
        let location_id = resolved_locations.location_id;
        let home_location_id = resolved_locations.home_location_id;
        let qr_code = normalize_optional_text(row.qr_code.as_deref());
        let vendor = normalize_optional_text(row.vendor.as_deref()).or_else(|| {
            existing_master_defaults
                .as_ref()
                .map(|(vendor, _)| vendor.clone())
        });
        let purchase_metadata = resolve_imported_purchase_metadata(row, existing_spool.as_ref())?;
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
        let historical_status = is_historical_status(&normalized.status);
        let existing_historical_status = existing_spool
            .as_ref()
            .map(|spool| spool.status.as_str())
            .filter(|status| is_historical_status(status));
        let preserves_historical_lock = historical_status || existing_historical_status.is_some();
        let imported_price_lock = if preserves_historical_lock {
            None
        } else {
            row.purchase_price_batch_locked
        };
        let new_spool_price_lock =
            historical_status || row.purchase_price_batch_locked.unwrap_or(false);

        if existing_spool.is_some() {
            update_imported_spool(
                conn,
                ImportedSpoolUpdate {
                    spool_id: normalized.spool_id,
                    master_id: &master_id,
                    qr_code: qr_code.as_deref(),
                    update_qr_code: row.has_qr_code,
                    status: &normalized.status,
                    update_ownership: resolved_ownership.update_existing,
                    ownership_type: &resolved_ownership.ownership_type,
                    owner_name: resolved_ownership.owner_name.as_deref(),
                    owner_contact: resolved_ownership.owner_contact.as_deref(),
                    ownership_note: resolved_ownership.ownership_note.as_deref(),
                    initial_weight_g: normalized.initial_weight_g,
                    update_initial_weight_g: row.has_initial_weight_g
                        && row.initial_weight_g.is_some(),
                    current_weight_g: normalized.current_weight_g,
                    update_current_weight_g: row.has_current_weight_g
                        && row.current_weight_g.is_some(),
                    remaining_g: normalized.remaining_g,
                    update_remaining_g: row.has_remaining_g && row.remaining_g.is_some(),
                    spool_tare_weight_g: row.spool_tare_weight_g,
                    location_id: location_id.as_deref(),
                    update_location_id: resolved_locations.update_location_id,
                    home_location_id: home_location_id.as_deref(),
                    update_home_location_id: resolved_locations.update_home_location_id,
                    purchase_metadata: purchase_metadata.as_ref(),
                    purchase_price_batch_locked: imported_price_lock,
                    purchase_price_source: row.purchase_price_source.as_ref(),
                },
            )?;
            let price_lock_status = if historical_status {
                normalized.status.as_str()
            } else {
                existing_historical_status.unwrap_or(normalized.status.as_str())
            };
            lock_spool_price_for_historical_status(
                conn,
                normalized.spool_id,
                price_lock_status,
                "INVENTORY_IMPORT",
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
                    status: normalized.status.clone(),
                    ownership_type: resolved_ownership.ownership_type.clone(),
                    owner_name: resolved_ownership.owner_name.clone(),
                    owner_contact: resolved_ownership.owner_contact.clone(),
                    ownership_note: resolved_ownership.ownership_note.clone(),
                    initial_weight_g: Some(normalized.initial_weight_g),
                    current_weight_g: Some(normalized.current_weight_g),
                    remaining_g: Some(normalized.remaining_g),
                    spool_tare_weight_g: row.spool_tare_weight_g.flatten(),
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
                    purchase_price_batch_locked: new_spool_price_lock,
                    purchase_price_source: row.purchase_price_source.clone().unwrap_or_else(|| {
                        purchase_metadata
                            .as_ref()
                            .and_then(|metadata| metadata.purchase_price)
                            .map(|_| PURCHASE_PRICE_SOURCE_MANUAL.to_string())
                    }),
                },
            )?;
            if resolved_ownership.ownership_type == "BORROWED_IN"
                && !is_historical_status(&normalized.status)
            {
                create_inbound_spool_loan_in_transaction(
                    conn,
                    normalized.spool_id,
                    resolved_ownership.owner_name.as_deref().unwrap_or(""),
                    resolved_ownership.owner_contact.as_deref(),
                    resolved_ownership.ownership_note.as_deref(),
                    normalized.remaining_g,
                )?;
            }
            update_imported_price_protection(
                conn,
                normalized.spool_id,
                Some(new_spool_price_lock),
                row.purchase_price_source.as_ref(),
            )?;
            created_count += 1;
        }
        if existing_spool.is_some()
            && !existing_has_active_loan
            && existing_spool
                .as_ref()
                .is_some_and(|spool| spool.ownership_type != "BORROWED_IN")
            && resolved_ownership.ownership_type == "BORROWED_IN"
            && !is_historical_status(&normalized.status)
        {
            create_inbound_spool_loan_in_transaction(
                conn,
                normalized.spool_id,
                resolved_ownership.owner_name.as_deref().unwrap_or(""),
                resolved_ownership.owner_contact.as_deref(),
                resolved_ownership.ownership_note.as_deref(),
                normalized.remaining_g,
            )?;
        }
    }

    Ok(InventoryImportStats {
        imported_count: i64::try_from(rows.len()).unwrap_or(0),
        created_count,
        updated_count,
    })
}

fn resolve_imported_purchase_metadata(
    row: &InventoryImportRow,
    existing_spool: Option<&SpoolRow>,
) -> InventoryResult<Option<super::purchase_receipt_metadata::PurchaseReceiptMetadata>> {
    let Some(imported) = row.purchase_metadata.clone() else {
        return Ok(None);
    };
    let imported = imported.normalize_for_import()?;
    let (Some(presence), Some(existing_spool)) =
        (row.purchase_metadata_field_presence, existing_spool)
    else {
        return Ok(Some(imported));
    };

    let mut merged =
        super::purchase_receipt_metadata::PurchaseReceiptMetadata::from_spool(existing_spool);
    if presence.purchase_price {
        merged.purchase_price = imported.purchase_price;
    }
    if presence.purchase_currency {
        merged.purchase_currency = imported.purchase_currency;
    }
    if presence.purchase_date {
        merged.purchase_date = imported.purchase_date;
    }
    if presence.batch_code {
        merged.batch_code = imported.batch_code;
    }
    if presence.supplier_reference {
        merged.supplier_reference = imported.supplier_reference;
    }
    Ok(Some(merged.normalize_for_import()?))
}

fn update_imported_spool(
    conn: &Connection,
    update: ImportedSpoolUpdate<'_>,
) -> InventoryResult<()> {
    let ImportedSpoolUpdate {
        spool_id,
        master_id,
        qr_code,
        update_qr_code,
        status,
        update_ownership,
        ownership_type,
        owner_name,
        owner_contact,
        ownership_note,
        initial_weight_g,
        update_initial_weight_g,
        current_weight_g,
        update_current_weight_g,
        remaining_g,
        update_remaining_g,
        spool_tare_weight_g,
        location_id,
        update_location_id,
        home_location_id,
        update_home_location_id,
        purchase_metadata,
        purchase_price_batch_locked,
        purchase_price_source,
    } = update;

    conn.execute(
        "UPDATE filament_spools
         SET master_id = ?1,
             qr_code = CASE WHEN ?2 THEN ?3 ELSE qr_code END,
             status = ?4,
             ownership_type = CASE WHEN ?5 THEN ?6 ELSE ownership_type END,
             owner_name = CASE WHEN ?5 THEN ?7 ELSE owner_name END,
             owner_contact = CASE WHEN ?5 THEN ?8 ELSE owner_contact END,
             ownership_note = CASE WHEN ?5 THEN ?9 ELSE ownership_note END,
             initial_weight_g = CASE WHEN ?10 THEN ?11 ELSE initial_weight_g END,
             current_weight_g = CASE WHEN ?12 THEN ?13 ELSE current_weight_g END,
             remaining_g = CASE WHEN ?14 THEN ?15 ELSE remaining_g END,
             spool_tare_weight_g = CASE WHEN ?16 THEN ?17 ELSE spool_tare_weight_g END,
             location_id = CASE WHEN ?18 THEN ?19 ELSE location_id END,
             home_location_id = CASE WHEN ?20 THEN ?21 ELSE home_location_id END,
             updated_at = datetime('now')
         WHERE id = ?22",
        params![
            master_id,
            update_qr_code,
            qr_code,
            status,
            update_ownership,
            ownership_type,
            owner_name,
            owner_contact,
            ownership_note,
            update_initial_weight_g,
            initial_weight_g,
            update_current_weight_g,
            current_weight_g,
            update_remaining_g,
            remaining_g,
            spool_tare_weight_g.is_some(),
            spool_tare_weight_g.flatten(),
            update_location_id,
            location_id,
            update_home_location_id,
            home_location_id,
            spool_id
        ],
    )?;
    if let Some(metadata) = purchase_metadata {
        update_spool_purchase_metadata(conn, spool_id, metadata)?;
    }
    update_imported_price_protection(
        conn,
        spool_id,
        purchase_price_batch_locked,
        purchase_price_source,
    )?;
    Ok(())
}

fn update_imported_price_protection(
    conn: &Connection,
    spool_id: &str,
    purchase_price_batch_locked: Option<bool>,
    purchase_price_source: Option<&Option<String>>,
) -> InventoryResult<()> {
    if purchase_price_batch_locked.is_none() && purchase_price_source.is_none() {
        return Ok(());
    }
    conn.execute(
        "UPDATE filament_spools
         SET purchase_price_batch_locked = CASE WHEN ?1 THEN ?2 ELSE purchase_price_batch_locked END,
             purchase_price_source = CASE WHEN ?3 THEN ?4 ELSE purchase_price_source END,
             updated_at = datetime('now')
         WHERE id = ?5",
        params![
            purchase_price_batch_locked.is_some(),
            purchase_price_batch_locked.unwrap_or(false),
            purchase_price_source.is_some(),
            purchase_price_source.cloned().flatten(),
            spool_id,
        ],
    )?;
    Ok(())
}

struct ImportedSpoolUpdate<'a> {
    spool_id: &'a str,
    master_id: &'a str,
    qr_code: Option<&'a str>,
    update_qr_code: bool,
    status: &'a str,
    update_ownership: bool,
    ownership_type: &'a str,
    owner_name: Option<&'a str>,
    owner_contact: Option<&'a str>,
    ownership_note: Option<&'a str>,
    initial_weight_g: i64,
    update_initial_weight_g: bool,
    current_weight_g: i64,
    update_current_weight_g: bool,
    remaining_g: i64,
    update_remaining_g: bool,
    spool_tare_weight_g: Option<Option<i64>>,
    location_id: Option<&'a str>,
    update_location_id: bool,
    home_location_id: Option<&'a str>,
    update_home_location_id: bool,
    purchase_metadata: Option<&'a super::purchase_receipt_metadata::PurchaseReceiptMetadata>,
    purchase_price_batch_locked: Option<bool>,
    purchase_price_source: Option<&'a Option<String>>,
}

struct ResolvedImportedOwnership {
    ownership_type: String,
    owner_name: Option<String>,
    owner_contact: Option<String>,
    ownership_note: Option<String>,
    update_existing: bool,
}

fn resolve_imported_ownership(
    row: &InventoryImportRow,
    existing_spool: Option<&SpoolRow>,
    existing_has_active_loan: bool,
    index: usize,
) -> InventoryResult<ResolvedImportedOwnership> {
    let existing_ownership_type = existing_spool
        .map(|spool| spool.ownership_type.clone())
        .unwrap_or_else(|| "OWNED".to_string());
    let existing_owner_name = existing_spool.and_then(|spool| spool.owner_name.clone());
    let existing_owner_contact = existing_spool.and_then(|spool| spool.owner_contact.clone());
    let existing_ownership_note = existing_spool.and_then(|spool| spool.ownership_note.clone());
    let has_imported_ownership = row.has_ownership_type
        || row.owner_name.is_some()
        || row.owner_contact.is_some()
        || row.ownership_note.is_some();

    // Active local loan relations are authoritative. A lightweight inventory
    // file contains no loan ids or lifecycle history and must not rewrite the
    // ownership fields out from under that relation.
    if existing_has_active_loan {
        return Ok(ResolvedImportedOwnership {
            ownership_type: existing_ownership_type,
            owner_name: existing_owner_name,
            owner_contact: existing_owner_contact,
            ownership_note: existing_ownership_note,
            update_existing: false,
        });
    }

    let ownership_type = if row.has_ownership_type {
        row.ownership_type
            .clone()
            .unwrap_or_else(|| "OWNED".to_string())
    } else {
        existing_ownership_type
    };
    let owner_name = row.owner_name.clone().unwrap_or(existing_owner_name);
    let owner_contact = row.owner_contact.clone().unwrap_or(existing_owner_contact);
    let ownership_note = row
        .ownership_note
        .clone()
        .unwrap_or(existing_ownership_note);
    if ownership_type == "BORROWED_IN" && owner_name.is_none() {
        return Err(InventoryError::Db(format!(
            "Inventory row {index} borrowed-in ownership requires `owner_name`"
        )));
    }
    Ok(ResolvedImportedOwnership {
        ownership_type,
        owner_name,
        owner_contact,
        ownership_note,
        update_existing: existing_spool.is_some() && has_imported_ownership,
    })
}

struct ResolvedImportedLocations {
    location_id: Option<String>,
    home_location_id: Option<String>,
    update_location_id: bool,
    update_home_location_id: bool,
}

fn resolve_imported_locations(
    conn: &Connection,
    row: &InventoryImportRow,
    status: &str,
    existing_spool: Option<&SpoolRow>,
    existing_managed_status: Option<&str>,
) -> InventoryResult<ResolvedImportedLocations> {
    if existing_managed_status.is_some() {
        let existing = existing_spool.expect("managed status requires an existing spool");
        let home_location_id = if row.has_home_location {
            resolve_structured_location(
                conn,
                row.home_location_id.as_deref(),
                row.home_location_name.as_deref(),
                row.home_location_type.as_deref(),
                false,
            )?
            .id
        } else {
            existing.home_location_id.clone()
        };
        return Ok(ResolvedImportedLocations {
            location_id: existing.location_id.clone(),
            home_location_id,
            update_location_id: false,
            update_home_location_id: row.has_home_location,
        });
    }

    if row.has_structured_locations {
        let update_location_id = row.has_current_location || row.has_legacy_location;
        let current = if row.has_current_location {
            let location_name = row.location_name.as_deref().or(row.location.as_deref());
            resolve_structured_location(
                conn,
                row.location_id.as_deref(),
                location_name,
                row.location_type.as_deref(),
                matches!(status, "ASSIGNED" | "BORROWED"),
            )?
            .id
        } else if row.has_legacy_location {
            match normalize_optional_text(row.location.as_deref()) {
                Some(reference) => resolve_legacy_location(conn, &reference)?,
                None => None,
            }
        } else {
            existing_spool.and_then(|spool| spool.location_id.clone())
        };
        let home = if row.has_home_location {
            resolve_structured_location(
                conn,
                row.home_location_id.as_deref(),
                row.home_location_name.as_deref(),
                row.home_location_type.as_deref(),
                false,
            )?
            .id
        } else {
            existing_spool.and_then(|spool| spool.home_location_id.clone())
        };
        return Ok(ResolvedImportedLocations {
            location_id: current,
            home_location_id: home,
            update_location_id,
            update_home_location_id: row.has_home_location,
        });
    }

    if !row.has_legacy_location {
        return Ok(ResolvedImportedLocations {
            location_id: existing_spool.and_then(|spool| spool.location_id.clone()),
            home_location_id: existing_spool.and_then(|spool| spool.home_location_id.clone()),
            update_location_id: false,
            update_home_location_id: false,
        });
    }
    let legacy_location = row.location.as_deref().or(row.location_id.as_deref());
    if matches!(status, "ASSIGNED" | "BORROWED") {
        return Ok(ResolvedImportedLocations {
            location_id: None,
            home_location_id: None,
            update_location_id: false,
            update_home_location_id: false,
        });
    }
    let location_id = match normalize_optional_text(legacy_location) {
        Some(reference) => resolve_legacy_location(conn, &reference)?,
        None => None,
    };
    Ok(ResolvedImportedLocations {
        location_id: location_id.clone(),
        home_location_id: location_id,
        update_location_id: true,
        update_home_location_id: true,
    })
}

struct ResolvedStructuredLocation {
    id: Option<String>,
}

fn resolve_structured_location(
    conn: &Connection,
    id: Option<&str>,
    name: Option<&str>,
    location_type: Option<&str>,
    status_requires_managed_location: bool,
) -> InventoryResult<ResolvedStructuredLocation> {
    let normalized_id = normalize_optional_text(id);
    let location_is_managed = normalize_optional_text(location_type)
        .is_some_and(|kind| !kind.eq_ignore_ascii_case("GENERIC"))
        || status_requires_managed_location;
    if location_is_managed {
        return Ok(ResolvedStructuredLocation { id: None });
    }
    if let Some(id) = normalized_id.as_deref()
        && let Some(existing) = get_location(conn, id)?
    {
        return Ok(ResolvedStructuredLocation {
            id: existing
                .location_type
                .eq_ignore_ascii_case("GENERIC")
                .then(|| existing.id.clone()),
        });
    }
    // Stable ids are meaningful only when they resolve in this database. A
    // structured export supplies the human name separately for cross-library
    // import; never turn an unresolved internal id into a visible shelf name.
    let id = match normalize_optional_text(name) {
        Some(name) => ensure_location(conn, &name).map(Some)?,
        None => None,
    };
    Ok(ResolvedStructuredLocation { id })
}

fn managed_relation_status(conn: &Connection, spool_id: &str) -> InventoryResult<Option<String>> {
    let sql = format!(
        "SELECT CASE
            WHEN EXISTS (
                SELECT 1 FROM ams_slots WHERE spool_id = ?1
            ) THEN 'ASSIGNED'
            WHEN EXISTS (
                SELECT 1
                FROM spool_loans
                WHERE spool_id = ?1
                  AND {ACTIVE_LOAN_PREDICATE_SQL}
                  AND ({LOAN_DIRECTION_SELECT_SQL}) = 'OUTBOUND'
            ) THEN 'BORROWED'
            ELSE NULL
         END"
    );
    conn.query_row(&sql, params![spool_id], |row| row.get(0))
        .map_err(Into::into)
}

fn resolve_legacy_location(conn: &Connection, reference: &str) -> InventoryResult<Option<String>> {
    if let Some(existing) = get_location(conn, reference)? {
        return Ok(existing
            .location_type
            .eq_ignore_ascii_case("GENERIC")
            .then(|| existing.id.clone()));
    }
    // Older exports wrote the opaque database id into the human-readable
    // `location` field. That id is only meaningful in the source database: on
    // a fresh database, creating a visible shelf named after it would turn an
    // unresolved foreign key into user-facing junk. Existing ids are reused
    // above, while ordinary legacy names remain importable below.
    if is_generated_location_id(reference) {
        return Ok(None);
    }
    ensure_location(conn, reference).map(Some)
}

fn is_generated_location_id(reference: &str) -> bool {
    reference.strip_prefix("location_").is_some_and(|suffix| {
        suffix.len() == 32 && suffix.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn normalize_import_row<'a>(
    row: &'a InventoryImportRow,
    index: usize,
    existing_spool: Option<&SpoolRow>,
    existing_master_default_weight: Option<i64>,
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
        .or_else(|| existing_spool.and_then(|spool| spool.remaining_g))
        .or(row.current_weight_g)
        .or_else(|| existing_spool.and_then(|spool| spool.current_weight_g))
        .or(row.initial_weight_g)
        .or_else(|| existing_spool.and_then(|spool| spool.initial_weight_g))
        .or(existing_master_default_weight)
        .unwrap_or(1000)
        .max(0);
    let current_weight_g = row
        .current_weight_g
        .or_else(|| existing_spool.and_then(|spool| spool.current_weight_g))
        .unwrap_or(remaining_g)
        .max(0);
    let initial_weight_g = row
        .initial_weight_g
        .or_else(|| existing_spool.and_then(|spool| spool.initial_weight_g))
        .or(existing_master_default_weight)
        .unwrap_or(remaining_g.max(current_weight_g).max(1000))
        .max(current_weight_g)
        .max(remaining_g)
        .max(1);

    Ok(NormalizedImportRow {
        spool_id,
        material,
        filament_name,
        color_name,
        status: normalize_spool_status(
            row.status
                .as_deref()
                .map(str::trim)
                .filter(|status| !status.is_empty())
                .or_else(|| existing_spool.map(|spool| spool.status.as_str())),
        ),
        initial_weight_g,
        current_weight_g,
        remaining_g,
    })
}

fn is_historical_status(status: &str) -> bool {
    matches!(
        status,
        "EMPTY" | "LOST" | "MISSING" | "DELETED" | "ARCHIVED"
    )
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

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::import_inventory_spools_rows;
    use crate::backend::database_import::parse_inventory_spools_json;
    use crate::backend::database_schema_setup::apply_schema_migrations;

    const SCHEMA_SQL: &str = include_str!("../database/schema.sql");

    fn import_json(conn: &Connection, content: &str) {
        let rows = parse_inventory_spools_json(content).expect("parse lightweight inventory");
        import_inventory_spools_rows(conn, &rows).expect("import lightweight inventory");
    }

    #[test]
    fn explicit_false_cannot_unlock_lost_or_empty_spool_during_reactivation() {
        let conn = Connection::open_in_memory().expect("open database");
        apply_schema_migrations(&conn, SCHEMA_SQL).expect("apply schema");

        import_json(
            &conn,
            r#"[
                {"spool_id":"lost-reactivation","material":"PLA","filament_name":"Basic","color_name":"Black","status":"IN_STOCK","purchase_price_batch_locked":false},
                {"spool_id":"empty-reactivation","material":"PETG","filament_name":"Basic","color_name":"White","status":"IN_STOCK","purchase_price_batch_locked":false}
            ]"#,
        );
        import_json(
            &conn,
            r#"[
                {"spool_id":"lost-reactivation","material":"PLA","filament_name":"Basic","color_name":"Black","status":"LOST","purchase_price_batch_locked":false},
                {"spool_id":"empty-reactivation","material":"PETG","filament_name":"Basic","color_name":"White","status":"EMPTY","purchase_price_batch_locked":false}
            ]"#,
        );
        import_json(
            &conn,
            r#"[
                {"spool_id":"lost-reactivation","material":"PLA","filament_name":"Basic","color_name":"Black","status":"IN_STOCK","purchase_price_batch_locked":false},
                {"spool_id":"empty-reactivation","material":"PETG","filament_name":"Basic","color_name":"White","status":"IN_STOCK","purchase_price_batch_locked":false}
            ]"#,
        );

        let protected: (i64, i64) = conn
            .query_row(
                "SELECT
                    SUM(status = 'IN_STOCK'),
                    SUM(purchase_price_batch_locked = 1)
                 FROM filament_spools
                 WHERE id IN ('lost-reactivation', 'empty-reactivation')",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read reactivated spools");
        assert_eq!(protected, (2, 2));

        let lock_events: i64 = conn
            .query_row(
                "SELECT COUNT(*)
                 FROM spool_history_events
                 WHERE event_type = 'PURCHASE_PRICE_BATCH_LOCK_UPDATED'
                   AND json_extract(payload_json, '$.source') = 'INVENTORY_IMPORT'",
                [],
                |row| row.get(0),
            )
            .expect("count import lock audit events");
        assert_eq!(lock_events, 2, "reactivation must not add an unlock event");
    }
}
