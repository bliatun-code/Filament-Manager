use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::filament_database::BambuLiveTlsIdentityRow;
use crate::bambu_live::tls_identity::{assess_trust, BambuTlsIdentity, BambuTlsTrustDecision};
use crate::bambu_live::{probe_printer_tls_identity, trusted_pin_from_config};
use crate::bambu_live_observation::now_iso_string;
use crate::bambu_printer_discovery::{
    discover_bambu_printers, discover_bambu_printers_on_private_networks,
    BambuPrinterDiscoveryCandidate,
};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;

#[derive(Deserialize)]
pub(crate) struct DiscoverBambuLivePrintersInput {
    interface_address: String,
}

/// Listens briefly for Bambu's unauthenticated LAN announcements.
///
/// Discovery results are intentionally not persisted. The UI may use one to
/// fill an initial setup form, while an existing live integration must use the
/// separate recovery command below so its saved TLS identity is verified first.
#[tauri::command]
pub(crate) async fn discover_bambu_live_printers(
    input: DiscoverBambuLivePrintersInput,
) -> Result<Vec<BambuPrinterDiscoveryCandidate>, String> {
    tauri::async_runtime::spawn_blocking(move || discover_bambu_printers(&input.interface_address))
        .await
        .map_err(|_| "Bambu printer discovery did not complete.".to_string())?
}

#[derive(Deserialize)]
pub(crate) struct RecoverBambuLiveHostInput {
    printer_id: String,
    host: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct BambuLiveHostRecovery {
    host: String,
    printer_serial: String,
    certificate_sha256: String,
    spki_sha256: String,
}

/// Recovers a previously paired Bambu printer after DHCP changed its address.
///
/// The endpoint has to be a private IPv4 discovery candidate. Before SQLite is
/// changed, the TLS probe proves both the saved printer serial and saved SPKI
/// pin. This command deliberately never loads the access code from the OS
/// credential store and never opens an MQTT session.
#[tauri::command]
pub(crate) async fn recover_bambu_live_host(
    state: tauri::State<'_, AppState>,
    input: RecoverBambuLiveHostInput,
) -> Result<BambuLiveHostRecovery, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        recover_bambu_live_host_with_probe(&state, input, probe_printer_tls_identity)
    })
    .await
    .map_err(|_| "Bambu printer address recovery did not complete.".to_string())?
}

fn recover_bambu_live_host_with_probe(
    state: &AppState,
    input: RecoverBambuLiveHostInput,
    probe: impl FnOnce(&str, &str) -> Result<BambuTlsIdentity, String>,
) -> Result<BambuLiveHostRecovery, String> {
    with_authoritative_local_library(state, || {
        recover_bambu_live_host_at_path(&state.db_path, input, probe)
    })
}

fn recover_bambu_live_host_at_path(
    db_path: &str,
    input: RecoverBambuLiveHostInput,
    probe: impl FnOnce(&str, &str) -> Result<BambuTlsIdentity, String>,
) -> Result<BambuLiveHostRecovery, String> {
    let printer_id = input.printer_id.trim().to_string();
    if printer_id.is_empty() {
        return Err("Printer id is required for Bambu address recovery.".to_string());
    }
    let host = normalize_private_discovery_host(&input.host)?;
    let db = crate::backend::filament_database::FilamentDatabase::open(db_path)
        .map_err(|error| error.to_string())?;
    let expected_config = db
        .list_bambu_live_integrations()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|entry| entry.printer_id == printer_id)
        .map(|entry| entry.config)
        .ok_or_else(|| {
            "This printer does not have a saved Bambu Live connection to recover.".to_string()
        })?;
    let printer_serial = expected_config
        .printer_serial
        .as_deref()
        .map(str::trim)
        .filter(|serial| !serial.is_empty())
        .ok_or_else(|| {
            "The saved Bambu Live connection has no printer serial. Configure it again before recovering an address."
                .to_string()
        })?
        .to_string();
    let trusted_pin = trusted_pin_from_config(
        &printer_serial,
        expected_config.tls_identity.as_ref(),
    )?
    .ok_or_else(|| {
        "The saved Bambu Live connection is not trusted yet. Check and trust its current identity before recovering an address."
            .to_string()
    })?;

    // `probe_printer_tls_identity` performs only a TLS handshake and extracts
    // the peer certificate. Do not add credential-store or MQTT work above
    // this trust gate.
    let observed = probe(&host, &printer_serial)?;
    let observed = match assess_trust(&printer_serial, Some(&trusted_pin), &observed)? {
        BambuTlsTrustDecision::Trusted { observed, .. } => observed,
        BambuTlsTrustDecision::Changed { change, .. } => {
            return Err(format!(
                "The discovered printer did not match the saved TLS identity, so its address was not changed: {change}"
            ));
        }
        BambuTlsTrustDecision::Unknown { .. } => {
            return Err(
                "The saved Bambu Live connection is not trusted yet. Check and trust its current identity before recovering an address."
                    .to_string(),
            );
        }
    };
    let observed_tls_identity = observed_tls_identity_row(&observed);
    let recovered = db
        .recover_bambu_live_connection_if_current(
            &printer_id,
            &expected_config,
            &host,
            &observed_tls_identity,
        )
        .map_err(|error| error.to_string())?;
    if !recovered {
        return Err(
            "The saved Bambu Live connection changed while its new address was being checked. Review it and try again."
                .to_string(),
        );
    }

    Ok(BambuLiveHostRecovery {
        host,
        printer_serial,
        certificate_sha256: observed.certificate_sha256,
        spki_sha256: observed.spki_sha256,
    })
}

