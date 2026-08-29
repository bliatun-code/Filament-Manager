use super::live_security::{
    run_after_trusted_identity, test_bambu_client_config, test_bambu_server_cert_verifier,
};
use super::tls_identity::{
    assess_trust, identity_from_leaf_der, preferred_printer_identity, write_connect_after_trust,
    BambuTlsConnectGateError, BambuTlsIdentityChange, BambuTlsPin, BambuTlsTrustDecision,
};
use base64::Engine;
use rustls::pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName, UnixTime};
use rustls::server::{ClientHello, ResolvesServerCert};
use rustls::sign::CertifiedKey;
use rustls::{ClientConnection, ProtocolVersion, ServerConfig, ServerConnection};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use x509_parser::prelude::{parse_x509_certificate, X509Version};

const TEST_PRINTER_SERIAL: &str = "01TESTSERIAL1234";
const TEST_CERTIFICATE_DER_BASE64: &str = "\
MIIC5DCCAcwCCQDQNWy3jOC+NzANBgkqhkiG9w0BAQsFADA0MRcwFQYDVQQDDA5CYW1idSBM\
YWIgVGVzdDEZMBcGA1UEBRMQMDFURVNUU0VSSUFMMTIzNDAeFw0yNjA4MjkwMTM3NDBaFw00\
NjA4MjQwMTM3NDBaMDQxFzAVBgNVBAMMDkJhbWJ1IExhYiBUZXN0MRkwFwYDVQQFExAwMVRF\
U1RTRVJJQUwxMjM0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyAm7O7AioaM6\
NTzsiT24qQ0SXVbqxTjbKATL6CuPaZ9Laxg7J8eGWeIFzExaX/LK2HKr4tJUxbVgUUGf71LT\
Zj9dG1uy+5zLC8Xvcp2rPOa0pKuiEiK7zt1K9YtOzu6bA+eWNBUPzcd7KoUvFNG0CfHrP1iS\
zJ26AGib7BeuoayKQmqyw/89NRMixxOWpoQ5XxWtlawnbd0DrKHQF9LkPQb0jJuEABI0ZmSs\
RID6YXgdcDzAWNf6PpaII876aweo6j7r4kKaFVVts1En5UXfjKCtogsn+RcpKPEBNmbkCrm6\
ymt3JDfwcJ48cYYU6N6iQswOSff3SeUyaeMQwf1O5wIDAQABMA0GCSqGSIb3DQEBCwUAA4IB\
AQCYtJeCO97EyTm/RmQgqSzL8N2WB9TJgzJqTL2eZIrKJGkYur0XPPJUVLSHuwhSKTr6QoXl\
/PiPNwuOS1kG5qNGjnp3SCeHZXWzeqVJGKi/2ePM9sL6TbQ4fzbkw/GEOule6bRHKmA4BJIR\
OqRi18VfyMRQJNIaq0TKFDWJ7Z+5ebZb4ursWZ/LwYEtm4em7U2Dt6oJdMVq3vvBjqYX8KY2\
CP33O3RUi9xvrDrYcGtTi2905F6r/QtWPYglOIzuijOw4HX7d1YCKNgvsG+oVD0J1kLbyzGJ\
cfwQjByl+qLyhhTDbH7ZKS4gFr+QvnV7zev1uReyFWyB5xOU3gHwhEIy";
const TEST_CERTIFICATE_SHA256: &str =
    "3648f095da10aab76cd9459dcc12944222a89feb14c26decc3b4e04b6dffd300";
