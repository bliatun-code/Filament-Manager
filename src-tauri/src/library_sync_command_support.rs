use crate::library_sync_host_client::ensure_library_sync_host_matches;
use crate::library_sync_models::ValidateLibrarySyncHostInput;
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;

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
