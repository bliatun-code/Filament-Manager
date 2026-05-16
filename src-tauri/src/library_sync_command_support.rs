use crate::library_sync_models::ValidateLibrarySyncHostInput;
use crate::library_sync_host_client::ensure_library_sync_host_matches;
use crate::trusted_lan_commands::CompanionHealthCheckResponse;

pub(crate) fn normalize_library_sync_host_input(
    input: &ValidateLibrarySyncHostInput,
) -> Result<(String, Option<&str>), String> {
    let normalized_base_url = input.base_url.trim().trim_end_matches('/').to_string();
    if normalized_base_url.is_empty() {
        return Err("Host URL is required.".to_string());
    }
    let expected_library_id = input
        .expected_library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok((normalized_base_url, expected_library_id))
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
