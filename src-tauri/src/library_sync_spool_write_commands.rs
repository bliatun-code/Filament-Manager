use crate::backend::inventory_domain::OwnershipType;
use crate::backend::inventory_engine::UpdateSpoolDetailsInput;
use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::refresh_library_sync_spool_cache;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write,
    require_host_purchase_receipt_metadata_capability, save_library_sync_success,
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
use crate::optional_update::OptionalUpdate;
use crate::state::AppState;

struct HostSpoolDetailsOwnership {
    ownership_type: String,
    owner_name: Option<String>,
    owner_contact: Option<String>,
    ownership_note: Option<String>,
}

struct HostSpoolDetailsUpdate {
    spool_id: String,
    qr_code: Option<String>,
    status: String,
    location: OptionalUpdate<String>,
    home_location: OptionalUpdate<String>,
    spool_tare_weight_g: Option<i64>,
    ownership: Option<HostSpoolDetailsOwnership>,
    purchase_metadata: Option<PurchaseReceiptMetadata>,
}

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
    let base_url = input.base_url.clone();
    let expected_library_id = input.expected_library_id.clone();
    update_library_sync_host_spool_details_for_target(
        state,
        &base_url,
        expected_library_id.as_deref(),
        HostSpoolDetailsUpdate {
            spool_id: input.spool_id,
            qr_code: input.qr_code,
            status: input.status,
            location: input.location,
            home_location: input.home_location,
            spool_tare_weight_g: input.spool_tare_weight_g,
            ownership: input.ownership.map(|ownership| HostSpoolDetailsOwnership {
                ownership_type: ownership.ownership_type,
                owner_name: ownership.owner_name,
                owner_contact: ownership.owner_contact,
                ownership_note: ownership.ownership_note,
            }),
            purchase_metadata: input.purchase_metadata,
        },
    )
}

pub(crate) fn update_active_library_host_spool_details_blocking(
    state: &AppState,
    base_url: &str,
    expected_library_id: &str,
    input: UpdateSpoolDetailsInput,
) -> Result<(), String> {
    update_library_sync_host_spool_details_for_target(
        state,
        base_url,
        Some(expected_library_id),
        host_spool_details_update_from_active_input(input),
    )
}

fn host_spool_details_update_from_active_input(
    input: UpdateSpoolDetailsInput,
) -> HostSpoolDetailsUpdate {
    HostSpoolDetailsUpdate {
        spool_id: input.spool_id,
        qr_code: input.qr_code,
        status: input.status,
        // The local atomic command has always treated an omitted/null location as
        // an explicit clear, so the gateway preserves that behavior for Host writes.
        location: OptionalUpdate::Set(input.location),
        home_location: match input.home_location {
            Some(value) => OptionalUpdate::Set(value),
            None => OptionalUpdate::Unset,
        },
        spool_tare_weight_g: input.spool_tare_weight_g,
        ownership: input.ownership.map(|ownership| HostSpoolDetailsOwnership {
            ownership_type: ownership.ownership_type,
            owner_name: ownership.owner_name,
            owner_contact: ownership.owner_contact,
            ownership_note: ownership.ownership_note,
        }),
        purchase_metadata: input.purchase_metadata,
    }
}

fn update_library_sync_host_spool_details_for_target(
    state: &AppState,
    base_url: &str,
    expected_library_id: Option<&str>,
    input: HostSpoolDetailsUpdate,
) -> Result<(), String> {
    let host_input = library_sync_host_input(base_url, expected_library_id);
    let (normalized_base_url, health) = prepare_library_sync_host_write(&host_input)?;
    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let payload = host_spool_details_payload_for_capabilities(&input, &health.capabilities)?;

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

fn host_spool_details_payload(
    input: &HostSpoolDetailsUpdate,
) -> serde_json::Map<String, serde_json::Value> {
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
    if let Some(ownership) = input.ownership.as_ref() {
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
    if let Some(purchase_metadata) = input.purchase_metadata.as_ref() {
        payload.insert(
            "purchase_metadata".to_string(),
            serde_json::json!(purchase_metadata),
        );
    }

    payload
}

fn host_spool_details_payload_for_capabilities(
    input: &HostSpoolDetailsUpdate,
    capabilities: &[String],
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    require_host_purchase_receipt_metadata_capability(
        capabilities,
        input.purchase_metadata.is_some(),
    )?;
    Ok(host_spool_details_payload(input))
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
    use super::{
        host_spool_details_payload_for_capabilities, host_spool_details_update_from_active_input,
        library_sync_create_spool_path,
    };
    use crate::backend::inventory_engine::{
        UpdateSpoolDetailsInput, UpdateSpoolDetailsOwnershipInput,
    };
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::companion_models::PURCHASE_RECEIPT_METADATA_CAPABILITY;

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

    #[test]
    fn active_library_adapter_preserves_the_atomic_details_payload() {
        let mut update = host_spool_details_update_from_active_input(UpdateSpoolDetailsInput {
            spool_id: "spool-1".to_string(),
            qr_code: Some(" FM-SPOOL-1 ".to_string()),
            status: " IN_STOCK ".to_string(),
            location: None,
            home_location: Some(Some(" Drybox 2 ".to_string())),
            spool_tare_weight_g: Some(241),
            ownership: Some(UpdateSpoolDetailsOwnershipInput {
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some(" Nora ".to_string()),
                owner_contact: Some(" nora@example.com ".to_string()),
                ownership_note: Some(" Return next week ".to_string()),
            }),
            purchase_metadata: Some(PurchaseReceiptMetadata {
                purchase_price: None,
                purchase_currency: None,
                purchase_date: None,
                batch_code: None,
                supplier_reference: None,
            }),
        });

        let unsupported = host_spool_details_payload_for_capabilities(&update, &[])
            .expect_err("explicit metadata must be rejected for a legacy Host");
        let unsupported: serde_json::Value =
            serde_json::from_str(&unsupported).expect("coded unsupported error");
        assert_eq!(unsupported["code"], "purchase_metadata.host_unsupported");

        assert_eq!(
            serde_json::Value::Object(
                host_spool_details_payload_for_capabilities(
                    &update,
                    &[PURCHASE_RECEIPT_METADATA_CAPABILITY.to_string()],
                )
                .expect("capable Host payload"),
            ),
            serde_json::json!({
                "qr_code": "FM-SPOOL-1",
                "status": "IN_STOCK",
                "location": null,
                "home_location": "Drybox 2",
                "spool_tare_weight_g": 241,
                "ownership": {
                    "ownership_type": "BORROWED_IN",
                    "owner_name": "Nora",
                    "owner_contact": "nora@example.com",
                    "ownership_note": "Return next week"
                },
                "purchase_metadata": {
                    "purchase_price": null,
                    "purchase_currency": null,
                    "purchase_date": null,
                    "batch_code": null,
                    "supplier_reference": null
                }
            })
        );

        update.purchase_metadata = None;
        let legacy_payload = host_spool_details_payload_for_capabilities(&update, &[])
            .expect("legacy detail without metadata");
        assert!(!legacy_payload.contains_key("purchase_metadata"));
    }
}
