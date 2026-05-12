use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, FilamentDatabase, FilamentMasterCatalogRow, LibrarySyncSettingsRow,
    PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow, WishlistItemRow,
};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput, CreateWishlistItemInput,
    DeleteSpoolInput, LendSpoolInput, PurgeSpoolInput, RecordPrintUsageInput, ReturnSpoolLoanInput,
    UpdateBorrowedInSpoolInput, UpdateSpoolDetailsInput, UpdateWishlistStatusInput, WeightSource,
};
use crate::backend::statistics::{FilamentConsumptionRow, StatisticsEngine};
#[cfg(test)]
use crate::companion_assets::companion_browser_assets;
use crate::companion_assets::{
    companion_browser_asset, companion_browser_binary_asset, COMPANION_BROWSER_HTML,
};
use crate::companion_error::CompanionApiError;
use crate::companion_http::{
    has_valid_csrf, header_string, maybe_apply_qa_delay, require_allowed_host,
    require_allowed_origin, requires_csrf,
};
use crate::companion_models::*;
use crate::companion_payload::{
    build_companion_spool_qr_payload, build_qr_svg, bytes_response, html_response,
    normalize_optional_hex_color, normalize_optional_text, normalize_owned_manual_fields,
    string_response, text_response, validate_initial_weight,
};
use crate::companion_session::{
    build_authenticated_session_response, find_active_session, find_active_trusted_lan_browser,
    generate_companion_spool_id, random_hex_token, unix_epoch_millis,
};
use crate::companion_state::CompanionApiState;
use crate::security::hash_secret;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header::ORIGIN, HeaderMap, Request};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};

pub const COMPANION_DEFAULT_PORT: u16 = 4278;

pub fn generate_pairing_token() -> String {
    crate::companion_session::generate_pairing_token()
}

pub async fn reconcile_trusted_lan_server(state: AppState) -> Result<(), String> {
    if let Some(handle) = state.companion.trusted_lan.take_server_handle() {
        let join_handle = handle.shutdown();
        let _ = join_handle.await;
    }

    let Some(bind_address) = state.companion.trusted_lan.bind_address() else {
        state.companion.trusted_lan.mark_stopped();
        return Ok(());
    };
    if state.companion.trusted_lan.base_url().is_none() {
        state.companion.trusted_lan.mark_stopped();
        return Ok(());
    }

    let listener = match tokio::net::TcpListener::bind(&bind_address).await {
        Ok(listener) => listener,
        Err(error) => {
            let message =
                format!("Failed to bind trusted-LAN companion on {bind_address}: {error}");
            state.companion.trusted_lan.mark_failed(message.clone());
            return Err(message);
        }
    };

    let api_state =
        CompanionApiState::new(state.db_path.clone(), state.companion.trusted_lan.clone());
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
    Ok(())
}

async fn run_companion_server(
    listener: tokio::net::TcpListener,
    state: CompanionApiState,
    shutdown_rx: Option<tokio::sync::oneshot::Receiver<()>>,
) -> Result<(), String> {
    let runtime = state.runtime.clone();
    let router = build_router(state);
    let result = if let Some(shutdown_rx) = shutdown_rx {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
    } else {
        axum::serve(listener, router).await
    };

    result.map_err(|error| {
        let message = format!("Companion API server stopped: {error}");
        runtime.mark_failed(message.clone());
        message
    })
}

