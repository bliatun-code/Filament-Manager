use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{BambuLiveIntegrationRow, BambuLiveTlsIdentityRow};
use crate::bambu_live::probe_printer_tls_identity;
use crate::bambu_live::tls_identity::{
    assess_trust, BambuTlsIdentity, BambuTlsPin, BambuTlsTrustDecision,
};
use crate::bambu_live_observation::now_iso_string;
use crate::credential_store::{
    new_credential_binding_id, normalize_credential_binding_id, CredentialKey, CredentialStore,
    SecretValue,
};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::{with_db, with_inventory};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum BambuAccessCodeAction {
    Keep,
    Replace,
    Clear,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum BambuTlsTrustAction {
    Keep,
    TrustCurrent,
    Clear,
}

#[derive(Deserialize)]
pub(crate) struct SaveBambuLiveIntegrationInput {
    printer_id: String,
    enabled: bool,
    host: Option<String>,
    access_code_action: BambuAccessCodeAction,
    access_code: Option<String>,
    printer_serial: Option<String>,
    tls_trust_action: BambuTlsTrustAction,
    expected_tls_certificate_sha256: Option<String>,
    expected_tls_spki_sha256: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct InspectBambuLiveTlsIdentityInput {
    host: String,
    printer_serial: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct BambuLiveTlsIdentityInspection {
    certificate_sha256: String,
    spki_sha256: String,
}

#[tauri::command]
pub(crate) async fn inspect_bambu_live_tls_identity(
    input: InspectBambuLiveTlsIdentityInput,
) -> Result<BambuLiveTlsIdentityInspection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        inspect_bambu_live_tls_identity_with_probe(input, probe_printer_tls_identity)
    })
    .await
    .map_err(|_| "Printer identity check did not complete.".to_string())?
}

fn inspect_bambu_live_tls_identity_with_probe(
    input: InspectBambuLiveTlsIdentityInput,
    probe: impl FnOnce(&str, &str) -> Result<BambuTlsIdentity, String>,
) -> Result<BambuLiveTlsIdentityInspection, String> {
    let host = input.host.trim();
    if host.is_empty() {
        return Err("Printer host is required before checking TLS identity.".to_string());
    }
    let printer_serial = input.printer_serial.trim();
    if printer_serial.is_empty() {
        return Err("Printer serial is required before checking TLS identity.".to_string());
    }
    let observed = probe(host, printer_serial)?;
    ensure_observed_identity_matches_serial(printer_serial, &observed)?;
    Ok(BambuLiveTlsIdentityInspection {
        certificate_sha256: observed.certificate_sha256,
        spki_sha256: observed.spki_sha256,
    })
}

#[tauri::command]
pub(crate) async fn save_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    input: SaveBambuLiveIntegrationInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        save_bambu_live_integration_with_probe(&state, input, probe_printer_tls_identity)
    })
    .await
    .map_err(|_| "Printer security settings did not finish saving.".to_string())?
}

