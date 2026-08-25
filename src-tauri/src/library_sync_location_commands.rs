use crate::backend::filament_database::{InventoryLocationMergeResult, InventoryLocationRow};
use crate::inventory_location_models::{
    InventoryLocationListResponse, LibrarySyncCreateInventoryLocationInput,
    LibrarySyncInventoryLocationIdInput, LibrarySyncLocationTargetInput,
    LibrarySyncMergeInventoryLocationsInput, LibrarySyncRenameInventoryLocationInput,
};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_read, prepare_library_sync_host_write,
    save_library_sync_success,
};
use crate::library_sync_host_client::{
    get_library_sync_host_json_authenticated, perform_library_sync_host_write_and_parse,
};
use crate::state::AppState;
use crate::with_db;

const LEGACY_LOCATION_HOST_ERROR: &str =
    "The Host does not support location objects. Upgrade the Host before changing locations.";

#[tauri::command]
pub(crate) async fn fetch_library_sync_locations(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncLocationTargetInput,
) -> Result<InventoryLocationListResponse, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_locations_blocking(&state, input)).await
}

fn fetch_library_sync_locations_blocking(
    state: &AppState,
    input: LibrarySyncLocationTargetInput,
) -> Result<InventoryLocationListResponse, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (base_url, health) = prepare_library_sync_host_read(&host_input)?;
    match fetch_and_cache_locations(state, &base_url) {
        Ok(cached) => {
            save_library_sync_success(
                state,
                "Host location list refreshed.",
                health.device_name.as_deref(),
            )?;
            Ok(InventoryLocationListResponse {
                rows: cached.rows,
                mutations_supported: true,
                captured_at: Some(cached.captured_at),
            })
        }
        Err(error) if is_missing_location_endpoint(&error) => {
            let cached = with_db(state, |db| db.get_library_sync_cached_locations())?;
            Ok(cached_location_response(cached))
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_locations(
    state: tauri::State<'_, AppState>,
) -> Result<Option<InventoryLocationListResponse>, String> {
    let cached = with_db(&state, |db| db.get_library_sync_cached_locations())?;
    Ok(cached.map(|cached| cached_location_response(Some(cached))))
}

fn cached_location_response(
    cached: Option<crate::backend::filament_database::LibrarySyncCachedLocationListRow>,
) -> InventoryLocationListResponse {
    InventoryLocationListResponse {
        rows: cached
            .as_ref()
            .map(|value| value.rows.clone())
            .unwrap_or_default(),
        // Cache proves only that rows were fetched previously, never that the
        // currently reachable Host supports or can accept mutations.
        mutations_supported: false,
        captured_at: cached.map(|value| value.captured_at),
    }
}

#[tauri::command]
pub(crate) async fn create_library_sync_host_location(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || create_library_sync_host_location_blocking(&state, input))
        .await
}

fn create_library_sync_host_location_blocking(
    state: &AppState,
    input: LibrarySyncCreateInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    let base_url =
        prepare_location_write_target(&input.base_url, input.expected_library_id.as_deref())?;
    let row = location_write(
        state,
        &base_url,
        "/api/v1/locations",
        &serde_json::json!({ "name": input.name, "parent_id": input.parent_id }),
    )?;
    refresh_location_cache_best_effort(state, &base_url);
    save_library_sync_success(state, "Host location created.", None)?;
    Ok(row)
}

#[tauri::command]
pub(crate) async fn rename_library_sync_host_location(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRenameInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || rename_library_sync_host_location_blocking(&state, input))
        .await
}

fn rename_library_sync_host_location_blocking(
    state: &AppState,
    input: LibrarySyncRenameInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    let base_url =
        prepare_location_write_target(&input.base_url, input.expected_library_id.as_deref())?;
    let path = format!(
        "/api/v1/locations/{}/rename",
        encode_path_segment(&input.location_id)
    );
    let row = location_write(
        state,
        &base_url,
        &path,
        &serde_json::json!({ "location_id": input.location_id, "name": input.name }),
    )?;
    refresh_location_cache_best_effort(state, &base_url);
    save_library_sync_success(state, "Host location renamed.", None)?;
    Ok(row)
}

#[tauri::command]
pub(crate) async fn archive_library_sync_host_location(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || archive_library_sync_host_location_blocking(&state, input))
        .await
}

fn archive_library_sync_host_location_blocking(
    state: &AppState,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    location_id_write_blocking(state, input, "archive", "Host location archived.")
}

#[tauri::command]
pub(crate) async fn restore_library_sync_host_location(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || restore_library_sync_host_location_blocking(&state, input))
        .await
}

