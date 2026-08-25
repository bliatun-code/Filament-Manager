use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::companion_models::{
    FILAMENT_PRICE_STANDARDS_CAPABILITY, PURCHASE_RECEIPT_METADATA_CAPABILITY,
};
use crate::library_sync_host_client::ensure_library_sync_host_matches;
use crate::library_sync_models::ValidateLibrarySyncHostInput;
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;

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
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, CompanionHealthCheckResponse), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    Ok((normalized_base_url, health))
}

pub(crate) fn prepare_library_sync_host_checked(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    Ok((normalized_base_url, expected_library_id))
}

pub(crate) fn prepare_library_sync_host_read(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, CompanionHealthCheckResponse), String> {
    let (normalized_base_url, expected_library_id) = normalize_library_sync_host_input(input)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, expected_library_id)?;
    Ok((normalized_base_url, health))
}

pub(crate) fn trimmed_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|entry| !entry.is_empty())
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
    message: &str,
    device_name: Option<&str>,
) -> Result<(), String> {
    with_inventory(state, |engine| {
        engine.save_library_sync_validation_state(true, Some(message), device_name)
    })
}

pub(crate) fn save_library_sync_success_without_message(
    state: &AppState,
    device_name: Option<&str>,
) -> Result<(), String> {
    with_inventory(state, |engine| {
        engine.save_library_sync_validation_state(true, None, device_name)
    })
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_stable_local_library_sync_host, normalize_library_sync_base_url,
        purchase_receipt_metadata_has_values, require_host_filament_price_standards_capability,
        require_host_purchase_receipt_metadata_capability,
    };
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::companion_models::{
        FILAMENT_PRICE_STANDARDS_CAPABILITY, PURCHASE_RECEIPT_METADATA_CAPABILITY,
    };

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
}
