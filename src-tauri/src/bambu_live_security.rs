use super::{connect_printer_mqtt_tcp, tls_identity, MQTT_TIMEOUT_SECS};
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, BambuLiveTlsIdentityRow,
};
use crate::bambu_live_observation::now_iso_string;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls13_signature_with_raw_key, WebPkiSupportedAlgorithms};
use rustls::pki_types::{CertificateDer, ServerName, SubjectPublicKeyInfoDer, UnixTime};
use rustls::{
    CertificateError, ClientConfig, ClientConnection, DigitallySignedStruct, Error as RustlsError,
    PeerMisbehaved, SignatureScheme, StreamOwned,
};
use std::net::{SocketAddr, TcpStream};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use x509_parser::parse_x509_certificate;
use x509_parser::time::ASN1Time;

pub(crate) type BambuTlsStream = StreamOwned<ClientConnection, TcpStream>;

#[derive(Debug)]
pub(crate) struct BambuTlsHandshakeError {
    pub(crate) message: String,
    pub(crate) observed_identity: Option<tls_identity::BambuTlsIdentity>,
}

#[derive(Debug)]
struct BambuServerCertVerifier {
    expected_printer_serial: String,
    expected_pin: Option<tls_identity::BambuTlsPin>,
    observed_identity: Arc<OnceLock<tls_identity::BambuTlsIdentity>>,
    signature_algorithms: WebPkiSupportedAlgorithms,
}

impl BambuServerCertVerifier {
    fn new(
        expected_printer_serial: &str,
        expected_pin: Option<&tls_identity::BambuTlsPin>,
        observed_identity: Arc<OnceLock<tls_identity::BambuTlsIdentity>>,
        signature_algorithms: WebPkiSupportedAlgorithms,
    ) -> Result<Self, String> {
        let expected_printer_serial = expected_printer_serial.trim().to_ascii_uppercase();
        if expected_printer_serial.is_empty() {
            return Err("configured printer serial is required for TLS trust".to_string());
        }
        Ok(Self {
            expected_printer_serial,
            expected_pin: expected_pin.cloned(),
            observed_identity,
            signature_algorithms,
        })
    }

    fn certificate_error(error: CertificateError) -> RustlsError {
        RustlsError::InvalidCertificate(error)
    }

    fn subject_public_key_info(
        certificate_der: &CertificateDer<'_>,
    ) -> Result<SubjectPublicKeyInfoDer<'static>, RustlsError> {
        let (remaining, certificate) = parse_x509_certificate(certificate_der.as_ref())
            .map_err(|_| Self::certificate_error(CertificateError::BadEncoding))?;
        if !remaining.is_empty() {
            return Err(Self::certificate_error(CertificateError::BadEncoding));
        }
        Ok(SubjectPublicKeyInfoDer::from(
            certificate.tbs_certificate.subject_pki.raw.to_vec(),
        ))
    }

    fn signature_algorithms_for_scheme(
        &self,
        scheme: SignatureScheme,
    ) -> Result<
        &'static [&'static dyn rustls::pki_types::SignatureVerificationAlgorithm],
        RustlsError,
    > {
        self.signature_algorithms
            .mapping
            .iter()
            .find_map(|(candidate, algorithms)| (*candidate == scheme).then_some(*algorithms))
            .ok_or_else(|| {
                RustlsError::PeerMisbehaved(
                    PeerMisbehaved::SignedHandshakeWithUnadvertisedSigScheme,
                )
            })
    }
}

