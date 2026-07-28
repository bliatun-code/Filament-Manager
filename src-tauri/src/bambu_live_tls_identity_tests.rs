use super::live_security::run_after_trusted_identity;
use super::tls_identity::{
    assess_trust, identity_from_leaf_der, preferred_printer_identity, write_connect_after_trust,
    BambuTlsConnectGateError, BambuTlsIdentityChange, BambuTlsPin, BambuTlsTrustDecision,
};
use base64::Engine;
use std::sync::atomic::{AtomicBool, Ordering};

const TEST_PRINTER_SERIAL: &str = "01TESTSERIAL1234";
const TEST_CERTIFICATE_DER_BASE64: &str = "\
MIIC5DCCAcwCCQCkNXd4eGzZjTANBgkqhkiG9w0BAQsFADA0MRcwFQYDVQQDDA5C\
YW1idSBMYWIgVGVzdDEZMBcGA1UEBRMQMDFURVNUU0VSSUFMMTIzNDAeFw0yNjA3\
MjgyMDEzMjZaFw0zNjA3MjUyMDEzMjZaMDQxFzAVBgNVBAMMDkJhbWJ1IExhYiBU\
ZXN0MRkwFwYDVQQFExAwMVRFU1RTRVJJQUwxMjM0MIIBIjANBgkqhkiG9w0BAQEF\
AAOCAQ8AMIIBCgKCAQEA5Ak8HA7YZHnFY02qPrEWRzvR2BiNoJG+LMYMPKVjKVkj\
Lf0aASAn+Ip98FjRDHykQP3cn7OtLZn/RGHFEVM7akxYUyc+w/1FNV7Xi/8oGNA1\
WMjWHO5iJn0EMF6ccqo5x9GONeVL6UNJdYcTIfTQlUrms5Pfg4O06gsVgKtmTgD\
OwX7k27yO0AOba9hhV8kUNHRbzaqKM/A3pGQHN9FK3MrXbV3kmAs6/hCiwOV0em\
yeaxoD+Of1KIPDAl234wvYeK3DTlw/FvHT8Tt+OZr/WkSA7wIwgziEW8GRhboMRT\
k0q+Ix3DBlvByo1wxtROpmqBrI64pQpAqvQDcxytWYDwIDAQABMA0GCSqGSIb3DQ\
EBCwUAA4IBAQBfRqOELe0LSRG9mJfxxkJ/+mkey1S51huruQkHITkABkO2PR0r7h\
KhC4eV+KvKpjUOOGBPVTBbDApsFGVQj27TEMpLIWt6TAGZjpjIn08FM3MZ0aDo5h\
K9dVyGecm9DWcD0PL5O+iD2g43/wOrpWGsYg/b/dAwul32pYpttGZHmJQA0XFAU\
hb4VnDfOudIpOHCMEd8LMuhIFqKBqkY3ivdCI/z8pWKjEKGknwz1NbpDLYYdWei\
Q27VwVg9I6DsSa9ovYHYoqXA6nhsys328YP9GXn8jXElDahwVNq1SahG3TsmYrJ\
Et+Twkd5WIB2sd/z5SR+ylEH35TE9AW4Kq2fA";
const TEST_CERTIFICATE_SHA256: &str =
    "39252222113a11e97095ce7e7045eed3d2d245a51ca20305f9af6829d6f17744";
const TEST_SPKI_SHA256: &str = "f6b1289d982403444e37d9d2d179363239ec7331d044f4461b304731072f38b6";
const MQTT_CONNECT_PACKET: &[u8] = b"\x10\x04test";

fn certificate_der() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(TEST_CERTIFICATE_DER_BASE64)
        .expect("valid test certificate")
}

fn observed_identity() -> super::tls_identity::BambuTlsIdentity {
    identity_from_leaf_der(&certificate_der()).expect("parse test certificate")
}

fn matching_pin() -> BambuTlsPin {
    BambuTlsPin::new(
        TEST_PRINTER_SERIAL,
        TEST_CERTIFICATE_SHA256,
        TEST_SPKI_SHA256,
    )
    .expect("valid test pin")
}

