use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::database_events::insert_spool_history_event;
use super::database_result::{InventoryError, InventoryResult};
use super::database_revision::{bump_library_domain_revision, INVENTORY_REVISION_DOMAIN};
use super::database_settings::{delete_setting, get_setting, set_setting};
use super::filament_standards::{
    canonical_vendor_display_component, canonical_vendor_group_key_component,
    filament_price_group_key_for_master, normalize_currency, validate_price,
    FilamentPriceBatchInput, FilamentPriceBatchMode, FilamentPriceBatchReceipt,
    FilamentPriceBatchSkipReason, FilamentPriceBatchSkippedSpool, FilamentPriceBatchUpdatedSpool,
    FilamentPriceGroup, FilamentPriceGroupSpool, FilamentPriceStandard, FilamentStandardsSettings,
    FilamentStandardsSnapshot, PURCHASE_PRICE_SOURCE_MANUAL, PURCHASE_PRICE_SOURCE_STANDARD_BATCH,
};
use super::inventory_domain::{is_historical_spool_status, OwnershipType};

pub const DEFAULT_PURCHASE_CURRENCY_SETTING_KEY: &str = "default_purchase_currency";
pub const FILAMENT_PRICE_STANDARDS_SETTING_KEY: &str = "filament_price_standards_json";

#[derive(Deserialize, Serialize)]
struct StoredFilamentPriceStandards {
    schema_version: i64,
    #[serde(default)]
    price_standards: Vec<FilamentPriceStandard>,
}

#[derive(Clone, Debug)]
struct StoredGroupSpool {
    spool_id: String,
    master_id: String,
    color_name: String,
    status: String,
    ownership_type: String,
    purchase_price: Option<f64>,
    purchase_currency: Option<String>,
    purchase_price_source: Option<String>,
    purchase_price_batch_locked: bool,
    deleted_at: Option<String>,
    vendor: String,
    material: String,
    filament_name: String,
    nominal_weight_g: i64,
}

enum VerifiedBatchAction {
    Update {
        spool: Box<StoredGroupSpool>,
        purchase_price: f64,
        purchase_currency: String,
        purchase_price_source: String,
        purchase_price_batch_locked: bool,
        historical_missing_price_fill: bool,
    },
    Skip(FilamentPriceBatchSkippedSpool),
}

pub(crate) fn get_filament_standards(
    connection: &Connection,
) -> InventoryResult<FilamentStandardsSnapshot> {
    let (mut settings, mut settings_valid) = load_filament_standards_settings(connection)?;
    if remove_orphaned_price_standards(connection, &mut settings)? {
        settings_valid = false;
    }
    let groups = list_filament_price_groups(connection, &settings)?;
    Ok(FilamentStandardsSnapshot {
        settings,
        settings_valid,
        groups,
    })
}

pub(crate) fn save_filament_standards(
    connection: &Connection,
    settings: FilamentStandardsSettings,
) -> InventoryResult<FilamentStandardsSnapshot> {
    let settings = settings.normalized()?;
    validate_standards_match_authoritative_groups(connection, &settings)?;
    match settings.default_purchase_currency.as_deref() {
        Some(currency) => set_setting(connection, DEFAULT_PURCHASE_CURRENCY_SETTING_KEY, currency)?,
        None => delete_setting(connection, DEFAULT_PURCHASE_CURRENCY_SETTING_KEY)?,
    }
    let stored = StoredFilamentPriceStandards {
        schema_version: settings.schema_version,
        price_standards: settings.price_standards.clone(),
    };
    let serialized = serde_json::to_string(&stored).map_err(|error| {
        InventoryError::Db(format!(
            "Could not serialize filament price standards: {error}"
        ))
    })?;
    set_setting(
        connection,
        FILAMENT_PRICE_STANDARDS_SETTING_KEY,
        &serialized,
    )?;
    bump_library_domain_revision(connection, INVENTORY_REVISION_DOMAIN)?;
    let groups = list_filament_price_groups(connection, &settings)?;
    Ok(FilamentStandardsSnapshot {
        settings,
        settings_valid: true,
        groups,
    })
}

fn validate_standards_match_authoritative_groups(
    connection: &Connection,
    settings: &FilamentStandardsSettings,
) -> InventoryResult<()> {
    let authoritative = authoritative_group_map(connection)?;
    for standard in &settings.price_standards {
        let Some(group) = authoritative.get(&standard.group_key) else {
            return Err(invalid_batch(
                "filament_standards.group_missing",
                format!(
                    "Filament price group '{}' no longer exists. Refresh the standards before saving.",
                    standard.group_key
                ),
            ));
        };
        if !standard_matches_group(standard, group) {
            return Err(invalid_batch(
                "filament_standards.group_metadata_stale",
                format!(
                    "Filament price group '{}' changed after it was reviewed.",
                    standard.group_key
                ),
            ));
        }
    }
    Ok(())
}

fn remove_orphaned_price_standards(
    connection: &Connection,
    settings: &mut FilamentStandardsSettings,
) -> InventoryResult<bool> {
    let authoritative = authoritative_group_map(connection)?;
    let before = settings.price_standards.len();
    settings.price_standards.retain(|standard| {
        authoritative
            .get(&standard.group_key)
            .is_some_and(|group| standard_matches_group(standard, group))
    });
    Ok(settings.price_standards.len() != before)
}

fn authoritative_group_map(
    connection: &Connection,
) -> InventoryResult<HashMap<String, FilamentPriceGroup>> {
    Ok(
        list_filament_price_groups(connection, &FilamentStandardsSettings::default())?
            .into_iter()
            .map(|group| (group.group_key.clone(), group))
            .collect(),
    )
}

fn standard_matches_group(standard: &FilamentPriceStandard, group: &FilamentPriceGroup) -> bool {
    canonical_vendor_group_key_component(&standard.vendor)
        == canonical_vendor_group_key_component(&group.vendor)
        && normalized_metadata_token(&standard.material)
            == normalized_metadata_token(&group.material)
        && normalized_metadata_token(&standard.filament_name)
            == normalized_metadata_token(&group.filament_name)
        && standard.nominal_weight_g == group.nominal_weight_g
}