fn save_bambu_live_integration_with_probe(
    state: &AppState,
    mut input: SaveBambuLiveIntegrationInput,
    probe: impl FnOnce(&str, &str) -> Result<BambuTlsIdentity, String>,
) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let mut submitted_access_code = input.access_code.take().map(Zeroizing::new);
    if input.access_code_action != BambuAccessCodeAction::Replace {
        submitted_access_code.take();
    }
    let printer_id = input.printer_id.trim().to_string();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    if input.enabled
        && (input.access_code_action == BambuAccessCodeAction::Clear
            || input.tls_trust_action == BambuTlsTrustAction::Clear)
    {
        return Err(
            "Disable live status when removing its access code or trusted identity.".to_string(),
        );
    }
    with_inventory(state, |engine| {
        let exists = engine
            .list_printers()?
            .into_iter()
            .any(|printer| printer.id == printer_id);
        if !exists {
            return Err(InventoryError::NotFound);
        }
        Ok(())
    })?;

    let existing = with_db(state, |db| {
        Ok(db
            .list_bambu_live_integrations()?
            .into_iter()
            .find(|entry| entry.printer_id == printer_id)
            .map(|entry| entry.config))
    })?;
    let host = normalize_optional_text(input.host.take());
    let printer_serial = normalize_optional_text(input.printer_serial.take());
    let printer_serial_changed = existing
        .as_ref()
        .is_some_and(|config| config.printer_serial != printer_serial);

    let tls_identity = match input.tls_trust_action {
        BambuTlsTrustAction::Keep => {
            if printer_serial_changed
                && existing
                    .as_ref()
                    .and_then(|config| config.tls_identity.as_ref())
                    .and_then(|identity| identity.trusted_spki_sha256.as_ref())
                    .is_some()
            {
                return Err(
                    "Trust the current printer certificate again after changing its serial."
                        .to_string(),
                );
            }
            if printer_serial_changed {
                None
            } else {
                existing
                    .as_ref()
                    .and_then(|config| config.tls_identity.clone())
            }
        }
        BambuTlsTrustAction::Clear => {
            if printer_serial_changed {
                None
            } else {
                existing
                    .as_ref()
                    .and_then(|config| config.tls_identity.clone())
                    .map(|mut identity| {
                        identity.trusted_spki_sha256 = None;
                        identity.trusted_certificate_sha256 = None;
                        identity.trusted_at = None;
                        identity
                    })
            }
        }
        BambuTlsTrustAction::TrustCurrent => {
            let host = host
                .as_deref()
                .ok_or_else(|| "Printer host is required before trusting TLS.".to_string())?;
            let printer_serial = printer_serial
                .as_deref()
                .ok_or_else(|| "Printer serial is required before trusting TLS.".to_string())?;
            let expected_certificate = input
                .expected_tls_certificate_sha256
                .as_deref()
                .ok_or_else(|| "Check the printer TLS identity before trusting it.".to_string())?;
            let expected_spki = input
                .expected_tls_spki_sha256
                .as_deref()
                .ok_or_else(|| "Check the printer TLS identity before trusting it.".to_string())?;
            let expected_pin =
                BambuTlsPin::new(printer_serial, expected_certificate, expected_spki)?;
            let observed = probe(host, printer_serial)?;
            ensure_observed_identity_matches_serial(printer_serial, &observed)?;
            if expected_pin.certificate_sha256() != observed.certificate_sha256
                || expected_pin.spki_sha256() != observed.spki_sha256
            {
                return Err(
                    "The printer TLS identity changed after it was checked. Review the new fingerprint before trusting it."
                        .to_string(),
                );
            }
            let observed_at = now_iso_string();
            Some(BambuLiveTlsIdentityRow {
                trusted_spki_sha256: Some(observed.spki_sha256.clone()),
                trusted_certificate_sha256: Some(observed.certificate_sha256.clone()),
                trusted_at: Some(observed_at.clone()),
                observed_spki_sha256: observed.spki_sha256,
                observed_certificate_sha256: observed.certificate_sha256,
                observed_at,
            })
        }
    };

    let existing_binding_id = existing
        .as_ref()
        .and_then(|config| config.access_code_binding_id.as_deref())
        .map(normalize_credential_binding_id)
        .transpose()
        .map_err(|error| error.to_string())?;
    let mut stale_binding_ids = normalized_stale_credential_binding_ids(
        existing_binding_id.as_deref(),
        existing
            .as_ref()
            .map(|config| config.access_code_stale_binding_ids.as_slice())
            .unwrap_or_default(),
    )?;
    let mut credential_rollback = CredentialRollback::default();
    let (access_code_configured, access_code_binding_id, credential_changed) = match input
        .access_code_action
    {
        BambuAccessCodeAction::Keep => {
            let configured = match existing_binding_id.as_deref() {
                Some(binding_id) => {
                    let key = CredentialKey::bambu_access_code(&printer_id, binding_id)
                        .map_err(|error| error.to_string())?;
                    state
                        .credentials
                        .get(&key)
                        .map_err(|error| error.to_string())?
                        .is_some()
                }
                None => false,
            };
            (configured, existing_binding_id.clone(), false)
        }
        BambuAccessCodeAction::Replace => {
            let submitted = submitted_access_code
                .as_deref()
                .ok_or_else(|| "Access code is required when replacing it.".to_string())?;
            let normalized = submitted.trim().to_string();
            if normalized.is_empty() {
                return Err("Access code is required when replacing it.".to_string());
            }
            let next_binding_id = new_credential_binding_id();
            let credential_key = CredentialKey::bambu_access_code(&printer_id, &next_binding_id)
                .map_err(|error| error.to_string())?;
            credential_rollback =
                CredentialRollback::capture(&state.credentials, [credential_key.clone()])?;
            let secret = SecretValue::from_utf8(normalized);
            if let Err(error) = state.credentials.set(&credential_key, &secret) {
                return rollback_after_error(
                    &state.credentials,
                    &credential_rollback,
                    true,
                    error.to_string(),
                );
            }
            if let Err(error) = verify_stored_secret(&state.credentials, &credential_key, &secret) {
                return rollback_after_error(&state.credentials, &credential_rollback, true, error);
            }
            if let Some(previous_binding_id) = existing_binding_id.as_ref() {
                stale_binding_ids.push(previous_binding_id.clone());
                stale_binding_ids.sort_unstable();
                stale_binding_ids.dedup();
            }
            (true, Some(next_binding_id), true)
        }
        BambuAccessCodeAction::Clear => {
            let binding_ids = credential_binding_ids_for_cleanup(
                existing_binding_id.as_deref(),
                &stale_binding_ids,
            );
            let credential_keys = binding_ids
                .into_iter()
                .map(|binding_id| CredentialKey::bambu_access_code(&printer_id, &binding_id))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            credential_rollback =
                CredentialRollback::capture(&state.credentials, credential_keys.clone())?;
            for credential_key in &credential_keys {
                if let Err(error) = state.credentials.delete(credential_key) {
                    return rollback_after_error(
                        &state.credentials,
                        &credential_rollback,
                        true,
                        error.to_string(),
                    );
                }
                match state.credentials.get(credential_key) {
                    Ok(None) => {}
                    Ok(Some(_)) => {
                        return rollback_after_error(
                            &state.credentials,
                            &credential_rollback,
                            true,
                            "The access code remained present after deletion.".to_string(),
                        );
                    }
                    Err(error) => {
                        return rollback_after_error(
                            &state.credentials,
                            &credential_rollback,
                            true,
                            error.to_string(),
                        );
                    }
                }
            }
            stale_binding_ids.clear();
            (false, None, !credential_rollback.is_empty())
        }
    };

    if input.enabled {
        if host.is_none() {
            return rollback_after_error(
                &state.credentials,
                &credential_rollback,
                credential_changed,
                "Printer host is required when live status is enabled.".to_string(),
            );
        }
        if printer_serial.is_none() {
            return rollback_after_error(
                &state.credentials,
                &credential_rollback,
                credential_changed,
                "Printer serial is required when live status is enabled.".to_string(),
            );
        }
        if !access_code_configured {
            return rollback_after_error(
                &state.credentials,
                &credential_rollback,
                credential_changed,
                "An access code is required when live status is enabled.".to_string(),
            );
        }
        if !tls_identity_is_trusted(tls_identity.as_ref()) {
            return rollback_after_error(
                &state.credentials,
                &credential_rollback,
                credential_changed,
                "Trust the current printer certificate before enabling live status.".to_string(),
            );
        }
    }

    let connection_changed = existing
        .as_ref()
        .is_some_and(|config| config.host != host || config.printer_serial != printer_serial);
    let config = BambuLiveIntegrationRow {
        enabled: input.enabled,
        host,
        access_code: None,
        access_code_configured,
        access_code_binding_id,
        access_code_stale_binding_ids: stale_binding_ids.clone(),
        printer_serial,
        last_error: None,
        tls_identity,
        observed_state: if !input.enabled || connection_changed {
            None
        } else {
            existing.and_then(|config| config.observed_state)
        },
    };
    if let Err(error) = with_db(state, |db| {
        db.save_bambu_live_integration_for_existing_printer_atomically(&printer_id, &config)
    }) {
        return rollback_after_error(
            &state.credentials,
            &credential_rollback,
            credential_changed,
            error,
        );
    }
    if credential_changed {
        cleanup_stale_bambu_credentials(state, &printer_id, &config)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    delete_bambu_live_integration_for_state(&state, &printer_id)
}

