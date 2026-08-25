use crate::backend::inventory_domain::{LoanDirection, OwnershipType, SpoolStatus};
use crate::backend::inventory_engine::{
    AcceptBambuLiveWeightEstimateInput, CreateManualSpoolInput, CreatePrinterInput,
    CreateSpoolInput, DeleteSpoolInput, LendSpoolInput, PurgeSpoolInput, RecordPrintUsageInput,
    ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput, UpdateMasterCatalogEntryInput,
    UpdateSpoolDetailsInput, UpdateSpoolDetailsOwnershipInput, UpdateSpoolOwnershipInput,
    WeightSource,
};
use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::catalog_commands::CatalogRefreshResult;
#[cfg(test)]
use crate::companion_assets::companion_browser_assets;
use crate::companion_assets::{cached_companion_browser_asset, COMPANION_BROWSER_HTML};
use crate::companion_error::CompanionApiError;
use crate::companion_http::{
    has_valid_csrf, header_string, require_allowed_host, require_allowed_origin,
    require_stable_request_host, requires_csrf,
};
use crate::companion_models::*;
use crate::companion_payload::{
    html_response, normalize_optional_swatch_color, normalize_optional_text,
    normalize_owned_manual_fields, static_asset_response, validate_initial_weight,
};
use crate::companion_session::{
    build_authenticated_session_response, build_qa_authenticated_session_response,
    find_active_session, find_active_trusted_lan_browser, generate_companion_spool_id,
    random_hex_token,
};
use crate::companion_state::CompanionApiState;
use crate::credential_store::{CredentialKey, SecretValue};
use crate::local_service_advertisement::{
    LocalServiceAdvertisement, LocalServiceAdvertisementConfig,
};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::security::hash_secret;
use crate::state::AppState;
use crate::trusted_lan_interfaces::current_trusted_lan_interface_index;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header::ORIGIN, HeaderMap, Request};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;

pub const COMPANION_DEFAULT_PORT: u16 = 4278;
const COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS: u64 = 3;
const LOCAL_SERVICE_SHUTDOWN_TIMEOUT_SECONDS: u64 = 5;

pub fn generate_pairing_token() -> String {
    crate::companion_session::generate_pairing_token()
}

pub async fn reconcile_trusted_lan_server(state: AppState) -> Result<(), String> {
    let reconcile_guard = state.companion.trusted_lan.lock_reconcile().await;
    let result = reconcile_trusted_lan_server_locked(&state).await;
    drop(reconcile_guard);
    result
}

pub(crate) async fn reconcile_trusted_lan_server_locked(state: &AppState) -> Result<(), String> {
    stop_trusted_lan_server_locked(state, false).await;

    if state.companion.trusted_lan.shutting_down() {
        state.companion.trusted_lan.mark_stopped();
        return Ok(());
    }

    let Some(bind_address) = state.companion.trusted_lan.bind_address() else {
        state.companion.trusted_lan.mark_stopped();
        return Ok(());
    };
    let listener = match tokio::net::TcpListener::bind(&bind_address).await {
        Ok(listener) => listener,
        Err(error) => {
            let message =
                format!("Failed to bind trusted-LAN companion on {bind_address}: {error}");
            state.companion.trusted_lan.mark_failed(message.clone());
            return Err(message);
        }
    };

    let api_state = CompanionApiState::new(
        state.db_path.clone(),
        state.companion.trusted_lan.clone(),
        state.credentials.clone(),
    );
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let runtime = state.companion.trusted_lan.clone();
    let join_handle = tauri::async_runtime::spawn(async move {
        let _ = run_companion_server(listener, api_state, Some(shutdown_rx))
            .await
            .inspect_err(|error| {
                runtime.mark_failed((*error).clone());
            });
    });
    state
        .companion
        .trusted_lan
        .install_server_handle(shutdown_tx, join_handle);
    state.companion.trusted_lan.mark_running();

    if state.companion.trusted_lan.qa_mode() {
        return Ok(());
    }

    if let Err(error) = start_local_service_advertisement(state).await {
        state
            .companion
            .trusted_lan
            .mark_local_name_failed(error.clone());
        eprintln!("Companion stable local address is unavailable: {error}");
    }
    Ok(())
}

pub(crate) async fn shutdown_trusted_lan_server(state: &AppState) {
    state.companion.trusted_lan.mark_shutdown_started();
    let _reconcile_guard = state.companion.trusted_lan.lock_reconcile().await;
    stop_trusted_lan_server_locked(state, true).await;
    state.companion.trusted_lan.mark_stopped();
}

async fn stop_trusted_lan_server_locked(state: &AppState, bounded_for_app_shutdown: bool) {
    let advertisement_drop = state
        .companion
        .trusted_lan
        .take_local_service_advertisement()
        .map(|advertisement| tauri::async_runtime::spawn_blocking(move || drop(advertisement)));
    state.companion.trusted_lan.mark_local_name_stopped();

    if let Some(handle) = state.companion.trusted_lan.take_server_handle() {
        let mut join_handle = handle.shutdown();
        if tokio::time::timeout(
            std::time::Duration::from_secs(COMPANION_SERVER_SHUTDOWN_TIMEOUT_SECONDS),
            &mut join_handle,
        )
        .await
        .is_err()
        {
            join_handle.abort();
            let _ = join_handle.await;
        }
    }

    if let Some(mut advertisement_drop) = advertisement_drop {
        if bounded_for_app_shutdown {
            // Tokio cannot cancel spawn_blocking once Drop has started. Give the Windows backend
            // enough time for unregister, daemon shutdown, and its monitor-thread join instead of
            // calling abort and falsely treating the native teardown as cancelled.
            if tokio::time::timeout(
                std::time::Duration::from_secs(LOCAL_SERVICE_SHUTDOWN_TIMEOUT_SECONDS),
                &mut advertisement_drop,
            )
            .await
            .is_err()
            {
                eprintln!(
                    "Companion local-service shutdown timed out; application exit will continue."
                );
            }
        } else {
            let _ = advertisement_drop.await;
        }
    }
}