impl ServerCertVerifier for BambuServerCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        if !server_name
            .to_str()
            .eq_ignore_ascii_case(&self.expected_printer_serial)
        {
            return Err(Self::certificate_error(CertificateError::NotValidForName));
        }

        let observed = tls_identity::identity_from_leaf_der(end_entity.as_ref())
            .map_err(|_| Self::certificate_error(CertificateError::BadEncoding))?;
        let _ = self.observed_identity.set(observed.clone());

        let (_, certificate) = parse_x509_certificate(end_entity.as_ref())
            .map_err(|_| Self::certificate_error(CertificateError::BadEncoding))?;
        let now = i64::try_from(now.as_secs())
            .ok()
            .and_then(|seconds| ASN1Time::from_timestamp(seconds).ok())
            .ok_or_else(|| Self::certificate_error(CertificateError::BadEncoding))?;
        if now < certificate.validity().not_before {
            return Err(Self::certificate_error(CertificateError::NotValidYet));
        }
        if now > certificate.validity().not_after {
            return Err(Self::certificate_error(CertificateError::Expired));
        }

        match tls_identity::assess_trust(
            &self.expected_printer_serial,
            self.expected_pin.as_ref(),
            &observed,
        )
        .map_err(|_| Self::certificate_error(CertificateError::ApplicationVerificationFailure))?
        {
            tls_identity::BambuTlsTrustDecision::Unknown { .. } if self.expected_pin.is_none() => {}
            tls_identity::BambuTlsTrustDecision::Trusted { .. } => {}
            tls_identity::BambuTlsTrustDecision::Unknown { .. }
            | tls_identity::BambuTlsTrustDecision::Changed { .. } => {
                return Err(Self::certificate_error(
                    CertificateError::ApplicationVerificationFailure,
                ));
            }
        }

        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        let spki = Self::subject_public_key_info(certificate)?;
        let public_key = webpki::RawPublicKeyEntity::try_from(&spki)
            .map_err(|_| Self::certificate_error(CertificateError::BadEncoding))?;
        let algorithms = self.signature_algorithms_for_scheme(signature.scheme)?;
        for algorithm in algorithms {
            match public_key.verify_signature(*algorithm, message, signature.signature()) {
                Ok(()) => return Ok(HandshakeSignatureValid::assertion()),
                Err(webpki::Error::UnsupportedSignatureAlgorithmForPublicKeyContext(_)) => {
                    continue;
                }
                Err(_) => return Err(Self::certificate_error(CertificateError::BadSignature)),
            }
        }
        Err(Self::certificate_error(CertificateError::BadSignature))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        let spki = Self::subject_public_key_info(certificate)?;
        verify_tls13_signature_with_raw_key(message, &spki, signature, &self.signature_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.signature_algorithms.supported_schemes()
    }
}

fn bambu_server_cert_verifier(
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
    observed_identity: Arc<OnceLock<tls_identity::BambuTlsIdentity>>,
    signature_algorithms: WebPkiSupportedAlgorithms,
) -> Result<Arc<BambuServerCertVerifier>, String> {
    BambuServerCertVerifier::new(
        printer_serial,
        trusted_pin,
        observed_identity,
        signature_algorithms,
    )
    .map(Arc::new)
}

#[cfg(test)]
pub(crate) fn test_bambu_server_cert_verifier(
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
) -> Result<Arc<dyn ServerCertVerifier>, String> {
    let provider = rustls::crypto::aws_lc_rs::default_provider();
    bambu_server_cert_verifier(
        printer_serial,
        trusted_pin,
        Arc::new(OnceLock::new()),
        provider.signature_verification_algorithms,
    )
    .map(|verifier| verifier as Arc<dyn ServerCertVerifier>)
}

fn bambu_client_config(
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
    observed_identity: Arc<OnceLock<tls_identity::BambuTlsIdentity>>,
) -> Result<ClientConfig, String> {
    let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    let signature_algorithms = provider.signature_verification_algorithms;
    let verifier = bambu_server_cert_verifier(
        printer_serial,
        trusted_pin,
        observed_identity,
        signature_algorithms,
    )?;
    let mut config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| format!("failed to select printer TLS protocol versions: {error}"))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    // The serial is used as rustls' logical server name so the verifier can
    // bind the handshake to it. Do not disclose it as plaintext SNI on LAN.
    config.enable_sni = false;
    Ok(config)
}

#[cfg(test)]
pub(crate) fn test_bambu_client_config(
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
) -> Result<ClientConfig, String> {
    bambu_client_config(printer_serial, trusted_pin, Arc::new(OnceLock::new()))
}

