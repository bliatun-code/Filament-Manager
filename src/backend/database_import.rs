use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::database_result::{InventoryError, InventoryResult};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportDataStats {
    pub detected_format: String,
    pub imported_count: i64,
    pub created_count: i64,
    pub updated_count: i64,
}

#[derive(Clone, Debug)]
pub(crate) struct InventoryImportRow {
    pub(crate) spool_id: String,
    pub(crate) material: String,
    pub(crate) filament_name: String,
    pub(crate) color_name: String,
    pub(crate) status: Option<String>,
    pub(crate) ownership_type: Option<String>,
    pub(crate) has_ownership_type: bool,
    /// Outer options track field presence so older exports preserve existing
    /// owner metadata while modern exports may explicitly clear it.
    pub(crate) owner_name: Option<Option<String>>,
    pub(crate) owner_contact: Option<Option<String>>,
    pub(crate) ownership_note: Option<Option<String>>,
    pub(crate) remaining_g: Option<i64>,
    /// Presence flags keep legacy imports from overwriting stored weights with
    /// synthesized defaults when the source did not contain these columns.
    pub(crate) has_remaining_g: bool,
    /// Legacy inventory exports stored one location name (or, briefly, an
    /// opaque location id) in `location` and mirrored it to the home location.
    pub(crate) location: Option<String>,
    pub(crate) location_id: Option<String>,
    pub(crate) location_name: Option<String>,
    pub(crate) location_type: Option<String>,
    pub(crate) home_location_id: Option<String>,
    pub(crate) home_location_name: Option<String>,
    pub(crate) home_location_type: Option<String>,
    /// True when the source declares the structured current/home location
    /// contract. This distinguishes explicit nulls from legacy missing fields.
    pub(crate) has_structured_locations: bool,
    /// Presence is tracked separately for current, home and legacy placement
    /// fields so subset imports preserve whichever side they omit.
    pub(crate) has_legacy_location: bool,
    pub(crate) has_current_location: bool,
    pub(crate) has_home_location: bool,
    pub(crate) qr_code: Option<String>,
    pub(crate) has_qr_code: bool,
    pub(crate) vendor: Option<String>,
    pub(crate) initial_weight_g: Option<i64>,
    pub(crate) has_initial_weight_g: bool,
    pub(crate) current_weight_g: Option<i64>,
    pub(crate) has_current_weight_g: bool,
    /// The outer option tracks field presence; the inner option represents an
    /// explicit null tare weight.
    pub(crate) spool_tare_weight_g: Option<Option<i64>>,
    /// `None` means the source format did not contain receipt columns. `Some`
    /// contains the parsed values for the fields that were supplied.
    pub(crate) purchase_metadata: Option<PurchaseReceiptMetadata>,
    /// Parsers populate this for lightweight imports so omitted legacy fields
    /// can preserve existing values while explicit null/blank fields clear
    /// only the corresponding value. `None` retains the historical internal
    /// all-fields replacement contract for directly constructed rows.
    pub(crate) purchase_metadata_field_presence: Option<PurchaseReceiptMetadataFieldPresence>,
    /// `None` means an older source omitted the field and existing state must
    /// be preserved. `Some` means the export explicitly supplied the value.
    pub(crate) purchase_price_batch_locked: Option<bool>,
    /// The outer option tracks field presence; the inner option represents an
    /// explicit null source for unpriced or legacy rows.
    pub(crate) purchase_price_source: Option<Option<String>>,
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct PurchaseReceiptMetadataFieldPresence {
    pub(crate) purchase_price: bool,
    pub(crate) purchase_currency: bool,
    pub(crate) purchase_date: bool,
    pub(crate) batch_code: bool,
    pub(crate) supplier_reference: bool,
}

impl PurchaseReceiptMetadataFieldPresence {
    fn any(self) -> bool {
        self.purchase_price
            || self.purchase_currency
            || self.purchase_date
            || self.batch_code
            || self.supplier_reference
    }
}

#[derive(Clone, Debug)]
pub(crate) struct InventoryImportStats {
    pub(crate) imported_count: i64,
    pub(crate) created_count: i64,
    pub(crate) updated_count: i64,
}

pub(crate) fn import_data_content<F, G, H>(
    content: &str,
    validate_full_backup: F,
    import_full_backup: G,
    import_inventory_rows: H,
) -> InventoryResult<ImportDataStats>
where
    F: Fn(&str) -> InventoryResult<super::database_backup::BackupValidationStats>,
    G: Fn(&str) -> InventoryResult<()>,
    H: Fn(&[InventoryImportRow]) -> InventoryResult<InventoryImportStats>,
{
    let normalized = content.trim_start_matches('\u{feff}').trim();
    if normalized.is_empty() {
        return Err(InventoryError::Db("Import file is empty".to_string()));
    }

    match validate_full_backup(normalized) {
        Ok(validation) => {
            import_full_backup(normalized)?;
            return Ok(ImportDataStats {
                detected_format: "FULL_BACKUP".to_string(),
                imported_count: validation.total_rows,
                created_count: 0,
                updated_count: 0,
            });
        }
        Err(error) if declares_full_backup_format(normalized) => return Err(error),
        Err(_) => {}
    }

    match parse_inventory_spools_json(normalized) {
        Ok(rows) => {
            let stats = import_inventory_rows(&rows)?;
            return Ok(import_stats("INVENTORY_JSON", stats));
        }
        Err(error) if looks_like_json(normalized) => return Err(error),
        Err(_) => {}
    }

    if let Ok(rows) = parse_inventory_spools_csv(normalized) {
        let stats = import_inventory_rows(&rows)?;
        return Ok(import_stats("INVENTORY_CSV", stats));
    }

    Err(InventoryError::Db(
        "Unsupported import format. Expected full backup JSON, inventory JSON array/object, or inventory CSV.".to_string(),
    ))
}

fn looks_like_json(content: &str) -> bool {
    content.starts_with('{') || content.starts_with('[')
}

fn declares_full_backup_format(content: &str) -> bool {
    serde_json::from_str::<Value>(content)
        .ok()
        .and_then(|value| {
            value
                .as_object()?
                .get("format")?
                .as_str()
                .map(|format| format.starts_with("filament-manager-backup-"))
        })
        .unwrap_or(false)
}

fn import_stats(detected_format: &str, stats: InventoryImportStats) -> ImportDataStats {
    ImportDataStats {
        detected_format: detected_format.to_string(),
        imported_count: stats.imported_count,
        created_count: stats.created_count,
        updated_count: stats.updated_count,
    }
}

pub(crate) fn parse_inventory_spools_json(
    content: &str,
) -> InventoryResult<Vec<InventoryImportRow>> {
    let parsed: Value =
        serde_json::from_str(content).map_err(|error| InventoryError::Db(error.to_string()))?;
    let rows = match &parsed {
        Value::Array(items) => items,
        Value::Object(object) => {
            object
                .get("spools")
                .and_then(Value::as_array)
                .ok_or_else(|| {
                    InventoryError::Db(
                        "Inventory JSON must be an array or an object with a `spools` array"
                            .to_string(),
                    )
                })?
        }
        _ => {
            return Err(InventoryError::Db(
                "Inventory JSON root must be an array or object".to_string(),
            ))
        }
    };

    let mut output = Vec::with_capacity(rows.len());
    for (index, row) in rows.iter().enumerate() {
        let object = row.as_object().ok_or_else(|| {
            InventoryError::Db(format!("Inventory JSON row {index} must be an object"))
        })?;
        let spool_id = value_to_optional_string(
            object
                .get("spool_id")
                .or_else(|| object.get("id"))
                .or_else(|| object.get("spoolId")),
        )
        .unwrap_or_default();
        let material = value_to_optional_string(object.get("material")).unwrap_or_default();
        let filament_name = value_to_optional_string(
            object
                .get("filament_name")
                .or_else(|| object.get("filament"))
                .or_else(|| object.get("filamentName")),
        )
        .unwrap_or_default();
        let color_name = value_to_optional_string(
            object
                .get("color_name")
                .or_else(|| object.get("color"))
                .or_else(|| object.get("colorName")),
        )
        .unwrap_or_default();
        let remaining_fields = ["remaining_g", "remaining", "remainingG"];
        let initial_weight_fields = ["initial_weight_g", "initialWeightG"];
        let current_weight_fields = ["current_weight_g", "currentWeightG"];
        let has_structured_locations = [
            "location_name",
            "locationName",
            "location_type",
            "locationType",
            "home_location_id",
            "homeLocationId",
            "home_location_name",
            "homeLocationName",
            "home_location_type",
            "homeLocationType",
        ]
        .iter()
        .any(|field| object.contains_key(*field));
        let has_legacy_location = object.contains_key("location")
            || (!has_structured_locations
                && json_has_field(object, &["location_id", "locationId"]));
        let has_current_location = has_structured_locations
            && json_has_field(
                object,
                &[
                    "location_id",
                    "locationId",
                    "location_name",
                    "locationName",
                    "location_type",
                    "locationType",
                ],
            );
        let has_home_location = json_has_field(
            object,
            &[
                "home_location_id",
                "homeLocationId",
                "home_location_name",
                "homeLocationName",
                "home_location_type",
                "homeLocationType",
            ],
        );
        let has_qr_code = json_has_field(object, &["qr_code", "qr", "qrCode"]);
        let purchase_metadata_field_presence = PurchaseReceiptMetadataFieldPresence {
            purchase_price: json_has_field(object, &["purchase_price", "purchasePrice"]),
            purchase_currency: json_has_field(object, &["purchase_currency", "purchaseCurrency"]),
            purchase_date: json_has_field(object, &["purchase_date", "purchaseDate"]),
            batch_code: json_has_field(object, &["batch_code", "batchCode"]),
            supplier_reference: json_has_field(
                object,
                &["supplier_reference", "supplierReference"],
            ),
        };
        let purchase_metadata = if purchase_metadata_field_presence.any() {
            Some(PurchaseReceiptMetadata {
                purchase_price: value_to_optional_receipt_price(
                    object
                        .get("purchase_price")
                        .or_else(|| object.get("purchasePrice")),
                    index,
                )?,
                purchase_currency: value_to_optional_receipt_text(
                    object
                        .get("purchase_currency")
                        .or_else(|| object.get("purchaseCurrency")),
                    "purchase_currency",
                    index,
                )?,
                purchase_date: value_to_optional_receipt_text(
                    object
                        .get("purchase_date")
                        .or_else(|| object.get("purchaseDate")),
                    "purchase_date",
                    index,
                )?,
                batch_code: value_to_optional_receipt_text(
                    object.get("batch_code").or_else(|| object.get("batchCode")),
                    "batch_code",
                    index,
                )?,
                supplier_reference: value_to_optional_receipt_text(
                    object
                        .get("supplier_reference")
                        .or_else(|| object.get("supplierReference")),
                    "supplier_reference",
                    index,
                )?,
            })
        } else {
            None
        };
        let ownership_type_field = optional_json_text_field(
            object,
            &["ownership_type", "ownershipType"],
            "ownership_type",
            index,
        )?;
        let ownership_type = parse_optional_ownership_type(
            ownership_type_field
                .as_ref()
                .and_then(|value| value.as_deref()),
            index,
            "JSON",
        )?;
        let owner_name =
            optional_json_text_field(object, &["owner_name", "ownerName"], "owner_name", index)?;
        let owner_contact = optional_json_text_field(
            object,
            &["owner_contact", "ownerContact"],
            "owner_contact",
            index,
        )?;
        let ownership_note = optional_json_text_field(
            object,
            &["ownership_note", "ownershipNote"],
            "ownership_note",
            index,
        )?;

        output.push(InventoryImportRow {
            spool_id,
            material,
            filament_name,
            color_name,
            status: value_to_optional_string(object.get("status")),
            ownership_type,
            has_ownership_type: ownership_type_field.is_some(),
            owner_name,
            owner_contact,
            ownership_note,
            remaining_g: optional_json_non_negative_i64_field(
                object,
                &remaining_fields,
                "remaining_g",
                index,
            )?
            .flatten(),
            has_remaining_g: json_has_field(object, &remaining_fields),
            location: value_to_optional_string(object.get("location")),
            location_id: value_to_optional_string(
                object
                    .get("location_id")
                    .or_else(|| object.get("locationId")),
            ),
            location_name: value_to_optional_string(
                object
                    .get("location_name")
                    .or_else(|| object.get("locationName")),
            ),
            location_type: value_to_optional_string(
                object
                    .get("location_type")
                    .or_else(|| object.get("locationType")),
            ),
            home_location_id: value_to_optional_string(
                object
                    .get("home_location_id")
                    .or_else(|| object.get("homeLocationId")),
            ),
            home_location_name: value_to_optional_string(
                object
                    .get("home_location_name")
                    .or_else(|| object.get("homeLocationName")),
            ),
            home_location_type: value_to_optional_string(
                object
                    .get("home_location_type")
                    .or_else(|| object.get("homeLocationType")),
            ),
            has_structured_locations,
            has_legacy_location,
            has_current_location,
            has_home_location,
            qr_code: value_to_optional_string(
                object
                    .get("qr_code")
                    .or_else(|| object.get("qr"))
                    .or_else(|| object.get("qrCode")),
            ),
            has_qr_code,
            vendor: value_to_optional_string(object.get("vendor")),
            initial_weight_g: optional_json_non_negative_i64_field(
                object,
                &initial_weight_fields,
                "initial_weight_g",
                index,
            )?
            .flatten(),
            has_initial_weight_g: json_has_field(object, &initial_weight_fields),
            current_weight_g: optional_json_non_negative_i64_field(
                object,
                &current_weight_fields,
                "current_weight_g",
                index,
            )?
            .flatten(),
            has_current_weight_g: json_has_field(object, &current_weight_fields),
            spool_tare_weight_g: optional_json_non_negative_i64_field(
                object,
                &[
                    "spool_tare_weight_g",
                    "spoolTareWeightG",
                    "spoolTareWeightGrams",
                ],
                "spool_tare_weight_g",
                index,
            )?,
            purchase_metadata,
            purchase_metadata_field_presence: purchase_metadata_field_presence
                .any()
                .then_some(purchase_metadata_field_presence),
            purchase_price_batch_locked: optional_json_bool_field(
                object,
                &["purchase_price_batch_locked", "purchasePriceBatchLocked"],
                "purchase_price_batch_locked",
                index,
            )?,
            purchase_price_source: optional_json_price_source_field(
                object,
                &["purchase_price_source", "purchasePriceSource"],
                index,
            )?,
        });
    }
    Ok(output)
}

pub(crate) fn parse_inventory_spools_csv(
    content: &str,
) -> InventoryResult<Vec<InventoryImportRow>> {
    let mut records = parse_csv_records(content)?
        .into_iter()
        .filter(|record| !record.iter().all(|field| field.trim().is_empty()));
    let header_record = records
        .next()
        .ok_or_else(|| InventoryError::Db("Inventory CSV is empty".to_string()))?;
    let headers = header_record
        .into_iter()
        .map(|header| normalize_csv_header(&header))
        .collect::<Vec<_>>();

    let required = ["spool_id", "material", "filament_name", "color_name"];
    for field in required {
        if !headers.iter().any(|header| header == field) {
            return Err(InventoryError::Db(format!(
                "Inventory CSV is missing required column `{field}`"
            )));
        }
    }
    let purchase_metadata_field_presence = PurchaseReceiptMetadataFieldPresence {
        purchase_price: csv_has_header(&headers, &["purchase_price", "purchaseprice"]),
        purchase_currency: csv_has_header(&headers, &["purchase_currency", "purchasecurrency"]),
        purchase_date: csv_has_header(&headers, &["purchase_date", "purchasedate"]),
        batch_code: csv_has_header(&headers, &["batch_code", "batchcode"]),
        supplier_reference: csv_has_header(&headers, &["supplier_reference", "supplierreference"]),
    };
    let has_structured_locations = [
        "location_name",
        "locationname",
        "location_type",
        "locationtype",
        "home_location_id",
        "homelocationid",
        "home_location_name",
        "homelocationname",
        "home_location_type",
        "homelocationtype",
    ]
    .iter()
    .any(|field| headers.iter().any(|header| header == field));
    let has_legacy_location = csv_has_header(&headers, &["location"])
        || (!has_structured_locations && csv_has_header(&headers, &["location_id", "locationid"]));
    let has_current_location = has_structured_locations
        && csv_has_header(
            &headers,
            &[
                "location_id",
                "locationid",
                "location_name",
                "locationname",
                "location_type",
                "locationtype",
            ],
        );
    let has_home_location = csv_has_header(
        &headers,
        &[
            "home_location_id",
            "homelocationid",
            "home_location_name",
            "homelocationname",
            "home_location_type",
            "homelocationtype",
        ],
    );
    let has_qr_code = csv_has_header(&headers, &["qr_code", "qr", "qrcode"]);
    let has_purchase_price_batch_locked =
        ["purchase_price_batch_locked", "purchasepricebatchlocked"]
            .iter()
            .any(|field| headers.iter().any(|header| header == field));
    let has_purchase_price_source = ["purchase_price_source", "purchasepricesource"]
        .iter()
        .any(|field| headers.iter().any(|header| header == field));
    let has_remaining_g = csv_has_header(&headers, &["remaining_g", "remaining", "remainingg"]);
    let has_initial_weight_g = csv_has_header(
        &headers,
        &["initial_weight_g", "initial_weight", "initialweightg"],
    );
    let has_current_weight_g = csv_has_header(
        &headers,
        &["current_weight_g", "current_weight", "currentweightg"],
    );
    let has_spool_tare_weight_g = csv_has_header(
        &headers,
        &[
            "spool_tare_weight_g",
            "spool_tare_weight",
            "spooltareweightg",
        ],
    );
    let has_ownership_type = csv_has_header(&headers, &["ownership_type", "ownershiptype"]);
    let has_owner_name = csv_has_header(&headers, &["owner_name", "ownername"]);
    let has_owner_contact = csv_has_header(&headers, &["owner_contact", "ownercontact"]);
    let has_ownership_note = csv_has_header(&headers, &["ownership_note", "ownershipnote"]);

    let mut output = Vec::new();
    for (index, values) in records.enumerate() {
        output.push(InventoryImportRow {
            spool_id: csv_field(&headers, &values, &["spool_id", "id", "spoolid"])
                .unwrap_or("")
                .trim()
                .to_string(),
            material: csv_field(&headers, &values, &["material"])
                .unwrap_or("")
                .trim()
                .to_string(),
            filament_name: csv_field(
                &headers,
                &values,
                &["filament_name", "filament", "filamentname"],
            )
            .unwrap_or("")
            .trim()
            .to_string(),
            color_name: csv_field(&headers, &values, &["color_name", "color", "colorname"])
                .unwrap_or("")
                .trim()
                .to_string(),
            status: normalize_optional_text(csv_field(&headers, &values, &["status"])),
            ownership_type: if has_ownership_type {
                parse_optional_ownership_type(
                    csv_field(&headers, &values, &["ownership_type", "ownershiptype"]),
                    index,
                    "CSV",
                )?
            } else {
                None
            },
            has_ownership_type,
            owner_name: if has_owner_name {
                Some(normalize_optional_text(csv_field(
                    &headers,
                    &values,
                    &["owner_name", "ownername"],
                )))
            } else {
                None
            },
            owner_contact: if has_owner_contact {
                Some(normalize_optional_text(csv_field(
                    &headers,
                    &values,
                    &["owner_contact", "ownercontact"],
                )))
            } else {
                None
            },
            ownership_note: if has_ownership_note {
                Some(normalize_optional_text(csv_field(
                    &headers,
                    &values,
                    &["ownership_note", "ownershipnote"],
                )))
            } else {
                None
            },
            remaining_g: parse_optional_non_negative_i64(
                csv_field(
                    &headers,
                    &values,
                    &["remaining_g", "remaining", "remainingg"],
                ),
                "remaining_g",
                index,
                "CSV",
            )?,
            has_remaining_g,
            location: normalize_optional_text(csv_field(&headers, &values, &["location"])),
            location_id: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["location_id", "locationid"],
            )),
            location_name: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["location_name", "locationname"],
            )),
            location_type: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["location_type", "locationtype"],
            )),
            home_location_id: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["home_location_id", "homelocationid"],
            )),
            home_location_name: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["home_location_name", "homelocationname"],
            )),
            home_location_type: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["home_location_type", "homelocationtype"],
            )),
            has_structured_locations,
            has_legacy_location,
            has_current_location,
            has_home_location,
            qr_code: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["qr_code", "qr", "qrcode"],
            )),
            has_qr_code,
            vendor: normalize_optional_text(csv_field(&headers, &values, &["vendor"])),
            initial_weight_g: parse_optional_non_negative_i64(
                csv_field(
                    &headers,
                    &values,
                    &["initial_weight_g", "initial_weight", "initialweightg"],
                ),
                "initial_weight_g",
                index,
                "CSV",
            )?,
            has_initial_weight_g,
            current_weight_g: parse_optional_non_negative_i64(
                csv_field(
                    &headers,
                    &values,
                    &["current_weight_g", "current_weight", "currentweightg"],
                ),
                "current_weight_g",
                index,
                "CSV",
            )?,
            has_current_weight_g,
            spool_tare_weight_g: if has_spool_tare_weight_g {
                Some(parse_optional_non_negative_i64(
                    csv_field(
                        &headers,
                        &values,
                        &[
                            "spool_tare_weight_g",
                            "spool_tare_weight",
                            "spooltareweightg",
                        ],
                    ),
                    "spool_tare_weight_g",
                    index,
                    "CSV",
                )?)
            } else {
                None
            },
            purchase_metadata: if purchase_metadata_field_presence.any() {
                Some(PurchaseReceiptMetadata {
                    purchase_price: parse_f64_text(csv_field(
                        &headers,
                        &values,
                        &["purchase_price", "purchaseprice"],
                    )),
                    purchase_currency: preserve_optional_csv_text(csv_field(
                        &headers,
                        &values,
                        &["purchase_currency", "purchasecurrency"],
                    )),
                    purchase_date: preserve_optional_csv_text(csv_field(
                        &headers,
                        &values,
                        &["purchase_date", "purchasedate"],
                    )),
                    batch_code: preserve_optional_csv_text(csv_field(
                        &headers,
                        &values,
                        &["batch_code", "batchcode"],
                    )),
                    supplier_reference: preserve_optional_csv_text(csv_field(
                        &headers,
                        &values,
                        &["supplier_reference", "supplierreference"],
                    )),
                })
            } else {
                None
            },
            purchase_metadata_field_presence: purchase_metadata_field_presence
                .any()
                .then_some(purchase_metadata_field_presence),
            purchase_price_batch_locked: if has_purchase_price_batch_locked {
                Some(parse_required_csv_bool(
                    csv_field(
                        &headers,
                        &values,
                        &["purchase_price_batch_locked", "purchasepricebatchlocked"],
                    ),
                    index,
                )?)
            } else {
                None
            },
            purchase_price_source: if has_purchase_price_source {
                Some(parse_optional_price_source(
                    csv_field(
                        &headers,
                        &values,
                        &["purchase_price_source", "purchasepricesource"],
                    ),
                    index,
                )?)
            } else {
                None
            },
        });
    }
    Ok(output)
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.to_string())
}