pub(crate) async fn retry_trusted_lan_local_service_advertisement(
    state: &AppState,
) -> Result<bool, String> {
    if !state.companion.trusted_lan.enabled()
        || !state.companion.trusted_lan.running()
        || state.companion.trusted_lan.qa_mode()
    {
        return Ok(false);
    }
    if state.companion.trusted_lan.local_name_running()
        && state
            .companion
            .trusted_lan
            .local_service_advertisement_health()
            .is_ok()
    {
        return Ok(false);
    }

    let reconcile_guard = state.companion.trusted_lan.lock_reconcile().await;
    if !state.companion.trusted_lan.enabled()
        || !state.companion.trusted_lan.running()
        || state.companion.trusted_lan.qa_mode()
    {
        return Ok(false);
    }
    if state.companion.trusted_lan.local_name_running()
        && state
            .companion
            .trusted_lan
            .local_service_advertisement_health()
            .is_ok()
    {
        return Ok(false);
    }
    if let Some(advertisement) = state
        .companion
        .trusted_lan
        .take_local_service_advertisement()
    {
        let _ = tauri::async_runtime::spawn_blocking(move || drop(advertisement)).await;
    }
    state.companion.trusted_lan.mark_local_name_stopped();

    let result = match start_local_service_advertisement(state).await {
        Ok(()) => Ok(true),
        Err(error) => {
            state
                .companion
                .trusted_lan
                .mark_local_name_failed(error.clone());
            Err(error)
        }
    };
    drop(reconcile_guard);
    result
}

async fn start_local_service_advertisement(state: &AppState) -> Result<(), String> {
    let hostname = state
        .companion
        .trusted_lan
        .advertised_hostname()
        .ok_or_else(|| "Stable local hostname is not configured.".to_string())?;
    let (interface_name, interface_address) = state
        .companion
        .trusted_lan
        .selected_interface()
        .ok_or_else(|| "Stable local address requires one selected LAN interface.".to_string())?;
    let address = interface_address
        .parse()
        .map_err(|_| "Stable local address requires a valid private IPv4 address.".to_string())?;
    let interface_index = current_trusted_lan_interface_index(&interface_name, &interface_address)
        .ok_or_else(|| "The selected LAN interface is not currently available.".to_string())?;
    let port = state.companion.trusted_lan.listen_port();
    let instance_name = companion_service_instance_name(&hostname);
    let config = LocalServiceAdvertisementConfig {
        hostname,
        instance_name,
        address,
        port,
        interface_index,
    };

    let advertisement =
        tauri::async_runtime::spawn_blocking(move || LocalServiceAdvertisement::register(config))
            .await
            .map_err(|_| "Stable local address registration did not complete.".to_string())?
            .map_err(|error| error.to_string())?;

    if advertisement.hostname()
        != state
            .companion
            .trusted_lan
            .advertised_hostname()
            .as_deref()
            .unwrap_or_default()
    {
        return Err(
            "Stable local address registration returned an unexpected hostname.".to_string(),
        );
    }
    state
        .companion
        .trusted_lan
        .install_local_service_advertisement(advertisement);
    state.companion.trusted_lan.mark_local_name_running();
    Ok(())
}

fn companion_service_instance_name(hostname: &str) -> String {
    let label = hostname
        .trim()
        .trim_end_matches('.')
        .strip_suffix(".local")
        .unwrap_or(hostname.trim());
    let identity = label
        .strip_prefix("fm-")
        .or_else(|| label.strip_prefix("filament-manager-"))
        .unwrap_or(label);
    format!("Filament Manager {identity}")
}

pub(super) async fn handle_companion_root() -> axum::response::Redirect {
    axum::response::Redirect::temporary("/companion")
}

async fn run_companion_server(
    listener: tokio::net::TcpListener,
    state: CompanionApiState,
    shutdown_rx: Option<tokio::sync::oneshot::Receiver<()>>,
) -> Result<(), String> {
    let runtime = state.runtime.clone();
    let router = crate::companion_routes::build_router(state);
    let result = if let Some(shutdown_rx) = shutdown_rx {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await
    } else {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
    };

    result.map_err(|error| {
        let message = format!("Companion API server stopped: {error}");
        runtime.mark_failed(message.clone());
        message
    })
}

pub(super) async fn handle_companion_shell() -> Response {
    html_response(COMPANION_BROWSER_HTML)
}

pub(super) async fn handle_companion_asset(
    Path(asset): Path<String>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    cached_companion_browser_asset(asset.as_str())
        .map(|asset| static_asset_response(&headers, asset))
        .ok_or_else(|| CompanionApiError::NotFound(format!("Unknown companion asset: {asset}")))
}