fn delete_bambu_live_integration_for_state(
    state: &AppState,
    printer_id: &str,
) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let printer_id = printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    let existing = with_db(state, |db| {
        Ok(db
            .list_bambu_live_integrations()?
            .into_iter()
            .find(|entry| entry.printer_id == printer_id)
            .map(|entry| entry.config))
    })?;
    let binding_ids = existing
        .as_ref()
        .map(|config| {
            credential_binding_ids_for_cleanup(
                config.access_code_binding_id.as_deref(),
                &config.access_code_stale_binding_ids,
            )
        })
        .unwrap_or_default();
    let credential_keys = binding_ids
        .into_iter()
        .map(|binding_id| CredentialKey::bambu_access_code(printer_id, &binding_id))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let credential_rollback =
        CredentialRollback::capture(&state.credentials, credential_keys.clone())?;
    for credential_key in &credential_keys {
        if let Err(error) = state.credentials.delete(credential_key) {
            return rollback_after_error(
                &state.credentials,
                &credential_rollback,
                true,
                error.to_string(),
            );
        }
        match state.credentials.get(credential_key) {
            Ok(None) => {}
            Ok(Some(_)) => {
                return rollback_after_error(
                    &state.credentials,
                    &credential_rollback,
                    true,
                    "The access code remained present after deletion.".to_string(),
                );
            }
            Err(error) => {
                return rollback_after_error(
                    &state.credentials,
                    &credential_rollback,
                    true,
                    error.to_string(),
                );
            }
        }
    }
    if let Err(error) = with_db(state, |db| db.delete_bambu_live_integration(printer_id)) {
        return rollback_after_error(&state.credentials, &credential_rollback, true, error);
    }
    Ok(())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ensure_observed_identity_matches_serial(
    printer_serial: &str,
    observed: &BambuTlsIdentity,
) -> Result<(), String> {
    BambuTlsPin::from_observed(printer_serial, observed)?;
    match assess_trust(printer_serial, None, observed)? {
        BambuTlsTrustDecision::Unknown { .. } => Ok(()),
        BambuTlsTrustDecision::Changed { change, .. } => Err(format!(
            "The observed printer certificate does not match the configured printer: {change}"
        )),
        BambuTlsTrustDecision::Trusted { .. } => {
            Err("Unexpected TLS trust state while pairing printer.".to_string())
        }
    }
}

