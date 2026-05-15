use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::database_tables::FULL_BACKUP_TABLES;
use super::filament_database::{InventoryError, InventoryResult};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupValidationStats {
    pub format: String,
    pub expected_tables: i64,
    pub present_tables: i64,
    pub total_rows: i64,
    pub missing_tables: Vec<String>,
    pub extra_tables: Vec<String>,
}

pub(crate) struct ParsedFullBackup {
    pub format: String,
    pub tables: BTreeMap<String, Vec<Map<String, Value>>>,
}

pub(crate) fn parse_full_backup_content(content: &str) -> InventoryResult<ParsedFullBackup> {
    let normalized = content.trim_start_matches('\u{feff}').trim();
    if normalized.is_empty() {
        return Err(InventoryError::Db("Backup content is empty".to_string()));
    }
    let parsed: Value =
        serde_json::from_str(normalized).map_err(|error| InventoryError::Db(error.to_string()))?;
    let root = parsed
        .as_object()
        .ok_or_else(|| InventoryError::Db("Backup root must be a JSON object".to_string()))?;
    let format = root
        .get("format")
        .and_then(Value::as_str)
        .ok_or_else(|| InventoryError::Db("Backup format field is missing".to_string()))?;
    if format != "filament-manager-backup-v1" {
        return Err(InventoryError::Db(format!(
            "Unsupported backup format: {format}"
        )));
    }

    let raw_tables = root
        .get("tables")
        .and_then(Value::as_object)
        .ok_or_else(|| InventoryError::Db("Backup tables object is missing".to_string()))?;
    let mut tables = BTreeMap::new();

    for (table_name, raw_rows) in raw_tables {
        let rows = raw_rows.as_array().ok_or_else(|| {
            InventoryError::Db(format!("Backup table `{table_name}` must be an array"))
        })?;
        let mut table_rows = Vec::with_capacity(rows.len());
        for row in rows {
            let object = row.as_object().ok_or_else(|| {
                InventoryError::Db(format!(
                    "Backup row for `{table_name}` must be a JSON object"
                ))
            })?;
            table_rows.push(object.clone());
        }
        tables.insert(table_name.clone(), table_rows);
    }

    Ok(ParsedFullBackup {
        format: format.to_string(),
        tables,
    })
}

pub(crate) fn validate_full_backup_content(
    content: &str,
) -> InventoryResult<BackupValidationStats> {
    let parsed = parse_full_backup_content(content)?;
    let table_entries: Vec<(&str, &Vec<Map<String, Value>>)> = parsed
        .tables
        .iter()
        .map(|(name, rows)| (name.as_str(), rows))
        .collect();
    let mut present_table_names: HashSet<&str> = HashSet::new();
    for (name, _) in &table_entries {
        present_table_names.insert(*name);
    }

    let mut missing_tables = Vec::new();
    for table in FULL_BACKUP_TABLES {
        if !present_table_names.contains(table) {
            missing_tables.push(table.to_string());
        }
    }

    let expected_table_names: HashSet<&str> = FULL_BACKUP_TABLES.iter().copied().collect();
    let mut extra_tables = Vec::new();
    for table in present_table_names {
        if !expected_table_names.contains(table) {
            extra_tables.push(table.to_string());
        }
    }
    extra_tables.sort();

    let total_rows = table_entries
        .iter()
        .map(|(_, rows)| i64::try_from(rows.len()).unwrap_or(0))
        .sum();

    Ok(BackupValidationStats {
        format: parsed.format,
        expected_tables: i64::try_from(FULL_BACKUP_TABLES.len()).unwrap_or(0),
        present_tables: i64::try_from(table_entries.len()).unwrap_or(0),
        total_rows,
        missing_tables,
        extra_tables,
    })
}
