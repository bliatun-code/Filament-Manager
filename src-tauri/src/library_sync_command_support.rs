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
) -> Result<(String, Option<&str>), String> {
    prepare_library_sync_host_checked(input)
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

pub(crate) fn save_library_sync_success(
    state: &tauri::State<'_, AppState>,
    message: &str,
    device_name: Option<&str>,
) -> Result<(), String> {
    with_inventory(state, |engine| {
        engine.save_library_sync_validation_state(true, Some(message), device_name)
    })
}

#[cfg(test)]
mod tests {
    use super::normalize_library_sync_base_url;

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
}
