use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::companion_models::{
    FILAMENT_PRICE_STANDARDS_CAPABILITY, PURCHASE_RECEIPT_METADATA_CAPABILITY,
};
use crate::library_sync_host_client::ensure_library_sync_host_matches;
use crate::library_sync_models::ValidateLibrarySyncHostInput;
use crate::library_sync_target_guard::{
    capture_library_sync_target, with_current_library_sync_target, LibrarySyncTargetGuard,
};
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;

pub(crate) fn normalize_library_sync_host_input(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    let normalized_base_url = normalize_library_sync_base_url(&input.base_url)?;
    let expected_library_id = input
        .expected_library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok((normalized_base_url, expected_library_id))
}

pub(crate) fn normalize_library_sync_base_url(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Host URL is required.".to_string());
    }
    let mut parsed =
        url::Url::parse(value).map_err(|error| format!("Host URL is invalid: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Host URL must use http:// or https://.".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("Host URL is missing a hostname.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Host URL must not contain embedded credentials.".to_string());
    }
    if parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Host URL must not contain a path, query or fragment.".to_string());
    }

    parsed.set_path("");
    let normalized = parsed.as_str().trim_end_matches('/').to_string();
    Ok(normalized)
}

pub(crate) fn ensure_stable_local_library_sync_host(base_url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(base_url)
        .map_err(|_| "Pairing requires the host's stable local Companion address.".to_string())?;
    if parsed
        .host_str()
        .is_some_and(|hostname| hostname.to_ascii_lowercase().ends_with(".local"))
    {
        Ok(())
    } else {
        Err("Pairing requires the host's stable local Companion address.".to_string())
    }
}

pub(crate) fn library_sync_host_input(
    base_url: &str,
    expected_library_id: Option<&str>,
) -> ValidateLibrarySyncHostInput {
    ValidateLibrarySyncHostInput {
        base_url: base_url.to_string(),
        expected_library_id: expected_library_id.map(str::to_string),
    }
}

pub(crate) fn prepare_library_sync_host_write(
    state: &AppState,
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, CompanionHealthCheckResponse, LibrarySyncTargetGuard), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    let target = capture_library_sync_target(state, &normalized_base_url, expected_library_id)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, Some(target.library_id()))?;
    Ok((normalized_base_url, health, target))
}

pub(crate) fn prepare_library_sync_host_checked<'a>(
    state: &AppState,
    input: &'a ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&'a str>, LibrarySyncTargetGuard), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    let target = capture_library_sync_target(state, &normalized_base_url, expected_library_id)?;
    ensure_library_sync_host_matches(&normalized_base_url, Some(target.library_id()))?;
    Ok((normalized_base_url, expected_library_id, target))
}

pub(crate) fn prepare_library_sync_host_read(
    state: &AppState,
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, CompanionHealthCheckResponse, LibrarySyncTargetGuard), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    let target = capture_library_sync_target(state, &normalized_base_url, expected_library_id)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, Some(target.library_id()))?;
    Ok((normalized_base_url, health, target))
}

pub(crate) fn trimmed_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|entry| !entry.is_empty())
}