pub(super) async fn handle_session_status(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<SessionStatusResponse>, CompanionApiError> {
    state
        .run_blocking("session status", move |state| {
            require_allowed_host(&headers, &state.runtime)?;

            let active_session = find_active_session(&state.sessions, &state.db_path, &headers)?;
            let mut authenticated = false;
            let mut csrf_token = None;
            let mut can_renew = false;

            if let Some(session) = active_session {
                authenticated = true;
                csrf_token = Some(session.csrf_token.clone());
            } else {
                can_renew = find_active_trusted_lan_browser(&state.db_path, &headers)?.is_some();
            }

            Ok(Json(SessionStatusResponse {
                ok: true,
                auth_mode: state.runtime.auth_mode().to_string(),
                access_mode: "trusted-lan".to_string(),
                authenticated,
                csrf_token,
                can_renew,
            }))
        })
        .await
}

pub(super) async fn handle_pair_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Json(payload): Json<PairSessionRequest>,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("pair session", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            require_allowed_origin(&headers, &state.runtime)?;

            let pairing_token = payload.pairing_token.trim();
            if pairing_token.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "pairing_token is required".to_string(),
                ));
            }

            let origin = header_string(&headers, ORIGIN).map(|value| value.trim().to_string());
            let db = state.open_db()?;
            let pairing_token_hash = hash_secret(pairing_token);
            let pairing_display_name = db
                .consume_trusted_lan_pairing(&pairing_token_hash)
                .map_err(CompanionApiError::from)?
                .ok_or_else(|| {
                    CompanionApiError::Unauthorized(
                        "Pairing link is invalid, expired, or already used".to_string(),
                    )
                })?;
            let device_token = random_hex_token(32);
            let device_token_hash = hash_secret(&device_token);
            let paired_browser = db
                .create_trusted_lan_paired_browser(
                    pairing_display_name.as_deref(),
                    &device_token_hash,
                    origin.as_deref(),
                )
                .map_err(CompanionApiError::from)?;

            build_authenticated_session_response(
                &state.sessions,
                &state.db_path,
                Some(paired_browser.id),
                Some(&device_token),
                origin.as_deref(),
            )
        })
        .await
}

pub(super) async fn handle_renew_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("renew session", move |state| {
            require_allowed_host(&headers, &state.runtime)?;
            require_allowed_origin(&headers, &state.runtime)?;

            let paired_browser = find_active_trusted_lan_browser(&state.db_path, &headers)?
                .ok_or_else(|| {
                    CompanionApiError::Unauthorized(
                        "Trusted-LAN browser pairing is required".to_string(),
                    )
                })?;

            let origin = header_string(&headers, ORIGIN).map(|value| value.trim().to_string());
            build_authenticated_session_response(
                &state.sessions,
                &state.db_path,
                Some(paired_browser.id),
                None,
                origin.as_deref(),
            )
        })
        .await
}

pub(super) async fn handle_qa_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    if !state.runtime.qa_mode() {
        return Err(CompanionApiError::NotFound("Record not found".to_string()));
    }

    require_allowed_host(&headers, &state.runtime)?;
    build_qa_authenticated_session_response(&state.sessions)
}

pub(super) async fn handle_qa_expire_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    if !state.runtime.qa_mode() {
        return Err(CompanionApiError::NotFound("Record not found".to_string()));
    }

    require_allowed_host(&headers, &state.runtime)?;
    require_allowed_origin(&headers, &state.runtime)?;

    state.sessions.clear()?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "QA companion sessions expired".to_string(),
    }))
}

pub(super) async fn handle_update_master_catalog_entry(
    State(state): State<CompanionApiState>,
    Path(master_id): Path<String>,
    Json(payload): Json<UpdateMasterCatalogEntryRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let master_id = master_id.trim();
    if master_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "master_id is required".to_string(),
        ));
    }

    let master_id = master_id.to_string();
    state
        .run_blocking("catalog entry update", move |state| {
            state
                .service
                .update_master_catalog_entry(UpdateMasterCatalogEntryInput {
                    master_id,
                    material: payload.material,
                    filament_name: payload.filament_name,
                    color_name: payload.color_name,
                    hex_color: payload.hex_color,
                    product_url: payload.product_url,
                    vendor: payload.vendor,
                    default_weight: payload.default_weight,
                })
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Catalog entry updated".to_string(),
    }))
}

pub(super) async fn handle_refresh_vendor_catalog(
    State(state): State<CompanionApiState>,
    Json(payload): Json<RefreshVendorCatalogRequest>,
) -> Result<Json<CatalogRefreshResult>, CompanionApiError> {
    let vendor = payload.vendor.trim().to_ascii_lowercase();
    if vendor != "bambu" && vendor != "esun" {
        return Err(CompanionApiError::BadRequest(
            "vendor must be Bambu or eSUN".to_string(),
        ));
    }

    let material_types = payload.material_types;
    let result = state
        .run_blocking("catalog refresh", move |state| {
            if vendor == "bambu" {
                state.service.refresh_bambu_catalog(material_types)
            } else {
                state.service.refresh_esun_catalog(material_types)
            }
            .map_err(CompanionApiError::Internal)
        })
        .await?;

    Ok(Json(result))
}

pub(super) async fn handle_create_printer(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreatePrinterInput>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let model = payload.model.trim();
    let name = payload.name.trim();
    if model.is_empty() || name.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "printer model and name are required".to_string(),
        ));
    }

    let input = CreatePrinterInput {
        id: payload.id.trim().to_string(),
        model: model.to_string(),
        name: name.to_string(),
        ams_units: payload.ams_units,
        slots_per_ams: payload.slots_per_ams,
    };
    state
        .run_blocking("printer create", move |state| {
            state
                .service
                .create_printer(input)
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Printer saved".to_string(),
    }))
}