fn restore_library_sync_host_location_blocking(
    state: &AppState,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    location_id_write_blocking(state, input, "restore", "Host location restored.")
}

#[tauri::command]
pub(crate) async fn delete_library_sync_host_location(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || delete_library_sync_host_location_blocking(&state, input))
        .await
}

fn delete_library_sync_host_location_blocking(
    state: &AppState,
    input: LibrarySyncInventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    location_id_write_blocking(state, input, "delete", "Host location deleted.")
}

fn location_id_write_blocking(
    state: &AppState,
    input: LibrarySyncInventoryLocationIdInput,
    action: &'static str,
    success_message: &'static str,
) -> Result<InventoryLocationRow, String> {
    let base_url =
        prepare_location_write_target(&input.base_url, input.expected_library_id.as_deref())?;
    let path = format!(
        "/api/v1/locations/{}/{}",
        encode_path_segment(&input.location_id),
        action
    );
    let row = location_write(
        state,
        &base_url,
        &path,
        &serde_json::json!({ "location_id": input.location_id }),
    )?;
    refresh_location_cache_best_effort(state, &base_url);
    save_library_sync_success(state, success_message, None)?;
    Ok(row)
}

#[tauri::command]
pub(crate) async fn merge_library_sync_host_locations(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncMergeInventoryLocationsInput,
) -> Result<InventoryLocationMergeResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || merge_library_sync_host_locations_blocking(&state, input))
        .await
}

fn merge_library_sync_host_locations_blocking(
    state: &AppState,
    input: LibrarySyncMergeInventoryLocationsInput,
) -> Result<InventoryLocationMergeResult, String> {
    let base_url =
        prepare_location_write_target(&input.base_url, input.expected_library_id.as_deref())?;
    let result = location_write(
        state,
        &base_url,
        "/api/v1/locations/merge",
        &serde_json::json!({
            "source_id": input.source_id,
            "target_id": input.target_id,
        }),
    )?;
    refresh_location_cache_best_effort(state, &base_url);
    save_library_sync_success(state, "Host locations merged.", None)?;
    Ok(result)
}

fn prepare_location_write_target(
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<String, String> {
    let host_input = library_sync_host_input(base_url, expected_library_id);
    prepare_library_sync_host_write(&host_input).map(|(base_url, _)| base_url)
}

fn location_write<T: serde::Serialize, R: serde::de::DeserializeOwned>(
    state: &AppState,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    perform_library_sync_host_write_and_parse(state, base_url, path, payload).map_err(|error| {
        if is_missing_location_endpoint(&error) {
            LEGACY_LOCATION_HOST_ERROR.to_string()
        } else {
            error
        }
    })
}

fn fetch_and_cache_locations(
    state: &AppState,
    base_url: &str,
) -> Result<crate::backend::filament_database::LibrarySyncCachedLocationListRow, String> {
    let rows: Vec<InventoryLocationRow> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/locations?include_archived=true",
    )?;
    with_db(state, |db| db.save_library_sync_cached_locations(&rows))
}

fn refresh_location_cache_best_effort(state: &AppState, base_url: &str) {
    let _ = fetch_and_cache_locations(state, base_url);
}

fn is_missing_location_endpoint(error: &str) -> bool {
    error.contains("404 Not Found")
}

fn encode_path_segment(value: &str) -> String {
    let mut output = String::new();
    for byte in value.trim().bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            output.push(char::from(byte));
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use crate::backend::filament_database::LibrarySyncCachedLocationListRow;

    use super::{cached_location_response, encode_path_segment, is_missing_location_endpoint};

    #[test]
    fn legacy_ids_are_safely_encoded_and_only_404_marks_missing_capability() {
        assert_eq!(encode_path_segment(" Shelf A/Top "), "Shelf%20A%2FTop");
        assert!(is_missing_location_endpoint(
            "Desktop sync write request returned 404 Not Found."
        ));
        assert!(!is_missing_location_endpoint(
            "Desktop sync write request returned 500 Internal Server Error."
        ));
    }

    #[test]
    fn restart_cache_is_fail_closed_even_when_rows_came_from_a_modern_host() {
        let response = cached_location_response(Some(LibrarySyncCachedLocationListRow {
            captured_at: "2026-08-21 12:00:00".to_string(),
            rows: Vec::new(),
        }));

        assert!(!response.mutations_supported);
        assert_eq!(response.captured_at.as_deref(), Some("2026-08-21 12:00:00"));
    }
}
