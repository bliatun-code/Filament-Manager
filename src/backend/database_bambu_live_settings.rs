use rusqlite::{params, Connection};

use super::bambu_live_settings::{
    bambu_live_integration_setting_key, BAMBU_LIVE_INTEGRATION_SETTING_PREFIX,
};
use super::database_settings::{delete_setting, set_setting};
use super::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, InventoryError, InventoryResult,
};

pub(crate) fn save_bambu_live_integration(
    conn: &Connection,
    printer_id: &str,
    config: &BambuLiveIntegrationRow,
) -> InventoryResult<()> {
    let normalized_printer_id = printer_id.trim();
    if normalized_printer_id.is_empty() {
        return Err(InventoryError::Db(
            "printer id is required for Bambu live integration".to_string(),
        ));
    }

    let payload =
        serde_json::to_string(config).map_err(|error| InventoryError::Db(error.to_string()))?;
    set_setting(
        conn,
        &bambu_live_integration_setting_key(normalized_printer_id),
        &payload,
    )
}

pub(crate) fn delete_bambu_live_integration(
    conn: &Connection,
    printer_id: &str,
) -> InventoryResult<()> {
    let normalized_printer_id = printer_id.trim();
    if normalized_printer_id.is_empty() {
        return Ok(());
    }
    delete_setting(
        conn,
        &bambu_live_integration_setting_key(normalized_printer_id),
    )
}

pub(crate) fn list_bambu_live_integrations(
    conn: &Connection,
) -> InventoryResult<Vec<BambuLiveIntegrationEntryRow>> {
    let mut stmt = conn.prepare(
        "SELECT key, value
         FROM settings
         WHERE key LIKE ?1 || '%'
         ORDER BY key ASC",
    )?;
    let rows = stmt.query_map(params![BAMBU_LIVE_INTEGRATION_SETTING_PREFIX], |row| {
        let key: String = row.get(0)?;
        let value: String = row.get(1)?;
        Ok((key, value))
    })?;
    let mut entries = Vec::new();
    for row in rows {
        let (key, value) = row?;
        let Some(printer_id) = key.strip_prefix(BAMBU_LIVE_INTEGRATION_SETTING_PREFIX) else {
            continue;
        };
        let config = serde_json::from_str::<BambuLiveIntegrationRow>(&value)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        entries.push(BambuLiveIntegrationEntryRow {
            printer_id: printer_id.to_string(),
            config,
        });
    }
    Ok(entries)
}