fn preserve_optional_csv_text(value: Option<&str>) -> Option<String> {
    value
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
}

fn parse_f64_text(raw: Option<&str>) -> Option<f64> {
    let value = raw.map(str::trim).filter(|value| !value.is_empty())?;
    Some(value.parse::<f64>().unwrap_or(f64::NAN))
}

fn value_to_optional_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) => normalize_optional_text(Some(text)),
        Some(Value::Number(number)) => normalize_optional_text(Some(&number.to_string())),
        Some(Value::Bool(boolean)) => {
            normalize_optional_text(Some(if *boolean { "true" } else { "false" }))
        }
        _ => None,
    }
}

fn json_field<'a>(
    object: &'a serde_json::Map<String, Value>,
    fields: &[&str],
) -> Option<&'a Value> {
    fields.iter().find_map(|field| object.get(*field))
}

fn json_has_field(object: &serde_json::Map<String, Value>, fields: &[&str]) -> bool {
    fields.iter().any(|field| object.contains_key(*field))
}

fn optional_json_non_negative_i64_field(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
    display_field: &str,
    row_index: usize,
) -> InventoryResult<Option<Option<i64>>> {
    let Some(value) = json_field(object, fields) else {
        return Ok(None);
    };
    match value {
        Value::Null => Ok(Some(None)),
        Value::Number(number) => number
            .as_i64()
            .filter(|value| *value >= 0)
            .map(|value| Some(Some(value)))
            .ok_or_else(|| {
                InventoryError::Db(format!(
                    "Inventory JSON row {row_index} field `{display_field}` must be a non-negative integer or null"
                ))
            }),
        Value::String(text) => Ok(Some(parse_optional_non_negative_i64(
            Some(text),
            display_field,
            row_index,
            "JSON",
        )?)),
        _ => Err(InventoryError::Db(format!(
            "Inventory JSON row {row_index} field `{display_field}` must be a non-negative integer or null"
        ))),
    }
}

