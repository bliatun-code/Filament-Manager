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
    pub(crate) remaining_g: Option<i64>,
    pub(crate) location: Option<String>,
    pub(crate) qr_code: Option<String>,
    pub(crate) vendor: Option<String>,
    pub(crate) initial_weight_g: Option<i64>,
    pub(crate) current_weight_g: Option<i64>,
    /// `None` means the source format did not contain receipt columns. `Some`
    /// (including an all-null value) means those columns were explicitly
    /// supplied and should replace the stored metadata.
    pub(crate) purchase_metadata: Option<PurchaseReceiptMetadata>,
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
        let has_purchase_metadata = [
            "purchase_price",
            "purchasePrice",
            "purchase_currency",
            "purchaseCurrency",
            "purchase_date",
            "purchaseDate",
            "batch_code",
            "batchCode",
            "supplier_reference",
            "supplierReference",
        ]
        .iter()
        .any(|field| object.contains_key(*field));
        let purchase_metadata = if has_purchase_metadata {
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

        output.push(InventoryImportRow {
            spool_id,
            material,
            filament_name,
            color_name,
            status: value_to_optional_string(object.get("status")),
            remaining_g: value_to_optional_i64(
                object
                    .get("remaining_g")
                    .or_else(|| object.get("remaining"))
                    .or_else(|| object.get("remainingG")),
            ),
            location: value_to_optional_string(
                object
                    .get("location")
                    .or_else(|| object.get("location_id"))
                    .or_else(|| object.get("locationId")),
            ),
            qr_code: value_to_optional_string(
                object
                    .get("qr_code")
                    .or_else(|| object.get("qr"))
                    .or_else(|| object.get("qrCode")),
            ),
            vendor: value_to_optional_string(object.get("vendor")),
            initial_weight_g: value_to_optional_i64(
                object
                    .get("initial_weight_g")
                    .or_else(|| object.get("initialWeightG")),
            ),
            current_weight_g: value_to_optional_i64(
                object
                    .get("current_weight_g")
                    .or_else(|| object.get("currentWeightG")),
            ),
            purchase_metadata,
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
    let has_purchase_metadata = [
        "purchase_price",
        "purchaseprice",
        "purchase_currency",
        "purchasecurrency",
        "purchase_date",
        "purchasedate",
        "batch_code",
        "batchcode",
        "supplier_reference",
        "supplierreference",
    ]
    .iter()
    .any(|field| headers.iter().any(|header| header == field));

    let mut output = Vec::new();
    for values in records {
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
            remaining_g: parse_i64_text(csv_field(
                &headers,
                &values,
                &["remaining_g", "remaining", "remainingg"],
            )),
            location: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["location", "location_id", "locationid"],
            )),
            qr_code: normalize_optional_text(csv_field(
                &headers,
                &values,
                &["qr_code", "qr", "qrcode"],
            )),
            vendor: normalize_optional_text(csv_field(&headers, &values, &["vendor"])),
            initial_weight_g: parse_i64_text(csv_field(
                &headers,
                &values,
                &["initial_weight_g", "initial_weight", "initialweightg"],
            )),
            current_weight_g: parse_i64_text(csv_field(
                &headers,
                &values,
                &["current_weight_g", "current_weight", "currentweightg"],
            )),
            purchase_metadata: if has_purchase_metadata {
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
    value.filter(|text| !text.is_empty()).map(str::to_string)
}

fn parse_i64_text(raw: Option<&str>) -> Option<i64> {
    let value = raw?.trim();
    if value.is_empty() {
        return None;
    }
    value.parse::<i64>().ok()
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

fn value_to_optional_i64(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(number)) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|raw| i64::try_from(raw).ok())),
        Some(Value::String(text)) => parse_i64_text(Some(text)),
        _ => None,
    }
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
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(invalid_receipt_json_type(
            row_index,
            field,
            "a string or null",
        )),
    }
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

#[cfg(test)]
mod tests {
    use super::parse_csv_records;

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
}