fn build_router(state: CompanionApiState) -> Router {
    let protected = Router::new()
        .route("/inventory/spools", get(handle_list_spools))
        .route("/catalog/masters", get(handle_list_catalog_masters))
        .route("/loans", get(handle_list_spool_loans))
        .route("/printers/overview", get(handle_list_printer_overview))
        .route("/printers", post(handle_create_printer))
        .route("/printers/{printer_id}/delete", post(handle_delete_printer))
        .route("/printers/active", post(handle_set_active_printer))
        .route("/loans/active", get(handle_list_active_spool_loans))
        .route("/wishlist", get(handle_list_wishlist_items))
        .route("/wishlist", post(handle_create_wishlist_item))
        .route(
            "/wishlist/{item_id}/status",
            post(handle_update_wishlist_item_status),
        )
        .route(
            "/wishlist/{item_id}/delete",
            post(handle_delete_wishlist_item),
        )
        .route("/spools/by-qr", get(handle_find_spool_by_qr))
        .route("/spools/owned", post(handle_create_owned_spool))
        .route("/spools/manual", post(handle_create_owned_spool))
        .route("/spools/borrowed-in", post(handle_create_borrowed_in_spool))
        .route(
            "/spools/{spool_id}/borrowed-in",
            post(handle_update_borrowed_in_spool),
        )
        .route(
            "/spools/{spool_id}/details",
            post(handle_update_spool_details),
        )
        .route(
            "/spools/{spool_id}/qr-image.svg",
            get(handle_spool_qr_image_svg),
        )
        .route(
            "/printers/{printer_id}/slots/{slot_id}/assignment",
            post(handle_update_printer_slot_assignment),
        )
        .route(
            "/printers/{printer_id}/spools/{spool_id}/usage",
            post(handle_record_print_usage),
        )
        .route("/spools/{spool_id}", get(handle_get_spool_detail))
        .route("/spools/{spool_id}/lend", post(handle_lend_spool))
        .route(
            "/spools/{spool_id}/weight",
            post(handle_update_spool_weight),
        )
        .route(
            "/spools/{spool_id}/tare-weight",
            post(handle_update_spool_tare_weight),
        )
        .route(
            "/spools/{spool_id}/rfid",
            post(handle_update_spool_rfid_tag),
        )
        .route("/spools/{spool_id}/delete", post(handle_delete_spool))
        .route("/spools/{spool_id}/purge", post(handle_purge_spool))
        .route("/loans/{loan_id}/return", post(handle_return_spool_loan))
        .route(
            "/loans/{loan_id}/hand-back",
            post(handle_hand_back_borrowed_in_spool),
        )
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_companion_session,
        ))
        .with_state(state.clone());

    Router::new()
        .route("/companion", get(handle_companion_shell))
        .route("/companion/", get(handle_companion_shell))
        .route("/companion/{asset}", get(handle_companion_asset))
        .route("/api/v1/health", get(handle_health))
        .route("/api/v1/library/snapshot", get(handle_library_snapshot))
        .route("/api/v1/library/spools", get(handle_library_spools))
        .route("/api/v1/library/printers", get(handle_library_printers))
        .route(
            "/api/v1/library/printer-settings",
            get(handle_library_printer_settings),
        )
        .route("/api/v1/library/loans", get(handle_library_loans))
        .route(
            "/api/v1/library/statistics/filament-consumption",
            get(handle_library_filament_consumption),
        )
        .route(
            "/api/v1/library/catalog/masters",
            get(handle_library_catalog_masters),
        )
        .route(
            "/api/v1/library/wishlist",
            get(handle_library_wishlist_items),
        )
        .route("/api/v1/auth/session", get(handle_session_status))
        .route("/api/v1/auth/pair", post(handle_pair_session))
        .route("/api/v1/auth/renew", post(handle_renew_session))
        .route("/api/v1/qa/expire-session", post(handle_qa_expire_session))
        .with_state(state)
        .nest("/api/v1", protected)
}

async fn handle_companion_shell() -> Response {
    html_response(COMPANION_BROWSER_HTML)
}

async fn handle_companion_asset(Path(asset): Path<String>) -> Result<Response, CompanionApiError> {
    match companion_browser_asset(asset.as_str()) {
        Some(asset) => Ok(text_response(asset.content_type, asset.content)),
        None => match companion_browser_binary_asset(asset.as_str()) {
            Some(asset) => Ok(bytes_response(asset.content_type, asset.content)),
            None => Err(CompanionApiError::NotFound(format!(
                "Unknown companion asset: {}",
                asset
            ))),
        },
    }
}

