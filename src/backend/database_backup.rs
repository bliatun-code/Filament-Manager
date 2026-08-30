use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::app_metadata::APP_VERSION;
use super::database_result::{InventoryError, InventoryResult};
use super::database_schema::{
    ensure_database_quick_check, ensure_no_foreign_key_violations, table_columns,
    CURRENT_SCHEMA_VERSION,
};
use super::database_tables::{
    is_required_full_backup_table, portable_backup_row, FULL_BACKUP_TABLES,
};
use super::database_values::{json_value_to_sql, sqlite_value_to_json};

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
    pub schema_version: Option<i64>,
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

    let schema_version = optional_schema_version(root)?;
    validate_optional_app_version(root)?;

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
        schema_version,
        tables,
    })
}

fn optional_schema_version(root: &Map<String, Value>) -> InventoryResult<Option<i64>> {
    let Some(value) = root.get("schema_version") else {
        return Ok(None);
    };
    let version = value.as_i64().ok_or_else(|| {
        InventoryError::Db("Backup schema_version must be an integer".to_string())
    })?;
    if version < 0 {
        return Err(InventoryError::Db(
            "Backup schema_version cannot be negative".to_string(),
        ));
    }
    Ok(Some(version))
}

fn validate_optional_app_version(root: &Map<String, Value>) -> InventoryResult<()> {
    let Some(value) = root.get("app_version") else {
        return Ok(());
    };
    if value.is_string() {
        return Ok(());
    }
    Err(InventoryError::Db(
        "Backup app_version must be a string".to_string(),
    ))
}

pub(crate) fn validate_full_backup_content(
    content: &str,
    schema_sql: &str,
) -> InventoryResult<BackupValidationStats> {
    let parsed = parse_full_backup_content(content)?;
    ensure_full_backup_is_safe_to_import(&parsed)?;
    ensure_full_backup_rows_are_importable(&parsed, schema_sql)?;
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

pub(crate) fn ensure_full_backup_rows_are_importable(
    parsed: &ParsedFullBackup,
    schema_sql: &str,
) -> InventoryResult<()> {
    ensure_full_backup_purchase_metadata_types_are_valid(parsed)?;
    let scratch = rusqlite::Connection::open_in_memory()?;
    scratch.execute_batch(schema_sql)?;
    scratch.execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")?;

    let result = (|| {
        insert_portable_full_backup_rows(&scratch, parsed)?;
        ensure_no_foreign_key_violations(&scratch, "Full backup preflight")?;
        ensure_database_quick_check(&scratch)
    })();

    let rollback_result = scratch.execute_batch("ROLLBACK; PRAGMA foreign_keys = ON;");
    match result {
        Err(error) => Err(error),
        Ok(()) => {
            rollback_result?;
            Ok(())
        }
    }
}

fn ensure_full_backup_purchase_metadata_types_are_valid(
    parsed: &ParsedFullBackup,
) -> InventoryResult<()> {
    let Some(rows) = parsed.tables.get("filament_spools") else {
        return Ok(());
    };
    for (row_index, row) in rows.iter().enumerate() {
        let _ = backup_optional_price(row, "purchase_price", row_index)?;
        for field in [
            "purchase_currency",
            "purchase_date",
            "batch_code",
            "supplier_reference",
        ] {
            let _ = backup_optional_text(row, field, row_index)?;
        }
        let _ = backup_optional_batch_lock(row, row_index)?;
        if let Some(source) = backup_optional_text(row, "purchase_price_source", row_index)?
            && !matches!(source.as_str(), "MANUAL" | "STANDARD_BATCH")
        {
            return Err(invalid_backup_purchase_field(
                row_index,
                "purchase_price_source",
                "must be `MANUAL`, `STANDARD_BATCH`, or null",
            ));
        }
    }
    Ok(())
}

fn backup_optional_batch_lock(
    row: &Map<String, Value>,
    row_index: usize,
) -> InventoryResult<Option<bool>> {
    match row.get("purchase_price_batch_locked") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(Value::Number(value))
            if value.as_i64().is_some_and(|value| matches!(value, 0 | 1)) =>
        {
            Ok(Some(value.as_i64() == Some(1)))
        }
        Some(_) => Err(invalid_backup_purchase_field(
            row_index,
            "purchase_price_batch_locked",
            "must be 0, 1, a boolean, or null",
        )),
    }
}