const TEST_SPKI_SHA256: &str = "2f69da7f2d9e809e53d6a8381ba986f316ee7b0c19ef4ecf6ba495c1f6c2e50c";
const MQTT_CONNECT_PACKET: &[u8] = b"\x10\x04test";
const TEST_PRIVATE_KEY_DER_BASE64: &str = "\
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDICbs7sCKhozo1POyJPbip\
DRJdVurFONsoBMvoK49pn0trGDsnx4ZZ4gXMTFpf8srYcqvi0lTFtWBRQZ/vUtNmP10bW7L7\
nMsLxe9ynas85rSkq6ISIrvO3Ur1i07O7psD55Y0FQ/Nx3sqhS8U0bQJ8es/WJLMnboAaJvs\
F66hrIpCarLD/z01EyLHE5amhDlfFa2VrCdt3QOsodAX0uQ9BvSMm4QAEjRmZKxEgPpheB1w\
PMBY1/o+logjzvprB6jqPuviQpoVVW2zUSflRd+MoK2iCyf5Fyko8QE2ZuQKubrKa3ckN/Bw\
njxxhhTo3qJCzA5J9/dJ5TJp4xDB/U7nAgMBAAECggEAbtjVo/Gqfx9QNggYmsRU+3h+4LI1\
Tix/ZOGjjHf29HSM+j9nKFfsHwqcY+U7f0evF9oTXZFn4FbtlJlk4t1mv5YFJg/eUodEDLYW\
RdEQ/qJpH4bsPFh68dq2mvIjLZAS3ksKdLnnFASiP6GlwUejGI+x6FxQnIoac/eDz4QgBP33\
W9jQrU+Hp82bXddXmf5G4a6O90bC3g74Z12bxUwQQog7nXR56Os5yemIOhsGaAdd+E8HC1Yi\
kfP1oH5FJ7yxq3CK11ZCF/jsR6iZvAD12nVpRpXfyOAC+TT8sd7+ODZ8yIvfvg3MJgGtY2ms\
3hM8fL1y/MlWYoQtshof2UeKoQKBgQD6U5vpFqaXN3B9xqGhY8MXuTMfff0ojltPqftaBwUY\
mwXvIhIHy4ozr/PkLT4g4fumx+ub/iVwAk2f2mbvhIqiICQ/jD6eqjdH3QhS7QjZfxgGhNFV\
UEbC9hR5Fx5guXyYa8Yu7FoRRxtpBkVjRMDvORPOiyOJFMVZG4nHeGyOTQKBgQDMkllJl3bI\
u+109UKTt9fS5OxVtsIuvuXl0WBBxJ3vK74YPWSi4a4/N52SSy1NtElbR9HsB0EeUz9aAHYv\
kgaId1vZMrvCeRxBv3eLXxTxVQviGiiMti5LzDmRdqO6utwLkLDIz5Vj27sjsB3BhIji1PpQ\
/HdNRkc9DP1SgxA0AwKBgQDsl1szSTI4l7BdX//hnn2EjYjRCe3ch/erapfiteHOKK7KHiR2\
c5xyT6mujkg7IfsL3cZEkEbn/3VIUU6asGWq57/6w91nbq+C31h/sAJ+Nk4J0zxaat4GZDhj\
XkNa3dTx5mLQdJiH3fH9KG0qbo//Sa37t6vlYtlG5+0ntxy6vQKBgQDKjiIAfwuraICPLQV1\
9DOr6uWjXSlaVcSW0MDpfgAPQBWiNK+/o4v/plbL8snxxZBY5H0Ton80wqLYv9pF8eWsG9sC\
7XwB7B8xbp60jjnTVy1D/DioUv72KEncIUeu7bRRczvIKdo2nOvoQ0rDQTK0vsL3i3OpPOvu\
pDz0BTf29wKBgD8W6kCT5VptF2+8g7PcNOQeuEWDqHRyJXDPkx/U2JFuHLtHvwDBDHoBr4z4\
hWpoxWhgnPZjEUx+7aWrYdhuoPaxcso9OUxzML6j++vVj1VuFjm3fNolDwElIGz9Jm3f7MdE\
OQpcAi+g2sXB01/lpsFnEaNIlNbe+u0z+7caal96";

fn certificate_der() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(TEST_CERTIFICATE_DER_BASE64)
        .expect("valid test certificate")
}

fn private_key_der() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(TEST_PRIVATE_KEY_DER_BASE64)
        .expect("valid test private key")
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

fn test_verification_time() -> UnixTime {
    // 2027-01-15, inside the test certificate's 2026-2046 validity period.
    UnixTime::since_unix_epoch(Duration::from_secs(1_800_000_000))
}

fn verify_test_certificate(
    verifier: &dyn rustls::client::danger::ServerCertVerifier,
    server_name: &str,
    now: UnixTime,
) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
    let certificate = CertificateDer::from(certificate_der());
    let server_name = ServerName::try_from(server_name.to_string()).expect("valid server name");
    verifier.verify_server_cert(&certificate, &[], &server_name, &[], now)
}

#[derive(Debug)]
struct FixedTestServerCertificate {
    certified_key: Arc<CertifiedKey>,
}

impl ResolvesServerCert for FixedTestServerCertificate {
    fn resolve(&self, _client_hello: ClientHello<'_>) -> Option<Arc<CertifiedKey>> {
        Some(self.certified_key.clone())
    }
}

#[test]
fn tls_verifier_accepts_matching_serial_during_uncredentialed_probe() {
    let verifier =
        test_bambu_server_cert_verifier(TEST_PRINTER_SERIAL, None).expect("build probe verifier");

    verify_test_certificate(
        verifier.as_ref(),
        TEST_PRINTER_SERIAL,
        test_verification_time(),
    )
    .expect("matching serial should complete the identity-only probe verification");
}

#[test]
fn bambu_tls_keeps_serial_out_of_plaintext_sni() {
    let config =
        test_bambu_client_config(TEST_PRINTER_SERIAL, None).expect("build Bambu TLS config");

    assert!(!config.enable_sni);
}