/// Percent-encodes one untrusted identifier for use as exactly one URL path segment.
///
/// Library IDs predate the HTTP sync API and may contain characters such as `/`, `?`, `#`,
/// `%`, or non-ASCII text. Interpolating those values directly can silently change the route or
/// query. Encode their UTF-8 bytes according to the RFC 3986 unreserved set so the Companion
/// router receives the original identifier as one decoded segment.
pub(crate) fn encode_library_sync_path_segment(value: &str) -> String {
    let mut output = String::new();
    for byte in value.trim().bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            output.push(char::from(byte));
        } else {
            use std::fmt::Write as _;
            write!(&mut output, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    output
}

pub(crate) fn purchase_receipt_metadata_has_values(metadata: &PurchaseReceiptMetadata) -> bool {
    metadata.purchase_price.is_some()
        || trimmed_non_empty(metadata.purchase_currency.as_deref()).is_some()
        || trimmed_non_empty(metadata.purchase_date.as_deref()).is_some()
        || trimmed_non_empty(metadata.batch_code.as_deref()).is_some()
        || trimmed_non_empty(metadata.supplier_reference.as_deref()).is_some()
}

pub(crate) fn require_host_purchase_receipt_metadata_capability(
    capabilities: &[String],
    requested: bool,
) -> Result<(), String> {
    if !requested
        || capabilities
            .iter()
            .any(|capability| capability == PURCHASE_RECEIPT_METADATA_CAPABILITY)
    {
        return Ok(());
    }

    Err(crate::app_error::coded_command_error(
        "purchase_metadata.host_unsupported",
    ))
}

pub(crate) fn require_host_filament_price_standards_capability(
    capabilities: &[String],
    requested: bool,
) -> Result<(), String> {
    if !requested
        || capabilities
            .iter()
            .any(|capability| capability == FILAMENT_PRICE_STANDARDS_CAPABILITY)
    {
        return Ok(());
    }

    Err(crate::app_error::coded_command_error(
        "filament_standards.host_unsupported",
    ))
}

pub(crate) fn save_library_sync_success(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
    message: &str,
    device_name: Option<&str>,
) -> Result<(), String> {
    with_current_library_sync_target(state, target, |engine| {
        engine.save_library_sync_validation_state(true, Some(message), device_name)
    })
}

pub(crate) fn save_library_sync_success_without_message(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
    device_name: Option<&str>,
) -> Result<(), String> {
    with_current_library_sync_target(state, target, |engine| {
        engine.save_library_sync_validation_state(true, None, device_name)
    })
}

#[cfg(test)]
mod tests {
    use super::{
        encode_library_sync_path_segment, ensure_stable_local_library_sync_host,
        normalize_library_sync_base_url, prepare_library_sync_host_read,
        prepare_library_sync_host_write, purchase_receipt_metadata_has_values,
        require_host_filament_price_standards_capability,
        require_host_purchase_receipt_metadata_capability,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::companion_models::{
        FILAMENT_PRICE_STANDARDS_CAPABILITY, PURCHASE_RECEIPT_METADATA_CAPABILITY,
    };
    use crate::credential_store::CredentialStore;
    use crate::library_sync_models::ValidateLibrarySyncHostInput;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn host_url_is_canonical_and_rejects_credential_leak_surfaces() {
        assert_eq!(
            normalize_library_sync_base_url(" HTTP://Host.Local:4278/ ").expect("valid host"),
            "http://host.local:4278"
        );
        assert_eq!(
            normalize_library_sync_base_url("https://[::1]:4278/").expect("valid IPv6 host"),
            "https://[::1]:4278"
        );
        for invalid in [
            "ftp://host.local",
            "http://user:password@host.local",
            "http://host.local/companion",
            "http://host.local?token=value",
            "http://host.local#fragment",
        ] {
            assert!(
                normalize_library_sync_base_url(invalid).is_err(),
                "{invalid} must be rejected"
            );
        }
    }

    #[test]
    fn legacy_identifiers_are_encoded_as_exactly_one_path_segment() {
        assert_eq!(
            encode_library_sync_path_segment(" legacy/id ?#% "),
            "legacy%2Fid%20%3F%23%25"
        );
        assert_eq!(
            encode_library_sync_path_segment("Lager Ångström"),
            "Lager%20%C3%85ngstr%C3%B6m"
        );
    }

    #[test]
    fn new_pairings_require_a_stable_local_hostname() {
        assert!(ensure_stable_local_library_sync_host(
            "http://filament-manager-0123456789abcdef01234567.local:4278"
        )
        .is_ok());
        for invalid in [
            "http://192.168.1.50:4278",
            "http://filament-manager.local.evil:4278",
            "http://[::1]:4278",
        ] {
            assert!(
                ensure_stable_local_library_sync_host(invalid).is_err(),
                "{invalid} must be rejected for new pairings"
            );
        }
    }

    #[test]
    fn legacy_hosts_only_reject_meaningful_receipt_metadata() {
        assert!(!purchase_receipt_metadata_has_values(
            &PurchaseReceiptMetadata::default()
        ));
        assert!(!purchase_receipt_metadata_has_values(
            &PurchaseReceiptMetadata {
                purchase_currency: Some("  ".to_string()),
                purchase_date: Some("".to_string()),
                batch_code: Some("  ".to_string()),
                supplier_reference: Some("".to_string()),
                ..Default::default()
            }
        ));
        assert!(purchase_receipt_metadata_has_values(
            &PurchaseReceiptMetadata {
                purchase_price: Some(0.0),
                ..Default::default()
            }
        ));

        assert!(require_host_purchase_receipt_metadata_capability(&[], false).is_ok());
        let error = require_host_purchase_receipt_metadata_capability(&[], true)
            .expect_err("metadata must fail closed for a legacy Host");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("coded error");
        assert_eq!(envelope["code"], "purchase_metadata.host_unsupported");
        assert!(require_host_purchase_receipt_metadata_capability(
            &[PURCHASE_RECEIPT_METADATA_CAPABILITY.to_string()],
            true,
        )
        .is_ok());
    }

    #[test]
    fn filament_standards_requests_fail_closed_for_legacy_hosts() {
        assert!(require_host_filament_price_standards_capability(&[], false).is_ok());
        let error = require_host_filament_price_standards_capability(&[], true)
            .expect_err("filament standards must fail closed for a legacy Host");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("coded error");
        assert_eq!(envelope["code"], "filament_standards.host_unsupported");
        assert!(require_host_filament_price_standards_capability(
            &[FILAMENT_PRICE_STANDARDS_CAPABILITY.to_string()],
            true,
        )
        .is_ok());
    }

    #[test]
    fn active_client_operations_bind_health_to_configured_library_when_input_omits_expected_id() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mismatched Host");
        let address = listener.local_addr().expect("read mismatched Host address");
        let server = thread::spawn(move || {
            let mut request_lines = Vec::new();
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept Host health request");
                let mut request = [0_u8; 4096];
                let read = stream.read(&mut request).expect("read Host health request");
                let request = String::from_utf8_lossy(&request[..read]);
                request_lines.push(request.lines().next().unwrap_or_default().to_string());
                let body = json!({
                    "ok": true,
                    "api_version": "v1",
                    "capabilities": [],
                    "auth_mode": "pairing-session",
                    "access_mode": "trusted-lan",
                    "library_id": "library-b",
                    "device_name": "Wrong Library Host",
                    "sync_mode": "HOST",
                })
                .to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body,
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("write Host health response");
            }
            request_lines
        });
        let base_url = format!("http://{address}");

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-library-target-health-{}-{suffix}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open Client database");
        db.apply_schema().expect("apply Client schema");
        let mut settings = db
            .get_library_sync_settings()
            .expect("load Client settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(base_url.clone());
        settings.library_id = "library-a".to_string();
        db.save_library_sync_settings(&settings)
            .expect("save Client target");
        drop(db);
        let state = AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        let input = ValidateLibrarySyncHostInput {
            base_url,
            expected_library_id: None,
        };

        let read_error = prepare_library_sync_host_read(&state, &input)
            .err()
            .expect("read must reject a different remote library");
        let write_error = prepare_library_sync_host_write(&state, &input)
            .err()
            .expect("write must reject a different remote library");
        assert!(read_error.contains("different library"), "{read_error}");
        assert!(write_error.contains("different library"), "{write_error}");

        let request_lines = server.join().expect("join mismatched Host");
        assert_eq!(
            request_lines,
            vec![
                "GET /api/v1/health HTTP/1.1".to_string(),
                "GET /api/v1/health HTTP/1.1".to_string(),
            ],
            "identity mismatch must stop before any protected GET or POST",
        );
        let db = FilamentDatabase::open(&db_path).expect("reopen Client database");
        let settings = db
            .get_library_sync_settings()
            .expect("reload Client settings");
        assert!(settings.cached_snapshot.is_none());
        assert!(settings.cached_spools.is_none());
        assert!(settings.cached_printers.is_none());
        assert!(settings.cached_loans.is_none());
        assert!(settings.cached_consumption.is_none());
        assert!(settings.cached_wishlist.is_none());
        drop(db);
        let _ = std::fs::remove_file(db_path);
    }
}