pub(crate) fn connect_printer_tls(
    tcp_stream: TcpStream,
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
) -> Result<BambuTlsStream, BambuTlsHandshakeError> {
    let observed_identity = Arc::new(OnceLock::new());
    let config = bambu_client_config(printer_serial, trusted_pin, observed_identity.clone())
        .map_err(|message| BambuTlsHandshakeError {
            message,
            observed_identity: None,
        })?;
    let server_name =
        ServerName::try_from(printer_serial.trim().to_ascii_uppercase()).map_err(|_| {
            BambuTlsHandshakeError {
                message: "printer serial is not a valid TLS server name".to_string(),
                observed_identity: None,
            }
        })?;
    let connection = ClientConnection::new(Arc::new(config), server_name).map_err(|error| {
        BambuTlsHandshakeError {
            message: format!("failed to prepare printer TLS session: {error}"),
            observed_identity: None,
        }
    })?;
    let mut stream = StreamOwned::new(connection, tcp_stream);
    while stream.conn.is_handshaking() {
        if let Err(error) = stream.conn.complete_io(&mut stream.sock) {
            let observed = observed_identity.get().cloned();
            let message = observed
                .as_ref()
                .and_then(|identity| {
                    tls_identity::assess_trust(printer_serial, trusted_pin, identity).ok()
                })
                .and_then(|decision| match decision {
                    tls_identity::BambuTlsTrustDecision::Changed { change, .. } => Some(format!(
                        "printer TLS identity was rejected during the handshake: {change}"
                    )),
                    _ => None,
                })
                .unwrap_or_else(|| format!("failed to establish printer TLS session: {error}"));
            return Err(BambuTlsHandshakeError {
                message,
                observed_identity: observed,
            });
        }
    }
    Ok(stream)
}

pub(crate) fn peer_leaf_der(stream: &BambuTlsStream) -> Result<Vec<u8>, String> {
    stream
        .conn
        .peer_certificates()
        .and_then(|certificates| certificates.first())
        .map(|certificate| certificate.as_ref().to_vec())
        .ok_or_else(|| "printer TLS session did not provide a leaf certificate".to_string())
}

pub(crate) fn probe_printer_tls_identity(
    host: &str,
    printer_serial: &str,
) -> Result<tls_identity::BambuTlsIdentity, String> {
    probe_printer_tls_identity_with_optional_pin(host, printer_serial, None)
}

pub(crate) fn probe_printer_tls_identity_with_pin(
    host: &str,
    printer_serial: &str,
    trusted_pin: &tls_identity::BambuTlsPin,
) -> Result<tls_identity::BambuTlsIdentity, String> {
    probe_printer_tls_identity_with_optional_pin(host, printer_serial, Some(trusted_pin))
}

fn probe_printer_tls_identity_with_optional_pin(
    host: &str,
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
) -> Result<tls_identity::BambuTlsIdentity, String> {
    let tcp_stream = connect_printer_mqtt_tcp(host)?;
    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set TLS probe read timeout: {error}"))?;
    tcp_stream
        .set_write_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set TLS probe write timeout: {error}"))?;
    let stream = connect_printer_tls(tcp_stream, printer_serial, trusted_pin)
        .map_err(|error| error.message)?;
    let peer_leaf_der = peer_leaf_der(&stream)?;
    let observed = tls_identity::identity_from_leaf_der(&peer_leaf_der)?;
    match tls_identity::assess_trust(printer_serial, trusted_pin, &observed)? {
        tls_identity::BambuTlsTrustDecision::Unknown { .. } if trusted_pin.is_none() => {
            Ok(observed)
        }
        tls_identity::BambuTlsTrustDecision::Trusted { .. } if trusted_pin.is_some() => {
            Ok(observed)
        }
        tls_identity::BambuTlsTrustDecision::Changed { change, .. } => Err(format!(
            "Printer TLS identity did not match its serial: {change}"
        )),
        _ => Err("TLS probe returned an inconsistent trust decision.".to_string()),
    }
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
