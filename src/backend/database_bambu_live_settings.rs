use rusqlite::{params, Connection};

use super::bambu_live_settings::{
    bambu_live_integration_setting_key, BAMBU_LIVE_INTEGRATION_SETTING_PREFIX,
};
use super::database_printer_models::{BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow};
use super::database_result::{InventoryError, InventoryResult};
use super::database_revision::{bump_library_domain_revision, PRINTERS_REVISION_DOMAIN};
use super::database_settings::{delete_setting, get_setting, set_setting};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

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
    let setting_key = bambu_live_integration_setting_key(normalized_printer_id);
    let previous_payload = get_setting(conn, &setting_key)?;
    if previous_payload.as_deref() == Some(payload.as_str()) {
        return Ok(());
    }

    let should_advance_revision = previous_payload
        .as_deref()
        .and_then(|value| serde_json::from_str::<BambuLiveIntegrationRow>(value).ok())
        .is_none_or(|previous| bambu_live_revision_should_advance(&previous, config));
    set_setting(conn, &setting_key, &payload)?;
    if should_advance_revision {
        bump_library_domain_revision(conn, PRINTERS_REVISION_DOMAIN)?;
    }
    Ok(())
}

fn bambu_live_revision_should_advance(
    previous: &BambuLiveIntegrationRow,
    current: &BambuLiveIntegrationRow,
) -> bool {
    if bambu_live_revision_view(previous) != bambu_live_revision_view(current) {
        return true;
    }

    // The timestamp still drives the visible freshness state, but waking every
    // page for each 20-second MQTT heartbeat defeats revision-gated polling.
    // One revision per UTC minute keeps freshness current without turning an
    // otherwise unchanged heartbeat into a continuous full-data reload.
    freshness_minute_changed(previous, current)
}

fn bambu_live_revision_view(config: &BambuLiveIntegrationRow) -> BambuLiveIntegrationRow {
    let mut view = config.clone();
    if let Some(observed) = view.observed_state.as_mut() {
        observed.last_seen_at = None;
        observed.raw_payload_json = None;
        for tray in &mut observed.trays {
            tray.last_identity_seen_at = None;
            tray.last_empty_seen_at = None;
            tray.empty_observation_count = tray
                .empty_observation_count
                .map(|count| i64::from(count > 0));
        }
    }
    view
}

fn freshness_minute_changed(
    previous: &BambuLiveIntegrationRow,
    current: &BambuLiveIntegrationRow,
) -> bool {
    let previous_value = previous
        .observed_state
        .as_ref()
        .and_then(|state| state.last_seen_at.as_deref());
    let current_value = current
        .observed_state
        .as_ref()
        .and_then(|state| state.last_seen_at.as_deref());
    if previous_value == current_value {
        return false;
    }
    match (previous_value, current_value) {
        (Some(previous_value), Some(current_value)) => {
            match (
                freshness_minute(previous_value),
                freshness_minute(current_value),
            ) {
                (Some(previous_minute), Some(current_minute)) => previous_minute != current_minute,
                _ => true,
            }
        }
        (None, None) => false,
        _ => true,
    }
}

fn freshness_minute(value: &str) -> Option<i64> {
    OffsetDateTime::parse(value.trim(), &Rfc3339)
        .ok()
        .map(|timestamp| timestamp.unix_timestamp().div_euclid(60))
}

pub(crate) fn delete_bambu_live_integration(
    conn: &Connection,
    printer_id: &str,
) -> InventoryResult<()> {
    let normalized_printer_id = printer_id.trim();
    if normalized_printer_id.is_empty() {
        return Ok(());
    }
    let setting_key = bambu_live_integration_setting_key(normalized_printer_id);
    if get_setting(conn, &setting_key)?.is_none() {
        return Ok(());
    }

    delete_setting(conn, &setting_key)?;
    bump_library_domain_revision(conn, PRINTERS_REVISION_DOMAIN)
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