#[test]
fn pinned_verifier_completes_a_signed_tls12_handshake_with_v1_certificate() {
    let certificate_der = certificate_der();
    let (_, certificate) = parse_x509_certificate(&certificate_der).expect("parse v1 certificate");
    assert_eq!(certificate.version(), X509Version::V1);
    let observed = identity_from_leaf_der(&certificate_der).expect("parse handshake certificate");
    let pin = BambuTlsPin::from_observed(TEST_PRINTER_SERIAL, &observed).expect("build test pin");
    let client_config =
        test_bambu_client_config(TEST_PRINTER_SERIAL, Some(&pin)).expect("build client config");
    let server_provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    let signing_key = server_provider
        .key_provider
        .load_private_key(PrivatePkcs8KeyDer::from(private_key_der()).into())
        .expect("load matching v1 fixture key");
    let certified_key = Arc::new(CertifiedKey::new(
        vec![CertificateDer::from(certificate_der)],
        signing_key,
    ));
    // `with_single_cert` performs a webpki EndEntityCert key-match check and
    // cannot configure an X.509 v1 test server. A fixed resolver lets rustls
    // emit the representative v1 leaf; the successful client handshake below
    // proves that the private key matches and CertificateVerify is validated.
    let server_config = ServerConfig::builder_with_provider(server_provider)
        .with_protocol_versions(&[&rustls::version::TLS12])
        .expect("TLS 1.2 server configuration")
        .with_no_client_auth()
        .with_cert_resolver(Arc::new(FixedTestServerCertificate { certified_key }));
    let server_name =
        ServerName::try_from(TEST_PRINTER_SERIAL.to_string()).expect("valid printer serial name");
    let mut client =
        ClientConnection::new(Arc::new(client_config), server_name).expect("client connection");
    let mut server = ServerConnection::new(Arc::new(server_config)).expect("server connection");

    for _ in 0..32 {
        let mut client_bytes = Vec::new();
        client
            .write_tls(&mut client_bytes)
            .expect("write client handshake bytes");
        if !client_bytes.is_empty() {
            server
                .read_tls(&mut Cursor::new(client_bytes))
                .expect("read client handshake bytes");
            server
                .process_new_packets()
                .expect("process client handshake bytes");
        }

        let mut server_bytes = Vec::new();
        server
            .write_tls(&mut server_bytes)
            .expect("write server handshake bytes");
        if !server_bytes.is_empty() {
            client
                .read_tls(&mut Cursor::new(server_bytes))
                .expect("read server handshake bytes");
            client
                .process_new_packets()
                .expect("verify server handshake signature");
        }

        if !client.is_handshaking() && !server.is_handshaking() {
            break;
        }
    }

    assert!(!client.is_handshaking());
    assert!(!server.is_handshaking());
    assert_eq!(client.protocol_version(), Some(ProtocolVersion::TLSv1_2));
}

#[test]
fn tls_verifier_enforces_saved_spki_during_handshake() {
    let verifier = test_bambu_server_cert_verifier(TEST_PRINTER_SERIAL, Some(&matching_pin()))
        .expect("build pinned verifier");
    verify_test_certificate(
        verifier.as_ref(),
        TEST_PRINTER_SERIAL,
        test_verification_time(),
    )
    .expect("matching pin should pass handshake verification");

    let changed_pin = BambuTlsPin::new(
        TEST_PRINTER_SERIAL,
        TEST_CERTIFICATE_SHA256,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .expect("changed pin");
    let verifier = test_bambu_server_cert_verifier(TEST_PRINTER_SERIAL, Some(&changed_pin))
        .expect("build changed verifier");
    assert!(
        verify_test_certificate(
            verifier.as_ref(),
            TEST_PRINTER_SERIAL,
            test_verification_time()
        )
        .is_err(),
        "changed SPKI must abort the TLS handshake"
    );
}

#[test]
fn tls_verifier_rejects_wrong_serial_server_name_and_invalid_time() {
    let wrong_serial = "01ANOTHERPRINTER";
    let verifier =
        test_bambu_server_cert_verifier(wrong_serial, None).expect("build serial verifier");
    assert!(
        verify_test_certificate(verifier.as_ref(), wrong_serial, test_verification_time()).is_err(),
        "a certificate for another serial must be rejected"
    );

    let verifier = test_bambu_server_cert_verifier(TEST_PRINTER_SERIAL, None)
        .expect("build server-name verifier");
    assert!(
        verify_test_certificate(verifier.as_ref(), wrong_serial, test_verification_time()).is_err(),
        "the rustls server name must stay bound to the configured serial"
    );
    assert!(
        verify_test_certificate(
            verifier.as_ref(),
            TEST_PRINTER_SERIAL,
            UnixTime::since_unix_epoch(Duration::from_secs(1_700_000_000)),
        )
        .is_err(),
        "a not-yet-valid printer certificate must be rejected"
    );
    assert!(
        verify_test_certificate(
            verifier.as_ref(),
            TEST_PRINTER_SERIAL,
            UnixTime::since_unix_epoch(Duration::from_secs(2_500_000_000)),
        )
        .is_err(),
        "an expired printer certificate must be rejected"
    );
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
