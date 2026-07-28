use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, PrinterRow,
};
use crate::credential_store::{CredentialKey, CredentialStore};
use crate::printer_models::supported_printer_models;
use crate::state::AppState;
use crate::{with_db, with_inventory};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
pub(crate) struct PrinterSettingsSnapshot {
    active_printer_id: Option<String>,
    printers: Vec<PrinterRow>,
    printer_models: Vec<String>,
    bambu_live_integrations: Vec<BambuLiveIntegrationSettingsEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct BambuLiveIntegrationSettingsEntry {
    pub(crate) printer_id: String,
    pub(crate) config: BambuLiveIntegrationSettings,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct BambuLiveIntegrationSettings {
    pub(crate) enabled: bool,
    pub(crate) host: Option<String>,
    pub(crate) access_code_configured: bool,
    pub(crate) printer_serial: Option<String>,
    pub(crate) tls_trust_state: String,
    pub(crate) tls_certificate_fingerprint: Option<String>,
    pub(crate) tls_spki_fingerprint: Option<String>,
    pub(crate) last_error: Option<String>,
    pub(crate) observed_state: Option<BambuLiveObservedStateRow>,
}

#[tauri::command]
pub(crate) fn get_printer_settings(
    state: tauri::State<'_, AppState>,
) -> Result<PrinterSettingsSnapshot, String> {
    let bambu_live_integrations = sanitized_bambu_live_integrations(
        with_db(&state, |db| db.list_bambu_live_integrations())?,
        &state.credentials,
        false,
    )?;
    with_inventory(&state, |engine| {
        Ok(PrinterSettingsSnapshot {
            active_printer_id: engine.get_active_printer()?,
            printers: engine.list_printers()?,
            printer_models: supported_printer_models(),
            bambu_live_integrations,
        })
    })
}

pub(crate) fn sanitized_bambu_live_integrations(
    integrations: Vec<BambuLiveIntegrationEntryRow>,
    credentials: &CredentialStore,
    redact_network_details: bool,
) -> Result<Vec<BambuLiveIntegrationSettingsEntry>, String> {
    integrations
        .into_iter()
        .map(|mut entry| {
            let access_code_configured =
                if let Some(binding_id) = entry.config.access_code_binding_id.as_deref() {
                    let credential_key =
                        CredentialKey::bambu_access_code(&entry.printer_id, binding_id)
                            .map_err(|error| error.to_string())?;
                    credentials
                        .get(&credential_key)
                        .map_err(|error| error.to_string())?
                        .is_some()
                } else {
                    false
                };
            let (tls_trust_state, mut tls_certificate_fingerprint, mut tls_spki_fingerprint) =
                tls_settings_snapshot(entry.config.tls_identity.as_ref());
            if redact_network_details {
                tls_certificate_fingerprint = None;
                tls_spki_fingerprint = None;
                entry.config.last_error = None;
                if let Some(observed_state) = entry.config.observed_state.as_mut() {
                    observed_state.raw_status_note = None;
                    observed_state.raw_payload_json = None;
                }
            }

            Ok(BambuLiveIntegrationSettingsEntry {
                printer_id: entry.printer_id,
                config: BambuLiveIntegrationSettings {
                    enabled: entry.config.enabled,
                    host: (!redact_network_details)
                        .then_some(entry.config.host)
                        .flatten(),
                    access_code_configured,
                    printer_serial: (!redact_network_details)
                        .then_some(entry.config.printer_serial)
                        .flatten(),
                    tls_trust_state,
                    tls_certificate_fingerprint,
                    tls_spki_fingerprint,
                    last_error: entry.config.last_error,
                    observed_state: entry.config.observed_state,
                },
            })
        })
        .collect()
}

fn tls_settings_snapshot(
    identity: Option<&crate::backend::filament_database::BambuLiveTlsIdentityRow>,
) -> (String, Option<String>, Option<String>) {
    let Some(identity) = identity else {
        return ("UNPAIRED".to_string(), None, None);
    };
    let trust_state = match (
        identity.trusted_spki_sha256.as_deref(),
        identity.trusted_certificate_sha256.as_deref(),
        identity.trusted_at.as_deref(),
    ) {
        (Some(trusted), Some(_), Some(_)) if trusted == identity.observed_spki_sha256 => "TRUSTED",
        (None, None, None) => "UNPAIRED",
        _ => "CHANGED",
    }
    .to_string();
    (
        trust_state,
        Some(identity.observed_certificate_sha256.clone()),
        Some(identity.observed_spki_sha256.clone()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::{BambuLiveIntegrationRow, BambuLiveTlsIdentityRow};
    use crate::bambu_live_observation::default_offline_state;
    use crate::credential_store::SecretValue;

    fn integration_with_identity(
        trusted_spki: Option<&str>,
        observed_spki: &str,
    ) -> BambuLiveIntegrationEntryRow {
        let mut observed_state = default_offline_state();
        observed_state.raw_status_note = Some("printer 192.168.1.42 serial SERIAL".to_string());
        observed_state.raw_payload_json = Some(serde_json::json!({
            "host": "192.168.1.42",
            "serial": "SERIAL",
        }));
        BambuLiveIntegrationEntryRow {
            printer_id: "printer_1".to_string(),
            config: BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.42".to_string()),
                access_code: Some("legacy-secret-must-not-leak".to_string()),
                access_code_configured: true,
                access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL".to_string()),
                last_error: Some("failed to connect to 192.168.1.42 for SERIAL".to_string()),
                tls_identity: Some(BambuLiveTlsIdentityRow {
                    trusted_spki_sha256: trusted_spki.map(str::to_string),
                    trusted_certificate_sha256: trusted_spki.map(|_| "trusted-cert".to_string()),
                    trusted_at: trusted_spki.map(|_| "2026-07-28T00:00:00Z".to_string()),
                    observed_spki_sha256: observed_spki.to_string(),
                    observed_certificate_sha256: "observed-cert".to_string(),
                    observed_at: "2026-07-28T00:00:01Z".to_string(),
                }),
                observed_state: Some(observed_state),
            },
        }
    }

    #[test]
    fn settings_dto_never_serializes_access_code_and_uses_store_as_source_of_truth() {
        let credentials = CredentialStore::in_memory();
        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        credentials
            .set(&key, &SecretValue::from_utf8("stored-secret".to_string()))
            .expect("store credential");

        let settings = sanitized_bambu_live_integrations(
            vec![integration_with_identity(Some("same"), "same")],
            &credentials,
            false,
        )
        .expect("settings");
        let json = serde_json::to_value(&settings).expect("serialize settings");

        assert_eq!(json[0]["config"]["access_code_configured"], true);
        assert_eq!(json[0]["config"]["tls_trust_state"], "TRUSTED");
        assert_eq!(
            json[0]["config"]["tls_certificate_fingerprint"],
            "observed-cert"
        );
        assert_eq!(json[0]["config"]["tls_spki_fingerprint"], "same");
        assert!(json[0]["config"].get("access_code").is_none());
        assert!(!json.to_string().contains("legacy-secret-must-not-leak"));
        assert!(!json.to_string().contains("stored-secret"));
    }

    #[test]
    fn settings_dto_distinguishes_unpaired_and_changed_tls_identities() {
        let credentials = CredentialStore::in_memory();
        let settings = sanitized_bambu_live_integrations(
            vec![
                integration_with_identity(None, "observed"),
                BambuLiveIntegrationEntryRow {
                    printer_id: "printer_2".to_string(),
                    ..integration_with_identity(Some("trusted"), "changed")
                },
            ],
            &credentials,
            false,
        )
        .expect("settings");

        assert_eq!(settings[0].config.tls_trust_state, "UNPAIRED");
        assert_eq!(settings[1].config.tls_trust_state, "CHANGED");
        assert!(!settings[0].config.access_code_configured);
        assert!(!settings[1].config.access_code_configured);
    }

    #[test]
    fn companion_settings_redact_network_details() {
        let credentials = CredentialStore::in_memory();
        let settings = sanitized_bambu_live_integrations(
            vec![integration_with_identity(Some("same"), "same")],
            &credentials,
            true,
        )
        .expect("settings");

        assert!(settings[0].config.host.is_none());
        assert!(settings[0].config.printer_serial.is_none());
        assert!(settings[0].config.tls_certificate_fingerprint.is_none());
        assert!(settings[0].config.tls_spki_fingerprint.is_none());
        assert!(settings[0].config.last_error.is_none());
        let json = serde_json::to_string(&settings).expect("serialize settings");
        assert!(!json.contains("192.168.1.42"));
        assert!(!json.contains("SERIAL"));
    }
}