async fn handle_health(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionHealthResponse>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let sync_settings = read_library_sync_settings(&state)?;
    Ok(Json(CompanionHealthResponse {
        ok: true,
        api_version: "v1",
        auth_mode: state.runtime.auth_mode().to_string(),
        access_mode: "trusted-lan",
        library_id: sync_settings.library_id,
        device_name: sync_settings.device_name,
        sync_mode: sync_settings.mode,
    }))
}

async fn handle_library_snapshot(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionLibrarySnapshotResponse>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let sync_settings = read_library_sync_settings(&state)?;
    let stats = StatisticsEngine::open(&state.db_path)
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let inventory = stats
        .inventory_overview()
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let active_loans = state
        .service
        .list_active_spool_loans()
        .map_err(CompanionApiError::from)?
        .len() as i64;
    let printers = state
        .service
        .list_printer_overview()
        .map_err(CompanionApiError::from)?
        .len() as i64;
    let captured_at = FilamentDatabase::open(&state.db_path)
        .map_err(CompanionApiError::from)?
        .current_timestamp()
        .map_err(CompanionApiError::from)?;

    Ok(Json(CompanionLibrarySnapshotResponse {
        ok: true,
        captured_at,
        library_id: sync_settings.library_id,
        device_name: sync_settings.device_name,
        sync_mode: sync_settings.mode,
        inventory,
        active_loans,
        printers,
    }))
}

