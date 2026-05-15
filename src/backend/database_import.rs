use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::filament_database::{InventoryError, InventoryResult};

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
}

#[derive(Clone, Debug)]
pub(crate) struct InventoryImportStats {
    pub(crate) imported_count: i64,
    pub(crate) created_count: i64,
    pub(crate) updated_count: i64,
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
        });
    }
    Ok(output)
}

pub(crate) fn parse_inventory_spools_csv(
    content: &str,
) -> InventoryResult<Vec<InventoryImportRow>> {
    let mut lines = content.lines().filter(|line| !line.trim().is_empty());
    let header_line = lines
        .next()
        .ok_or_else(|| InventoryError::Db("Inventory CSV is empty".to_string()))?;
    let headers = parse_csv_record(header_line)
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

    let mut output = Vec::new();
    for line in lines {
        let values = parse_csv_record(line);
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
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

fn parse_i64_text(raw: Option<&str>) -> Option<i64> {
    let value = raw?.trim();
    if value.is_empty() {
        return None;
    }
    value.parse::<i64>().ok()
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

fn normalize_csv_header(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('\u{feff}')
        .to_lowercase()
        .replace([' ', '-'], "_")
}

fn parse_csv_record(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;

    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                if in_quotes {
                    if matches!(chars.peek(), Some('"')) {
                        current.push('"');
                        let _ = chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else if current.is_empty() {
                    in_quotes = true;
                } else {
                    current.push(ch);
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    fields.push(current.trim().to_string());
    fields
}

fn csv_field<'a>(headers: &[String], values: &'a [String], candidates: &[&str]) -> Option<&'a str> {
    for candidate in candidates {
        if let Some(index) = headers.iter().position(|header| header == candidate) {
            return values.get(index).map(|value| value.as_str());
        }
    }
    None
}