fn normalized_metadata_token(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_uppercase()
}

pub(crate) fn apply_filament_price_batch(
    connection: &Connection,
    input: FilamentPriceBatchInput,
) -> InventoryResult<FilamentPriceBatchReceipt> {
    validate_price(input.price)?;
    let currency = normalize_currency(input.currency)?;
    let group_key = input.group_key.trim().to_string();
    if group_key.is_empty() {
        return Err(invalid_batch(
            "filament_price_batch.group_required",
            "A filament price group is required.",
        ));
    }
    if input.spools.is_empty() {
        return Err(invalid_batch(
            "filament_price_batch.empty_selection",
            "Select at least one filament spool for price application.",
        ));
    }

    let mut seen = HashSet::with_capacity(input.spools.len());
    for precondition in &input.spools {
        let spool_id = precondition.spool_id.trim();
        if spool_id.is_empty() {
            return Err(invalid_batch(
                "filament_price_batch.blank_spool_id",
                "Filament price batch spool ids cannot be blank.",
            ));
        }
        if !seen.insert(spool_id.to_string()) {
            return Err(invalid_batch(
                "filament_price_batch.duplicate_spool_id",
                format!("Spool '{spool_id}' appears more than once in the price batch."),
            ));
        }
    }

    let mut verified = Vec::with_capacity(input.spools.len());
    for precondition in &input.spools {
        let spool_id = precondition.spool_id.trim();
        let spool = load_group_spool(connection, spool_id)?
            .ok_or_else(|| stale_batch(format!("Spool '{spool_id}' no longer exists.")))?;
        if spool.deleted_at.is_some() {
            return Err(stale_batch(format!(
                "Spool '{spool_id}' was removed after the price review."
            )));
        }
        let actual_group_key = filament_price_group_key_for_master(
            &spool.vendor,
            &spool.material,
            &spool.filament_name,
            spool.nominal_weight_g,
            &spool.master_id,
        );
        if actual_group_key != group_key
            || precondition.expected_master_id != spool.master_id
            || precondition.expected_status != spool.status
            || precondition.expected_ownership_type != spool.ownership_type
            || precondition.expected_purchase_price != spool.purchase_price
            || precondition.expected_purchase_currency != spool.purchase_currency
            || precondition.expected_purchase_price_source != spool.purchase_price_source
            || precondition.expected_purchase_price_batch_locked
                != spool.purchase_price_batch_locked
        {
            return Err(stale_batch(format!(
                "Spool '{spool_id}' changed after the price review. Review the group again."
            )));
        }

        verified.push(verify_batch_action(
            spool,
            input.mode,
            input.price,
            &currency,
            precondition.allow_historical_missing_price_fill,
        )?);
    }

    let batch_id = format!("filament_price_batch_{:032x}", rand::random::<u128>());
    let mut updated = Vec::new();
    let mut skipped = Vec::new();
    for action in verified {
        match action {
            VerifiedBatchAction::Skip(row) => skipped.push(row),
            VerifiedBatchAction::Update {
                spool,
                purchase_price,
                purchase_currency,
                purchase_price_source,
                purchase_price_batch_locked,
                historical_missing_price_fill,
            } => {
                let affected = connection.execute(
                    "UPDATE filament_spools
                     SET purchase_price = ?1,
                         purchase_currency = ?2,
                         purchase_price_source = ?3,
                         purchase_price_batch_locked = ?4,
                         updated_at = datetime('now')
                     WHERE id = ?5 AND deleted_at IS NULL",
                    params![
                        purchase_price,
                        purchase_currency,
                        purchase_price_source,
                        purchase_price_batch_locked,
                        spool.spool_id
                    ],
                )?;
                if affected != 1 {
                    return Err(stale_batch(format!(
                        "Spool '{}' disappeared while the price batch was applied.",
                        spool.spool_id
                    )));
                }
                let payload = json!({
                    "batch_id": batch_id,
                    "mode": input.mode.as_str(),
                    "group_key": group_key,
                    "before": {
                        "purchase_price": spool.purchase_price,
                        "purchase_currency": spool.purchase_currency,
                        "purchase_price_source": spool.purchase_price_source,
                        "purchase_price_batch_locked": spool.purchase_price_batch_locked,
                    },
                    "after": {
                        "purchase_price": purchase_price,
                        "purchase_currency": purchase_currency,
                        "purchase_price_source": purchase_price_source,
                        "purchase_price_batch_locked": purchase_price_batch_locked,
                    },
                    "historical_missing_price_fill": historical_missing_price_fill,
                });
                insert_spool_history_event(
                    connection,
                    &spool.spool_id,
                    "PURCHASE_PRICE_STANDARD_APPLIED",
                    &serde_json::to_string(&payload)
                        .map_err(|error| InventoryError::Db(error.to_string()))?,
                )?;
                updated.push(FilamentPriceBatchUpdatedSpool {
                    spool_id: spool.spool_id,
                    master_id: spool.master_id,
                    color_name: spool.color_name,
                    previous_purchase_price: spool.purchase_price,
                    previous_purchase_currency: spool.purchase_currency,
                    purchase_price,
                    purchase_currency,
                    purchase_price_source,
                    purchase_price_batch_locked,
                });
            }
        }
    }

    Ok(FilamentPriceBatchReceipt {
        batch_id,
        mode: input.mode,
        group_key,
        committed: true,
        updated_count: i64::try_from(updated.len()).unwrap_or(i64::MAX),
        skipped_count: i64::try_from(skipped.len()).unwrap_or(i64::MAX),
        updated,
        skipped,
    })
}