pub(super) async fn handle_delete_printer(
    State(state): State<CompanionApiState>,
    Path(printer_id): Path<String>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("printer delete", move |state| {
            let printer_id = printer_id.trim();
            if printer_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "printer_id is required".to_string(),
                ));
            }
            let _credential_mutation =
                lock_secure_credential_mutation().map_err(CompanionApiError::Internal)?;

    let integration = state
        .open_db()?
        .list_bambu_live_integrations()
        .map_err(CompanionApiError::from)?
        .into_iter()
        .find(|entry| entry.printer_id == printer_id)
        .map(|entry| entry.config);
    let mut binding_ids = integration
        .as_ref()
        .map(|config| config.access_code_stale_binding_ids.clone())
        .unwrap_or_default();
    if let Some(current) = integration
        .as_ref()
        .and_then(|config| config.access_code_binding_id.clone())
    {
        binding_ids.push(current);
    }
    binding_ids.retain(|binding_id| !binding_id.trim().is_empty());
    binding_ids.sort_unstable();
    binding_ids.dedup();
    let credential_keys = binding_ids
        .into_iter()
        .map(|binding_id| CredentialKey::bambu_access_code(printer_id, &binding_id))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let mut previous_secrets = Vec::new();
    for credential_key in &credential_keys {
        let previous = state
            .credentials
            .get(credential_key)
            .map_err(|error| CompanionApiError::Internal(error.to_string()))?
            .map(|secret| zeroize::Zeroizing::new(secret.expose_bytes().to_vec()));
        previous_secrets.push((credential_key.clone(), previous));
    }
    let restore_previous_secret = || -> Result<(), String> {
        for (credential_key, previous_secret) in &previous_secrets {
            match previous_secret.as_ref() {
                Some(previous_secret) => {
                    let secret = SecretValue::from_bytes(previous_secret.to_vec());
                    state
                        .credentials
                        .set(credential_key, &secret)
                        .map_err(|error| error.to_string())?;
                    let restored = state
                        .credentials
                        .get(credential_key)
                        .map_err(|error| error.to_string())?
                        .ok_or_else(|| {
                            "Bambu access code was absent after credential rollback.".to_string()
                        })?;
                    if restored.expose_bytes() != secret.expose_bytes() {
                        return Err("Bambu access code did not match after credential rollback."
                            .to_string());
                    }
                }
                None => {
                    state
                        .credentials
                        .delete(credential_key)
                        .map_err(|error| error.to_string())?;
                }
            }
        }
        Ok(())
    };
    for credential_key in &credential_keys {
        if let Err(error) = state.credentials.delete(credential_key) {
            if let Err(rollback_error) = restore_previous_secret() {
                return Err(CompanionApiError::Internal(format!(
                    "Credential deletion failed: {error}. Credential rollback failed: {rollback_error}"
                )));
            }
            return Err(CompanionApiError::Internal(error.to_string()));
        }
        match state.credentials.get(credential_key) {
            Ok(None) => {}
            Ok(Some(_)) => {
                restore_previous_secret().map_err(CompanionApiError::Internal)?;
                return Err(CompanionApiError::Internal(
                    "Bambu access code remained present after deletion.".to_string(),
                ));
            }
            Err(error) => {
                restore_previous_secret().map_err(CompanionApiError::Internal)?;
                return Err(CompanionApiError::Internal(error.to_string()));
            }
        }
    }

    if let Err(error) = state.service.delete_printer(printer_id) {
        if let Err(rollback_error) = restore_previous_secret() {
            return Err(CompanionApiError::Internal(format!(
                "Printer deletion failed: {error:?}. Credential rollback failed: {rollback_error}"
            )));
        }
        return Err(CompanionApiError::from(error));
    }

            Ok(Json(WriteResponse {
                ok: true,
                message: "Printer deleted".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_save_bambu_live_integration(
    State(_state): State<CompanionApiState>,
    Path(_printer_id): Path<String>,
    Json(_payload): Json<SaveBambuLiveIntegrationRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    Err(CompanionApiError::Forbidden(
        "Bambu credentials and TLS trust can only be changed on the host desktop.".to_string(),
    ))
}

pub(super) async fn handle_delete_bambu_live_integration(
    State(_state): State<CompanionApiState>,
    Path(_printer_id): Path<String>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    Err(CompanionApiError::Forbidden(
        "Bambu credentials and TLS trust can only be changed on the host desktop.".to_string(),
    ))
}

pub(super) async fn handle_set_active_printer(
    State(state): State<CompanionApiState>,
    Json(payload): Json<SetActivePrinterRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let printer_id = payload
        .printer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    state
        .run_blocking("active printer update", move |state| {
            state
                .service
                .set_active_printer(printer_id.as_deref())
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Active printer updated".to_string(),
    }))
}

pub(super) async fn handle_create_owned_spool(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateOwnedSpoolRequest>,
) -> Result<Json<CreateSpoolResponse>, CompanionApiError> {
    state
        .run_blocking("owned spool create", move |state| {
            validate_initial_weight(payload.initial_weight_g)?;

            let spool_id = generate_companion_spool_id();
            let master_id = normalize_optional_text(payload.master_id.as_deref());
            let qr_code = normalize_optional_text(payload.qr_code.as_deref());
            let location = normalize_optional_text(payload.location.as_deref());
            if let Some(master_id) = master_id {
                state
                    .service
                    .create_spool(CreateSpoolInput {
                        id: spool_id.clone(),
                        master_id,
                        qr_code: qr_code.clone(),
                        status: "IN_STOCK".to_string(),
                        ownership_type: Some("OWNED".to_string()),
                        owner_name: None,
                        owner_contact: None,
                        ownership_note: None,
                        initial_weight_g: payload.initial_weight_g,
                        current_weight_g: payload.initial_weight_g,
                        location_id: location.clone(),
                        home_location_id: location.clone(),
                        purchase_date: None,
                        purchase_price: None,
                        batch_code: None,
                        purchase_currency: None,
                        supplier_reference: None,
                    })
                    .map_err(CompanionApiError::from)?;
            } else {
                let manual = normalize_owned_manual_fields(
                    payload.material.as_deref(),
                    payload.filament_name.as_deref(),
                    payload.color_name.as_deref(),
                )?;
                state
                    .service
                    .create_manual_spool(CreateManualSpoolInput {
                        id: spool_id.clone(),
                        material: manual.material,
                        filament_name: manual.filament_name,
                        color_name: manual.color_name,
                        hex_color: normalize_optional_swatch_color(payload.hex_color.as_deref())?,
                        product_url: None,
                        vendor: Some(
                            payload
                                .vendor
                                .as_deref()
                                .map(str::trim)
                                .filter(|value| !value.is_empty())
                                .unwrap_or("Generic")
                                .to_string(),
                        ),
                        default_weight_g: payload.initial_weight_g,
                        qr_code,
                        status: Some("IN_STOCK".to_string()),
                        ownership_type: Some("OWNED".to_string()),
                        owner_name: None,
                        owner_contact: None,
                        ownership_note: None,
                        initial_weight_g: payload.initial_weight_g,
                        location,
                    })
                    .map_err(CompanionApiError::from)?;
            }

            Ok(Json(CreateSpoolResponse {
                ok: true,
                message: "Filament added".to_string(),
                spool_id,
            }))
        })
        .await
}

pub(super) async fn handle_create_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateBorrowedInSpoolRequest>,
) -> Result<Json<CreateSpoolResponse>, CompanionApiError> {
    state
        .run_blocking("borrowed-in spool create", move |state| {
            let owner_name = payload.owner_name.trim();
            if owner_name.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "owner_name is required".to_string(),
                ));
            }

            validate_initial_weight(payload.initial_weight_g)?;

            let spool_id = generate_companion_spool_id();
            let master_id = normalize_optional_text(payload.master_id.as_deref());
            let qr_code = normalize_optional_text(payload.qr_code.as_deref());
            let location = normalize_optional_text(payload.location.as_deref());
            let owner_contact = normalize_optional_text(payload.owner_contact.as_deref());
            let ownership_note = normalize_optional_text(payload.ownership_note.as_deref());
            if let Some(master_id) = master_id {
                state
                    .service
                    .create_spool(CreateSpoolInput {
                        id: spool_id.clone(),
                        master_id,
                        qr_code: qr_code.clone(),
                        status: "IN_STOCK".to_string(),
                        ownership_type: Some("BORROWED_IN".to_string()),
                        owner_name: Some(owner_name.to_string()),
                        owner_contact: owner_contact.clone(),
                        ownership_note: ownership_note.clone(),
                        initial_weight_g: payload.initial_weight_g,
                        current_weight_g: payload.initial_weight_g,
                        location_id: None,
                        home_location_id: None,
                        purchase_date: None,
                        purchase_price: None,
                        batch_code: None,
                        purchase_currency: None,
                        supplier_reference: None,
                    })
                    .map_err(CompanionApiError::from)?;
                if location.is_some() {
                    state
                        .service
                        .update_spool_details(UpdateSpoolDetailsInput {
                            spool_id: spool_id.clone(),
                            qr_code,
                            status: "IN_STOCK".to_string(),
                            location: location.clone(),
                            home_location: Some(location.clone()),
                            spool_tare_weight_g: None,
                            ownership: None,
                            purchase_metadata: None,
                            purchase_price_batch_locked: None,
                        })
                        .map_err(CompanionApiError::from)?;
                }
            } else {
                let manual = normalize_owned_manual_fields(
                    payload.material.as_deref(),
                    payload.filament_name.as_deref(),
                    payload.color_name.as_deref(),
                )?;
                state
                    .service
                    .create_manual_spool(CreateManualSpoolInput {
                        id: spool_id.clone(),
                        material: manual.material,
                        filament_name: manual.filament_name,
                        color_name: manual.color_name,
                        hex_color: normalize_optional_swatch_color(payload.hex_color.as_deref())?,
                        product_url: None,
                        vendor: Some(
                            payload
                                .vendor
                                .as_deref()
                                .map(str::trim)
                                .filter(|value| !value.is_empty())
                                .unwrap_or("Generic")
                                .to_string(),
                        ),
                        default_weight_g: payload.initial_weight_g,
                        qr_code,
                        status: Some("IN_STOCK".to_string()),
                        ownership_type: Some("BORROWED_IN".to_string()),
                        owner_name: Some(owner_name.to_string()),
                        owner_contact,
                        ownership_note,
                        initial_weight_g: payload.initial_weight_g,
                        location,
                    })
                    .map_err(CompanionApiError::from)?;
            }

            Ok(Json(CreateSpoolResponse {
                ok: true,
                message: "Borrowed-in spool registered".to_string(),
                spool_id,
            }))
        })
        .await
}