#[test]
fn leaf_identity_contains_certificate_spki_and_printer_serial() {
    let identity = observed_identity();

    assert_eq!(identity.certificate_sha256, TEST_CERTIFICATE_SHA256);
    assert_eq!(identity.spki_sha256, TEST_SPKI_SHA256);
    assert_eq!(
        identity.certificate_subject_serial.as_deref(),
        Some(TEST_PRINTER_SERIAL)
    );
}

#[test]
fn matching_serial_and_spki_are_trusted() {
    let identity = observed_identity();
    let decision = assess_trust(TEST_PRINTER_SERIAL, Some(&matching_pin()), &identity)
        .expect("trust decision");

    assert_eq!(
        decision,
        BambuTlsTrustDecision::Trusted {
            observed: identity,
            certificate_changed: false,
        }
    );
}

#[test]
fn printer_identity_prefers_serial_number_and_falls_back_to_common_name() {
    assert_eq!(
        preferred_printer_identity(
            Some("SERIAL-NUMBER".to_string()),
            Some("COMMON-NAME".to_string())
        )
        .as_deref(),
        Some("SERIAL-NUMBER")
    );
    assert_eq!(
        preferred_printer_identity(None, Some(TEST_PRINTER_SERIAL.to_string())).as_deref(),
        Some(TEST_PRINTER_SERIAL)
    );
}

#[test]
fn same_spki_remains_trusted_when_only_leaf_certificate_changes() {
    let identity = observed_identity();
    let pin = BambuTlsPin::new(
        TEST_PRINTER_SERIAL,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        TEST_SPKI_SHA256,
    )
    .expect("valid test pin");

    assert_eq!(
        assess_trust(TEST_PRINTER_SERIAL, Some(&pin), &identity).expect("trust decision"),
        BambuTlsTrustDecision::Trusted {
            observed: identity,
            certificate_changed: true,
        }
    );
}

#[test]
fn certificate_without_printer_identity_cannot_be_enrolled() {
    let mut identity = observed_identity();
    identity.certificate_subject_serial = None;

    assert!(matches!(
        assess_trust(TEST_PRINTER_SERIAL, None, &identity).expect("trust decision"),
        BambuTlsTrustDecision::Changed {
            change: BambuTlsIdentityChange::MissingCertificateIdentity { .. },
            ..
        }
    ));
}