fn load_filament_standards_settings(
    connection: &Connection,
) -> InventoryResult<(FilamentStandardsSettings, bool)> {
    let mut settings = FilamentStandardsSettings::default();
    let mut valid = true;
    if let Some(raw_currency) = get_setting(connection, DEFAULT_PURCHASE_CURRENCY_SETTING_KEY)? {
        match normalize_currency(raw_currency) {
            Ok(currency) => settings.default_purchase_currency = Some(currency),
            Err(_) => valid = false,
        }
    }
    if let Some(raw) = get_setting(connection, FILAMENT_PRICE_STANDARDS_SETTING_KEY)? {
        match serde_json::from_str::<StoredFilamentPriceStandards>(&raw)
            .map_err(|error| error.to_string())
            .and_then(|stored| {
                FilamentStandardsSettings {
                    schema_version: stored.schema_version,
                    default_purchase_currency: settings.default_purchase_currency.clone(),
                    price_standards: stored.price_standards,
                }
                .normalized()
                .map_err(|error| error.to_string())
            }) {
            Ok(normalized) => settings.price_standards = normalized.price_standards,
            Err(_) => valid = false,
        }
    }
    Ok((settings, valid))
}

fn list_filament_price_groups(
    connection: &Connection,
    settings: &FilamentStandardsSettings,
) -> InventoryResult<Vec<FilamentPriceGroup>> {
    let standards = settings
        .price_standards
        .iter()
        .cloned()
        .map(|standard| (standard.group_key.clone(), standard))
        .collect::<HashMap<_, _>>();
    let mut statement = connection.prepare(
        "SELECT s.id, s.master_id, m.color_name, s.status, s.ownership_type,
                s.purchase_price, s.purchase_currency, s.purchase_price_source,
                s.purchase_price_batch_locked, s.deleted_at, m.vendor, m.material,
                m.filament_name, m.default_weight
         FROM filament_spools s
         JOIN filament_master_list m ON m.id = s.master_id
         WHERE s.deleted_at IS NULL
         ORDER BY m.vendor COLLATE NOCASE, m.material COLLATE NOCASE,
                  m.filament_name COLLATE NOCASE, m.default_weight, m.color_name COLLATE NOCASE,
                  s.id",
    )?;
    let rows = statement.query_map([], map_group_spool)?;
    let mut grouped: BTreeMap<String, Vec<StoredGroupSpool>> = BTreeMap::new();
    for row in rows {
        let spool = row?;
        let key = filament_price_group_key_for_master(
            &spool.vendor,
            &spool.material,
            &spool.filament_name,
            spool.nominal_weight_g,
            &spool.master_id,
        );
        grouped.entry(key).or_default().push(spool);
    }

    let mut groups = Vec::with_capacity(grouped.len());
    for (group_key, rows) in grouped {
        let first = rows.first().expect("grouped spool rows cannot be empty");
        let mut group = FilamentPriceGroup {
            group_key: group_key.clone(),
            vendor: canonical_vendor_display_component(&first.vendor),
            material: first.material.clone(),
            filament_name: first.filament_name.clone(),
            nominal_weight_g: first.nominal_weight_g,
            spool_count: 0,
            owned_spool_count: 0,
            borrowed_in_spool_count: 0,
            missing_price_count: 0,
            missing_currency_count: 0,
            manual_price_count: 0,
            standard_batch_price_count: 0,
            locked_count: 0,
            standard: standards.get(&group_key).cloned(),
            spools: Vec::with_capacity(rows.len()),
        };
        for row in rows {
            group.spool_count += 1;
            let is_historical = is_historical_status(&row.status);
            if OwnershipType::from_raw(Some(&row.ownership_type)).is_borrowed_in() {
                group.borrowed_in_spool_count += 1;
            } else if !is_historical {
                group.owned_spool_count += 1;
            }
            if row.purchase_price.is_none() {
                group.missing_price_count += 1;
            }
            if normalized_existing_currency(row.purchase_currency.as_deref()).is_err()
                || normalized_existing_currency(row.purchase_currency.as_deref())
                    .ok()
                    .flatten()
                    .is_none()
            {
                group.missing_currency_count += 1;
            }
            if row.purchase_price.is_some() {
                if row.purchase_price_source.as_deref()
                    == Some(PURCHASE_PRICE_SOURCE_STANDARD_BATCH)
                {
                    group.standard_batch_price_count += 1;
                } else {
                    group.manual_price_count += 1;
                }
            }
            if row.purchase_price_batch_locked {
                group.locked_count += 1;
            }
            group.spools.push(FilamentPriceGroupSpool {
                spool_id: row.spool_id,
                master_id: row.master_id,
                color_name: row.color_name,
                status: row.status,
                ownership_type: row.ownership_type,
                purchase_price: row.purchase_price,
                purchase_currency: row.purchase_currency,
                purchase_price_source: row.purchase_price_source,
                purchase_price_batch_locked: row.purchase_price_batch_locked,
            });
        }
        groups.push(group);
    }
    groups.sort_by(|left, right| {
        left.vendor
            .to_lowercase()
            .cmp(&right.vendor.to_lowercase())
            .then_with(|| {
                left.material
                    .to_lowercase()
                    .cmp(&right.material.to_lowercase())
            })
            .then_with(|| {
                left.filament_name
                    .to_lowercase()
                    .cmp(&right.filament_name.to_lowercase())
            })
            .then_with(|| left.nominal_weight_g.cmp(&right.nominal_weight_g))
    });
    Ok(groups)
}

fn map_group_spool(row: &rusqlite::Row<'_>) -> Result<StoredGroupSpool, rusqlite::Error> {
    Ok(StoredGroupSpool {
        spool_id: row.get(0)?,
        master_id: row.get(1)?,
        color_name: row.get(2)?,
        status: row.get(3)?,
        ownership_type: row.get(4)?,
        purchase_price: row.get(5)?,
        purchase_currency: row.get(6)?,
        purchase_price_source: row.get(7)?,
        purchase_price_batch_locked: row.get(8)?,
        deleted_at: row.get(9)?,
        vendor: row.get(10)?,
        material: row.get(11)?,
        filament_name: row.get(12)?,
        nominal_weight_g: row.get(13)?,
    })
}