pub(super) async fn handle_update_printer_slot_assignment(
    State(state): State<CompanionApiState>,
    Path((printer_id, slot_id)): Path<(String, String)>,
    Json(payload): Json<UpdatePrinterSlotAssignmentRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("printer slot assignment", move |state| {
            let printer_id = printer_id.trim();
            let slot_id = slot_id.trim();
            if printer_id.is_empty() || slot_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "printer_id and slot_id are required".to_string(),
                ));
            }

            let target_spool_id = payload
                .spool_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let override_tray_uuid = payload
                .rfid_override_tray_uuid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let override_color_hex = payload
                .rfid_override_color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let slot = state.find_printer_slot(printer_id, slot_id)?;

            if slot.spool_id.is_none() && target_spool_id.is_none() {
                return Err(CompanionApiError::BadRequest(
                    "Slot is already empty".to_string(),
                ));
            }
            if let (Some(current_spool_id), Some(next_spool_id)) =
                (slot.spool_id.as_deref(), target_spool_id)
                && current_spool_id != next_spool_id
            {
                return Err(CompanionApiError::BadRequest(
                "Slot must be cleared before assigning another spool from the browser companion"
                    .to_string(),
            ));
            }
            if let Some(next_spool_id) = target_spool_id {
                let spool = state
                    .service
                    .get_spool(next_spool_id)
                    .map_err(CompanionApiError::from)?
                    .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
                let spool_status = SpoolStatus::from_raw(Some(&spool.spool.status));
                if matches!(
                    spool_status,
                    SpoolStatus::Borrowed | SpoolStatus::Empty | SpoolStatus::Lost
                ) {
                    return Err(CompanionApiError::BadRequest(
                "Selected spool cannot be loaded into a printer slot from the browser companion"
                    .to_string(),
            ));
                }
            }

            state
                .service
                .assign_printer_slot(
                    printer_id,
                    slot_id,
                    target_spool_id,
                    override_tray_uuid,
                    override_color_hex,
                    payload
                        .clear_live_cache_before_next_refresh
                        .unwrap_or(false),
                )
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: if target_spool_id.is_some() {
                    "Printer slot assigned".to_string()
                } else {
                    "Printer slot cleared".to_string()
                },
            }))
        })
        .await
}