pub(crate) fn try_auto_recover_bambu_live_host(
    db_path: &str,
    printer_id: &str,
    printer_serial: &str,
) -> Result<Option<String>, String> {
    let candidates = discover_bambu_printers_on_private_networks()?;
    let matching_hosts = matching_discovery_hosts(candidates, printer_serial);

    for host in matching_hosts {
        let input = RecoverBambuLiveHostInput {
            printer_id: printer_id.to_string(),
            host: host.clone(),
        };
        match recover_bambu_live_host_at_path(db_path, input, probe_printer_tls_identity) {
            Ok(_) => return Ok(Some(host)),
            Err(error) => {
                eprintln!("Ignored discovered Bambu address {host} for {printer_id}: {error}")
            }
        }
    }
    Ok(None)
}

fn matching_discovery_hosts(
    candidates: Vec<BambuPrinterDiscoveryCandidate>,
    printer_serial: &str,
) -> Vec<String> {
    let expected_serial = printer_serial.trim().to_ascii_uppercase();
    let mut matching_hosts = candidates
        .into_iter()
        .filter(|candidate| candidate.printer_serial == expected_serial)
        .map(|candidate| candidate.host)
        .collect::<Vec<_>>();
    matching_hosts.sort();
    matching_hosts.dedup();
    matching_hosts
}

fn normalize_private_discovery_host(value: &str) -> Result<String, String> {
    let address = value.trim().parse::<Ipv4Addr>().map_err(|_| {
        "Choose a private IPv4 address returned by Bambu printer discovery.".to_string()
    })?;
    if !address.is_private() {
        return Err(
            "Choose a private IPv4 address returned by Bambu printer discovery.".to_string(),
        );
    }
    Ok(address.to_string())
}

