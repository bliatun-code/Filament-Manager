use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::database_result::{InventoryError, InventoryResult};
use super::database_tables::{
    is_required_full_backup_table, portable_backup_row, FULL_BACKUP_TABLES,
};
use super::database_values::sqlite_value_to_json;

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
    ensure_full_backup_is_safe_to_import(&parsed)?;
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

pub(crate) fn ensure_full_backup_is_safe_to_import(
    parsed: &ParsedFullBackup,
) -> InventoryResult<()> {
    let missing_required_tables: Vec<&str> = FULL_BACKUP_TABLES
        .iter()
        .copied()
        .filter(|table| is_required_full_backup_table(table))
        .filter(|table| !parsed.tables.contains_key(*table))
        .collect();

    if missing_required_tables.is_empty() {
        return Ok(());
    }

    Err(InventoryError::Db(format!(
        "Backup is incomplete and cannot be imported safely. Missing required tables: {}",
        missing_required_tables.join(", ")
    )))
}

pub(crate) fn export_full_backup_content(conn: &rusqlite::Connection) -> InventoryResult<String> {
    let transaction = conn.unchecked_transaction()?;
    let exported_at: String =
        transaction.query_row("SELECT datetime('now')", [], |row| row.get(0))?;

    let mut tables = Map::new();
    for table in FULL_BACKUP_TABLES {
        tables.insert(
            table.to_string(),
            Value::Array(export_table_rows(&transaction, table)?),
        );
    }
    transaction.commit()?;

    let mut root = Map::new();
    root.insert(
        "format".to_string(),
        Value::String("filament-manager-backup-v1".to_string()),
    );
    root.insert("exported_at".to_string(), Value::String(exported_at));
    root.insert("tables".to_string(), Value::Object(tables));

    serde_json::to_string_pretty(&Value::Object(root))
        .map_err(|error| InventoryError::Db(error.to_string()))
}

fn export_table_rows(conn: &rusqlite::Connection, table: &str) -> InventoryResult<Vec<Value>> {
    let query = format!("SELECT * FROM {table}");
    let mut stmt = conn.prepare(&query)?;
    let columns: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|name| (*name).to_string())
        .collect();

    let mut rows = stmt.query([])?;
    let mut output = Vec::new();
    while let Some(row) = rows.next()? {
        let mut object = Map::new();
        for (index, column_name) in columns.iter().enumerate() {
            let value = row.get_ref(index)?;
            object.insert(column_name.clone(), sqlite_value_to_json(value));
        }
        if let Some(object) = portable_backup_row(table, object) {
            output.push(Value::Object(object));
        }
    }
    Ok(output)
}