pub(super) async fn handle_record_print_usage(
    State(state): State<CompanionApiState>,
    Path((printer_id, spool_id)): Path<(String, String)>,
    Json(payload): Json<RecordPrintUsageRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("print usage record", move |state| {
            let printer_id = printer_id.trim();
            let spool_id = spool_id.trim();
            if printer_id.is_empty() || spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "printer_id and spool_id are required".to_string(),
                ));
            }
            if payload.grams <= 0 {
                return Err(CompanionApiError::BadRequest(
                    "grams must be greater than zero".to_string(),
                ));
            }

            state
                .service
                .record_print_usage(RecordPrintUsageInput {
                    printer_id: printer_id.to_string(),
                    spool_id: spool_id.to_string(),
                    grams: payload.grams,
                    job_name: normalize_optional_text(payload.job_name.as_deref()),
                    success: Some(payload.success.unwrap_or(true)),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Print usage recorded".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_accept_bambu_live_weight_estimate(
    State(state): State<CompanionApiState>,
    Path((printer_id, slot_id, spool_id)): Path<(String, String, String)>,
    Json(payload): Json<AcceptBambuLiveWeightEstimateRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("Bambu live weight estimate acceptance", move |state| {
            state
                .service
                .accept_bambu_live_weight_estimate(AcceptBambuLiveWeightEstimateInput {
                    printer_id,
                    slot_id,
                    spool_id,
                    expected_weight_seen_at: payload.expected_weight_seen_at,
                    expected_remaining_grams: payload.expected_remaining_grams,
                    expected_current_grams: payload.expected_current_grams,
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "AMS weight estimate accepted".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_update_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateBorrowedInSpoolRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("borrowed-in spool update", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }

            let owner_name = payload.owner_name.trim();
            if owner_name.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "owner_name is required".to_string(),
                ));
            }

            state
                .service
                .update_borrowed_in_spool(UpdateBorrowedInSpoolInput {
                    spool_id: spool_id.to_string(),
                    owner_name: owner_name.to_string(),
                    owner_contact: normalize_optional_text(payload.owner_contact.as_deref()),
                    ownership_note: normalize_optional_text(payload.ownership_note.as_deref()),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Borrowed-in spool details updated".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_update_spool_ownership(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolOwnershipRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool ownership update", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            let ownership_type = payload.ownership_type.trim().to_ascii_uppercase();
            if !matches!(ownership_type.as_str(), "OWNED" | "BORROWED_IN") {
                return Err(CompanionApiError::BadRequest(
                    "ownership_type must be OWNED or BORROWED_IN".to_string(),
                ));
            }

            state
                .service
                .update_spool_ownership(UpdateSpoolOwnershipInput {
                    spool_id: spool_id.to_string(),
                    ownership_type,
                    owner_name: normalize_optional_text(payload.owner_name.as_deref()),
                    owner_contact: normalize_optional_text(payload.owner_contact.as_deref()),
                    ownership_note: normalize_optional_text(payload.ownership_note.as_deref()),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Spool ownership updated".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_update_spool_details(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolDetailsRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool details update", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }

            let status = payload.status.trim().to_ascii_uppercase();
            if payload.spool_tare_weight_g.is_some_and(|grams| grams < 0) {
                return Err(CompanionApiError::BadRequest(
                    "spool_tare_weight_g must be zero or greater".to_string(),
                ));
            }
            let ownership = payload
                .ownership
                .map(|ownership| {
                    let ownership_type = ownership.ownership_type.trim().to_ascii_uppercase();
                    if !matches!(ownership_type.as_str(), "OWNED" | "BORROWED_IN") {
                        return Err(CompanionApiError::BadRequest(
                            "ownership_type must be OWNED or BORROWED_IN".to_string(),
                        ));
                    }
                    let owner_name = normalize_optional_text(ownership.owner_name.as_deref());
                    if ownership_type == "BORROWED_IN" && owner_name.is_none() {
                        return Err(CompanionApiError::BadRequest(
                            "borrowed-in spools require an owner/counterparty name".to_string(),
                        ));
                    }
                    Ok(UpdateSpoolDetailsOwnershipInput {
                        ownership_type,
                        owner_name,
                        owner_contact: normalize_optional_text(ownership.owner_contact.as_deref()),
                        ownership_note: normalize_optional_text(ownership.ownership_note.as_deref()),
                    })
                })
                .transpose()?;

            let spool = state
                .service
                .get_spool(spool_id)
                .map_err(CompanionApiError::from)?
                .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
            let current_status = SpoolStatus::from_raw(Some(&spool.spool.status));
            let requested_location = match payload.location.as_update() {
                Some(value) => normalize_optional_text(value.map(String::as_str)),
                None => spool.spool.location_id.clone(),
            };
            let requested_home_location = payload
                .home_location
                .as_update()
                .map(|value| normalize_optional_text(value.map(String::as_str)));
            let normalized_purchase_metadata = payload
                .purchase_metadata
                .map(|metadata| metadata.normalize_for_edit(&spool.spool))
                .transpose()
                .map_err(CompanionApiError::from)?;
            let purchase_metadata_changes = normalized_purchase_metadata
                .as_ref()
                .is_some_and(|metadata| {
                    metadata != &PurchaseReceiptMetadata::from_spool(&spool.spool)
                });
            let purchase_price_batch_lock_changes = payload
                .purchase_price_batch_locked
                .is_some_and(|locked| locked != spool.spool.purchase_price_batch_locked);
            let requested_home_location_is_unchanged = match &requested_home_location {
                Some(value) => value == &spool.spool.home_location_id,
                None => true,
            };
            let has_active_outbound_loan = state
                .service
                .list_active_spool_loans()
                .map_err(CompanionApiError::from)?
                .into_iter()
                .any(|row| {
                    row.loan.spool_id == spool_id
                        && LoanDirection::from_raw(Some(&row.loan.loan_direction))
                            == LoanDirection::Outbound
                });
            let editing_loan_receipt_only = status == current_status.as_str()
                && requested_location == spool.spool.location_id
                && requested_home_location_is_unchanged
                && payload.spool_tare_weight_g.is_none()
                && ownership.is_none()
                && (purchase_metadata_changes || purchase_price_batch_lock_changes);
            if (current_status == SpoolStatus::Borrowed || has_active_outbound_loan)
                && !editing_loan_receipt_only
            {
                return Err(CompanionApiError::BadRequest(
                    "Loaned-out spools use the companion loan return flow instead of manual status/location edits"
                        .to_string(),
                ));
            }
            let editing_nonplacement_details = requested_location == spool.spool.location_id
                && status == current_status.as_str()
                && (payload.home_location.is_set()
                    || payload.spool_tare_weight_g.is_some()
                    || ownership.is_some()
                    || normalized_purchase_metadata.is_some()
                    || payload.purchase_price_batch_locked.is_some());
            if (current_status.is_assigned() || state.spool_assigned_to_printer(spool_id)?)
                && !editing_nonplacement_details
            {
                return Err(CompanionApiError::BadRequest(
                    "Loaded spools use printer-slot actions instead of manual status/location edits"
                        .to_string(),
                ));
            }
            if !matches!(status.as_str(), "IN_STOCK" | "EMPTY" | "LOST")
                && !editing_nonplacement_details
            {
                return Err(CompanionApiError::BadRequest(
                    "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST"
                        .to_string(),
                ));
            }
            state
                .service
                .update_spool_details(UpdateSpoolDetailsInput {
                    spool_id: spool_id.to_string(),
                    qr_code: spool.spool.qr_code.clone(),
                    status,
                    location: requested_location,
                    home_location: requested_home_location,
                    spool_tare_weight_g: payload.spool_tare_weight_g,
                    ownership,
                    purchase_metadata: normalized_purchase_metadata,
                    purchase_price_batch_locked: payload.purchase_price_batch_locked,
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(WriteResponse {
                ok: true,
                message: "Spool details updated".to_string(),
            }))
        })
        .await
}

pub(super) async fn handle_lend_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<CreateSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool lend", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }

            let borrower_name = payload.borrower_name.trim();
            if borrower_name.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "borrower_name is required".to_string(),
                ));
            }

            if let Some(grams_out) = payload.grams_out
                && grams_out < 0
            {
                return Err(CompanionApiError::BadRequest(
                    "grams_out must be zero or greater".to_string(),
                ));
            }

            let spool = state
                .service
                .get_spool(spool_id)
                .map_err(CompanionApiError::from)?
                .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
            if OwnershipType::from_raw(Some(&spool.spool.ownership_type)).is_borrowed_in() {
                return Err(CompanionApiError::BadRequest(
                    "Borrowed-in spools cannot be loaned out from the browser companion"
                        .to_string(),
                ));
            }

            let spool_status = SpoolStatus::from_raw(Some(&spool.spool.status));
            if matches!(
                spool_status,
                SpoolStatus::Borrowed | SpoolStatus::Empty | SpoolStatus::Lost
            ) {
                return Err(CompanionApiError::BadRequest(
                    "Selected spool cannot be loaned out from the browser companion".to_string(),
                ));
            }

            let loan = state
                .service
                .lend_spool(LendSpoolInput {
                    spool_id: spool_id.to_string(),
                    borrower_name: borrower_name.to_string(),
                    counterparty_contact: payload
                        .counterparty_contact
                        .as_deref()
                        .map(str::trim)
                        .and_then(|value| {
                            if value.is_empty() {
                                None
                            } else {
                                Some(value.to_string())
                            }
                        }),
                    grams_out: payload.grams_out,
                    note: payload.note.as_deref().map(str::trim).and_then(|value| {
                        if value.is_empty() {
                            None
                        } else {
                            Some(value.to_string())
                        }
                    }),
                    expected_return_at: payload
                        .expected_return_at
                        .as_deref()
                        .map(str::trim)
                        .and_then(|value| {
                            if value.is_empty() {
                                None
                            } else {
                                Some(value.to_string())
                            }
                        }),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(LoanWriteResponse {
                ok: true,
                message: "Spool loan created".to_string(),
                loan,
            }))
        })
        .await
}