async fn handle_library_spools(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<SpoolWithMasterRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let offset = query.offset.unwrap_or(0).max(0);
    let rows = state
        .service
        .list_spools(limit, offset)
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_library_printers(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PrinterOverviewRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let rows = state
        .service
        .list_printer_overview()
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_library_printer_settings(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<CompanionPrinterSettingsResponse>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let bambu_live_integrations = FilamentDatabase::open(&state.db_path)
        .map_err(CompanionApiError::from)?
        .list_bambu_live_integrations()
        .map_err(CompanionApiError::from)?
        .into_iter()
        .map(|mut entry| {
            entry.config.host = None;
            entry.config.access_code = None;
            entry.config.printer_serial = None;
            entry
        })
        .collect();
    let printers = FilamentDatabase::open(&state.db_path)
        .map_err(CompanionApiError::from)?
        .list_printers()
        .map_err(CompanionApiError::from)?;

    Ok(Json(CompanionPrinterSettingsResponse {
        active_printer_id: None,
        printers,
        printer_models: Vec::new(),
        bambu_live_integrations,
    }))
}

async fn handle_library_loans(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<LoanListQuery>,
) -> Result<Json<Vec<SpoolLoanDetailsRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let include_returned = query.include_returned.unwrap_or(true);
    let direction = query
        .direction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("ALL");
    let rows = state
        .service
        .list_spool_loans(limit, include_returned, Some(direction))
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_library_filament_consumption(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<FilamentConsumptionQuery>,
) -> Result<Json<Vec<FilamentConsumptionRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(500).clamp(1, 2_000);
    let printer_id = query
        .printer_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let stats = StatisticsEngine::open(&state.db_path)
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let rows = stats
        .filament_consumption(limit, printer_id)
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    Ok(Json(rows))
}

async fn handle_library_catalog_masters(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<CatalogListQuery>,
) -> Result<Json<Vec<FilamentMasterCatalogRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(1_000).clamp(1, 5_000);
    let rows = state
        .service
        .list_master_catalog(limit, query.search.as_deref())
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_library_wishlist_items(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<WishlistItemRow>>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    let limit = query.limit.unwrap_or(500).clamp(1, 2_000);
    let rows = state
        .service
        .list_wishlist_items(limit)
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

fn read_library_sync_settings(
    state: &CompanionApiState,
) -> Result<LibrarySyncSettingsRow, CompanionApiError> {
    let db = FilamentDatabase::open(&state.db_path).map_err(CompanionApiError::from)?;
    db.get_library_sync_settings()
        .map_err(CompanionApiError::from)
}

async fn handle_session_status(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<SessionStatusResponse>, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;

    let active_session = find_active_session(&state.sessions, &state.db_path, &headers)?;
    let mut authenticated = false;
    let mut csrf_token = None;
    let mut can_renew = false;

    if let Some(session) = active_session {
        authenticated = true;
        csrf_token = Some(session.csrf_token);
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
}

async fn handle_pair_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Json(payload): Json<PairSessionRequest>,
) -> Result<Response, CompanionApiError> {
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
}

async fn handle_renew_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    require_allowed_host(&headers, &state.runtime)?;
    require_allowed_origin(&headers, &state.runtime)?;

    let paired_browser =
        find_active_trusted_lan_browser(&state.db_path, &headers)?.ok_or_else(|| {
            CompanionApiError::Unauthorized("Trusted-LAN browser pairing is required".to_string())
        })?;

    let origin = header_string(&headers, ORIGIN).map(|value| value.trim().to_string());
    build_authenticated_session_response(
        &state.sessions,
        &state.db_path,
        Some(paired_browser.id),
        None,
        origin.as_deref(),
    )
}

async fn handle_qa_expire_session(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    if !state.runtime.qa_mode() {
        return Err(CompanionApiError::NotFound("Record not found".to_string()));
    }

    require_allowed_host(&headers, &state.runtime)?;
    require_allowed_origin(&headers, &state.runtime)?;

    state
        .sessions
        .write()
        .map_err(|_| CompanionApiError::Internal("Failed to write session state".to_string()))?
        .clear();

    Ok(Json(WriteResponse {
        ok: true,
        message: "QA companion sessions expired".to_string(),
    }))
}

async fn handle_list_spools(
    State(state): State<CompanionApiState>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<SpoolWithMasterRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let offset = query.offset.unwrap_or(0).max(0);
    let rows = state
        .service
        .list_spools(limit, offset)
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_list_catalog_masters(
    State(state): State<CompanionApiState>,
    Query(query): Query<CatalogListQuery>,
) -> Result<Json<Vec<FilamentMasterCatalogRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(1_000).clamp(1, 5_000);
    let rows = state
        .service
        .list_master_catalog(limit, query.search.as_deref())
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_list_printer_overview(
    State(state): State<CompanionApiState>,
) -> Result<Json<Vec<PrinterOverviewRow>>, CompanionApiError> {
    let rows = state
        .service
        .list_printer_overview()
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_create_printer(
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

    state
        .service
        .create_printer(CreatePrinterInput {
            id: payload.id.trim().to_string(),
            model: model.to_string(),
            name: name.to_string(),
            ams_units: payload.ams_units,
            slots_per_ams: payload.slots_per_ams,
        })
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Printer saved".to_string(),
    }))
}

async fn handle_delete_printer(
    State(state): State<CompanionApiState>,
    Path(printer_id): Path<String>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let printer_id = printer_id.trim();
    if printer_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "printer_id is required".to_string(),
        ));
    }

    state
        .service
        .delete_printer(printer_id)
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Printer deleted".to_string(),
    }))
}

async fn handle_set_active_printer(
    State(state): State<CompanionApiState>,
    Json(payload): Json<SetActivePrinterRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let printer_id = payload
        .printer_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    state
        .service
        .set_active_printer(printer_id)
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Active printer updated".to_string(),
    }))
}