fn observed_tls_identity_row(observed: &BambuTlsIdentity) -> BambuLiveTlsIdentityRow {
    BambuLiveTlsIdentityRow {
        // The database merge preserves the original trust pin. These fields
        // only record the identity observed during the successful recovery.
        trusted_spki_sha256: None,
        trusted_certificate_sha256: None,
        trusted_at: None,
        observed_spki_sha256: observed.spki_sha256.clone(),
        observed_certificate_sha256: observed.certificate_sha256.clone(),
        observed_at: now_iso_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
    use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_state(test_name: &str) -> (AppState, PathBuf) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "filament-manager-bambu-discovery-{test_name}-{nanos}.db"
        ));
        let db = FilamentDatabase::open(&path).expect("open db");
        db.apply_schema().expect("apply schema");
        db.connection()
            .execute(
                "INSERT INTO printers (id, model, name) VALUES (?1, ?2, ?3)",
                ["printer_1", "Bambu Lab P1S", "Printer"],
            )
            .expect("create printer");
        (
            AppState {
                db_path: path.to_string_lossy().to_string(),
                companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                    TRUSTED_LAN_DEFAULT_PORT,
                )),
                credentials: CredentialStore::in_memory(),
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

    #[test]
    fn automatic_recovery_selects_only_the_saved_serial_and_deduplicates_hosts() {
        let candidates = vec![
            BambuPrinterDiscoveryCandidate {
                host: "192.168.1.44".to_string(),
                printer_serial: "SERIAL".to_string(),
                model: None,
                name: None,
            },
            BambuPrinterDiscoveryCandidate {
                host: "192.168.1.44".to_string(),
                printer_serial: "SERIAL".to_string(),
                model: Some("P1S".to_string()),
                name: Some("Printer".to_string()),
            },
            BambuPrinterDiscoveryCandidate {
                host: "192.168.1.99".to_string(),
                printer_serial: "OTHER".to_string(),
                model: None,
                name: None,
            },
        ];

        assert_eq!(
            matching_discovery_hosts(candidates, " serial "),
            vec!["192.168.1.44"]
        );
        assert!(matching_discovery_hosts(Vec::new(), "SERIAL").is_empty());
    }

    fn trusted_config(host: &str) -> BambuLiveIntegrationRow {
        BambuLiveIntegrationRow {
            enabled: true,
            host: Some(host.to_string()),
            access_code: None,
            access_code_configured: true,
            access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
            access_code_stale_binding_ids: Vec::new(),
            printer_serial: Some("SERIAL".to_string()),
            last_error: Some("old address failed".to_string()),
            tls_identity: Some(BambuLiveTlsIdentityRow {
                trusted_spki_sha256: Some("a".repeat(64)),
                trusted_certificate_sha256: Some("a".repeat(64)),
                trusted_at: Some("2026-08-01T12:00:00Z".to_string()),
                observed_spki_sha256: "a".repeat(64),
                observed_certificate_sha256: "a".repeat(64),
                observed_at: "2026-08-01T12:00:00Z".to_string(),
            }),
            observed_state: None,
        }
    }

    fn save_config(path: &std::path::Path, config: &BambuLiveIntegrationRow) {
        FilamentDatabase::open(path)
            .expect("open db")
            .save_bambu_live_integration("printer_1", config)
            .expect("save integration");
    }

    #[test]
    fn recovery_updates_only_a_matching_trusted_printer_without_touching_the_access_code() {
        let (state, path) = test_state("trusted");
        let expected = trusted_config("192.168.86.20");
        save_config(&path, &expected);
        let credential_key = CredentialKey::bambu_access_code(
            "printer_1",
            expected
                .access_code_binding_id
                .as_deref()
                .expect("credential binding"),
        )
        .expect("credential key");
        state
            .credentials
            .set(
                &credential_key,
                &SecretValue::from_utf8("access-code".to_string()),
            )
            .expect("seed credential");

        let recovered = recover_bambu_live_host_with_probe(
            &state,
            RecoverBambuLiveHostInput {
                printer_id: "printer_1".to_string(),
                host: "192.168.86.44".to_string(),
            },
            |host, serial| {
                assert_eq!(host, "192.168.86.44");
                assert_eq!(serial, "SERIAL");
                Ok(identity("SERIAL", 'a'))
            },
        )
        .expect("recover host");

        assert_eq!(recovered.host, "192.168.86.44");
        let stored = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("stored integration")
            .config;
        assert_eq!(stored.host.as_deref(), Some("192.168.86.44"));
        assert!(stored.access_code_configured);
        assert_eq!(stored.last_error, None);
        let tls_identity = stored.tls_identity.expect("TLS identity retained");
        assert_eq!(
            tls_identity.trusted_spki_sha256.as_deref(),
            Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        assert_eq!(tls_identity.observed_spki_sha256, "a".repeat(64));
        assert_eq!(
            state
                .credentials
                .get(&credential_key)
                .expect("read credential")
                .expect("stored credential")
                .expose_utf8()
                .expect("utf8 credential"),
            "access-code"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn recovery_rejects_a_serial_or_pin_mismatch_without_changing_the_saved_address() {
        let (state, path) = test_state("mismatch");
        let expected = trusted_config("192.168.86.20");
        save_config(&path, &expected);

        let error = recover_bambu_live_host_with_probe(
            &state,
            RecoverBambuLiveHostInput {
                printer_id: "printer_1".to_string(),
                host: "192.168.86.44".to_string(),
            },
            |_, _| Ok(identity("OTHER", 'b')),
        )
        .expect_err("foreign printer must not replace saved host");
        assert!(error.contains("did not match"));
        let stored = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("stored integration")
            .config;
        assert_eq!(stored.host, expected.host);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn recovery_rejects_non_private_hosts_before_the_tls_probe() {
        let (state, path) = test_state("public-host");
        save_config(&path, &trusted_config("192.168.86.20"));

        let error = recover_bambu_live_host_with_probe(
            &state,
            RecoverBambuLiveHostInput {
                printer_id: "printer_1".to_string(),
                host: "8.8.8.8".to_string(),
            },
            |_, _| panic!("public address must be rejected before probing"),
        )
        .expect_err("public host must fail");
        assert!(error.contains("private IPv4"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn recovery_cannot_overwrite_a_connection_changed_while_tls_was_checked() {
        let (state, path) = test_state("stale");
        let expected = trusted_config("192.168.86.20");
        save_config(&path, &expected);
        let path_for_probe = path.clone();

        let error = recover_bambu_live_host_with_probe(
            &state,
            RecoverBambuLiveHostInput {
                printer_id: "printer_1".to_string(),
                host: "192.168.86.44".to_string(),
            },
            move |_, _| {
                let mut newer = trusted_config("192.168.86.30");
                newer.tls_identity = Some(BambuLiveTlsIdentityRow {
                    trusted_spki_sha256: Some("b".repeat(64)),
                    trusted_certificate_sha256: Some("b".repeat(64)),
                    trusted_at: Some("2026-08-01T12:30:00Z".to_string()),
                    observed_spki_sha256: "b".repeat(64),
                    observed_certificate_sha256: "b".repeat(64),
                    observed_at: "2026-08-01T12:30:00Z".to_string(),
                });
                save_config(&path_for_probe, &newer);
                Ok(identity("SERIAL", 'a'))
            },
        )
        .expect_err("stale recovery must not overwrite fresh setting");
        assert!(error.contains("changed while"));
        let stored = FilamentDatabase::open(&path)
            .expect("open db")
            .list_bambu_live_integrations()
            .expect("list integrations")
            .pop()
            .expect("stored integration")
            .config;
        assert_eq!(stored.host.as_deref(), Some("192.168.86.30"));
        assert_eq!(
            stored
                .tls_identity
                .as_ref()
                .and_then(|identity| identity.trusted_spki_sha256.as_deref()),
            Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
        );
        let _ = std::fs::remove_file(path);
    }
}
