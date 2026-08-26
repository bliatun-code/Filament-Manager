use crate::backend::filament_database::{InventoryLocationMergeResult, InventoryLocationRow};
use crate::companion_models::INVENTORY_LOCATIONS_CAPABILITY;
use crate::inventory_location_models::{
    InventoryLocationListResponse, LibrarySyncCreateInventoryLocationInput,
    LibrarySyncInventoryLocationIdInput, LibrarySyncLocationTargetInput,
    LibrarySyncMergeInventoryLocationsInput, LibrarySyncRenameInventoryLocationInput,
};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_read,
    prepare_library_sync_host_write, save_library_sync_success,
};
use crate::library_sync_host_client::{
    get_library_sync_host_json_authenticated, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::LibrarySyncCacheTargetInput;
use crate::library_sync_target_guard::{
    capture_library_sync_target, with_current_library_sync_target, LibrarySyncTargetGuard,
};
use crate::state::AppState;

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
    let (base_url, health, target) = prepare_library_sync_host_read(state, &host_input)?;
    let advertised = host_supports_locations(&health.capabilities);
    match fetch_and_cache_locations(state, &base_url, &target) {
        Ok(cached) => {
            save_library_sync_success(
                state,
                &target,
                "Host location list refreshed.",
                health.device_name.as_deref(),
            )?;
            Ok(InventoryLocationListResponse {
                rows: cached.rows,
                mutations_supported: true,
                captured_at: Some(cached.captured_at),
            })
        }
        Err(error) if !advertised && is_missing_location_endpoint(&error) => {
            let cached = with_current_library_sync_target(state, &target, |engine| {
                engine.get_library_sync_cached_locations()
            })?;
            Ok(cached_location_response(cached))
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_locations(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCacheTargetInput,
) -> Result<Option<InventoryLocationListResponse>, String> {
    let target =
        capture_library_sync_target(&state, &input.base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.target_generation {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    let cached = with_current_library_sync_target(&state, &target, |engine| {
        engine.get_library_sync_cached_locations()
    })?;
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
    let (base_url, target) = prepare_location_write_target(
        state,
        &input.base_url,
        input.expected_library_id.as_deref(),
    )?;
    let row = location_write(
        state,
        &base_url,
        "/api/v1/locations",
        &serde_json::json!({ "name": input.name, "parent_id": input.parent_id }),
    )?;
    refresh_location_cache_best_effort(state, &base_url, &target);
    save_library_sync_success(state, &target, "Host location created.", None)?;
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
    let (base_url, target) = prepare_location_write_target(
        state,
        &input.base_url,
        input.expected_library_id.as_deref(),
    )?;
    let path = format!(
        "/api/v1/locations/{}/rename",
        encode_library_sync_path_segment(&input.location_id)
    );
    let row = location_write(
        state,
        &base_url,
        &path,
        &serde_json::json!({ "location_id": input.location_id, "name": input.name }),
    )?;
    refresh_location_cache_best_effort(state, &base_url, &target);
    save_library_sync_success(state, &target, "Host location renamed.", None)?;
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
    let (base_url, target) = prepare_location_write_target(
        state,
        &input.base_url,
        input.expected_library_id.as_deref(),
    )?;
    let path = format!(
        "/api/v1/locations/{}/{}",
        encode_library_sync_path_segment(&input.location_id),
        action
    );
    let row = location_write(
        state,
        &base_url,
        &path,
        &serde_json::json!({ "location_id": input.location_id }),
    )?;
    refresh_location_cache_best_effort(state, &base_url, &target);
    save_library_sync_success(state, &target, success_message, None)?;
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
    let (base_url, target) = prepare_location_write_target(
        state,
        &input.base_url,
        input.expected_library_id.as_deref(),
    )?;
    let result = location_write(
        state,
        &base_url,
        "/api/v1/locations/merge",
        &serde_json::json!({
            "source_id": input.source_id,
            "target_id": input.target_id,
        }),
    )?;
    refresh_location_cache_best_effort(state, &base_url, &target);
    save_library_sync_success(state, &target, "Host locations merged.", None)?;
    Ok(result)
}

fn prepare_location_write_target(
    state: &AppState,
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<(String, LibrarySyncTargetGuard), String> {
    let host_input = library_sync_host_input(base_url, expected_library_id);
    let (base_url, health, target) = prepare_library_sync_host_write(state, &host_input)?;
    if !host_supports_locations(&health.capabilities) {
        // Hosts released before the capability marker can still have the
        // collection endpoint. Probe that unambiguous route once before
        // deciding that the feature is genuinely absent; a per-resource 404
        // must remain a normal `common.not_found` domain error.
        match fetch_and_cache_locations(state, &base_url, &target) {
            Ok(_) => {}
            Err(error) if is_missing_location_endpoint(&error) => {
                return Err(legacy_location_host_error());
            }
            Err(error) => return Err(error),
        }
    }
    Ok((base_url, target))
}

fn location_write<T: serde::Serialize, R: serde::de::DeserializeOwned>(
    state: &AppState,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    perform_library_sync_host_write_and_parse(state, base_url, path, payload)
}

fn fetch_and_cache_locations(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) -> Result<crate::backend::filament_database::LibrarySyncCachedLocationListRow, String> {
    let rows: Vec<InventoryLocationRow> = get_library_sync_host_json_authenticated(
        state,
        base_url,
        "/api/v1/library/locations?include_archived=true",
    )?;
    with_current_library_sync_target(state, target, |engine| {
        engine.save_library_sync_cached_locations(&rows)
    })
}

fn refresh_location_cache_best_effort(
    state: &AppState,
    base_url: &str,
    target: &LibrarySyncTargetGuard,
) {
    let _ = fetch_and_cache_locations(state, base_url, target);
}

fn is_missing_location_endpoint(error: &str) -> bool {
    matches!(
        error,
        "Desktop sync read request returned 404 Not Found."
            | "Desktop sync write request returned 404 Not Found."
    )
}

fn host_supports_locations(capabilities: &[String]) -> bool {
    capabilities
        .iter()
        .any(|capability| capability == INVENTORY_LOCATIONS_CAPABILITY)
}

fn legacy_location_host_error() -> String {
    crate::app_error::coded_command_error("inventory.location.host_unsupported")
}

#[cfg(test)]
mod tests {
    use crate::backend::filament_database::{FilamentDatabase, LibrarySyncCachedLocationListRow};
    use crate::credential_store::CredentialStore;
    use crate::inventory_location_models::LibrarySyncInventoryLocationIdInput;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        cached_location_response, delete_library_sync_host_location_blocking,
        is_missing_location_endpoint,
    };
    use crate::library_sync_command_support::encode_library_sync_path_segment;

    struct FakeHostResponse {
        expected_request_line: &'static str,
        status: &'static str,
        body: String,
    }

    fn fake_health(capabilities: &[&str]) -> String {
        serde_json::json!({
            "ok": true,
            "api_version": "v1",
            "capabilities": capabilities,
            "auth_mode": "pairing-session",
            "access_mode": "trusted-lan",
            "library_id": "library-test",
            "device_name": "Fake Host",
            "sync_mode": "HOST",
        })
        .to_string()
    }

    fn spawn_fake_host(responses: Vec<FakeHostResponse>) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Host");
        let address = listener.local_addr().expect("read fake Host address");
        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept fake Host request");
                let mut request = [0_u8; 16 * 1024];
                let read = stream.read(&mut request).expect("read fake Host request");
                let request = String::from_utf8_lossy(&request[..read]);
                assert!(
                    request.starts_with(response.expected_request_line),
                    "unexpected fake Host request: {request}"
                );
                let wire = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response.status,
                    response.body.len(),
                    response.body,
                );
                stream
                    .write_all(wire.as_bytes())
                    .expect("write fake Host response");
            }
        });
        (format!("http://{address}"), handle)
    }

    fn test_state(base_url: &str) -> (AppState, std::path::PathBuf) {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-location-host-test-{}-{suffix}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open test database");
        db.apply_schema().expect("apply test schema");
        let mut settings = db.get_library_sync_settings().expect("load settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(base_url.to_string());
        settings.library_id = "library-test".to_string();
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
        state
            .library_sync_auth
            .replace_authenticated(base_url, "session", "csrf", "device")
            .expect("seed fake Host authentication");
        (state, db_path)
    }

    fn delete_input(base_url: &str) -> LibrarySyncInventoryLocationIdInput {
        LibrarySyncInventoryLocationIdInput {
            base_url: base_url.to_string(),
            expected_library_id: Some("library-test".to_string()),
            location_id: "location-missing".to_string(),
        }
    }

    #[test]
    fn legacy_ids_are_safely_encoded_and_only_404_marks_missing_capability() {
        assert_eq!(
            encode_library_sync_path_segment(" Shelf A/Top "),
            "Shelf%20A%2FTop"
        );
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

    #[test]
    fn modern_location_not_found_envelope_is_forwarded_unchanged() {
        let (base_url, server) = spawn_fake_host(vec![
            FakeHostResponse {
                expected_request_line: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: fake_health(&["inventory-locations-v1"]),
            },
            FakeHostResponse {
                expected_request_line: "POST /api/v1/locations/location-missing/delete HTTP/1.1",
                status: "404 Not Found",
                body: serde_json::json!({
                    "ok": false,
                    "code": "common.not_found",
                    "message": "internal detail must not cross the boundary",
                    "safe_detail": null,
                    "diagnostic_id": "fm-location-404",
                })
                .to_string(),
            },
        ]);
        let (state, db_path) = test_state(&base_url);

        let error = delete_library_sync_host_location_blocking(&state, delete_input(&base_url))
            .expect_err("missing modern location must fail");
        server.join().expect("join fake Host");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("structured error");
        assert_eq!(envelope["code"], "common.not_found");
        assert_eq!(envelope["diagnostic_id"], "fm-location-404");
        assert!(envelope.get("message").is_none());
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn modern_location_reference_error_is_forwarded_instead_of_marked_legacy() {
        let (base_url, server) = spawn_fake_host(vec![
            FakeHostResponse {
                expected_request_line: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: fake_health(&["inventory-locations-v1"]),
            },
            FakeHostResponse {
                expected_request_line: "POST /api/v1/locations/location-missing/delete HTTP/1.1",
                status: "400 Bad Request",
                body: serde_json::json!({
                    "ok": false,
                    "code": "inventory.location.has_references",
                    "safe_detail": "Move linked spools first.",
                    "diagnostic_id": "fm-location-400",
                })
                .to_string(),
            },
        ]);
        let (state, db_path) = test_state(&base_url);

        let error = delete_library_sync_host_location_blocking(&state, delete_input(&base_url))
            .expect_err("referenced modern location must fail");
        server.join().expect("join fake Host");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("structured error");
        assert_eq!(envelope["code"], "inventory.location.has_references");
        assert_eq!(envelope["safe_detail"], "Move linked spools first.");
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn legacy_host_missing_location_collection_fails_closed_before_resource_write() {
        let (base_url, server) = spawn_fake_host(vec![
            FakeHostResponse {
                expected_request_line: "GET /api/v1/health HTTP/1.1",
                status: "200 OK",
                body: fake_health(&[]),
            },
            FakeHostResponse {
                expected_request_line:
                    "GET /api/v1/library/locations?include_archived=true HTTP/1.1",
                status: "404 Not Found",
                body: String::new(),
            },
        ]);
        let (state, db_path) = test_state(&base_url);

        let error = delete_library_sync_host_location_blocking(&state, delete_input(&base_url))
            .expect_err("legacy Host must reject location management");
        server.join().expect("join fake Host");
        let envelope: serde_json::Value = serde_json::from_str(&error).expect("structured error");
        assert_eq!(envelope["code"], "inventory.location.host_unsupported");
        let _ = std::fs::remove_file(db_path);
    }
}