async fn handle_list_spool_loans(
    State(state): State<CompanionApiState>,
    Query(query): Query<LoanListQuery>,
) -> Result<Json<Vec<SpoolLoanDetailsRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let include_returned = query.include_returned.unwrap_or(true);
    let rows = state
        .service
        .list_spool_loans(limit, include_returned, Some("OUTBOUND"))
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_list_active_spool_loans(
    State(state): State<CompanionApiState>,
) -> Result<Json<Vec<ActiveSpoolLoanRow>>, CompanionApiError> {
    let rows = state
        .service
        .list_active_spool_loans()
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_list_wishlist_items(
    State(state): State<CompanionApiState>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<WishlistItemRow>>, CompanionApiError> {
    let limit = query.limit.unwrap_or(250).clamp(1, 2_500);
    let rows = state
        .service
        .list_wishlist_items(limit)
        .map_err(CompanionApiError::from)?;
    Ok(Json(rows))
}

async fn handle_find_spool_by_qr(
    State(state): State<CompanionApiState>,
    Query(query): Query<QrLookupQuery>,
) -> Result<Json<SpoolWithMasterRow>, CompanionApiError> {
    let qr_code = query
        .qr_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CompanionApiError::BadRequest("qr_code is required".to_string()))?;

    let spool = if let Some(spool) = state
        .service
        .find_spool_by_qr(qr_code)
        .map_err(CompanionApiError::from)?
    {
        spool
    } else {
        return Err(CompanionApiError::NotFound(
            "No spool found for that QR code".to_string(),
        ));
    };
    Ok(Json(spool))
}

async fn handle_create_owned_spool(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateOwnedSpoolRequest>,
) -> Result<Json<CreateSpoolResponse>, CompanionApiError> {
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
                hex_color: normalize_optional_hex_color(payload.hex_color.as_deref())?,
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
}

async fn handle_create_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateBorrowedInSpoolRequest>,
) -> Result<Json<CreateSpoolResponse>, CompanionApiError> {
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
                hex_color: normalize_optional_hex_color(payload.hex_color.as_deref())?,
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
}

async fn handle_create_wishlist_item(
    State(state): State<CompanionApiState>,
    Json(payload): Json<CreateWishlistItemRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let material = payload.material.trim();
    if material.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "material is required".to_string(),
        ));
    }

    let filament_name = payload.filament_name.trim();
    if filament_name.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "filament_name is required".to_string(),
        ));
    }

    let color_name = payload.color_name.trim();
    if color_name.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "color_name is required".to_string(),
        ));
    }

    if let Some(quantity) = payload.quantity {
        if quantity <= 0 {
            return Err(CompanionApiError::BadRequest(
                "quantity must be greater than zero".to_string(),
            ));
        }
    }

    state
        .service
        .create_wishlist_item(CreateWishlistItemInput {
            id: format!(
                "wish_companion_{}_{}",
                unix_epoch_millis(),
                random_hex_token(4)
            ),
            master_id: normalize_optional_text(payload.master_id.as_deref()),
            material: material.to_string(),
            filament_name: filament_name.to_string(),
            color_name: color_name.to_string(),
            vendor: Some(
                payload
                    .vendor
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("Generic")
                    .to_string(),
            ),
            quantity: payload.quantity,
            note: normalize_optional_text(payload.note.as_deref()),
        })
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Wishlist item added".to_string(),
    }))
}

async fn handle_update_wishlist_item_status(
    State(state): State<CompanionApiState>,
    Path(item_id): Path<String>,
    Json(payload): Json<UpdateWishlistItemStatusRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let item_id = item_id.trim();
    if item_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "item_id is required".to_string(),
        ));
    }

    let status = payload.status.trim().to_uppercase();
    if status != "WISHLIST" && status != "ON_ORDER" && status != "RECEIVED" {
        return Err(CompanionApiError::BadRequest(
            "status must be WISHLIST, ON_ORDER, or RECEIVED".to_string(),
        ));
    }

    state
        .service
        .update_wishlist_item_status(UpdateWishlistStatusInput {
            item_id: item_id.to_string(),
            status,
        })
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Wishlist status updated".to_string(),
    }))
}

async fn handle_delete_wishlist_item(
    State(state): State<CompanionApiState>,
    Path(item_id): Path<String>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let item_id = item_id.trim();
    if item_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "item_id is required".to_string(),
        ));
    }

    state
        .service
        .delete_wishlist_item(item_id)
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Wishlist item deleted".to_string(),
    }))
}

