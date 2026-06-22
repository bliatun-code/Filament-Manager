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
pub(crate) fn update_library_sync_host_spool_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host spool weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/tare-weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host spool tare weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_details(
    state: tauri::State<'_, AppState>,
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

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/details"),
        &serde_json::Value::Object(payload),
    )?;

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host spool details updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_ownership(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolOwnershipInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/ownership"),
        &serde_json::json!({
            "ownership_type": input.ownership_type.trim(),
            "owner_name": trimmed_non_empty(input.owner_name.as_deref()),
            "owner_contact": trimmed_non_empty(input.owner_contact.as_deref()),
            "ownership_note": trimmed_non_empty(input.ownership_note.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host spool ownership updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolRfidTagInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/rfid"),
        &serde_json::json!({
            "rfid_tag": trimmed_non_empty(input.rfid_tag.as_deref()),
            "rfid_observed_at": trimmed_non_empty(input.rfid_observed_at.as_deref()),
        }),
    )?;

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host spool RFID updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateSpoolInput,
) -> Result<String, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let explicit_ownership_type = trimmed_non_empty(input.ownership_type.as_deref());
    let ownership_type = explicit_ownership_type.unwrap_or("OWNED").to_uppercase();

    let path = if ownership_type == "BORROWED_IN"
        || (explicit_ownership_type.is_none()
            && trimmed_non_empty(input.owner_name.as_deref()).is_some())
    {
        "/api/v1/spools/borrowed-in"
    } else if trimmed_non_empty(input.master_id.as_deref()).is_some() {
        "/api/v1/spools/owned"
    } else {
        "/api/v1/spools/manual"
    };

    let response: LibrarySyncCreateSpoolResponse = perform_library_sync_host_write_and_parse(
        &state,
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

    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, &response.message, None)?;

    Ok(response.spool_id)
}