pub(super) async fn handle_return_spool_loan(
    State(state): State<CompanionApiState>,
    Path(loan_id): Path<String>,
    Json(payload): Json<ReturnSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool loan return", move |state| {
            let loan_id = loan_id.trim();
            if loan_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "loan_id is required".to_string(),
                ));
            }
            if payload.returned_grams < 0 {
                return Err(CompanionApiError::BadRequest(
                    "returned_grams must be zero or greater".to_string(),
                ));
            }

            let active_loan = state
                .service
                .list_active_spool_loans()
                .map_err(CompanionApiError::from)?
                .into_iter()
                .find(|row| row.loan.id == loan_id)
                .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
            if LoanDirection::from_raw(Some(&active_loan.loan.loan_direction))
                != LoanDirection::Outbound
            {
                return Err(CompanionApiError::BadRequest(
                    "Inbound loan returns stay desktop-first for now".to_string(),
                ));
            }

            let loan = state
                .service
                .return_spool_loan(ReturnSpoolLoanInput {
                    loan_id: loan_id.to_string(),
                    returned_grams: payload.returned_grams,
                    note: payload.note.as_deref().map(str::trim).and_then(|value| {
                        if value.is_empty() {
                            None
                        } else {
                            Some(value.to_string())
                        }
                    }),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(LoanWriteResponse {
                ok: true,
                message: "Spool loan returned".to_string(),
                loan,
            }))
        })
        .await
}