async fn handle_update_printer_slot_assignment(
    State(state): State<CompanionApiState>,
    Path((printer_id, slot_id)): Path<(String, String)>,
    Json(payload): Json<UpdatePrinterSlotAssignmentRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
    {
        if current_spool_id != next_spool_id {
            return Err(CompanionApiError::BadRequest(
                "Slot must be cleared before assigning another spool from the browser companion"
                    .to_string(),
            ));
        }
    }
    if let Some(next_spool_id) = target_spool_id {
        let spool = state
            .service
            .get_spool(next_spool_id)
            .map_err(CompanionApiError::from)?
            .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
        let normalized_status = spool.spool.status.trim().to_ascii_uppercase();
        if matches!(normalized_status.as_str(), "BORROWED" | "EMPTY" | "LOST") {
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
}

async fn handle_record_print_usage(
    State(state): State<CompanionApiState>,
    Path((printer_id, spool_id)): Path<(String, String)>,
    Json(payload): Json<RecordPrintUsageRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
}

async fn handle_update_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateBorrowedInSpoolRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
}

async fn handle_update_spool_details(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolDetailsRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    let spool_id = spool_id.trim();
    if spool_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "spool_id is required".to_string(),
        ));
    }

    let status = payload.status.trim().to_ascii_uppercase();
    if !matches!(status.as_str(), "IN_STOCK" | "EMPTY" | "LOST") {
        return Err(CompanionApiError::BadRequest(
            "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST".to_string(),
        ));
    }

    let spool = state
        .service
        .get_spool(spool_id)
        .map_err(CompanionApiError::from)?
        .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
    let current_status = spool.spool.status.trim().to_ascii_uppercase();
    if current_status == "BORROWED" {
        return Err(CompanionApiError::BadRequest(
            "Loaned-out spools use the companion loan return flow instead of manual status/location edits"
                .to_string(),
        ));
    }
    let requested_location = normalize_optional_text(payload.location.as_deref());
    let editing_home_location_only = payload.home_location.is_some()
        && requested_location == spool.spool.location_id
        && status == current_status;
    if (current_status == "IN_USE"
        || current_status == "ASSIGNED"
        || state.spool_assigned_to_printer(spool_id)?)
        && !editing_home_location_only
    {
        return Err(CompanionApiError::BadRequest(
            "Loaded spools use printer-slot actions instead of manual status/location edits"
                .to_string(),
        ));
    }
    if state
        .service
        .list_active_spool_loans()
        .map_err(CompanionApiError::from)?
        .into_iter()
        .any(|row| row.loan.spool_id == spool_id)
    {
        return Err(CompanionApiError::BadRequest(
            "Loaned-out spools use the companion loan return flow instead of manual status/location edits"
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
            home_location: payload.home_location,
        })
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool details updated".to_string(),
    }))
}

async fn handle_spool_qr_image_svg(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
) -> Result<Response, CompanionApiError> {
    let spool_id = spool_id.trim();
    if spool_id.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "spool_id is required".to_string(),
        ));
    }

    let spool = state
        .service
        .get_spool(spool_id)
        .map_err(CompanionApiError::from)?
        .ok_or_else(|| CompanionApiError::NotFound("Spool not found".to_string()))?;
    let reference = spool.spool.id.clone();
    let payload = build_companion_spool_qr_payload(&state.runtime, &reference);
    let svg = build_qr_svg(&payload)?;
    Ok(string_response("image/svg+xml; charset=utf-8", svg))
}

async fn handle_get_spool_detail(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Path(spool_id): Path<String>,
    Query(query): Query<SpoolDetailQuery>,
) -> Result<Json<CompanionSpoolDetail>, CompanionApiError> {
    if spool_id.trim().is_empty() {
        return Err(CompanionApiError::BadRequest(
            "spool_id is required".to_string(),
        ));
    }

    maybe_apply_qa_delay(&state.runtime, &headers).await?;

    let detail = state
        .service
        .get_spool_detail(spool_id.trim(), query.history_limit, query.usage_limit)
        .map_err(CompanionApiError::from)?;
    Ok(Json(detail))
}