fn tls_identity_is_trusted(identity: Option<&BambuLiveTlsIdentityRow>) -> bool {
    identity.is_some_and(|identity| {
        identity.trusted_spki_sha256.as_deref() == Some(identity.observed_spki_sha256.as_str())
            && identity.trusted_certificate_sha256.is_some()
            && identity.trusted_at.is_some()
    })
}

fn credential_binding_ids_for_cleanup(current: Option<&str>, stale: &[String]) -> Vec<String> {
    let mut binding_ids = stale
        .iter()
        .map(|binding_id| binding_id.trim().to_ascii_lowercase())
        .filter(|binding_id| !binding_id.is_empty())
        .collect::<Vec<_>>();
    if let Some(current) = current.map(str::trim).filter(|value| !value.is_empty()) {
        binding_ids.push(current.to_ascii_lowercase());
    }
    binding_ids.sort_unstable();
    binding_ids.dedup();
    binding_ids
}

fn normalized_stale_credential_binding_ids(
    current: Option<&str>,
    stale: &[String],
) -> Result<Vec<String>, String> {
    let current = current
        .map(normalize_credential_binding_id)
        .transpose()
        .map_err(|error| error.to_string())?;
    let mut binding_ids = stale
        .iter()
        .filter_map(|binding_id| normalize_credential_binding_id(binding_id).ok())
        .filter(|binding_id| current.as_ref() != Some(binding_id))
        .collect::<Vec<_>>();
    binding_ids.sort_unstable();
    binding_ids.dedup();
    Ok(binding_ids)
}

fn cleanup_stale_bambu_credentials(
    state: &AppState,
    printer_id: &str,
    config: &BambuLiveIntegrationRow,
) -> Result<(), String> {
    if config.access_code_stale_binding_ids.is_empty() {
        return Ok(());
    }
    let stale_binding_ids = normalized_stale_credential_binding_ids(
        config.access_code_binding_id.as_deref(),
        &config.access_code_stale_binding_ids,
    )?;
    let mut remaining = Vec::new();
    for binding_id in &stale_binding_ids {
        let key = CredentialKey::bambu_access_code(printer_id, binding_id)
            .map_err(|error| error.to_string())?;
        let deleted = state.credentials.delete(&key);
        let verified_absent =
            deleted.and_then(|_| state.credentials.get(&key).map(|value| value.is_none()));
        if verified_absent != Ok(true) {
            remaining.push(binding_id.clone());
        }
    }
    if remaining == config.access_code_stale_binding_ids {
        return Ok(());
    }
    let mut cleaned = config.clone();
    cleaned.access_code_stale_binding_ids = remaining;
    if let Err(error) = with_db(state, |db| {
        db.save_bambu_live_integration(printer_id, &cleaned)
    }) {
        eprintln!(
            "Could not finalize superseded Bambu credential cleanup metadata; startup cleanup will retry: {error}"
        );
    }
    Ok(())
}

fn verify_stored_secret(
    credentials: &CredentialStore,
    key: &CredentialKey,
    expected: &SecretValue,
) -> Result<(), String> {
    let stored = credentials
        .get(key)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "The access code was not present after secure storage.".to_string())?;
    if stored.expose_bytes() != expected.expose_bytes() {
        return Err("The access code did not match after secure storage.".to_string());
    }
    Ok(())
}

#[derive(Default)]
struct CredentialRollback {
    entries: Vec<(CredentialKey, Option<Zeroizing<Vec<u8>>>)>,
}