fn optional_json_text_field(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
    display_field: &str,
    row_index: usize,
) -> InventoryResult<Option<Option<String>>> {
    let Some(value) = json_field(object, fields) else {
        return Ok(None);
    };
    match value {
        Value::Null => Ok(Some(None)),
        Value::String(text) => Ok(Some(normalize_optional_text(Some(text)))),
        _ => Err(InventoryError::Db(format!(
            "Inventory JSON row {row_index} field `{display_field}` must be a string or null"
        ))),
    }
}

fn parse_optional_ownership_type(
    raw: Option<&str>,
    row_index: usize,
    format: &str,
) -> InventoryResult<Option<String>> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value.to_ascii_uppercase().replace(['-', ' '], "_");
    if matches!(normalized.as_str(), "OWNED" | "BORROWED_IN") {
        return Ok(Some(normalized));
    }
    Err(InventoryError::Db(format!(
        "Inventory {format} row {} field `ownership_type` must be OWNED or BORROWED_IN",
        row_index + 1
    )))
}

fn parse_optional_non_negative_i64(
    raw: Option<&str>,
    field: &str,
    row_index: usize,
    format: &str,
) -> InventoryResult<Option<i64>> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    value
        .parse::<i64>()
        .ok()
        .filter(|value| *value >= 0)
        .map(Some)
        .ok_or_else(|| {
            InventoryError::Db(format!(
                "Inventory {format} row {} field `{field}` must be a non-negative integer or empty",
                row_index + 1
            ))
        })
}