#[test]
fn credentials_are_not_read_for_unknown_or_changed_identity() {
    let unknown_read = AtomicBool::new(false);
    let unknown = assess_trust(TEST_PRINTER_SERIAL, None, &observed_identity())
        .expect("unknown trust decision");
    assert!(run_after_trusted_identity(unknown, || {
        unknown_read.store(true, Ordering::SeqCst);
        Ok(())
    })
    .is_err());
    assert!(!unknown_read.load(Ordering::SeqCst));

    let changed_pin = BambuTlsPin::new(
        TEST_PRINTER_SERIAL,
        TEST_CERTIFICATE_SHA256,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .expect("changed pin");
    let changed_read = AtomicBool::new(false);
    let changed = assess_trust(
        TEST_PRINTER_SERIAL,
        Some(&changed_pin),
        &observed_identity(),
    )
    .expect("changed trust decision");
    assert!(run_after_trusted_identity(changed, || {
        changed_read.store(true, Ordering::SeqCst);
        Ok(())
    })
    .is_err());
    assert!(!changed_read.load(Ordering::SeqCst));
}

#[test]
fn unknown_identity_never_writes_mqtt_connect_bytes() {
    let mut written = Vec::new();

    let error = write_connect_after_trust(
        &mut written,
        TEST_PRINTER_SERIAL,
        None,
        &certificate_der(),
        MQTT_CONNECT_PACKET,
    )
    .expect_err("unpaired identity must be rejected");

    assert!(matches!(
        error,
        BambuTlsConnectGateError::IdentityUnknown { .. }
    ));
    assert!(written.is_empty());
}

#[test]
fn changed_spki_never_writes_mqtt_connect_bytes() {
    let changed_pin = BambuTlsPin::new(
        TEST_PRINTER_SERIAL,
        TEST_CERTIFICATE_SHA256,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .expect("valid changed pin");
    let mut written = Vec::new();

    let error = write_connect_after_trust(
        &mut written,
        TEST_PRINTER_SERIAL,
        Some(&changed_pin),
        &certificate_der(),
        MQTT_CONNECT_PACKET,
    )
    .expect_err("changed public key must be rejected");

    assert!(matches!(
        error,
        BambuTlsConnectGateError::IdentityChanged {
            change: BambuTlsIdentityChange::SpkiMismatch { .. },
            ..
        }
    ));
    assert!(written.is_empty());
}

#[test]
fn certificate_for_another_serial_never_writes_mqtt_connect_bytes() {
    let mut written = Vec::new();

    let error = write_connect_after_trust(
        &mut written,
        "01ANOTHERPRINTER",
        Some(&matching_pin()),
        &certificate_der(),
        MQTT_CONNECT_PACKET,
    )
    .expect_err("certificate serial mismatch must be rejected");

    assert!(matches!(
        error,
        BambuTlsConnectGateError::IdentityChanged {
            change: BambuTlsIdentityChange::CertificateSerialMismatch { .. },
            ..
        }
    ));
    assert!(written.is_empty());
}

#[test]
fn pin_for_another_serial_never_writes_mqtt_connect_bytes() {
    let pin = BambuTlsPin::new(
        "01ANOTHERPRINTER",
        TEST_CERTIFICATE_SHA256,
        TEST_SPKI_SHA256,
    )
    .expect("valid other-printer pin");
    let mut written = Vec::new();

    assert!(matches!(
        write_connect_after_trust(
            &mut written,
            TEST_PRINTER_SERIAL,
            Some(&pin),
            &certificate_der(),
            MQTT_CONNECT_PACKET,
        ),
        Err(BambuTlsConnectGateError::IdentityChanged {
            change: BambuTlsIdentityChange::PinBelongsToAnotherPrinter { .. },
            ..
        })
    ));
    assert!(written.is_empty());
}

#[test]
fn malformed_certificate_never_writes_mqtt_connect_bytes() {
    let mut written = Vec::new();

    let error = write_connect_after_trust(
        &mut written,
        TEST_PRINTER_SERIAL,
        Some(&matching_pin()),
        b"not a DER certificate",
        MQTT_CONNECT_PACKET,
    )
    .expect_err("malformed peer certificate must be rejected");

    assert!(matches!(
        error,
        BambuTlsConnectGateError::PeerCertificate(_)
    ));
    assert!(written.is_empty());
}

#[test]
fn trusted_identity_writes_the_complete_mqtt_connect_packet() {
    let mut written = Vec::new();

    let decision = write_connect_after_trust(
        &mut written,
        TEST_PRINTER_SERIAL,
        Some(&matching_pin()),
        &certificate_der(),
        MQTT_CONNECT_PACKET,
    )
    .expect("matching identity may authenticate");

    assert!(matches!(decision, BambuTlsTrustDecision::Trusted { .. }));
    assert_eq!(written, MQTT_CONNECT_PACKET);
}

#[test]
fn pins_normalize_display_separators_but_reject_invalid_fingerprints() {
    let grouped = TEST_SPKI_SHA256
        .as_bytes()
        .chunks(2)
        .map(|chunk| std::str::from_utf8(chunk).expect("ASCII hex"))
        .collect::<Vec<_>>()
        .join(":");
    let pin = BambuTlsPin::new(TEST_PRINTER_SERIAL, TEST_CERTIFICATE_SHA256, &grouped)
        .expect("colon-separated fingerprint");

    assert_eq!(pin.printer_serial(), TEST_PRINTER_SERIAL);
    assert_eq!(pin.certificate_sha256(), TEST_CERTIFICATE_SHA256);
    assert_eq!(pin.spki_sha256(), TEST_SPKI_SHA256);
    assert!(BambuTlsPin::new(TEST_PRINTER_SERIAL, TEST_CERTIFICATE_SHA256, "abcd").is_err());
}