impl CredentialRollback {
    fn capture(
        credentials: &CredentialStore,
        keys: impl IntoIterator<Item = CredentialKey>,
    ) -> Result<Self, String> {
        let mut entries = Vec::new();
        for key in keys {
            let previous = credentials
                .get(&key)
                .map_err(|error| error.to_string())?
                .map(|secret| Zeroizing::new(secret.expose_bytes().to_vec()));
            entries.push((key, previous));
        }
        Ok(Self { entries })
    }

    fn is_empty(&self) -> bool {
        self.entries.iter().all(|(_, value)| value.is_none())
    }

    fn restore(&self, credentials: &CredentialStore) -> Result<(), String> {
        let mut first_error = None;
        for (key, previous) in &self.entries {
            let result = match previous {
                Some(previous) => {
                    let secret = SecretValue::from_bytes(previous.to_vec());
                    credentials
                        .set(key, &secret)
                        .map_err(|error| error.to_string())
                        .and_then(|()| verify_stored_secret(credentials, key, &secret))
                }
                None => credentials
                    .delete(key)
                    .map(|_| ())
                    .map_err(|error| error.to_string()),
            };
            if first_error.is_none() {
                first_error = result.err();
            }
        }
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

fn rollback_after_error<T>(
    credentials: &CredentialStore,
    rollback: &CredentialRollback,
    credential_changed: bool,
    error: String,
) -> Result<T, String> {
    if !credential_changed {
        return Err(error);
    }
    match rollback.restore(credentials) {
        Ok(()) => Err(error),
        Err(rollback) => Err(format!("{error} Rollback failed: {rollback}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::FilamentDatabase;
    use crate::backend::inventory_engine::{CreatePrinterInput, InventoryEngine};
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::printer_danger_zone_commands::delete_printer_inner;
    use crate::state::{
        CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::path::PathBuf;
    use std::sync::{mpsc, Arc, Barrier};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn test_state(test_name: &str) -> (AppState, PathBuf) {
        test_state_with_credentials(test_name, CredentialStore::in_memory())
    }

    fn test_state_with_credentials(
        test_name: &str,
        credentials: CredentialStore,
    ) -> (AppState, PathBuf) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "filament-manager-bambu-security-{test_name}-{nanos}.db"
        ));
        let db = FilamentDatabase::open(&path).expect("open db");
        db.apply_schema().expect("apply schema");
        InventoryEngine::new(db)
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu Lab P1S".to_string(),
                name: "Printer".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(4),
            })
            .expect("create printer");
        (
            AppState {
                db_path: path.to_string_lossy().to_string(),
                companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                    TRUSTED_LAN_DEFAULT_PORT,
                )),
                credentials,
                library_sync_auth: LibrarySyncRuntimeAuth::new(),
            },
            path,
        )
    }

    fn identity(serial: &str, fingerprint_character: char) -> BambuTlsIdentity {
        BambuTlsIdentity {
            certificate_sha256: fingerprint_character.to_string().repeat(64),
            spki_sha256: fingerprint_character.to_string().repeat(64),
            certificate_subject_serial: Some(serial.to_string()),
        }
    }

    fn save_input(
        access_code_action: BambuAccessCodeAction,
        access_code: Option<&str>,
        tls_trust_action: BambuTlsTrustAction,
    ) -> SaveBambuLiveIntegrationInput {
        let trust_current = tls_trust_action == BambuTlsTrustAction::TrustCurrent;
        SaveBambuLiveIntegrationInput {
            printer_id: "printer_1".to_string(),
            enabled: true,
            host: Some("192.168.1.42".to_string()),
            access_code_action,
            access_code: access_code.map(str::to_string),
            printer_serial: Some("SERIAL".to_string()),
            tls_trust_action,
            expected_tls_certificate_sha256: trust_current.then(|| "a".repeat(64)),
            expected_tls_spki_sha256: trust_current.then(|| "a".repeat(64)),
        }
    }

    fn saved_binding_id(path: &std::path::Path) -> String {
        FilamentDatabase::open(path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("saved integration")
            .config
            .access_code_binding_id
            .expect("credential binding")
    }

    #[test]
    fn identity_inspection_validates_serial_and_returns_both_fingerprints() {
        let inspected = inspect_bambu_live_tls_identity_with_probe(
            InspectBambuLiveTlsIdentityInput {
                host: " 192.168.1.42 ".to_string(),
                printer_serial: " serial ".to_string(),
            },
            |host, serial| {
                assert_eq!(host, "192.168.1.42");
                assert_eq!(serial, "serial");
                Ok(identity("SERIAL", 'a'))
            },
        )
        .expect("inspect identity");

        assert_eq!(inspected.certificate_sha256, "a".repeat(64));
        assert_eq!(inspected.spki_sha256, "a".repeat(64));
    }

    #[test]
    fn identity_inspection_rejects_a_certificate_for_another_printer() {
        let error = inspect_bambu_live_tls_identity_with_probe(
            InspectBambuLiveTlsIdentityInput {
                host: "192.168.1.42".to_string(),
                printer_serial: "SERIAL".to_string(),
            },
            |_, _| Ok(identity("OTHER-SERIAL", 'a')),
        )
        .expect_err("serial mismatch must fail");

        assert!(error.contains("does not match"));
    }

    #[test]
    fn save_stores_access_code_outside_database_and_trusts_observed_identity() {
        let (state, path) = test_state("save");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some(" access-code "),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("save integration");

        let entry = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("saved integration");
        assert!(entry.config.access_code.is_none());
        assert!(entry.config.access_code_configured);
        assert_eq!(
            entry
                .config
                .tls_identity
                .as_ref()
                .and_then(|identity| identity.trusted_spki_sha256.as_deref()),
            Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        let key = CredentialKey::bambu_access_code(
            "printer_1",
            entry
                .config
                .access_code_binding_id
                .as_deref()
                .expect("credential binding"),
        )
        .expect("credential key");
        assert_eq!(
            state
                .credentials
                .get(&key)
                .expect("read credential")
                .expect("stored credential")
                .expose_utf8()
                .expect("utf8 credential"),
            "access-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_rejects_certificate_serial_mismatch_before_storing_access_code() {
        let (state, path) = test_state("serial-mismatch");
        let error = save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("access-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("OTHER-SERIAL", 'a')),
        )
        .expect_err("serial mismatch must fail");

        assert!(error.contains("does not match"));
        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_rejects_security_removal_while_enabled_before_mutating_credentials() {
        let (state, path) = test_state("rollback");
        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        state
            .credentials
            .set(&key, &SecretValue::from_utf8("old-code".to_string()))
            .expect("seed credential");
        let mut input = save_input(
            BambuAccessCodeAction::Replace,
            Some("new-code"),
            BambuTlsTrustAction::Clear,
        );
        input.host = None;

        save_bambu_live_integration_with_probe(&state, input, |_, _| {
            panic!("clear trust must not probe")
        })
        .expect_err("invalid enabled configuration must fail");

        assert_eq!(
            state
                .credentials
                .get(&key)
                .expect("read credential")
                .expect("restored credential")
                .expose_utf8()
                .expect("utf8 credential"),
            "old-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_rejects_identity_changed_after_review_before_storing_access_code() {
        let (state, path) = test_state("review-race");
        let mut input = save_input(
            BambuAccessCodeAction::Replace,
            Some("access-code"),
            BambuTlsTrustAction::TrustCurrent,
        );
        input.expected_tls_certificate_sha256 = Some("b".repeat(64));

        let error = save_bambu_live_integration_with_probe(&state, input, |_, _| {
            Ok(identity("SERIAL", 'a'))
        })
        .expect_err("a changed reviewed identity must fail");

        assert!(error.contains("changed after it was checked"));
        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_requires_reviewed_fingerprints_before_probe_or_credential_write() {
        let (state, path) = test_state("missing-reviewed-fingerprint");
        let mut input = save_input(
            BambuAccessCodeAction::Replace,
            Some("access-code"),
            BambuTlsTrustAction::TrustCurrent,
        );
        input.expected_tls_spki_sha256 = None;

        let error = save_bambu_live_integration_with_probe(&state, input, |_, _| {
            panic!("missing review data must fail before probing")
        })
        .expect_err("reviewed fingerprints are required");

        assert!(error.contains("Check the printer TLS identity"));
        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn removing_access_code_disables_live_status_and_preserves_tls_pairing() {
        let (state, path) = test_state("disable-and-clear-code");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("access-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("seed integration");
        let binding_id = saved_binding_id(&path);

        let mut disable = save_input(
            BambuAccessCodeAction::Clear,
            None,
            BambuTlsTrustAction::Keep,
        );
        disable.enabled = false;
        save_bambu_live_integration_with_probe(&state, disable, |_, _| {
            panic!("disabling with existing trust must not probe")
        })
        .expect("disable integration and remove access code");

        let entry = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("saved integration");
        assert!(!entry.config.enabled);
        assert!(!entry.config.access_code_configured);
        assert!(entry
            .config
            .tls_identity
            .as_ref()
            .and_then(|identity| identity.trusted_spki_sha256.as_ref())
            .is_some());
        let key =
            CredentialKey::bambu_access_code("printer_1", &binding_id).expect("credential key");
        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_integration_removes_credential_and_database_row() {
        let (state, path) = test_state("delete");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("access-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("save integration");
        let binding_id = saved_binding_id(&path);

        delete_bambu_live_integration_for_state(&state, "printer_1").expect("delete integration");

        let key =
            CredentialKey::bambu_access_code("printer_1", &binding_id).expect("credential key");
        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        assert!(FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn consecutive_replacements_never_reuse_an_old_poll_credential_binding() {
        let (state, path) = test_state("consecutive-replacements");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("first-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("first save");
        let first_snapshot = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("first integration")
            .config;
        let first_binding_id = first_snapshot
            .access_code_binding_id
            .clone()
            .expect("first binding");

        for expected in ["second-code", "third-code"] {
            save_bambu_live_integration_with_probe(
                &state,
                save_input(
                    BambuAccessCodeAction::Replace,
                    Some(expected),
                    BambuTlsTrustAction::Keep,
                ),
                |_, _| panic!("existing trust must not probe"),
            )
            .expect("replace code");
        }

        let latest = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("latest integration")
            .config;
        let latest_binding_id = latest
            .access_code_binding_id
            .as_deref()
            .expect("latest binding");
        assert_ne!(latest_binding_id, first_binding_id);
        assert!(latest.access_code_stale_binding_ids.is_empty());
        let old_poll_key =
            CredentialKey::bambu_access_code("printer_1", &first_binding_id).expect("old poll key");
        assert!(
            state
                .credentials
                .get(&old_poll_key)
                .expect("old poll credential read")
                .is_none(),
            "an old poll must never see the newest access code"
        );
        let latest_key = CredentialKey::bambu_access_code("printer_1", latest_binding_id)
            .expect("latest credential key");
        assert_eq!(
            state
                .credentials
                .get(&latest_key)
                .expect("latest read")
                .expect("latest credential")
                .expose_utf8()
                .expect("UTF-8"),
            "third-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn failed_database_commit_removes_new_binding_and_preserves_old_binding() {
        let (state, path) = test_state("binding-rollback");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("old-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("seed integration");
        let old_binding_id = saved_binding_id(&path);
        let db = FilamentDatabase::open(&path).expect("open db");
        db.connection()
            .execute_batch(
                "CREATE TRIGGER fail_bambu_revision_save
                 BEFORE UPDATE ON settings
                 WHEN OLD.key = 'bambu_live_integration:printer_1'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced Bambu save failure');
                 END;",
            )
            .expect("install failure trigger");
        drop(db);

        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("new-code"),
                BambuTlsTrustAction::Keep,
            ),
            |_, _| panic!("existing trust must not probe"),
        )
        .expect_err("database failure must roll back new credential");

        let old_key = CredentialKey::bambu_access_code("printer_1", &old_binding_id)
            .expect("old credential key");
        assert_eq!(
            state
                .credentials
                .get(&old_key)
                .expect("old read")
                .expect("old credential")
                .expose_utf8()
                .expect("UTF-8"),
            "old-code"
        );
        let stored = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("stored integration")
            .config;
        assert_eq!(
            stored.access_code_binding_id.as_deref(),
            Some(old_binding_id.as_str())
        );
        assert!(stored.access_code_stale_binding_ids.is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_and_readd_never_reuses_an_old_poll_credential_binding() {
        let (state, path) = test_state("delete-readd-binding");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("old-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("seed integration");
        let old_binding_id = saved_binding_id(&path);
        let old_poll_key =
            CredentialKey::bambu_access_code("printer_1", &old_binding_id).expect("old poll key");

        delete_bambu_live_integration_for_state(&state, "printer_1").expect("delete integration");
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("new-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("re-add integration");
        let new_binding_id = saved_binding_id(&path);
        assert_ne!(new_binding_id, old_binding_id);
        assert!(state
            .credentials
            .get(&old_poll_key)
            .expect("old poll read")
            .is_none());
        let new_key = CredentialKey::bambu_access_code("printer_1", &new_binding_id)
            .expect("new credential key");
        assert_eq!(
            state
                .credentials
                .get(&new_key)
                .expect("new read")
                .expect("new credential")
                .expose_utf8()
                .expect("UTF-8"),
            "new-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn failed_stale_delete_keeps_retry_state_until_cleanup_succeeds() {
        let (state, path) = test_state_with_credentials(
            "stale-delete-retry",
            CredentialStore::in_memory_with_delete_failures(1),
        );
        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("old-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            |_, _| Ok(identity("SERIAL", 'a')),
        )
        .expect("seed integration");
        let old_binding_id = saved_binding_id(&path);

        save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("new-code"),
                BambuTlsTrustAction::Keep,
            ),
            |_, _| panic!("existing trust must not probe"),
        )
        .expect("replacement remains saved when stale cleanup is deferred");

        let pending = FilamentDatabase::open(&path)
            .expect("open pending db")
            .list_bambu_live_integrations()
            .expect("list pending integration")
            .pop()
            .expect("pending integration")
            .config;
        assert_eq!(
            pending.access_code_stale_binding_ids,
            vec![old_binding_id.clone()]
        );
        let old_key = CredentialKey::bambu_access_code("printer_1", &old_binding_id)
            .expect("old credential key");
        assert_eq!(
            state
                .credentials
                .get(&old_key)
                .expect("read retained old credential")
                .expect("old credential retained for retry")
                .expose_utf8()
                .expect("UTF-8"),
            "old-code"
        );

        cleanup_stale_bambu_credentials(&state, "printer_1", &pending)
            .expect("retry stale cleanup");
        let cleaned = FilamentDatabase::open(&path)
            .expect("open cleaned db")
            .list_bambu_live_integrations()
            .expect("list cleaned integration")
            .pop()
            .expect("cleaned integration")
            .config;
        assert!(cleaned.access_code_stale_binding_ids.is_empty());
        assert!(state
            .credentials
            .get(&old_key)
            .expect("read deleted old credential")
            .is_none());
        let current_key = CredentialKey::bambu_access_code(
            "printer_1",
            cleaned
                .access_code_binding_id
                .as_deref()
                .expect("current binding"),
        )
        .expect("current credential key");
        assert_eq!(
            state
                .credentials
                .get(&current_key)
                .expect("read current credential")
                .expect("current credential remains")
                .expose_utf8()
                .expect("UTF-8"),
            "new-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn full_printer_delete_waits_for_in_flight_security_save() {
        let (state, path) = test_state("concurrent-save-delete");
        let probe_entered = Arc::new(Barrier::new(2));
        let release_probe = Arc::new(Barrier::new(2));
        let save_state = state.clone();
        let save_probe_entered = Arc::clone(&probe_entered);
        let save_release_probe = Arc::clone(&release_probe);
        let save_thread = std::thread::spawn(move || {
            save_bambu_live_integration_with_probe(
                &save_state,
                save_input(
                    BambuAccessCodeAction::Replace,
                    Some("new-code"),
                    BambuTlsTrustAction::TrustCurrent,
                ),
                |_, _| {
                    save_probe_entered.wait();
                    save_release_probe.wait();
                    Ok(identity("SERIAL", 'a'))
                },
            )
        });

        probe_entered.wait();
        let delete_state = state.clone();
        let (delete_started_tx, delete_started_rx) = mpsc::channel();
        let (delete_done_tx, delete_done_rx) = mpsc::channel();
        let delete_thread = std::thread::spawn(move || {
            delete_started_tx.send(()).expect("signal delete start");
            let result = delete_printer_inner(&delete_state, "printer_1");
            delete_done_tx.send(result).expect("signal delete result");
        });
        delete_started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("delete started");
        assert!(
            delete_done_rx
                .recv_timeout(Duration::from_millis(200))
                .is_err(),
            "printer deletion must wait until the security save releases the shared gate"
        );

        release_probe.wait();
        save_thread
            .join()
            .expect("security save thread")
            .expect("security save");
        delete_done_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("delete result")
            .expect("delete printer after save");
        delete_thread.join().expect("delete thread");

        let db = FilamentDatabase::open(&path).expect("open deleted database");
        assert!(!db.printer_exists("printer_1").expect("query printer"));
        assert!(db
            .list_bambu_live_integrations()
            .expect("list integrations")
            .is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn atomic_security_save_cannot_recreate_a_deleted_printer_integration() {
        let (state, path) = test_state("atomic-save-after-delete");
        let delete_path = path.clone();
        let error = save_bambu_live_integration_with_probe(
            &state,
            save_input(
                BambuAccessCodeAction::Replace,
                Some("new-code"),
                BambuTlsTrustAction::TrustCurrent,
            ),
            move |_, _| {
                FilamentDatabase::open(&delete_path)
                    .expect("open database for injected deletion")
                    .delete_printer("printer_1")
                    .expect("delete printer during probe");
                Ok(identity("SERIAL", 'a'))
            },
        )
        .expect_err("save must reject a printer deleted while the probe was in flight");

        let error: serde_json::Value =
            serde_json::from_str(&error).expect("structured missing-printer error");
        assert_eq!(error["code"], "common.not_found");
        let db = FilamentDatabase::open(&path).expect("open database after rejected save");
        assert!(!db.printer_exists("printer_1").expect("query printer"));
        assert!(db
            .list_bambu_live_integrations()
            .expect("list integrations")
            .is_empty());
        let _ = std::fs::remove_file(path);
    }
}