fn value_to_optional_receipt_price(
    value: Option<&Value>,
    row_index: usize,
) -> InventoryResult<Option<f64>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(number)) => number.as_f64().map(Some).ok_or_else(|| {
            invalid_receipt_json_type(row_index, "purchase_price", "a finite number or null")
        }),
        Some(Value::String(text)) if text.trim().is_empty() => Ok(None),
        Some(_) => Err(InventoryError::InvalidOperation {
            code: "purchase_metadata.price_invalid",
            message: format!(
                "Inventory JSON row {row_index} field `purchase_price` must be a number or null"
            ),
        }),
    }
}

fn value_to_optional_receipt_text(
    value: Option<&Value>,
    field: &str,
    row_index: usize,
) -> InventoryResult<Option<String>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) if text.trim().is_empty() => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(invalid_receipt_json_type(
            row_index,
            field,
            "a string or null",
        )),
    }
}

fn optional_json_bool_field(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
    display_field: &str,
    row_index: usize,
) -> InventoryResult<Option<bool>> {
    let Some((_, value)) = fields.iter().find_map(|field| object.get_key_value(*field)) else {
        return Ok(None);
    };
    match value {
        Value::Bool(value) => Ok(Some(*value)),
        _ => Err(InventoryError::InvalidOperation {
            code: "purchase_price_protection.lock_invalid",
            message: format!(
                "Inventory JSON row {row_index} field `{display_field}` must be a boolean"
            ),
        }),
    }
}