async fn handle_lend_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<CreateSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
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

    if let Some(grams_out) = payload.grams_out {
        if grams_out < 0 {
            return Err(CompanionApiError::BadRequest(
                "grams_out must be zero or greater".to_string(),
            ));
        }
    }

    let spool = state
        .service
        .get_spool(spool_id)
        .map_err(CompanionApiError::from)?
        .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))?;
    if spool
        .spool
        .ownership_type
        .eq_ignore_ascii_case("BORROWED_IN")
    {
        return Err(CompanionApiError::BadRequest(
            "Borrowed-in spools cannot be loaned out from the browser companion".to_string(),
        ));
    }

    let normalized_status = spool.spool.status.trim().to_ascii_uppercase();
    if matches!(normalized_status.as_str(), "BORROWED" | "EMPTY" | "LOST") {
        return Err(CompanionApiError::BadRequest(
            "Selected spool cannot be loaned out from the browser companion".to_string(),
        ));
    }

    let loan = state
        .service
        .lend_spool(LendSpoolInput {
            spool_id: spool_id.to_string(),
            borrower_name: borrower_name.to_string(),
            grams_out: payload.grams_out,
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
        message: "Spool loan created".to_string(),
        loan,
    }))
}

async fn handle_return_spool_loan(
    State(state): State<CompanionApiState>,
    Path(loan_id): Path<String>,
    Json(payload): Json<ReturnSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
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
    if !active_loan
        .loan
        .loan_direction
        .as_str()
        .eq_ignore_ascii_case("OUTBOUND")
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
}

async fn handle_hand_back_borrowed_in_spool(
    State(state): State<CompanionApiState>,
    Path(loan_id): Path<String>,
    Json(payload): Json<ReturnSpoolLoanRequest>,
) -> Result<Json<LoanWriteResponse>, CompanionApiError> {
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
}

async fn handle_update_spool_weight(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateWeightRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
    if spool_id.trim().is_empty() {
        return Err(CompanionApiError::BadRequest(
            "spool_id is required".to_string(),
        ));
    }

    state
        .service
        .update_spool_weight(spool_id.trim(), payload.grams, None, WeightSource::Manual)
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Weight updated".to_string(),
    }))
}

async fn handle_update_spool_tare_weight(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolTareWeightRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Tare weight updated".to_string(),
    }))
}

async fn handle_update_spool_rfid_tag(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    Json(payload): Json<UpdateSpoolRfidTagRequest>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool RFID updated".to_string(),
    }))
}

async fn handle_delete_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    payload: Option<Json<DeleteSpoolRequest>>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool removed from active inventory".to_string(),
    }))
}

async fn handle_purge_spool(
    State(state): State<CompanionApiState>,
    Path(spool_id): Path<String>,
    payload: Option<Json<DeleteSpoolRequest>>,
) -> Result<Json<WriteResponse>, CompanionApiError> {
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
        .map_err(CompanionApiError::from)?;

    Ok(Json(WriteResponse {
        ok: true,
        message: "Spool and history purged".to_string(),
    }))
}

async fn require_companion_session(
    State(state): State<CompanionApiState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let headers = request.headers();
    if let Err(error) = require_allowed_host(headers, &state.runtime) {
        return error.into_response();
    }

    let session = match find_active_session(&state.sessions, &state.db_path, headers) {
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
        if let Err(error) = require_allowed_origin(headers, &state.runtime) {
            return error.into_response();
        }
        if !has_valid_csrf(headers, &session.csrf_token) {
            return CompanionApiError::Forbidden("Missing or invalid CSRF token".to_string())
                .into_response();
        }
    }

    next.run(request).await
}

#[cfg(test)]
#[path = "companion_api_tests.rs"]
mod companion_api_tests;
