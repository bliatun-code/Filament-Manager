use sha2::{Digest, Sha256};
use std::fmt;
use std::fmt::Write as _;
use std::io::Write;
use x509_parser::parse_x509_certificate;

const X509_SUBJECT_SERIAL_NUMBER_OID: &str = "2.5.4.5";
const X509_SUBJECT_COMMON_NAME_OID: &str = "2.5.4.3";

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BambuTlsIdentity {
    pub(crate) certificate_sha256: String,
    pub(crate) spki_sha256: String,
    pub(crate) certificate_subject_serial: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BambuTlsPin {
    printer_serial: String,
    certificate_sha256: String,
    spki_sha256: String,
}

impl BambuTlsPin {
    pub(crate) fn new(
        printer_serial: &str,
        certificate_sha256: &str,
        spki_sha256: &str,
    ) -> Result<Self, String> {
        Ok(Self {
            printer_serial: normalize_printer_serial(printer_serial)?,
            certificate_sha256: normalize_sha256_fingerprint("certificate", certificate_sha256)?,
            spki_sha256: normalize_sha256_fingerprint("SPKI", spki_sha256)?,
        })
    }

    pub(crate) fn from_observed(
        printer_serial: &str,
        observed: &BambuTlsIdentity,
    ) -> Result<Self, String> {
        Self::new(
            printer_serial,
            &observed.certificate_sha256,
            &observed.spki_sha256,
        )
    }

    #[cfg(test)]
    pub(crate) fn printer_serial(&self) -> &str {
        &self.printer_serial
    }

    pub(crate) fn certificate_sha256(&self) -> &str {
        &self.certificate_sha256
    }

    pub(crate) fn spki_sha256(&self) -> &str {
        &self.spki_sha256
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum BambuTlsIdentityChange {
    MissingCertificateIdentity { expected: String },
    CertificateSerialMismatch { expected: String, observed: String },
    PinBelongsToAnotherPrinter { expected: String, pinned: String },
    SpkiMismatch { expected: String, observed: String },
}

impl fmt::Display for BambuTlsIdentityChange {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingCertificateIdentity { expected } => write!(
                formatter,
                "certificate does not identify configured printer {expected}"
            ),
            Self::CertificateSerialMismatch { expected, observed } => write!(
                formatter,
                "certificate serial {observed} does not match configured printer {expected}"
            ),
            Self::PinBelongsToAnotherPrinter { expected, pinned } => write!(
                formatter,
                "saved TLS pin belongs to printer {pinned}, not configured printer {expected}"
            ),
            Self::SpkiMismatch { expected, observed } => write!(
                formatter,
                "printer public-key fingerprint changed from {expected} to {observed}"
            ),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum BambuTlsTrustDecision {
    Unknown {
        observed: BambuTlsIdentity,
    },
    Trusted {
        observed: BambuTlsIdentity,
        certificate_changed: bool,
    },
    Changed {
        observed: BambuTlsIdentity,
        change: BambuTlsIdentityChange,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum BambuTlsConnectGateError {
    Configuration(String),
    PeerCertificate(String),
    IdentityUnknown {
        expected_printer_serial: String,
        observed: Box<BambuTlsIdentity>,
    },
    IdentityChanged {
        observed: Box<BambuTlsIdentity>,
        change: BambuTlsIdentityChange,
    },
    MqttWrite(String),
}

impl fmt::Display for BambuTlsConnectGateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Configuration(error) => {
                write!(formatter, "printer TLS trust is not configured: {error}")
            }
            Self::PeerCertificate(error) => {
                write!(
                    formatter,
                    "could not verify printer TLS certificate: {error}"
                )
            }
            Self::IdentityUnknown {
                expected_printer_serial,
                observed,
            } => write!(
                formatter,
                "printer TLS identity for {expected_printer_serial} is not trusted yet; \
                 re-pair before sending credentials (SPKI SHA-256 {})",
                observed.spki_sha256
            ),
            Self::IdentityChanged { change, .. } => write!(
                formatter,
                "printer TLS identity changed; credentials were not sent: {change}"
            ),
            Self::MqttWrite(error) => {
                write!(formatter, "failed to send MQTT connect packet: {error}")
            }
        }
    }
}

pub(crate) fn identity_from_leaf_der(leaf_der: &[u8]) -> Result<BambuTlsIdentity, String> {
    let (remaining, certificate) = parse_x509_certificate(leaf_der)
        .map_err(|error| format!("failed to parse TLS peer leaf certificate: {error}"))?;
    if !remaining.is_empty() {
        return Err(format!(
            "TLS peer leaf certificate has {} unexpected trailing bytes",
            remaining.len()
        ));
    }

    let subject_value = |oid: &str, label: &str| {
        certificate
            .subject()
            .iter_attributes()
            .find(|attribute| attribute.attr_type().to_id_string() == oid)
            .map(|attribute| {
                attribute
                    .as_str()
                    .map(str::trim)
                    .map(str::to_string)
                    .map_err(|error| {
                        format!("TLS peer certificate {label} is not valid text: {error}")
                    })
            })
            .transpose()
            .map(|value| value.filter(|value| !value.is_empty()))
    };
    let subject_serial_number =
        subject_value(X509_SUBJECT_SERIAL_NUMBER_OID, "subject serial number")?;
    let subject_common_name = subject_value(X509_SUBJECT_COMMON_NAME_OID, "common name")?;
    // Current Bambu firmware puts the printer serial in CN. Older/test
    // certificates may use the dedicated X.509 serialNumber attribute, which
    // remains the more specific source when both are present.
    let certificate_subject_serial =
        preferred_printer_identity(subject_serial_number, subject_common_name);

    Ok(BambuTlsIdentity {
        certificate_sha256: sha256_hex(leaf_der),
        spki_sha256: sha256_hex(certificate.tbs_certificate.subject_pki.raw),
        certificate_subject_serial,
    })
}

pub(crate) fn preferred_printer_identity(
    subject_serial_number: Option<String>,
    subject_common_name: Option<String>,
) -> Option<String> {
    subject_serial_number.or(subject_common_name)
}

pub(crate) fn assess_trust(
    expected_printer_serial: &str,
    expected_pin: Option<&BambuTlsPin>,
    observed: &BambuTlsIdentity,
) -> Result<BambuTlsTrustDecision, String> {
    let expected_printer_serial = normalize_printer_serial(expected_printer_serial)?;

    let Some(observed_serial) = observed.certificate_subject_serial.as_deref() else {
        return Ok(BambuTlsTrustDecision::Changed {
            observed: observed.clone(),
            change: BambuTlsIdentityChange::MissingCertificateIdentity {
                expected: expected_printer_serial,
            },
        });
    };
    let observed_serial = normalize_printer_serial(observed_serial)?;
    if observed_serial != expected_printer_serial {
        return Ok(BambuTlsTrustDecision::Changed {
            observed: observed.clone(),
            change: BambuTlsIdentityChange::CertificateSerialMismatch {
                expected: expected_printer_serial,
                observed: observed_serial,
            },
        });
    }

    let Some(expected_pin) = expected_pin else {
        return Ok(BambuTlsTrustDecision::Unknown {
            observed: observed.clone(),
        });
    };

    if expected_pin.printer_serial != expected_printer_serial {
        return Ok(BambuTlsTrustDecision::Changed {
            observed: observed.clone(),
            change: BambuTlsIdentityChange::PinBelongsToAnotherPrinter {
                expected: expected_printer_serial,
                pinned: expected_pin.printer_serial.clone(),
            },
        });
    }

    if expected_pin.spki_sha256 != observed.spki_sha256 {
        return Ok(BambuTlsTrustDecision::Changed {
            observed: observed.clone(),
            change: BambuTlsIdentityChange::SpkiMismatch {
                expected: expected_pin.spki_sha256.clone(),
                observed: observed.spki_sha256.clone(),
            },
        });
    }

    Ok(BambuTlsTrustDecision::Trusted {
        observed: observed.clone(),
        certificate_changed: expected_pin.certificate_sha256 != observed.certificate_sha256,
    })
}

/// Writes the MQTT CONNECT packet only after the peer leaf certificate has
/// matched the saved printer identity. The self-signed TLS handshake may
/// complete before this call, but unknown, changed, or malformed identities
/// never reach the writer.
pub(crate) fn write_connect_after_trust<W: Write>(
    writer: &mut W,
    expected_printer_serial: &str,
    expected_pin: Option<&BambuTlsPin>,
    peer_leaf_der: &[u8],
    connect_packet: &[u8],
) -> Result<BambuTlsTrustDecision, BambuTlsConnectGateError> {
    let observed =
        identity_from_leaf_der(peer_leaf_der).map_err(BambuTlsConnectGateError::PeerCertificate)?;
    match assess_trust(expected_printer_serial, expected_pin, &observed)
        .map_err(BambuTlsConnectGateError::Configuration)?
    {
        trusted @ BambuTlsTrustDecision::Trusted { .. } => {
            writer
                .write_all(connect_packet)
                .map_err(|error| BambuTlsConnectGateError::MqttWrite(error.to_string()))?;
            Ok(trusted)
        }
        BambuTlsTrustDecision::Unknown { observed } => {
            Err(BambuTlsConnectGateError::IdentityUnknown {
                expected_printer_serial: expected_printer_serial.trim().to_string(),
                observed: Box::new(observed),
            })
        }
        BambuTlsTrustDecision::Changed { observed, change } => {
            Err(BambuTlsConnectGateError::IdentityChanged {
                observed: Box::new(observed),
                change,
            })
        }
    }
}

fn normalize_printer_serial(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_ascii_uppercase();
    if normalized.is_empty() {
        return Err("configured printer serial is required for TLS trust".to_string());
    }
    Ok(normalized)
}

fn normalize_sha256_fingerprint(label: &str, value: &str) -> Result<String, String> {
    let normalized = value
        .chars()
        .filter(|character| !matches!(character, ':' | ' ' | '-'))
        .flat_map(char::to_lowercase)
        .collect::<String>();
    if normalized.len() != 64 || !normalized.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!(
            "{label} SHA-256 fingerprint must contain exactly 64 hexadecimal characters"
        ));
    }
    Ok(normalized)
}

fn sha256_hex(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}