fn optional_json_price_source_field(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
    row_index: usize,
) -> InventoryResult<Option<Option<String>>> {
    let Some((_, value)) = fields.iter().find_map(|field| object.get_key_value(*field)) else {
        return Ok(None);
    };
    match value {
        Value::Null => Ok(Some(None)),
        Value::String(value) => Ok(Some(parse_optional_price_source(Some(value), row_index)?)),
        _ => Err(InventoryError::InvalidOperation {
            code: "purchase_price_protection.source_invalid",
            message: format!(
                "Inventory JSON row {row_index} field `purchase_price_source` must be MANUAL, STANDARD_BATCH, or null"
            ),
        }),
    }
}

fn parse_required_csv_bool(raw: Option<&str>, row_index: usize) -> InventoryResult<bool> {
    match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("true" | "1") => Ok(true),
        Some("false" | "0") => Ok(false),
        _ => Err(InventoryError::InvalidOperation {
            code: "purchase_price_protection.lock_invalid",
            message: format!(
                "Inventory CSV row {} field `purchase_price_batch_locked` must be true or false",
                row_index + 1
            ),
        }),
    }
}

fn parse_optional_price_source(
    raw: Option<&str>,
    row_index: usize,
) -> InventoryResult<Option<String>> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value.to_ascii_uppercase();
    if matches!(normalized.as_str(), "MANUAL" | "STANDARD_BATCH") {
        return Ok(Some(normalized));
    }
    Err(InventoryError::InvalidOperation {
        code: "purchase_price_protection.source_invalid",
        message: format!(
            "Inventory row {row_index} field `purchase_price_source` must be MANUAL or STANDARD_BATCH"
        ),
    })
}