fn load_group_spool(
    connection: &Connection,
    spool_id: &str,
) -> InventoryResult<Option<StoredGroupSpool>> {
    connection
        .query_row(
            "SELECT s.id, s.master_id, m.color_name, s.status, s.ownership_type,
                    s.purchase_price, s.purchase_currency, s.purchase_price_source,
                    s.purchase_price_batch_locked, s.deleted_at, m.vendor, m.material,
                    m.filament_name, m.default_weight
             FROM filament_spools s
             JOIN filament_master_list m ON m.id = s.master_id
             WHERE s.id = ?1
             LIMIT 1",
            [spool_id],
            map_group_spool,
        )
        .optional()
        .map_err(Into::into)
}

fn verify_batch_action(
    spool: StoredGroupSpool,
    mode: FilamentPriceBatchMode,
    target_price: f64,
    target_currency: &str,
    allow_historical_missing_price_fill: bool,
) -> InventoryResult<VerifiedBatchAction> {
    let skipped = |spool: &StoredGroupSpool, reason| {
        VerifiedBatchAction::Skip(FilamentPriceBatchSkippedSpool {
            spool_id: spool.spool_id.clone(),
            master_id: spool.master_id.clone(),
            color_name: spool.color_name.clone(),
            reason,
        })
    };
    if OwnershipType::from_raw(Some(&spool.ownership_type)).is_borrowed_in() {
        if allow_historical_missing_price_fill {
            return Err(invalid_batch(
                "filament_price_batch.invalid_historical_fill",
                "Borrowed spools cannot use historical missing-price fill.",
            ));
        }
        return Ok(skipped(&spool, FilamentPriceBatchSkipReason::BorrowedIn));
    }
    let historical = is_historical_status(&spool.status);
    let historical_missing_price_fill = allow_historical_missing_price_fill
        && mode == FilamentPriceBatchMode::MissingOnly
        && historical
        && spool.purchase_price.is_none();
    if allow_historical_missing_price_fill && !historical_missing_price_fill {
        return Err(invalid_batch(
            "filament_price_batch.invalid_historical_fill",
            "Historical missing-price fill requires an owned historical spool without a purchase price in MISSING_ONLY mode.",
        ));
    }
    if spool.purchase_price_batch_locked && !historical_missing_price_fill {
        return Ok(skipped(&spool, FilamentPriceBatchSkipReason::BatchLocked));
    }
    if historical && !historical_missing_price_fill {
        return Ok(skipped(&spool, FilamentPriceBatchSkipReason::Inactive));
    }

    if mode == FilamentPriceBatchMode::Overwrite {
        return Ok(VerifiedBatchAction::Update {
            spool: Box::new(spool),
            purchase_price: target_price,
            purchase_currency: target_currency.to_string(),
            purchase_price_source: PURCHASE_PRICE_SOURCE_STANDARD_BATCH.to_string(),
            purchase_price_batch_locked: false,
            historical_missing_price_fill: false,
        });
    }

    match spool.purchase_price {
        Some(existing_price) => {
            if normalized_existing_currency(spool.purchase_currency.as_deref())
                .ok()
                .flatten()
                .is_some()
            {
                return Ok(skipped(&spool, FilamentPriceBatchSkipReason::AlreadyPriced));
            }
            let source = spool
                .purchase_price_source
                .clone()
                .unwrap_or_else(|| PURCHASE_PRICE_SOURCE_MANUAL.to_string());
            Ok(VerifiedBatchAction::Update {
                spool: Box::new(spool),
                purchase_price: existing_price,
                purchase_currency: target_currency.to_string(),
                purchase_price_source: source,
                purchase_price_batch_locked: false,
                historical_missing_price_fill: false,
            })
        }
        None => Ok(
            match normalized_existing_currency(spool.purchase_currency.as_deref()) {
                Ok(None) => VerifiedBatchAction::Update {
                    spool: Box::new(spool),
                    purchase_price: target_price,
                    purchase_currency: target_currency.to_string(),
                    purchase_price_source: PURCHASE_PRICE_SOURCE_STANDARD_BATCH.to_string(),
                    purchase_price_batch_locked: historical_missing_price_fill,
                    historical_missing_price_fill,
                },
                Ok(Some(existing)) if existing == target_currency => VerifiedBatchAction::Update {
                    spool: Box::new(spool),
                    purchase_price: target_price,
                    purchase_currency: existing,
                    purchase_price_source: PURCHASE_PRICE_SOURCE_STANDARD_BATCH.to_string(),
                    purchase_price_batch_locked: historical_missing_price_fill,
                    historical_missing_price_fill,
                },
                Ok(Some(_)) | Err(()) => {
                    skipped(&spool, FilamentPriceBatchSkipReason::ManualUpdateRequired)
                }
            },
        ),
    }
}

fn normalized_existing_currency(value: Option<&str>) -> Result<Option<String>, ()> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    normalize_currency(value.to_string())
        .map(Some)
        .map_err(|_| ())
}

fn is_historical_status(status: &str) -> bool {
    is_historical_spool_status(Some(status))
}

fn invalid_batch(code: &'static str, message: impl Into<String>) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.into(),
    }
}

