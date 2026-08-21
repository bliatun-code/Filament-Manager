use crate::backend::inventory_domain::OwnershipType;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::refresh_library_sync_spool_cache;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::{
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::{
    LibrarySyncCreateSpoolInput, LibrarySyncCreateSpoolResponse,
    LibrarySyncUpdateSpoolDetailsInput, LibrarySyncUpdateSpoolOwnershipInput,
    LibrarySyncUpdateSpoolRfidTagInput, LibrarySyncWeightWriteInput,
};
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn update_library_sync_host_spool_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || update_library_sync_host_spool_weight_blocking(&state, input))
        .await
}

fn update_library_sync_host_spool_weight_blocking(
    state: &AppState,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host spool weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_spool_tare_weight_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_spool_tare_weight_blocking(
    state: &AppState,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/tare-weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host spool tare weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_spool_details(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolDetailsInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_spool_details_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_spool_details_blocking(
    state: &AppState,
    input: LibrarySyncUpdateSpoolDetailsInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let mut payload = serde_json::Map::new();
    payload.insert(
        "qr_code".to_string(),
        serde_json::json!(trimmed_non_empty(input.qr_code.as_deref())),
    );
    payload.insert("status".to_string(), serde_json::json!(input.status.trim()));
    if let Some(value) = input.location.as_update() {
        payload.insert(
            "location".to_string(),
            serde_json::json!(trimmed_non_empty(value.map(String::as_str))),
        );
    }
    if let Some(value) = input.home_location.as_update() {
        payload.insert(
            "home_location".to_string(),
            serde_json::json!(trimmed_non_empty(value.map(String::as_str))),
        );
    }
    if let Some(grams) = input.spool_tare_weight_g {
        payload.insert("spool_tare_weight_g".to_string(), serde_json::json!(grams));
    }
    if let Some(ownership) = input.ownership {
        payload.insert(
            "ownership".to_string(),
            serde_json::json!({
                "ownership_type": ownership.ownership_type,
                "owner_name": trimmed_non_empty(ownership.owner_name.as_deref()),
                "owner_contact": trimmed_non_empty(ownership.owner_contact.as_deref()),
                "ownership_note": trimmed_non_empty(ownership.ownership_note.as_deref()),
            }),
        );
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/details"),
        &serde_json::Value::Object(payload),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host spool details updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_spool_ownership(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolOwnershipInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_spool_ownership_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_spool_ownership_blocking(
    state: &AppState,
    input: LibrarySyncUpdateSpoolOwnershipInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/ownership"),
        &serde_json::json!({
            "ownership_type": input.ownership_type.trim(),
            "owner_name": trimmed_non_empty(input.owner_name.as_deref()),
            "owner_contact": trimmed_non_empty(input.owner_contact.as_deref()),
            "ownership_note": trimmed_non_empty(input.ownership_note.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host spool ownership updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolRfidTagInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_spool_rfid_tag_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_spool_rfid_tag_blocking(
    state: &AppState,
    input: LibrarySyncUpdateSpoolRfidTagInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/rfid"),
        &serde_json::json!({
            "rfid_tag": trimmed_non_empty(input.rfid_tag.as_deref()),
            "rfid_observed_at": trimmed_non_empty(input.rfid_observed_at.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, "Host spool RFID updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn create_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateSpoolInput,
) -> Result<String, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || create_library_sync_host_spool_blocking(&state, input)).await
}

fn create_library_sync_host_spool_blocking(
    state: &AppState,
    input: LibrarySyncCreateSpoolInput,
) -> Result<String, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let path = library_sync_create_spool_path(
        input.ownership_type.as_deref(),
        input.master_id.as_deref(),
        input.owner_name.as_deref(),
    );

    let response: LibrarySyncCreateSpoolResponse = perform_library_sync_host_write_and_parse(
        state,
        &normalized_base_url,
        path,
        &serde_json::json!({
            "master_id": trimmed_non_empty(input.master_id.as_deref()),
            "material": trimmed_non_empty(input.material.as_deref()),
            "filament_name": trimmed_non_empty(input.filament_name.as_deref()),
            "color_name": trimmed_non_empty(input.color_name.as_deref()),
            "vendor": trimmed_non_empty(input.vendor.as_deref()),
            "initial_weight_g": input.initial_weight_g,
            "location": trimmed_non_empty(input.location.as_deref()),
            "hex_color": trimmed_non_empty(input.hex_color.as_deref()),
            "owner_name": trimmed_non_empty(input.owner_name.as_deref()),
            "owner_contact": trimmed_non_empty(input.owner_contact.as_deref()),
            "ownership_note": trimmed_non_empty(input.ownership_note.as_deref()),
        }),
    )?;
    if !response.ok {
        return Err(response.message);
    }

    refresh_library_sync_spool_cache(state, &normalized_base_url);
    save_library_sync_success(state, &response.message, None)?;

    Ok(response.spool_id)
}

fn library_sync_create_spool_path(
    ownership_type: Option<&str>,
    master_id: Option<&str>,
    owner_name: Option<&str>,
) -> &'static str {
    let explicit_ownership_type = trimmed_non_empty(ownership_type);
    let normalized_ownership =
        explicit_ownership_type.map(|raw| OwnershipType::from_raw(Some(raw)));

    if normalized_ownership == Some(OwnershipType::BorrowedIn)
        || (explicit_ownership_type.is_none() && trimmed_non_empty(owner_name).is_some())
    {
        "/api/v1/spools/borrowed-in"
    } else if trimmed_non_empty(master_id).is_some() {
        "/api/v1/spools/owned"
    } else {
        "/api/v1/spools/manual"
    }
}

#[cfg(test)]
mod tests {
    use super::library_sync_create_spool_path;

    #[test]
    fn library_sync_create_spool_path_uses_domain_ownership_tokens() {
        assert_eq!(
            library_sync_create_spool_path(Some("borrowed-in"), Some("master_1"), None),
            "/api/v1/spools/borrowed-in"
        );
        assert_eq!(
            library_sync_create_spool_path(None, Some("master_1"), Some("Ada")),
            "/api/v1/spools/borrowed-in"
        );
        assert_eq!(
            library_sync_create_spool_path(Some("owned"), Some("master_1"), Some("Ada")),
            "/api/v1/spools/owned"
        );
        assert_eq!(
            library_sync_create_spool_path(None, Some("master_1"), None),
            "/api/v1/spools/owned"
        );
        assert_eq!(
            library_sync_create_spool_path(None, None, None),
            "/api/v1/spools/manual"
        );
    }
}