fn invalid_receipt_json_type(row_index: usize, field: &str, expected: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "purchase_metadata.type_invalid",
        message: format!("Inventory JSON row {row_index} field `{field}` must be {expected}"),
    }
}

fn normalize_csv_header(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('\u{feff}')
        .to_lowercase()
        .replace([' ', '-'], "_")
}

fn parse_csv_records(content: &str) -> InventoryResult<Vec<Vec<String>>> {
    let mut records = Vec::new();
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut chars = content.chars().peekable();
    let mut in_quotes = false;
    let mut closed_quote = false;

    while let Some(ch) = chars.next() {
        if closed_quote {
            match ch {
                ',' => {
                    fields.push(std::mem::take(&mut current));
                    closed_quote = false;
                }
                '\r' => {
                    if matches!(chars.peek(), Some('\n')) {
                        let _ = chars.next();
                    }
                    fields.push(std::mem::take(&mut current));
                    records.push(std::mem::take(&mut fields));
                    closed_quote = false;
                }
                '\n' => {
                    fields.push(std::mem::take(&mut current));
                    records.push(std::mem::take(&mut fields));
                    closed_quote = false;
                }
                ' ' | '\t' => {}
                _ => {
                    return Err(InventoryError::Db(
                        "Inventory CSV contains unexpected characters after a quoted field"
                            .to_string(),
                    ));
                }
            }
            continue;
        }
        match ch {
            '"' => {
                if in_quotes {
                    if matches!(chars.peek(), Some('"')) {
                        current.push('"');
                        let _ = chars.next();
                    } else {
                        in_quotes = false;
                        closed_quote = true;
                    }
                } else if current.is_empty() {
                    in_quotes = true;
                } else {
                    return Err(InventoryError::Db(
                        "Inventory CSV contains an unexpected quote in an unquoted field"
                            .to_string(),
                    ));
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current.clear();
            }
            '\r' if !in_quotes => {
                if matches!(chars.peek(), Some('\n')) {
                    let _ = chars.next();
                }
                fields.push(current.trim().to_string());
                current.clear();
                records.push(std::mem::take(&mut fields));
            }
            '\n' if !in_quotes => {
                fields.push(current.trim().to_string());
                current.clear();
                records.push(std::mem::take(&mut fields));
            }
            _ => current.push(ch),
        }
    }
    if in_quotes {
        return Err(InventoryError::Db(
            "Inventory CSV contains an unterminated quoted field".to_string(),
        ));
    }
    if closed_quote || !current.is_empty() || !fields.is_empty() {
        fields.push(if closed_quote {
            current
        } else {
            current.trim().to_string()
        });
        records.push(fields);
    }
    Ok(records)
}

fn csv_field<'a>(headers: &[String], values: &'a [String], candidates: &[&str]) -> Option<&'a str> {
    for candidate in candidates {
        if let Some(index) = headers.iter().position(|header| header == candidate) {
            return values.get(index).map(|value| value.as_str());
        }
    }
    None
}