pub(super) async fn handle_hand_back_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Path(loan_id): Path<String>,
    Json(payload): Json<ReturnSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
    state
        .run_blocking("borrowed-in spool return", move |state| {
            let loan_id = loan_id.trim();
            if loan_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "loan_id is required".to_string(),
                ));
            }
            if payload.returned_grams < 0 {
                return Err(CompanionApiError::BadRequest(
                    "returned_grams must be zero or greater".to_string(),
                ));
            }

            let loan = state
                .service
                .return_inbound_spool_loan(ReturnSpoolLoanInput {
                    loan_id: loan_id.to_string(),
                    returned_grams: payload.returned_grams,
                    note: normalize_optional_text(payload.note.as_deref()),
                })
                .map_err(CompanionApiError::from)?;

            Ok(Json(LoanWriteResponse {
                ok: true,
                message: "Borrowed-in spool handed back".to_string(),
                loan,
            }))
        })
        .await
}

pub(super) async fn handle_update_spool_weight(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateWeightRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool weight update", move |state| {
            if spool_id.trim().is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            state
                .service
                .update_spool_weight(spool_id.trim(), payload.grams, None, WeightSource::Manual)
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Weight updated".to_string(),
    }))
}

pub(super) async fn handle_update_spool_tare_weight(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolTareWeightRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool tare weight update", move |state| {
            if spool_id.trim().is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            if payload.grams < 0 {
                return Err(CompanionApiError::BadRequest(
                    "tare grams must be zero or greater".to_string(),
                ));
            }
            state
                .service
                .update_spool_tare_weight(spool_id.trim(), payload.grams)
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Tare weight updated".to_string(),
    }))
}

pub(super) async fn handle_update_spool_rfid_tag(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolRfidTagRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool RFID update", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            state
                .service
                .update_spool_rfid_tag(crate::backend::inventory_engine::UpdateSpoolRfidTagInput {
                    spool_id: spool_id.to_string(),
                    rfid_tag: payload.rfid_tag,
                    rfid_observed_at: payload.rfid_observed_at,
                })
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool RFID updated".to_string(),
    }))
}

pub(super) async fn handle_delete_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    payload: Option<Json<DeleteSpoolRequest>>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool delete", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            state
                .service
                .delete_spool(DeleteSpoolInput {
                    spool_id: spool_id.to_string(),
                    reason: payload.and_then(|Json(body)| body.reason),
                })
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool removed from active inventory".to_string(),
    }))
}

pub(super) async fn handle_purge_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    payload: Option<Json<DeleteSpoolRequest>>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    state
        .run_blocking("spool purge", move |state| {
            let spool_id = spool_id.trim();
            if spool_id.is_empty() {
                return Err(CompanionApiError::BadRequest(
                    "spool_id is required".to_string(),
                ));
            }
            state
                .service
                .purge_spool(PurgeSpoolInput {
                    spool_id: spool_id.to_string(),
                    reason: payload.and_then(|Json(body)| body.reason),
                })
                .map_err(CompanionApiError::from)
        })
        .await?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool and history purged".to_string(),
    }))
}

pub(super) async fn require_companion_session(
    State(state): State<CompanionApiState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let headers = request.headers().clone();
    if let Err(error) = require_allowed_host(&headers, &state.runtime) {
        return error.into_response();
    }

    let session = match state
        .run_blocking("session authorization", move |state| {
            find_active_session(&state.sessions, &state.db_path, &headers)
        })
        .await
    {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CompanionApiError::Unauthorized(
                "Missing or invalid companion session".to_string(),
            )
            .into_response();
        }
        Err(error) => return error.into_response(),
    };

    if requires_csrf(request.method()) {
        if let Err(error) = require_allowed_origin(request.headers(), &state.runtime) {
            return error.into_response();
        }
        if !has_valid_csrf(request.headers(), &session.csrf_token) {
            return CompanionApiError::Forbidden("Missing or invalid CSRF token".to_string())
                .into_response();
        }
    }

    drop(session);
    next.run(request).await
}

pub(super) async fn require_companion_host(
    State(state): State<CompanionApiState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if let Err(error) = require_allowed_host(request.headers(), &state.runtime) {
        return error.into_response();
    }
    if request.uri().path() != "/api/v1/health"
        && let Err(error) = require_stable_request_host(request.headers(), &state.runtime)
    {
        return error.into_response();
    }
    next.run(request).await
}

#[cfg(test)]
#[path = "companion_api_tests.rs"]
mod companion_api_tests;
