use super::{connect_printer_mqtt_tcp, tls_identity, MQTT_TIMEOUT_SECS};
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, BambuLiveTlsIdentityRow,
};
use crate::bambu_live_observation::now_iso_string;
use native_tls::TlsConnector;
use std::net::SocketAddr;
use std::time::Duration;

pub(crate) fn probe_printer_tls_identity(
    host: &str,
    printer_serial: &str,
) -> Result<tls_identity::BambuTlsIdentity, String> {
    let tcp_stream = connect_printer_mqtt_tcp(host)?;
    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set TLS probe read timeout: {error}"))?;
    tcp_stream
        .set_write_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set TLS probe write timeout: {error}"))?;
    let connector = identity_probe_tls_connector()?;
    let stream = connector
        .connect(host, tcp_stream)
        .map_err(|error| format!("failed to establish TLS probe session: {error}"))?;
    let certificate = stream
        .peer_certificate()
        .map_err(|error| format!("failed to read printer TLS certificate: {error}"))?;
    let observed = tls_identity::identity_from_peer_certificate(certificate.as_ref())?;
    match tls_identity::assess_trust(printer_serial, None, &observed)? {
        tls_identity::BambuTlsTrustDecision::Unknown { .. } => Ok(observed),
        tls_identity::BambuTlsTrustDecision::Changed { change, .. } => Err(format!(
            "Printer TLS identity did not match its serial: {change}"
        )),
        tls_identity::BambuTlsTrustDecision::Trusted { .. } => {
            Err("TLS probe unexpectedly reported an existing trust decision.".to_string())
        }
    }
}

/// Bambu's local certificate is self-signed and identifies the printer serial
/// rather than its DHCP hostname. This connector may therefore only be used to
/// obtain the peer certificate. Callers must validate the serial and saved SPKI
/// before reading a credential or writing MQTT authentication bytes.
pub(crate) fn identity_probe_tls_connector() -> Result<TlsConnector, String> {
    TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|error| format!("failed to prepare printer TLS identity probe: {error}"))
}

pub(crate) fn trusted_pin_from_config(
    printer_serial: &str,
    identity: Option<&BambuLiveTlsIdentityRow>,
) -> Result<Option<tls_identity::BambuTlsPin>, String> {
    let Some(identity) = identity else {
        return Ok(None);
    };
    match (
        identity.trusted_certificate_sha256.as_deref(),
        identity.trusted_spki_sha256.as_deref(),
    ) {
        (None, None) => Ok(None),
        (Some(certificate), Some(spki)) => {
            tls_identity::BambuTlsPin::new(printer_serial, certificate, spki).map(Some)
        }
        _ => Err("saved printer TLS trust is incomplete; clear and re-pair it".to_string()),
    }
}

pub(crate) fn record_observed_tls_identity(
    entry: &mut BambuLiveIntegrationEntryRow,
    observed: &tls_identity::BambuTlsIdentity,
) {
    let previous = entry.config.tls_identity.take();
    entry.config.tls_identity = Some(BambuLiveTlsIdentityRow {
        trusted_spki_sha256: previous
            .as_ref()
            .and_then(|value| value.trusted_spki_sha256.clone()),
        trusted_certificate_sha256: previous
            .as_ref()
            .and_then(|value| value.trusted_certificate_sha256.clone()),
        trusted_at: previous.and_then(|value| value.trusted_at),
        observed_spki_sha256: observed.spki_sha256.clone(),
        observed_certificate_sha256: observed.certificate_sha256.clone(),
        observed_at: now_iso_string(),
    });
}

pub(crate) fn run_after_trusted_identity<T>(
    decision: tls_identity::BambuTlsTrustDecision,
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<(T, tls_identity::BambuTlsIdentity), BambuLivePollError> {
    match decision {
        tls_identity::BambuTlsTrustDecision::Trusted { observed, .. } => {
            let value = operation().map_err(|error| {
                BambuLivePollError::with_identity(error, observed.clone())
            })?;
            Ok((value, observed))
        }
        tls_identity::BambuTlsTrustDecision::Unknown { observed } => {
            Err(BambuLivePollError::with_identity(
                "Printer TLS identity is not trusted yet. Review and trust the current identity before live status can connect.",
                observed,
            ))
        }
        tls_identity::BambuTlsTrustDecision::Changed { observed, change } => {
            Err(BambuLivePollError::with_identity(
                format!(
                    "Printer TLS identity changed; the access code was not sent. Re-pair the printer after verifying it: {change}"
                ),
                observed,
            ))
        }
    }
}

#[derive(Debug)]
pub(crate) struct BambuLivePollError {
    pub(crate) message: String,
    pub(crate) observed_identity: Option<tls_identity::BambuTlsIdentity>,
}

impl BambuLivePollError {
    pub(crate) fn without_identity(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            observed_identity: None,
        }
    }

    pub(crate) fn with_identity(
        message: impl Into<String>,
        observed_identity: tls_identity::BambuTlsIdentity,
    ) -> Self {
        Self {
            message: message.into(),
            observed_identity: Some(observed_identity),
        }
    }
}

pub(crate) fn has_live_observation(state: &BambuLiveObservedStateRow) -> bool {
    !state.trays.is_empty()
        || state.gcode_state.is_some()
        || state.print_type.is_some()
        || state.subtask_id.is_some()
        || state.subtask_name.is_some()
        || state.progress_percent.is_some()
        || state.remaining_minutes.is_some()
        || state.prepare_percent.is_some()
        || state.print_stage.is_some()
        || state.print_error_code.is_some()
        || state.job_state_code.is_some()
        || state.nozzle_temp_c.is_some()
        || state.bed_temp_c.is_some()
        || state.active_ams_index.is_some()
        || state.active_tray_index.is_some()
        || state.ams_reading_bits.is_some()
        || state.ams_exist_bits.is_some()
        || state.ams_read_done_bits.is_some()
        || state.ams_bambu_bits.is_some()
        || state.ams_status_code.is_some()
}

pub(crate) fn is_mqtt_read_timeout(error: &str) -> bool {
    error.contains("os error 35")
        || error.contains("timed out")
        || error.contains("Resource temporarily unavailable")
}

pub(crate) fn format_mqtt_connect_errors(attempts: &[(SocketAddr, std::io::Error)]) -> String {
    format_mqtt_connect_errors_for_platform(attempts, cfg!(target_os = "macos"))
}

pub(crate) fn format_mqtt_connect_errors_for_platform(
    attempts: &[(SocketAddr, std::io::Error)],
    is_macos: bool,
) -> String {
    let base = match attempts {
        [] => "failed to connect to printer MQTT: no printer address resolved".to_string(),
        [(address, error)] => format!("failed to connect to printer MQTT at {address}: {error}"),
        _ => {
            let details = attempts
                .iter()
                .map(|(address, error)| format!("{address}: {error}"))
                .collect::<Vec<_>>()
                .join("; ");
            format!(
                "failed to connect to printer MQTT on all {} resolved addresses: {details}",
                attempts.len()
            )
        }
    };

    if is_macos
        && !attempts.is_empty()
        && attempts
            .iter()
            .all(|(_, error)| looks_like_macos_local_network_block(error))
    {
        return format!(
            "{base}. macOS may be blocking Filament Manager's Local Network access. Allow Filament Manager in System Settings > Privacy & Security > Local Network, then restart the app. If it is not listed, launch the app from Applications and retry the printer connection."
        );
    }
    base
}

fn looks_like_macos_local_network_block(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(51 | 65))
        || error
            .to_string()
            .to_lowercase()
            .contains("no route to host")
}