fn csv_has_header(headers: &[String], candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| headers.iter().any(|header| header == candidate))
}

#[cfg(test)]
mod tests {
    use super::{parse_csv_records, parse_inventory_spools_csv, parse_inventory_spools_json};

    #[test]
    fn csv_records_preserve_cr_and_lf_inside_quoted_fields() {
        let records =
            parse_csv_records("first,second\r\n\"line 1\rline 2\",\"line 1\nline 2\"\r\n")
                .expect("parse multiline CSV records");
        assert_eq!(
            records,
            vec![
                vec!["first".to_string(), "second".to_string()],
                vec!["line 1\rline 2".to_string(), "line 1\nline 2".to_string()]
            ]
        );
    }

    #[test]
    fn csv_records_reject_characters_after_a_closed_quote() {
        let error = parse_csv_records("field\n\"batch\"junk\n")
            .expect_err("malformed quoted field must fail closed");
        assert!(error
            .to_string()
            .contains("unexpected characters after a quoted field"));

        let error = parse_csv_records("field\nbat\"ch\n")
            .expect_err("a quote inside an unquoted field must fail closed");
        assert!(error
            .to_string()
            .contains("unexpected quote in an unquoted field"));
    }

    #[test]
    fn legacy_inventory_location_fields_remain_parseable() {
        let json = parse_inventory_spools_json(
            r#"[{"spool_id":"legacy-json","material":"PLA","filament_name":"Basic","color_name":"Blue","location_id":"Legacy JSON shelf"}]"#,
        )
        .expect("parse legacy JSON location alias");
        assert!(!json[0].has_structured_locations);
        assert!(json[0].has_legacy_location);
        assert!(!json[0].has_current_location);
        assert!(!json[0].has_home_location);
        assert_eq!(json[0].location_id.as_deref(), Some("Legacy JSON shelf"));
        assert!(!json[0].has_remaining_g);
        assert!(!json[0].has_initial_weight_g);
        assert!(!json[0].has_current_weight_g);
        assert_eq!(json[0].spool_tare_weight_g, None);
        assert!(!json[0].has_ownership_type);
        assert!(!json[0].has_qr_code);
        assert_eq!(json[0].owner_name, None);
        assert_eq!(json[0].purchase_price_batch_locked, None);
        assert_eq!(json[0].purchase_price_source, None);

        let csv = parse_inventory_spools_csv(
            "spool_id,material,filament_name,color_name,location\nlegacy-csv,PLA,Basic,Red,Legacy CSV shelf\n",
        )
        .expect("parse legacy CSV location field");
        assert!(!csv[0].has_structured_locations);
        assert!(csv[0].has_legacy_location);
        assert!(!csv[0].has_current_location);
        assert!(!csv[0].has_home_location);
        assert_eq!(csv[0].location.as_deref(), Some("Legacy CSV shelf"));
        assert!(!csv[0].has_remaining_g);
        assert!(!csv[0].has_initial_weight_g);
        assert!(!csv[0].has_current_weight_g);
        assert_eq!(csv[0].spool_tare_weight_g, None);
        assert!(!csv[0].has_ownership_type);
        assert!(!csv[0].has_qr_code);
        assert_eq!(csv[0].owner_name, None);
        assert_eq!(csv[0].purchase_price_batch_locked, None);
        assert_eq!(csv[0].purchase_price_source, None);
    }

