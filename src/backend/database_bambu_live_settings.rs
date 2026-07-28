use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};

use super::bambu_live_settings::{
    bambu_live_integration_setting_key, BAMBU_LIVE_INTEGRATION_SETTING_PREFIX,
};
use super::database_printer_models::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveTlsIdentityRow,
};
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

pub(crate) fn update_bambu_live_observation_if_current(
    conn: &Connection,
    printer_id: &str,
    expected_config: &BambuLiveIntegrationRow,
    observed_state: Option<BambuLiveObservedStateRow>,
    last_error: Option<String>,
    observed_tls_identity: Option<&BambuLiveTlsIdentityRow>,
) -> InventoryResult<bool> {
    let normalized_printer_id = printer_id.trim();
    if normalized_printer_id.is_empty() {
        return Err(InventoryError::Db(
            "printer id is required for Bambu live observation".to_string(),
        ));
    }

    // A network poll can take several seconds. Re-read the integration while
    // holding a write reservation so its stale snapshot cannot overwrite a
    // newer edit or recreate a row that was deleted while the poll ran.
    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(InventoryError::from)?;
    let setting_key = bambu_live_integration_setting_key(normalized_printer_id);
    let current_payload = transaction
        .query_row(
            "SELECT value FROM settings WHERE key = ?1 LIMIT 1",
            params![setting_key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(current_payload) = current_payload else {
        return Ok(false);
    };
    let mut current = serde_json::from_str::<BambuLiveIntegrationRow>(&current_payload)
        .map_err(|error| InventoryError::Db(error.to_string()))?;
    if !same_poll_binding(expected_config, &current) {
        return Ok(false);
    }

    let previous = current.clone();
    current.last_error = last_error;
    current.observed_state = observed_state;
    if let Some(observed_tls_identity) = observed_tls_identity {
        current.tls_identity = Some(merge_observed_tls_identity(
            current.tls_identity.as_ref(),
            observed_tls_identity,
        ));
    }

    let next_payload =
        serde_json::to_string(&current).map_err(|error| InventoryError::Db(error.to_string()))?;
    if next_payload != current_payload {
        let updated = transaction.execute(
            "UPDATE settings SET value = ?1 WHERE key = ?2",
            params![next_payload, setting_key],
        )?;
        if updated != 1 {
            return Err(InventoryError::Db(
                "Bambu live integration disappeared while saving an observation".to_string(),
            ));
        }
        if bambu_live_revision_should_advance(&previous, &current) {
            bump_library_domain_revision(&transaction, PRINTERS_REVISION_DOMAIN)?;
        }
    }
    transaction.commit()?;
    Ok(true)
}

fn same_poll_binding(
    expected: &BambuLiveIntegrationRow,
    current: &BambuLiveIntegrationRow,
) -> bool {
    expected.enabled == current.enabled
        && expected.host == current.host
        && expected.access_code_configured == current.access_code_configured
        && expected.access_code_binding_id == current.access_code_binding_id
        && expected.printer_serial == current.printer_serial
        && trusted_tls_pin(expected) == trusted_tls_pin(current)
}

fn trusted_tls_pin(config: &BambuLiveIntegrationRow) -> (Option<&str>, Option<&str>) {
    config
        .tls_identity
        .as_ref()
        .map(|identity| {
            (
                identity.trusted_spki_sha256.as_deref(),
                identity.trusted_certificate_sha256.as_deref(),
            )
        })
        .unwrap_or((None, None))
}

fn merge_observed_tls_identity(
    current: Option<&BambuLiveTlsIdentityRow>,
    observed: &BambuLiveTlsIdentityRow,
) -> BambuLiveTlsIdentityRow {
    BambuLiveTlsIdentityRow {
        trusted_spki_sha256: current.and_then(|identity| identity.trusted_spki_sha256.clone()),
        trusted_certificate_sha256: current
            .and_then(|identity| identity.trusted_certificate_sha256.clone()),
        trusted_at: current.and_then(|identity| identity.trusted_at.clone()),
        observed_spki_sha256: observed.observed_spki_sha256.clone(),
        observed_certificate_sha256: observed.observed_certificate_sha256.clone(),
        observed_at: observed.observed_at.clone(),
    }
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
    // Retry bookkeeping for OS-credential cleanup is deliberately invisible
    // to UI revision polling. The active binding still participates in the
    // comparison, so a real credential replacement wakes consumers.
    view.access_code_stale_binding_ids.clear();
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