fn backup_optional_price(
    row: &Map<String, Value>,
    field: &str,
    row_index: usize,
) -> InventoryResult<Option<f64>> {
    match row.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value.as_f64().map(Some).ok_or_else(|| {
            invalid_backup_purchase_field(row_index, field, "must be a finite number or null")
        }),
        Some(_) => Err(invalid_backup_purchase_field(
            row_index,
            field,
            "must be a number or null",
        )),
    }
}

fn backup_optional_text(
    row: &Map<String, Value>,
    field: &str,
    row_index: usize,
) -> InventoryResult<Option<String>> {
    match row.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(invalid_backup_purchase_field(
            row_index,
            field,
            "must be a string or null",
        )),
    }
}

fn invalid_backup_purchase_field(
    row_index: usize,
    field: &str,
    expectation: &str,
) -> InventoryError {
    InventoryError::Db(format!(
        "Backup row {} for `filament_spools` field `{field}` {expectation}",
        row_index + 1
    ))
}

pub(crate) fn insert_portable_full_backup_rows(
    conn: &rusqlite::Connection,
    parsed: &ParsedFullBackup,
) -> InventoryResult<()> {
    for table in FULL_BACKUP_TABLES {
        let Some(rows) = parsed.tables.get(table) else {
            continue;
        };
        let allowed_columns = table_columns(conn, table)?;

        for (row_index, row) in rows.iter().enumerate() {
            if !full_backup_table_is_entirely_local(table)
                && !row.keys().any(|column| allowed_columns.contains(column))
            {
                return Err(unrecognized_backup_row_error(table, row_index));
            }

            let Some(row) = portable_backup_row(table, row.clone()) else {
                continue;
            };
            insert_portable_backup_row(conn, table, row_index, &row, &allowed_columns)?;
        }
    }
    Ok(())
}

fn insert_portable_backup_row(
    conn: &rusqlite::Connection,
    table: &str,
    row_index: usize,
    row: &Map<String, Value>,
    allowed_columns: &HashSet<String>,
) -> InventoryResult<()> {
    let columns: Vec<String> = row
        .keys()
        .filter(|column| allowed_columns.contains(*column))
        .cloned()
        .collect();
    if columns.is_empty() {
        return Err(unrecognized_backup_row_error(table, row_index));
    }

    let placeholders = vec!["?"; columns.len()].join(", ");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({})",
        columns.join(", "),
        placeholders
    );
    let values: Vec<rusqlite::types::Value> = columns
        .iter()
        .map(|column| json_value_to_sql(row.get(column).unwrap_or(&Value::Null)))
        .collect();
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
    Ok(())
}

fn full_backup_table_is_entirely_local(table: &str) -> bool {
    matches!(
        table,
        "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue"
    )
}

fn unrecognized_backup_row_error(table: &str, row_index: usize) -> InventoryError {
    InventoryError::Db(format!(
        "Backup row {} for `{table}` contains no recognized importable columns",
        row_index + 1
    ))
}

pub(crate) fn ensure_full_backup_is_safe_to_import(
    parsed: &ParsedFullBackup,
) -> InventoryResult<()> {
    if let Some(schema_version) = parsed.schema_version
        && schema_version > CURRENT_SCHEMA_VERSION
    {
        return Err(InventoryError::Db(format!(
                "Backup schema version {schema_version} is newer than the supported schema version {CURRENT_SCHEMA_VERSION}"
            )));
    }

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
    root.insert(
        "schema_version".to_string(),
        Value::Number(CURRENT_SCHEMA_VERSION.into()),
    );
    root.insert(
        "app_version".to_string(),
        Value::String(APP_VERSION.to_string()),
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