fn stale_batch(message: impl Into<String>) -> InventoryError {
    invalid_batch("filament_price_batch.stale_review", message)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;

    use rusqlite::params;

    use super::*;
    use crate::backend::database_core::FilamentDatabase;
    use crate::backend::filament_standards::{
        filament_price_group_key_for_master, FilamentPriceBatchSpoolPrecondition,
        FILAMENT_STANDARDS_SCHEMA_VERSION,
    };

    fn temp_database(label: &str) -> (PathBuf, FilamentDatabase) {
        let path = std::env::temp_dir().join(format!(
            "filament-manager-{label}-{:032x}.sqlite3",
            rand::random::<u128>()
        ));
        let db = FilamentDatabase::open(&path).expect("open filament standards database");
        db.apply_schema().expect("apply filament standards schema");
        (path, db)
    }

    fn cleanup_database(path: &PathBuf, db: FilamentDatabase) {
        drop(db);
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
    }

    fn insert_master(
        db: &FilamentDatabase,
        id: &str,
        vendor: &str,
        material: &str,
        filament_name: &str,
        color_name: &str,
    ) {
        db.connection()
            .execute(
                "INSERT INTO filament_master_list (
                    id, vendor, material, filament_name, color_name, default_weight
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1000)",
                params![id, vendor, material, filament_name, color_name],
            )
            .expect("insert filament standards master");
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_spool(
        db: &FilamentDatabase,
        id: &str,
        master_id: &str,
        status: &str,
        ownership_type: &str,
        purchase_price: Option<f64>,
        purchase_currency: Option<&str>,
        purchase_price_source: Option<&str>,
        locked: bool,
    ) {
        db.connection()
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, purchase_price, purchase_currency,
                    purchase_price_source, purchase_price_batch_locked, purchase_date,
                    batch_code, supplier_reference
                 ) VALUES (
                    ?1, ?2, ?3, ?4, 1000, 800, 800, ?5, ?6, ?7, ?8,
                    '2026-08-01', 'batch-before', 'supplier-before'
                 )",
                params![
                    id,
                    master_id,
                    status,
                    ownership_type,
                    purchase_price,
                    purchase_currency,
                    purchase_price_source,
                    locked
                ],
            )
            .expect("insert filament standards spool");
    }

    fn precondition(spool: &FilamentPriceGroupSpool) -> FilamentPriceBatchSpoolPrecondition {
        FilamentPriceBatchSpoolPrecondition {
            spool_id: spool.spool_id.clone(),
            expected_master_id: spool.master_id.clone(),
            expected_status: spool.status.clone(),
            expected_ownership_type: spool.ownership_type.clone(),
            expected_purchase_price: spool.purchase_price,
            expected_purchase_currency: spool.purchase_currency.clone(),
            expected_purchase_price_source: spool.purchase_price_source.clone(),
            expected_purchase_price_batch_locked: spool.purchase_price_batch_locked,
            allow_historical_missing_price_fill: false,
        }
    }

    fn group_for_master<'a>(
        snapshot: &'a FilamentStandardsSnapshot,
        master_id: &str,
    ) -> &'a FilamentPriceGroup {
        snapshot
            .groups
            .iter()
            .find(|group| {
                group
                    .spools
                    .iter()
                    .any(|spool| spool.master_id == master_id)
            })
            .expect("find filament price group")
    }

    #[test]
    fn settings_round_trip_normalizes_currency_and_rejects_orphan_generic_group_keys() {
        let (path, db) = temp_database("standards-settings");
        insert_master(&db, "generic-master", "Other", "PLA", "Standard", "Black");
        insert_spool(
            &db,
            "generic-spool",
            "generic-master",
            "IN_STOCK",
            "OWNED",
            None,
            None,
            None,
            false,
        );

        let snapshot = db.get_filament_standards().expect("load standards");
        let group = group_for_master(&snapshot, "generic-master");
        assert!(group.group_key.contains("generic-master"));
        let standard = FilamentPriceStandard {
            group_key: group.group_key.clone(),
            vendor: group.vendor.clone(),
            material: group.material.clone(),
            filament_name: group.filament_name.clone(),
            nominal_weight_g: group.nominal_weight_g,
            price: 189.0,
            currency: " nok ".to_string(),
        };
        let saved = db
            .save_filament_standards(FilamentStandardsSettings {
                schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
                default_purchase_currency: Some(" nok ".to_string()),
                price_standards: vec![standard.clone()],
            })
            .expect("save standards");
        assert_eq!(
            saved.settings.default_purchase_currency.as_deref(),
            Some("NOK")
        );
        assert_eq!(saved.settings.price_standards[0].currency, "NOK");
        assert!(saved.settings_valid);

        let reloaded = db.get_filament_standards().expect("reload standards");
        assert_eq!(reloaded.settings, saved.settings);
        assert!(group_for_master(&reloaded, "generic-master")
            .standard
            .is_some());

        let mut orphan = standard;
        orphan.group_key =
            filament_price_group_key_for_master("Other", "PLA", "Standard", 1000, "missing-master");
        let error = db
            .save_filament_standards(FilamentStandardsSettings {
                schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
                default_purchase_currency: Some("NOK".to_string()),
                price_standards: vec![orphan],
            })
            .expect_err("orphan group must not be persisted");
        assert!(error.to_string().contains("no longer exists"));
        assert_eq!(
            db.get_filament_standards()
                .expect("settings remain after rejected save")
                .settings,
            saved.settings
        );

        db.connection()
            .execute(
                "UPDATE filament_spools
                 SET status = 'DELETED', deleted_at = datetime('now')
                 WHERE id = 'generic-spool'",
                [],
            )
            .expect("remove final spool from standards group");
        let cleaned = db
            .get_filament_standards()
            .expect("load settings after group disappears");
        assert!(!cleaned.settings_valid);
        assert!(cleaned.settings.price_standards.is_empty());
        let repaired = db
            .save_filament_standards(FilamentStandardsSettings {
                default_purchase_currency: Some("EUR".to_string()),
                ..cleaned.settings
            })
            .expect("saving default currency also removes orphaned standards");
        assert!(repaired.settings_valid);
        assert_eq!(
            repaired.settings.default_purchase_currency.as_deref(),
            Some("EUR")
        );
        assert!(repaired.settings.price_standards.is_empty());

        cleanup_database(&path, db);
    }

    #[test]
    fn mixed_bambu_vendor_aliases_share_stable_group_display_and_standard_metadata() {
        let (path, db) = temp_database("standards-bambu-aliases");
        insert_master(&db, "bambu-short", "Bambu", "PLA", "PLA Basic", "Black");
        insert_master(&db, "bambu-long", "Bambu Lab", "PLA", "PLA Basic", "White");
        insert_spool(
            &db,
            "bambu-short-spool",
            "bambu-short",
            "IN_STOCK",
            "OWNED",
            None,
            None,
            None,
            false,
        );
        insert_spool(
            &db,
            "bambu-long-spool",
            "bambu-long",
            "IN_STOCK",
            "OWNED",
            None,
            None,
            None,
            false,
        );

        let snapshot = db.get_filament_standards().expect("load alias groups");
        assert_eq!(snapshot.groups.len(), 1);
        let group = &snapshot.groups[0];
        assert_eq!(group.vendor, "Bambu Lab");
        assert_eq!(group.spool_count, 2);
        let saved = db
            .save_filament_standards(FilamentStandardsSettings {
                schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
                default_purchase_currency: Some("NOK".to_string()),
                price_standards: vec![FilamentPriceStandard {
                    group_key: group.group_key.clone(),
                    vendor: "Bambu".to_string(),
                    material: group.material.clone(),
                    filament_name: group.filament_name.clone(),
                    nominal_weight_g: group.nominal_weight_g,
                    price: 249.0,
                    currency: "NOK".to_string(),
                }],
            })
            .expect("save alias standard");
        assert_eq!(saved.settings.price_standards[0].vendor, "Bambu Lab");

        db.connection()
            .execute(
                "UPDATE filament_spools
                 SET status = 'DELETED', deleted_at = datetime('now')
                 WHERE id = 'bambu-long-spool'",
                [],
            )
            .expect("remove Bambu Lab alias spool");
        let remaining = db
            .get_filament_standards()
            .expect("reload group with short alias only");
        assert!(remaining.settings_valid);
        assert_eq!(remaining.groups.len(), 1);
        assert_eq!(remaining.groups[0].vendor, "Bambu Lab");
        assert_eq!(remaining.groups[0].spool_count, 1);
        assert_eq!(remaining.settings.price_standards[0].vendor, "Bambu Lab");
        assert!(remaining.groups[0].standard.is_some());

        cleanup_database(&path, db);
    }

    #[test]
    fn missing_only_updates_safe_gaps_and_returns_all_skip_reasons() {
        let (path, db) = temp_database("standards-missing-only");
        insert_master(&db, "series", "Bambu", "PLA", "PLA Basic", "Black");
        for (id, status, ownership, price, currency, source, locked) in [
            ("missing-pair", "IN_STOCK", "OWNED", None, None, None, false),
            (
                "missing-currency",
                "IN_STOCK",
                "OWNED",
                Some(249.0),
                None,
                Some(PURCHASE_PRICE_SOURCE_MANUAL),
                false,
            ),
            (
                "complete",
                "IN_STOCK",
                "OWNED",
                Some(229.0),
                Some("NOK"),
                Some(PURCHASE_PRICE_SOURCE_MANUAL),
                false,
            ),
            (
                "currency-conflict",
                "IN_STOCK",
                "OWNED",
                None,
                Some("EUR"),
                None,
                false,
            ),
            ("locked", "IN_STOCK", "OWNED", None, None, None, true),
            (
                "borrowed",
                "IN_STOCK",
                "BORROWED_IN",
                None,
                None,
                None,
                false,
            ),
            ("empty", "EMPTY", "OWNED", None, None, None, false),
        ] {
            insert_spool(
                &db, id, "series", status, ownership, price, currency, source, locked,
            );
        }

        let snapshot = db.get_filament_standards().expect("review price group");
        let group = group_for_master(&snapshot, "series");
        assert_eq!(group.spool_count, 7);
        assert_eq!(
            group.owned_spool_count, 5,
            "historical owned row is not eligible"
        );
        let receipt = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::MissingOnly,
                group_key: group.group_key.clone(),
                price: 199.0,
                currency: " nok ".to_string(),
                spools: group.spools.iter().map(precondition).collect(),
            })
            .expect("apply missing-only batch");
        assert!(receipt.committed);
        assert_eq!(receipt.updated_count, 2);
        assert_eq!(receipt.skipped_count, 5);

        let updated = receipt
            .updated
            .iter()
            .map(|row| (row.spool_id.as_str(), row))
            .collect::<HashMap<_, _>>();
        assert_eq!(updated["missing-pair"].purchase_price, 199.0);
        assert_eq!(
            updated["missing-pair"].purchase_price_source,
            PURCHASE_PRICE_SOURCE_STANDARD_BATCH
        );
        assert_eq!(updated["missing-currency"].purchase_price, 249.0);
        assert_eq!(
            updated["missing-currency"].purchase_price_source,
            PURCHASE_PRICE_SOURCE_MANUAL
        );

        let skipped = receipt
            .skipped
            .iter()
            .map(|row| (row.spool_id.as_str(), row.reason))
            .collect::<HashMap<_, _>>();
        assert_eq!(
            skipped["complete"],
            FilamentPriceBatchSkipReason::AlreadyPriced
        );
        assert_eq!(
            skipped["currency-conflict"],
            FilamentPriceBatchSkipReason::ManualUpdateRequired
        );
        assert_eq!(skipped["locked"], FilamentPriceBatchSkipReason::BatchLocked);
        assert_eq!(
            skipped["borrowed"],
            FilamentPriceBatchSkipReason::BorrowedIn
        );
        assert_eq!(skipped["empty"], FilamentPriceBatchSkipReason::Inactive);

        let applied_events: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM spool_history_events
                 WHERE event_type = 'PURCHASE_PRICE_STANDARD_APPLIED'",
                [],
                |row| row.get(0),
            )
            .expect("count applied history");
        assert_eq!(applied_events, 2);
        let conflict: (Option<f64>, Option<String>, Option<String>) = db
            .connection()
            .query_row(
                "SELECT purchase_price, purchase_currency, purchase_price_source
                 FROM filament_spools WHERE id = 'currency-conflict'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read conflicting currency spool");
        assert_eq!(conflict, (None, Some("EUR".to_string()), None));

        cleanup_database(&path, db);
    }

    #[test]
    fn legacy_archived_spool_is_historical_and_cannot_be_overwritten() {
        let (path, db) = temp_database("standards-legacy-archived");
        insert_master(
            &db,
            "archived-series",
            "Test vendor",
            "PLA",
            "Legacy archived",
            "Black",
        );
        insert_spool(
            &db,
            "archived-spool",
            "archived-series",
            "ARCHIVED",
            "OWNED",
            Some(149.0),
            Some("NOK"),
            Some(PURCHASE_PRICE_SOURCE_MANUAL),
            false,
        );

        let snapshot = db.get_filament_standards().expect("review archived group");
        let group = group_for_master(&snapshot, "archived-series");
        assert_eq!(group.owned_spool_count, 0);
        let receipt = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 299.0,
                currency: "NOK".to_string(),
                spools: group.spools.iter().map(precondition).collect(),
            })
            .expect("archived overwrite produces skip receipt");
        assert_eq!(receipt.updated_count, 0);
        assert_eq!(receipt.skipped_count, 1);
        assert_eq!(
            receipt.skipped[0].reason,
            FilamentPriceBatchSkipReason::Inactive
        );
        let stored_price: f64 = db
            .connection()
            .query_row(
                "SELECT purchase_price FROM filament_spools WHERE id = 'archived-spool'",
                [],
                |row| row.get(0),
            )
            .expect("read untouched archived price");
        assert_eq!(stored_price, 149.0);

        cleanup_database(&path, db);
    }

    #[test]
    fn explicit_historical_missing_price_fill_is_atomic_and_keeps_every_roll_locked() {
        let (path, db) = temp_database("standards-historical-missing-price");
        insert_master(&db, "series", "Bambu", "PLA", "PLA Basic", "Black");
        for (id, status) in [
            ("used-up", "EMPTY"),
            ("lost-history", "LOST"),
            ("missing-history", "MISSING"),
        ] {
            insert_spool(&db, id, "series", status, "OWNED", None, None, None, false);
        }

        let reviewed = db
            .get_filament_standards()
            .expect("review historical group");
        let group = group_for_master(&reviewed, "series");
        let mut spools = group.spools.iter().map(precondition).collect::<Vec<_>>();
        for spool in &mut spools {
            spool.allow_historical_missing_price_fill = true;
        }
        db.connection()
            .execute_batch(
                "CREATE TRIGGER force_historical_price_history_failure
                 BEFORE INSERT ON spool_history_events
                 WHEN NEW.event_type = 'PURCHASE_PRICE_STANDARD_APPLIED'
                      AND NEW.spool_id = 'lost-history'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced historical price history failure');
                 END;",
            )
            .expect("install historical history failure trigger");
        let failed = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::MissingOnly,
                group_key: group.group_key.clone(),
                price: 219.0,
                currency: "NOK".to_string(),
                spools: spools.clone(),
            })
            .expect_err("history failure must roll back historical price and lock writes");
        assert!(failed
            .to_string()
            .contains("forced historical price history failure"));
        let after_failure: (i64, i64) = db
            .connection()
            .query_row(
                "SELECT
                    SUM(CASE WHEN purchase_price IS NOT NULL THEN 1 ELSE 0 END),
                    SUM(purchase_price_batch_locked)
                 FROM filament_spools WHERE master_id = 'series'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read rolled-back historical rows");
        assert_eq!(after_failure, (0, 0));
        db.connection()
            .execute_batch("DROP TRIGGER force_historical_price_history_failure;")
            .expect("remove historical history failure trigger");

        let receipt = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::MissingOnly,
                group_key: group.group_key.clone(),
                price: 219.0,
                currency: "NOK".to_string(),
                spools,
            })
            .expect("fill deliberately selected historical prices");
        assert_eq!(receipt.updated_count, 3);
        assert!(receipt
            .updated
            .iter()
            .all(|row| row.purchase_price_batch_locked));
        let stored: (i64, i64, i64) = db
            .connection()
            .query_row(
                "SELECT
                    SUM(CASE WHEN purchase_price = 219.0 AND purchase_currency = 'NOK' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN purchase_price_source = 'STANDARD_BATCH' THEN 1 ELSE 0 END),
                    SUM(purchase_price_batch_locked)
                 FROM filament_spools WHERE master_id = 'series'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read historical price and protection writes");
        assert_eq!(stored, (3, 3, 3));

        db.connection()
            .execute(
                "UPDATE filament_spools SET status = 'IN_STOCK' WHERE master_id = 'series'",
                [],
            )
            .expect("reactivate protected historical rows");
        let refreshed = db
            .get_filament_standards()
            .expect("review reactivated group");
        let group = group_for_master(&refreshed, "series");
        let overwrite = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 299.0,
                currency: "NOK".to_string(),
                spools: group.spools.iter().map(precondition).collect(),
            })
            .expect("locked reactivated rows produce a receipt");
        assert_eq!(overwrite.updated_count, 0);
        assert!(overwrite
            .skipped
            .iter()
            .all(|row| row.reason == FilamentPriceBatchSkipReason::BatchLocked));

        cleanup_database(&path, db);
    }

    #[test]
    fn historical_missing_price_intent_rejects_active_or_overwrite_requests_before_writes() {
        let (path, db) = temp_database("standards-invalid-historical-intent");
        insert_master(
            &db,
            "series",
            "Test vendor",
            "TEST-MATERIAL",
            "Historical intent fixture",
            "Fixture white",
        );
        insert_spool(
            &db, "active", "series", "IN_STOCK", "OWNED", None, None, None, false,
        );
        let reviewed = db.get_filament_standards().expect("review active group");
        let group = group_for_master(&reviewed, "series");
        let mut active = precondition(&group.spools[0]);
        active.allow_historical_missing_price_fill = true;
        let error = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::MissingOnly,
                group_key: group.group_key.clone(),
                price: 199.0,
                currency: "NOK".to_string(),
                spools: vec![active],
            })
            .expect_err("active rows cannot claim historical fill intent");
        assert!(error
            .to_string()
            .contains("requires an owned historical spool"));
        let price: Option<f64> = db
            .connection()
            .query_row(
                "SELECT purchase_price FROM filament_spools WHERE id = 'active'",
                [],
                |row| row.get(0),
            )
            .expect("active price remains untouched");
        assert_eq!(price, None);

        db.connection()
            .execute(
                "UPDATE filament_spools SET status = 'EMPTY' WHERE id = 'active'",
                [],
            )
            .expect("make the fixture historical");
        let reviewed = db
            .get_filament_standards()
            .expect("review historical group");
        let group = group_for_master(&reviewed, "series");
        let mut historical = precondition(&group.spools[0]);
        historical.allow_historical_missing_price_fill = true;
        let error = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 299.0,
                currency: "NOK".to_string(),
                spools: vec![historical],
            })
            .expect_err("overwrite cannot claim historical fill intent");
        assert!(error
            .to_string()
            .contains("requires an owned historical spool"));
        let untouched: (Option<f64>, bool) = db
            .connection()
            .query_row(
                "SELECT purchase_price, purchase_price_batch_locked
                 FROM filament_spools WHERE id = 'active'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("historical price remains untouched");
        assert_eq!(untouched, (None, false));

        cleanup_database(&path, db);
    }

    #[test]
    fn overwrite_sets_the_pair_and_preserves_other_receipt_metadata() {
        let (path, db) = temp_database("standards-overwrite");
        insert_master(&db, "series", "eSUN", "PETG", "PETG Basic", "Blue");
        insert_spool(
            &db,
            "priced",
            "series",
            "IN_STOCK",
            "OWNED",
            Some(149.0),
            Some("EUR"),
            Some(PURCHASE_PRICE_SOURCE_MANUAL),
            false,
        );
        let snapshot = db.get_filament_standards().expect("review overwrite group");
        let group = group_for_master(&snapshot, "series");
        let receipt = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 239.0,
                currency: "NOK".to_string(),
                spools: group.spools.iter().map(precondition).collect(),
            })
            .expect("apply overwrite batch");
        assert_eq!(receipt.updated_count, 1);
        let stored: (f64, String, String, String, String, String) = db
            .connection()
            .query_row(
                "SELECT purchase_price, purchase_currency, purchase_price_source,
                        purchase_date, batch_code, supplier_reference
                 FROM filament_spools WHERE id = 'priced'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("read overwritten spool");
        assert_eq!(
            stored,
            (
                239.0,
                "NOK".to_string(),
                PURCHASE_PRICE_SOURCE_STANDARD_BATCH.to_string(),
                "2026-08-01".to_string(),
                "batch-before".to_string(),
                "supplier-before".to_string(),
            )
        );

        let duplicate = precondition(&group.spools[0]);
        let error = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 200.0,
                currency: "NOK".to_string(),
                spools: vec![duplicate.clone(), duplicate],
            })
            .expect_err("duplicate spool ids must fail");
        assert!(error.to_string().contains("more than once"));

        cleanup_database(&path, db);
    }

    #[test]
    fn stale_eligibility_and_history_failure_abort_the_entire_batch() {
        let (path, db) = temp_database("standards-atomic");
        insert_master(&db, "series", "Bambu", "ASA", "ASA Aero", "White");
        for id in ["first", "second"] {
            insert_spool(
                &db, id, "series", "IN_STOCK", "OWNED", None, None, None, false,
            );
        }
        let reviewed = db.get_filament_standards().expect("review atomic group");
        let group = group_for_master(&reviewed, "series");
        let input = FilamentPriceBatchInput {
            mode: FilamentPriceBatchMode::Overwrite,
            group_key: group.group_key.clone(),
            price: 319.0,
            currency: "NOK".to_string(),
            spools: group.spools.iter().map(precondition).collect(),
        };
        db.connection()
            .execute(
                "UPDATE filament_spools SET purchase_price_batch_locked = 1 WHERE id = 'first'",
                [],
            )
            .expect("change lock after review");
        let stale = db
            .apply_filament_price_batch(input)
            .expect_err("lock drift must invalidate review");
        assert!(stale.to_string().contains("changed after the price review"));
        let prices_after_stale: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM filament_spools WHERE purchase_price IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .expect("count prices after stale review");
        assert_eq!(prices_after_stale, 0);

        db.connection()
            .execute(
                "UPDATE filament_spools SET purchase_price_batch_locked = 0 WHERE id = 'first'",
                [],
            )
            .expect("unlock before transaction rollback test");
        let refreshed = db.get_filament_standards().expect("refresh atomic group");
        let group = group_for_master(&refreshed, "series");
        db.connection()
            .execute_batch(
                "CREATE TRIGGER force_price_history_failure
                 BEFORE INSERT ON spool_history_events
                 WHEN NEW.event_type = 'PURCHASE_PRICE_STANDARD_APPLIED'
                      AND NEW.spool_id = 'second'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced price history failure');
                 END;",
            )
            .expect("install price history failure trigger");
        let failed = db
            .apply_filament_price_batch(FilamentPriceBatchInput {
                mode: FilamentPriceBatchMode::Overwrite,
                group_key: group.group_key.clone(),
                price: 319.0,
                currency: "NOK".to_string(),
                spools: group.spools.iter().map(precondition).collect(),
            })
            .expect_err("history failure must roll back batch");
        assert!(failed.to_string().contains("forced price history failure"));
        let persisted: (i64, i64) = db
            .connection()
            .query_row(
                "SELECT
                    SUM(CASE WHEN purchase_price IS NOT NULL THEN 1 ELSE 0 END),
                    (SELECT COUNT(*) FROM spool_history_events
                     WHERE event_type = 'PURCHASE_PRICE_STANDARD_APPLIED')
                 FROM filament_spools",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read rolled-back batch state");
        assert_eq!(persisted, (0, 0));

        cleanup_database(&path, db);
    }
}