    #[test]
    fn structured_inventory_fields_preserve_location_and_price_intent() {
        let rows = parse_inventory_spools_json(
            r#"[{"spool_id":"structured","material":"PETG","filament_name":"Basic","color_name":"Black","ownership_type":"borrowed-in","owner_name":"Mina","owner_contact":"mina@example.test","ownership_note":"Prototype","remaining_g":650,"initial_weight_g":750,"current_weight_g":675,"spool_tare_weight_g":223,"location":"Drybox","location_id":"location-current","location_name":"Drybox","location_type":"PRINTER_SLOT","home_location_id":"location-home","home_location_name":"Shelf 1","home_location_type":"GENERIC","purchase_price_batch_locked":true,"purchase_price_source":"standard_batch"}]"#,
        )
        .expect("parse structured JSON export");
        let row = &rows[0];
        assert!(row.has_structured_locations);
        assert!(row.has_legacy_location);
        assert!(row.has_current_location);
        assert!(row.has_home_location);
        assert_eq!(row.location_id.as_deref(), Some("location-current"));
        assert_eq!(row.location_name.as_deref(), Some("Drybox"));
        assert_eq!(row.location_type.as_deref(), Some("PRINTER_SLOT"));
        assert_eq!(row.home_location_id.as_deref(), Some("location-home"));
        assert_eq!(row.home_location_name.as_deref(), Some("Shelf 1"));
        assert_eq!(row.home_location_type.as_deref(), Some("GENERIC"));
        assert!(row.has_remaining_g);
        assert!(row.has_initial_weight_g);
        assert!(row.has_current_weight_g);
        assert_eq!(row.spool_tare_weight_g, Some(Some(223)));
        assert!(row.has_ownership_type);
        assert_eq!(row.ownership_type.as_deref(), Some("BORROWED_IN"));
        assert_eq!(row.owner_name, Some(Some("Mina".to_string())));
        assert_eq!(
            row.owner_contact,
            Some(Some("mina@example.test".to_string()))
        );
        assert_eq!(row.ownership_note, Some(Some("Prototype".to_string())));
        assert_eq!(row.purchase_price_batch_locked, Some(true));
        assert_eq!(
            row.purchase_price_source,
            Some(Some("STANDARD_BATCH".to_string()))
        );
    }

    #[test]
    fn malformed_price_protection_fields_fail_closed() {
        let lock_error = parse_inventory_spools_json(
            r#"[{"spool_id":"invalid","material":"PLA","filament_name":"Basic","color_name":"Blue","purchase_price_batch_locked":"yes"}]"#,
        )
        .expect_err("non-boolean lock must fail");
        assert!(lock_error
            .to_string()
            .contains("purchase_price_batch_locked"));

        let source_error = parse_inventory_spools_csv(
            "spool_id,material,filament_name,color_name,purchase_price_batch_locked,purchase_price_source\ninvalid,PLA,Basic,Blue,false,AUTOMATIC\n",
        )
        .expect_err("unknown source must fail");
        assert!(source_error.to_string().contains("purchase_price_source"));

        let tare_error = parse_inventory_spools_json(
            r#"[{"spool_id":"invalid","material":"PLA","filament_name":"Basic","color_name":"Blue","spool_tare_weight_g":-1}]"#,
        )
        .expect_err("negative tare must fail");
        assert!(tare_error.to_string().contains("spool_tare_weight_g"));

        let json_weight_error = parse_inventory_spools_json(
            r#"[{"spool_id":"invalid","material":"PLA","filament_name":"Basic","color_name":"Blue","remaining_g":"heavy"}]"#,
        )
        .expect_err("invalid JSON weight must fail");
        assert!(json_weight_error.to_string().contains("remaining_g"));

        let csv_weight_error = parse_inventory_spools_csv(
            "spool_id,material,filament_name,color_name,current_weight_g\ninvalid,PLA,Basic,Blue,-10\n",
        )
        .expect_err("negative CSV weight must fail");
        assert!(csv_weight_error.to_string().contains("current_weight_g"));

        let ownership_error = parse_inventory_spools_json(
            r#"[{"spool_id":"invalid","material":"PLA","filament_name":"Basic","color_name":"Blue","ownership_type":"SHARED"}]"#,
        )
        .expect_err("unknown ownership must fail");
        assert!(ownership_error.to_string().contains("ownership_type"));
    }
}
