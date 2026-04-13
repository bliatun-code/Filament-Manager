use crate::app_services::{CompanionService, CompanionSpoolDetail};
use crate::backend::filament_database::{
    ActiveSpoolLoanRow, FilamentDatabase, FilamentMasterCatalogRow, InventoryError,
    LibrarySyncSettingsRow, PrinterAmsSlotRow, PrinterOverviewRow, SpoolLoanDetailsRow,
    SpoolLoanRow, SpoolWithMasterRow, TrustedLanPairedBrowserRow, WishlistItemRow,
};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput, CreateWishlistItemInput,
    DeleteSpoolInput, LendSpoolInput, PurgeSpoolInput, RecordPrintUsageInput,
    ReturnSpoolLoanInput,
    UpdateBorrowedInSpoolInput, UpdateSpoolDetailsInput, UpdateWishlistStatusInput, WeightSource,
};
use crate::backend::statistics::{FilamentConsumptionRow, InventoryOverview, StatisticsEngine};
use crate::state::{AppState, TrustedLanCompanionRuntime};
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{
    header::{COOKIE, HOST, ORIGIN, SET_COOKIE},
    HeaderMap, HeaderValue, Method, Request, StatusCode,
};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

pub const COMPANION_DEFAULT_PORT: u16 = 4278;
const COMPANION_BROWSER_HTML: &str = include_str!("../companion_browser/index.html");
const COMPANION_BROWSER_APP_JS: &str = include_str!("../companion_browser/app.js");
const COMPANION_BROWSER_API_CLIENT_JS: &str =
    include_str!("../companion_browser/companion_api_client.js");
const COMPANION_BROWSER_APP_SHELL_JS: &str =
    include_str!("../companion_browser/companion_app_shell.js");
const COMPANION_BROWSER_CLICK_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_click_router.js");
const COMPANION_BROWSER_DATA_CONTROLLER_JS: &str =
    include_str!("../companion_browser/companion_data_controller.js");
const COMPANION_BROWSER_DOM_EVENTS_JS: &str =
    include_str!("../companion_browser/companion_dom_events.js");
const COMPANION_BROWSER_I18N_JS: &str = include_str!("../companion_browser/companion_i18n.js");
const COMPANION_BROWSER_INPUT_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_input_router.js");
const COMPANION_BROWSER_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_mutations.js");
const COMPANION_BROWSER_QR_PAYLOAD_JS: &str = include_str!("../companion_browser/qr_payload.js");
const COMPANION_BROWSER_RENDER_FOCUS_JS: &str =
    include_str!("../companion_browser/companion_render_focus.js");
const COMPANION_BROWSER_RUNTIME_STATE_JS: &str =
    include_str!("../companion_browser/companion_runtime_state.js");
const COMPANION_BROWSER_SHELL_STATE_JS: &str =
    include_str!("../companion_browser/companion_shell_state.js");
const COMPANION_BROWSER_SUBMIT_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_submit_router.js");
const COMPANION_BROWSER_THEME_JS: &str = include_str!("../companion_browser/companion_theme.js");
const COMPANION_BROWSER_DETAIL_CONTENT_JS: &str =
    include_str!("../companion_browser/detail_content.js");
const COMPANION_BROWSER_COMPANION_LOGIC_JS: &str =
    include_str!("../companion_browser/companion_logic.js");
const COMPANION_BROWSER_FORMATTERS_JS: &str = include_str!("../companion_browser/formatters.js");
const COMPANION_BROWSER_LOANS_SHELL_JS: &str = include_str!("../companion_browser/loans_shell.js");
const COMPANION_BROWSER_PRINTER_SLOT_LABELS_JS: &str =
    include_str!("../companion_browser/printer_slot_labels.js");
const COMPANION_BROWSER_PRINTER_WORKSPACE_JS: &str =
    include_str!("../companion_browser/printer_workspace.js");
const COMPANION_BROWSER_PRINTERS_SHELL_JS: &str =
    include_str!("../companion_browser/printers_shell.js");
const COMPANION_BROWSER_SESSION_STATE_JS: &str =
    include_str!("../companion_browser/session_state.js");
const COMPANION_BROWSER_SETTINGS_SHELL_JS: &str =
    include_str!("../companion_browser/settings_shell.js");
const COMPANION_BROWSER_SHELL_CHROME_JS: &str =
    include_str!("../companion_browser/shell_chrome.js");
const COMPANION_BROWSER_STORAGE_SHELL_JS: &str =
    include_str!("../companion_browser/storage_shell.js");
const COMPANION_BROWSER_CSS: &str = include_str!("../companion_browser/app.css");
const COMPANION_ICON_LIGHT_PNG: &[u8] = include_bytes!("../icons/dock-light.png");
const COMPANION_ICON_DARK_PNG: &[u8] = include_bytes!("../icons/dock-dark.png");
const COMPANION_SESSION_COOKIE: &str = "bfm_companion_session";
const COMPANION_TRUSTED_LAN_DEVICE_COOKIE: &str = "bfm_trusted_lan_device";
const COMPANION_CSRF_HEADER: &str = "x-csrf-token";
const COMPANION_SESSION_MAX_AGE_SECONDS: u64 = 8 * 60 * 60;
const COMPANION_TRUSTED_LAN_DEVICE_MAX_AGE_SECONDS: u64 = 30 * 24 * 60 * 60;
const COMPANION_QA_DELAY_HEADER: &str = "x-companion-qa-delay-ms";

#[derive(Clone, Copy)]
struct CompanionBrowserAsset {
    content_type: &'static str,
    content: &'static str,
}

#[derive(Clone, Copy)]
struct CompanionBinaryAsset {
    content_type: &'static str,
    content: &'static [u8],
}

#[derive(Clone)]
struct CompanionApiState {
    service: CompanionService,
    db_path: String,
    runtime: TrustedLanCompanionRuntime,
    sessions: Arc<RwLock<HashMap<String, CompanionSession>>>,
}

#[derive(Clone, Debug, Serialize)]
struct CompanionSession {
    csrf_token: String,
    created_at_epoch_s: u64,
    paired_browser_id: Option<String>,
}

#[derive(Debug)]
enum CompanionApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

#[derive(Deserialize, Default)]
struct PaginationQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Deserialize, Default)]
struct CatalogListQuery {
    limit: Option<i64>,
    search: Option<String>,
}

#[derive(Deserialize, Default)]
struct QrLookupQuery {
    qr_code: Option<String>,
}

#[derive(Deserialize, Default)]
struct LoanListQuery {
    limit: Option<i64>,
    include_returned: Option<bool>,
    direction: Option<String>,
}

#[derive(Deserialize, Default)]
struct FilamentConsumptionQuery {
    limit: Option<i64>,
    printer_id: Option<String>,
}

#[derive(Deserialize, Default)]
struct SpoolDetailQuery {
    history_limit: Option<i64>,
    usage_limit: Option<i64>,
}

#[derive(Deserialize)]
struct UpdateWeightRequest {
    grams: i64,
}

#[derive(Deserialize)]
struct UpdateSpoolTareWeightRequest {
    grams: i64,
}

#[derive(Deserialize, Default)]
struct DeleteSpoolRequest {
    reason: Option<String>,
}

#[derive(Deserialize)]
struct UpdatePrinterSlotAssignmentRequest {
    spool_id: Option<String>,
}

#[derive(Deserialize)]
struct RecordPrintUsageRequest {
    grams: i64,
    job_name: Option<String>,
    success: Option<bool>,
}

#[derive(Deserialize)]
struct CreateSpoolLoanRequest {
    borrower_name: String,
    grams_out: Option<i64>,
    note: Option<String>,
}

#[derive(Deserialize)]
struct CreateOwnedSpoolRequest {
    master_id: Option<String>,
    material: Option<String>,
    filament_name: Option<String>,
    color_name: Option<String>,
    vendor: Option<String>,
    initial_weight_g: Option<i64>,
    qr_code: Option<String>,
    location: Option<String>,
    hex_color: Option<String>,
}

#[derive(Deserialize)]
struct CreateBorrowedInSpoolRequest {
    master_id: Option<String>,
    owner_name: String,
    owner_contact: Option<String>,
    ownership_note: Option<String>,
    material: Option<String>,
    filament_name: Option<String>,
    color_name: Option<String>,
    vendor: Option<String>,
    initial_weight_g: Option<i64>,
    qr_code: Option<String>,
    location: Option<String>,
    hex_color: Option<String>,
}

#[derive(Deserialize)]
struct CreateWishlistItemRequest {
    master_id: Option<String>,
    material: String,
    filament_name: String,
    color_name: String,
    vendor: Option<String>,
    quantity: Option<i64>,
    note: Option<String>,
}

#[derive(Deserialize)]
struct UpdateWishlistItemStatusRequest {
    status: String,
}

#[derive(Deserialize)]
struct SetActivePrinterRequest {
    printer_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateBorrowedInSpoolRequest {
    owner_name: String,
    owner_contact: Option<String>,
    ownership_note: Option<String>,
}

#[derive(Deserialize)]
struct UpdateSpoolDetailsRequest {
    status: String,
    location: Option<String>,
}

#[derive(Deserialize)]
struct ReturnSpoolLoanRequest {
    returned_grams: i64,
    note: Option<String>,
}

#[derive(Deserialize)]
struct PairSessionRequest {
    pairing_token: String,
}

#[derive(Serialize)]
struct CompanionHealthResponse {
    ok: bool,
    api_version: &'static str,
    auth_mode: String,
    access_mode: &'static str,
    library_id: String,
    device_name: String,
    sync_mode: String,
}

#[derive(Serialize)]
struct CompanionLibrarySnapshotResponse {
    ok: bool,
    captured_at: String,
    library_id: String,
    device_name: String,
    sync_mode: String,
    inventory: InventoryOverview,
    active_loans: i64,
    printers: i64,
}

#[derive(Serialize)]
struct AuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
    expires_in_seconds: u64,
}

#[derive(Serialize)]
struct WriteResponse {
    ok: bool,
    message: String,
}

#[derive(Serialize)]
struct SessionStatusResponse {
    ok: bool,
    auth_mode: String,
    access_mode: String,
    authenticated: bool,
    csrf_token: Option<String>,
    can_renew: bool,
}

#[derive(Serialize)]
struct LoanWriteResponse {
    ok: bool,
    message: String,
    loan: SpoolLoanRow,
}

#[derive(Serialize)]
struct CreateSpoolResponse {
    ok: bool,
    message: String,
    spool_id: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    ok: bool,
    message: String,
}

pub fn generate_pairing_token() -> String {
    random_hex_token(24)
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

    let api_state = CompanionApiState {
        service: CompanionService::new(state.db_path.clone()),
        db_path: state.db_path.clone(),
        runtime: state.companion.trusted_lan.clone(),
        sessions: Arc::new(RwLock::new(HashMap::new())),
    };
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let runtime = state.companion.trusted_lan.clone();
    let join_handle = tauri::async_runtime::spawn(async move {
        let _ = run_companion_server(listener, api_state, Some(shutdown_rx))
            .await
            .map_err(|error| {
                runtime.mark_failed(error.clone());
                error
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
        .route("/printers/:printer_id/delete", post(handle_delete_printer))
        .route("/printers/active", post(handle_set_active_printer))
        .route("/loans/active", get(handle_list_active_spool_loans))
        .route("/wishlist", get(handle_list_wishlist_items))
        .route("/wishlist", post(handle_create_wishlist_item))
        .route(
            "/wishlist/:item_id/status",
            post(handle_update_wishlist_item_status),
        )
        .route(
            "/wishlist/:item_id/delete",
            post(handle_delete_wishlist_item),
        )
        .route("/spools/by-qr", get(handle_find_spool_by_qr))
        .route("/spools/owned", post(handle_create_owned_spool))
        .route("/spools/manual", post(handle_create_owned_spool))
        .route("/spools/borrowed-in", post(handle_create_borrowed_in_spool))
        .route(
            "/spools/:spool_id/borrowed-in",
            post(handle_update_borrowed_in_spool),
        )
        .route(
            "/spools/:spool_id/details",
            post(handle_update_spool_details),
        )
        .route(
            "/spools/:spool_id/qr-image.svg",
            get(handle_spool_qr_image_svg),
        )
        .route(
            "/printers/:printer_id/slots/:slot_id/assignment",
            post(handle_update_printer_slot_assignment),
        )
        .route(
            "/printers/:printer_id/spools/:spool_id/usage",
            post(handle_record_print_usage),
        )
        .route("/spools/:spool_id", get(handle_get_spool_detail))
        .route("/spools/:spool_id/lend", post(handle_lend_spool))
        .route("/spools/:spool_id/weight", post(handle_update_spool_weight))
        .route(
            "/spools/:spool_id/tare-weight",
            post(handle_update_spool_tare_weight),
        )
        .route("/spools/:spool_id/delete", post(handle_delete_spool))
        .route("/spools/:spool_id/purge", post(handle_purge_spool))
        .route("/loans/:loan_id/return", post(handle_return_spool_loan))
        .route(
            "/loans/:loan_id/hand-back",
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
        .route("/companion/:asset", get(handle_companion_asset))
        .route("/api/v1/health", get(handle_health))
        .route("/api/v1/library/snapshot", get(handle_library_snapshot))
        .route("/api/v1/library/spools", get(handle_library_spools))
        .route("/api/v1/library/printers", get(handle_library_printers))
        .route("/api/v1/library/loans", get(handle_library_loans))
        .route(
            "/api/v1/library/statistics/filament-consumption",
            get(handle_library_filament_consumption),
        )
        .route("/api/v1/library/catalog/masters", get(handle_library_catalog_masters))
        .route("/api/v1/library/wishlist", get(handle_library_wishlist_items))
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

    let active_session = find_active_session(&state, &headers)?;
    let mut authenticated = false;
    let mut csrf_token = None;
    let mut can_renew = false;

    if let Some(session) = active_session {
        authenticated = true;
        csrf_token = Some(session.csrf_token);
    } else {
        can_renew = find_active_trusted_lan_browser(&state, &headers)?.is_some();
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
    let db = open_companion_db(&state)?;
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
        &state,
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

    let paired_browser = find_active_trusted_lan_browser(&state, &headers)?.ok_or_else(|| {
        CompanionApiError::Unauthorized("Trusted-LAN browser pairing is required".to_string())
    })?;

    let origin = header_string(&headers, ORIGIN).map(|value| value.trim().to_string());
    build_authenticated_session_response(&state, Some(paired_browser.id), None, origin.as_deref())
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
        state
            .service
            .get_spool(qr_code)
            .map_err(CompanionApiError::from)?
            .ok_or_else(|| {
                CompanionApiError::NotFound("No spool found for that QR code".to_string())
            })?
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
                location_id: None,
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
                    location,
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
                    location,
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
    let slot = find_printer_slot(&state, printer_id, slot_id)?;

    if slot.spool_id.is_none() && target_spool_id.is_none() {
        return Err(CompanionApiError::BadRequest(
            "Slot is already empty".to_string(),
        ));
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
        .assign_printer_slot(printer_id, slot_id, target_spool_id)
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
    if current_status == "IN_USE" || spool_assigned_to_printer(&state, spool_id)? {
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
            location: normalize_optional_text(payload.location.as_deref()),
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

    let session = match find_active_session(&state, headers) {
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

fn require_allowed_host(
    headers: &HeaderMap,
    runtime: &TrustedLanCompanionRuntime,
) -> Result<(), CompanionApiError> {
    let Some(host) = header_string(headers, HOST) else {
        return Ok(());
    };

    if is_allowed_host(host, runtime) {
        Ok(())
    } else {
        Err(CompanionApiError::Forbidden(
            "Host header is not allowed for the trusted-LAN companion API".to_string(),
        ))
    }
}

fn require_allowed_origin(
    headers: &HeaderMap,
    runtime: &TrustedLanCompanionRuntime,
) -> Result<(), CompanionApiError> {
    let Some(origin) = header_string(headers, ORIGIN) else {
        return Err(CompanionApiError::Forbidden(
            "Origin header is required for mutating companion requests".to_string(),
        ));
    };

    if is_allowed_origin(origin, runtime) {
        Ok(())
    } else {
        Err(CompanionApiError::Forbidden(
            "Origin header is not allowed for the trusted-LAN companion API".to_string(),
        ))
    }
}

async fn maybe_apply_qa_delay(
    runtime: &TrustedLanCompanionRuntime,
    headers: &HeaderMap,
) -> Result<(), CompanionApiError> {
    if !runtime.qa_mode() {
        return Ok(());
    }

    let Some(delay_header) = header_string(
        headers,
        axum::http::header::HeaderName::from_static(COMPANION_QA_DELAY_HEADER),
    ) else {
        return Ok(());
    };

    let delay_ms = delay_header
        .trim()
        .parse::<u64>()
        .map_err(|_| CompanionApiError::BadRequest("Invalid QA delay header".to_string()))?;
    let clamped_delay_ms = delay_ms.clamp(1, 5_000);
    tokio::time::sleep(Duration::from_millis(clamped_delay_ms)).await;
    Ok(())
}

fn header_string<'a>(
    headers: &'a HeaderMap,
    header_name: axum::http::header::HeaderName,
) -> Option<&'a str> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
}

fn is_allowed_host(host: &str, runtime: &TrustedLanCompanionRuntime) -> bool {
    let normalized = host.trim().to_ascii_lowercase();
    let runtime_host = runtime
        .bind_address()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    normalized == runtime_host
}

fn is_allowed_origin(origin: &str, runtime: &TrustedLanCompanionRuntime) -> bool {
    let normalized = origin.trim().trim_end_matches('/').to_ascii_lowercase();
    let runtime_origin = runtime
        .base_url()
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_ascii_lowercase();
    normalized == runtime_origin
}

fn find_printer_slot(
    state: &CompanionApiState,
    printer_id: &str,
    slot_id: &str,
) -> Result<PrinterAmsSlotRow, CompanionApiError> {
    state
        .service
        .list_printer_overview()
        .map_err(CompanionApiError::from)?
        .into_iter()
        .find(|printer| printer.printer.id == printer_id)
        .and_then(|printer| {
            printer
                .slots
                .into_iter()
                .find(|slot| slot.slot_id == slot_id)
        })
        .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))
}

fn spool_assigned_to_printer(
    state: &CompanionApiState,
    spool_id: &str,
) -> Result<bool, CompanionApiError> {
    Ok(state
        .service
        .list_printer_overview()
        .map_err(CompanionApiError::from)?
        .into_iter()
        .flat_map(|printer| printer.slots.into_iter())
        .any(|slot| slot.spool_id.as_deref() == Some(spool_id)))
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<String> {
    cookie_value_from_headers(headers, COMPANION_SESSION_COOKIE)
}

fn trusted_lan_device_token_from_headers(headers: &HeaderMap) -> Option<String> {
    cookie_value_from_headers(headers, COMPANION_TRUSTED_LAN_DEVICE_COOKIE)
}

fn cookie_value_from_headers(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    let cookie_header = header_string(headers, COOKIE)?;
    for entry in cookie_header.split(';') {
        let trimmed = entry.trim();
        let (name, value) = trimmed.split_once('=')?;
        if name == cookie_name && !value.trim().is_empty() {
            return Some(value.trim().to_string());
        }
    }
    None
}

fn build_session_cookie(session_id: &str) -> String {
    format!(
        "{COMPANION_SESSION_COOKIE}={session_id}; HttpOnly; SameSite=Strict; Max-Age={COMPANION_SESSION_MAX_AGE_SECONDS}; Path=/api/v1"
    )
}

fn build_trusted_lan_device_cookie(device_token: &str) -> String {
    format!(
        "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_token}; HttpOnly; SameSite=Strict; Max-Age={COMPANION_TRUSTED_LAN_DEVICE_MAX_AGE_SECONDS}; Path=/api/v1/auth"
    )
}

fn requires_csrf(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn has_valid_csrf(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get(COMPANION_CSRF_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim() == expected)
        .unwrap_or(false)
}

fn hash_secret(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{:02x}", byte));
    }
    output
}

fn open_companion_db(state: &CompanionApiState) -> Result<FilamentDatabase, CompanionApiError> {
    FilamentDatabase::open(&state.db_path).map_err(|error| {
        CompanionApiError::Internal(format!("Failed to open companion database: {error}"))
    })
}

fn find_active_session(
    state: &CompanionApiState,
    headers: &HeaderMap,
) -> Result<Option<CompanionSession>, CompanionApiError> {
    let Some(session_id) = session_id_from_headers(headers) else {
        return Ok(None);
    };

    let session = state
        .sessions
        .read()
        .map_err(|_| CompanionApiError::Internal("Failed to read session state".to_string()))?
        .get(session_id.as_str())
        .cloned();

    let Some(session) = session else {
        return Ok(None);
    };
    if session_is_expired(&session) {
        return Ok(None);
    }

    let Some(browser_id) = session.paired_browser_id.as_deref() else {
        return Ok(None);
    };
    let db = open_companion_db(state)?;
    let browser = db
        .get_trusted_lan_paired_browser_by_id(browser_id)
        .map_err(CompanionApiError::from)?;
    if browser
        .as_ref()
        .and_then(|value| value.revoked_at.as_ref())
        .is_some()
    {
        return Ok(None);
    }

    Ok(Some(session))
}

fn find_active_trusted_lan_browser(
    state: &CompanionApiState,
    headers: &HeaderMap,
) -> Result<Option<TrustedLanPairedBrowserRow>, CompanionApiError> {
    let Some(device_token) = trusted_lan_device_token_from_headers(headers) else {
        return Ok(None);
    };

    let db = open_companion_db(state)?;
    let device_token_hash = hash_secret(&device_token);
    db.get_active_trusted_lan_paired_browser_by_device_token_hash(&device_token_hash)
        .map_err(CompanionApiError::from)
}

fn build_authenticated_session_response(
    state: &CompanionApiState,
    paired_browser_id: Option<String>,
    device_token: Option<&str>,
    last_origin: Option<&str>,
) -> Result<Response, CompanionApiError> {
    let session_id = random_hex_token(32);
    let csrf_token = random_hex_token(24);
    let session = CompanionSession {
        csrf_token: csrf_token.clone(),
        created_at_epoch_s: unix_epoch_seconds(),
        paired_browser_id: paired_browser_id.clone(),
    };

    state
        .sessions
        .write()
        .map_err(|_| CompanionApiError::Internal("Failed to write session state".to_string()))?
        .insert(session_id.clone(), session);

    if let Some(browser_id) = paired_browser_id.as_deref() {
        let db = open_companion_db(state)?;
        db.touch_trusted_lan_paired_browser(browser_id, last_origin)
            .map_err(CompanionApiError::from)?;
    }

    let response_body = AuthenticatedSessionResponse {
        ok: true,
        csrf_token,
        expires_in_seconds: COMPANION_SESSION_MAX_AGE_SECONDS,
    };
    let mut response = Json(response_body).into_response();
    let session_cookie = build_session_cookie(&session_id);
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&session_cookie).map_err(|error| {
            CompanionApiError::Internal(format!("Failed to build session cookie: {error}"))
        })?,
    );
    if let Some(device_token) = device_token {
        let device_cookie = build_trusted_lan_device_cookie(device_token);
        response.headers_mut().append(
            SET_COOKIE,
            HeaderValue::from_str(&device_cookie).map_err(|error| {
                CompanionApiError::Internal(format!(
                    "Failed to build trusted-LAN device cookie: {error}"
                ))
            })?,
        );
    }
    Ok(response)
}

fn session_is_expired(session: &CompanionSession) -> bool {
    unix_epoch_seconds().saturating_sub(session.created_at_epoch_s)
        > COMPANION_SESSION_MAX_AGE_SECONDS
}

fn unix_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn random_hex_token(byte_count: usize) -> String {
    let mut bytes = vec![0u8; byte_count];
    OsRng.fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn generate_companion_spool_id() -> String {
    format!(
        "spool_companion_{}_{}",
        unix_epoch_millis(),
        random_hex_token(4)
    )
}

fn unix_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalize_optional_hex_color(value: Option<&str>) -> Result<Option<String>, CompanionApiError> {
    let Some(value) = normalize_optional_text(value) else {
        return Ok(None);
    };

    let normalized = if value.starts_with('#') {
        value.to_uppercase()
    } else {
        format!("#{}", value.to_uppercase())
    };

    let valid = match normalized.len() {
        4 => normalized
            .chars()
            .skip(1)
            .all(|char| char.is_ascii_hexdigit()),
        7 => normalized
            .chars()
            .skip(1)
            .all(|char| char.is_ascii_hexdigit()),
        _ => false,
    };

    if !valid {
        return Err(CompanionApiError::BadRequest(
            "hex_color must use #RGB or #RRGGBB".to_string(),
        ));
    }

    Ok(Some(normalized))
}

fn encode_versioned_qr_ref(reference: &str) -> String {
    format!("v1:{}", reference.trim())
}

fn build_companion_spool_qr_payload(
    runtime: &TrustedLanCompanionRuntime,
    reference: &str,
) -> String {
    let encoded_ref = encode_versioned_qr_ref(reference);
    let shell_url = runtime.snapshot().shell_url.unwrap_or_default();
    if shell_url.trim().is_empty() {
        return encoded_ref;
    }
    match reqwest::Url::parse(shell_url.trim()) {
        Ok(mut url) => {
            url.query_pairs_mut().append_pair("spool_qr", &encoded_ref);
            url.to_string()
        }
        Err(_) => encoded_ref,
    }
}

fn build_qr_svg(payload: &str) -> Result<String, CompanionApiError> {
    use qrcode::render::svg;
    use qrcode::QrCode;

    let code = QrCode::new(payload.as_bytes())
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(224, 224)
        .dark_color(svg::Color("#0f172a"))
        .light_color(svg::Color("#ffffff"))
        .build())
}

struct NormalizedManualSpoolFields {
    material: String,
    filament_name: String,
    color_name: String,
}

fn normalize_owned_manual_fields(
    material: Option<&str>,
    filament_name: Option<&str>,
    color_name: Option<&str>,
) -> Result<NormalizedManualSpoolFields, CompanionApiError> {
    let material = material.unwrap_or("").trim();
    if material.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "material is required when master_id is missing".to_string(),
        ));
    }

    let filament_name = filament_name.unwrap_or("").trim();
    if filament_name.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "filament_name is required when master_id is missing".to_string(),
        ));
    }

    let color_name = color_name.unwrap_or("").trim();
    if color_name.is_empty() {
        return Err(CompanionApiError::BadRequest(
            "color_name is required when master_id is missing".to_string(),
        ));
    }

    Ok(NormalizedManualSpoolFields {
        material: material.to_string(),
        filament_name: filament_name.to_string(),
        color_name: color_name.to_string(),
    })
}

fn validate_initial_weight(initial_weight_g: Option<i64>) -> Result<(), CompanionApiError> {
    if let Some(initial_weight_g) = initial_weight_g {
        if initial_weight_g < 0 {
            return Err(CompanionApiError::BadRequest(
                "initial_weight_g must be zero or greater".to_string(),
            ));
        }
    }
    Ok(())
}

fn companion_browser_asset(path: &str) -> Option<CompanionBrowserAsset> {
    match path {
        "app.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_APP_JS,
        }),
        "companion_api_client.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_API_CLIENT_JS,
        }),
        "companion_app_shell.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_APP_SHELL_JS,
        }),
        "companion_click_router.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_CLICK_ROUTER_JS,
        }),
        "companion_data_controller.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_DATA_CONTROLLER_JS,
        }),
        "companion_dom_events.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_DOM_EVENTS_JS,
        }),
        "companion_i18n.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_I18N_JS,
        }),
        "companion_input_router.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_INPUT_ROUTER_JS,
        }),
        "companion_mutations.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_MUTATIONS_JS,
        }),
        "qr_payload.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_QR_PAYLOAD_JS,
        }),
        "companion_render_focus.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_RENDER_FOCUS_JS,
        }),
        "companion_runtime_state.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_RUNTIME_STATE_JS,
        }),
        "companion_shell_state.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SHELL_STATE_JS,
        }),
        "companion_submit_router.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SUBMIT_ROUTER_JS,
        }),
        "companion_theme.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_THEME_JS,
        }),
        "detail_content.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_DETAIL_CONTENT_JS,
        }),
        "companion_logic.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_COMPANION_LOGIC_JS,
        }),
        "formatters.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_FORMATTERS_JS,
        }),
        "loans_shell.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_LOANS_SHELL_JS,
        }),
        "printer_slot_labels.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_PRINTER_SLOT_LABELS_JS,
        }),
        "printer_workspace.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_PRINTER_WORKSPACE_JS,
        }),
        "printers_shell.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_PRINTERS_SHELL_JS,
        }),
        "session_state.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SESSION_STATE_JS,
        }),
        "settings_shell.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SETTINGS_SHELL_JS,
        }),
        "shell_chrome.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SHELL_CHROME_JS,
        }),
        "storage_shell.js" => Some(CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_STORAGE_SHELL_JS,
        }),
        "app.css" => Some(CompanionBrowserAsset {
            content_type: "text/css; charset=utf-8",
            content: COMPANION_BROWSER_CSS,
        }),
        _ => None,
    }
}

fn companion_browser_binary_asset(path: &str) -> Option<CompanionBinaryAsset> {
    match path {
        "icon-light.png" => Some(CompanionBinaryAsset {
            content_type: "image/png",
            content: COMPANION_ICON_LIGHT_PNG,
        }),
        "icon-dark.png" => Some(CompanionBinaryAsset {
            content_type: "image/png",
            content: COMPANION_ICON_DARK_PNG,
        }),
        _ => None,
    }
}

fn text_response(content_type: &'static str, content: &'static str) -> Response {
    (
        [
            (axum::http::header::CONTENT_TYPE, content_type),
            (axum::http::header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        content,
    )
        .into_response()
}

fn string_response(content_type: &'static str, content: String) -> Response {
    (
        [
            (axum::http::header::CONTENT_TYPE, content_type),
            (axum::http::header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        content,
    )
        .into_response()
}

fn bytes_response(content_type: &'static str, content: &'static [u8]) -> Response {
    Response::builder()
        .header(axum::http::header::CONTENT_TYPE, content_type)
        .header(axum::http::header::CACHE_CONTROL, "no-store, max-age=0")
        .body(Body::from(content))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

fn html_response(content: &'static str) -> Response {
    text_response("text/html; charset=utf-8", content)
}

impl From<InventoryError> for CompanionApiError {
    fn from(error: InventoryError) -> Self {
        match error {
            InventoryError::NotFound => CompanionApiError::NotFound("Record not found".to_string()),
            InventoryError::Db(message) => CompanionApiError::Internal(message),
        }
    }
}

impl IntoResponse for CompanionApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            CompanionApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            CompanionApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            CompanionApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            CompanionApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            CompanionApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        (status, Json(ErrorResponse { ok: false, message })).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_router, hash_secret, CompanionApiState, COMPANION_CSRF_HEADER,
        COMPANION_SESSION_COOKIE, COMPANION_TRUSTED_LAN_DEVICE_COOKIE,
    };
    use crate::app_services::CompanionService;
    use crate::backend::filament_database::FilamentDatabase;
    use crate::backend::inventory_engine::{
        CreateManualSpoolInput, CreatePrinterInput, InventoryEngine,
    };
    use crate::state::TrustedLanCompanionRuntime;
    use axum::body::{to_bytes, Body};
    use axum::http::{header::SET_COOKIE, HeaderMap, Request, StatusCode};
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Arc, RwLock};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tower::ServiceExt;

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "filament-manager-companion-api-{test_name}-{nanos}.db"
        ))
    }

    fn seed_db(db_path: &PathBuf) -> Result<(), String> {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);
        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;
        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_2".to_string(),
                material: "PLA".to_string(),
                filament_name: "Matte".to_string(),
                color_name: "Black".to_string(),
                hex_color: Some("#111111".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-2".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;
        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())
    }

    fn trusted_lan_runtime_for_address(address: &str) -> TrustedLanCompanionRuntime {
        let runtime = TrustedLanCompanionRuntime::new(4278)
            .with_selected_interface("Test interface", address)
            .with_enabled(true);
        runtime.mark_running();
        runtime
    }

    fn test_state(db_path: &PathBuf) -> CompanionApiState {
        CompanionApiState {
            service: CompanionService::new(db_path.to_string_lossy().to_string()),
            db_path: db_path.to_string_lossy().to_string(),
            runtime: trusted_lan_runtime_for_address("127.0.0.1"),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn qa_test_state(db_path: &PathBuf) -> CompanionApiState {
        CompanionApiState {
            service: CompanionService::new(db_path.to_string_lossy().to_string()),
            db_path: db_path.to_string_lossy().to_string(),
            runtime: trusted_lan_runtime_for_address("127.0.0.1").with_qa_mode(true),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn trusted_lan_test_state(db_path: &PathBuf) -> CompanionApiState {
        CompanionApiState {
            service: CompanionService::new(db_path.to_string_lossy().to_string()),
            db_path: db_path.to_string_lossy().to_string(),
            runtime: trusted_lan_runtime_for_address("192.168.1.50"),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn extract_cookie_value(set_cookie: &str) -> Result<String, String> {
        let cookie_pair = set_cookie
            .split(';')
            .next()
            .ok_or_else(|| "missing cookie pair".to_string())?;
        let (_, value) = cookie_pair
            .split_once('=')
            .ok_or_else(|| "missing cookie value".to_string())?;
        Ok(value.to_string())
    }

    fn extract_named_cookie(headers: &HeaderMap, cookie_name: &str) -> Result<String, String> {
        for header_value in headers.get_all(SET_COOKIE).iter() {
            let set_cookie = header_value
                .to_str()
                .map_err(|error| format!("invalid Set-Cookie header: {error}"))?;
            let cookie_pair = set_cookie
                .split(';')
                .next()
                .ok_or_else(|| "missing cookie pair".to_string())?;
            let (name, _) = cookie_pair
                .split_once('=')
                .ok_or_else(|| "missing cookie value".to_string())?;
            if name == cookie_name {
                return extract_cookie_value(set_cookie);
            }
        }

        Err(format!("missing {cookie_name} cookie"))
    }

    struct AuthenticatedTestSession {
        session_cookie: String,
        csrf_token: String,
    }

    async fn pair_test_session(
        router: &axum::Router,
        db_path: &PathBuf,
    ) -> Result<AuthenticatedTestSession, String> {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let pairing_token = format!("pairing-{}", hash_secret(&db_path.to_string_lossy()));
        db.create_trusted_lan_pairing(Some("Test Browser"), &hash_secret(&pairing_token), 600)
            .map_err(|error| error.to_string())?;

        let pair = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/pair")
                    .header("content-type", "application/json")
                    .header("host", "127.0.0.1:4278")
                    .header("origin", "http://127.0.0.1:4278")
                    .body(Body::from(format!(
                        r#"{{"pairing_token":"{pairing_token}"}}"#
                    )))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|error| error.to_string())?;
        assert_eq!(pair.status(), StatusCode::OK);

        let session_cookie = extract_named_cookie(pair.headers(), COMPANION_SESSION_COOKIE)?;
        let _device_cookie =
            extract_named_cookie(pair.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE)?;
        let pair_body = to_bytes(pair.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?;
        let pair_body_text =
            String::from_utf8(pair_body.to_vec()).map_err(|error| error.to_string())?;
        let csrf_token = extract_csrf_token(&pair_body_text)?;

        Ok(AuthenticatedTestSession {
            session_cookie,
            csrf_token,
        })
    }

    fn extract_csrf_token(body_text: &str) -> Result<String, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        parsed
            .get("csrf_token")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "missing csrf_token".to_string())
    }

    fn extract_first_slot_id(body_text: &str) -> Result<String, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        parsed
            .get(0)
            .and_then(|printer| printer.get("slots"))
            .and_then(|slots| slots.get(0))
            .and_then(|slot| slot.get("slot_id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "missing slot_id".to_string())
    }

    fn extract_loan_id(body_text: &str) -> Result<String, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        parsed
            .get("loan")
            .and_then(|loan| loan.get("id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "missing loan.id".to_string())
    }

    fn extract_active_loan_id_from_spool_detail(body_text: &str) -> Result<Option<String>, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        Ok(parsed
            .get("active_loan")
            .and_then(|loan| loan.get("loan"))
            .and_then(|loan| loan.get("id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()))
    }

    fn extract_active_loan_ids(body_text: &str) -> Result<Vec<String>, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        let rows = parsed
            .as_array()
            .ok_or_else(|| "active loans response was not an array".to_string())?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                row.get("loan")
                    .and_then(|loan| loan.get("id"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            })
            .collect())
    }

    fn extract_loan_statuses(body_text: &str) -> Result<Vec<String>, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        let rows = parsed
            .as_array()
            .ok_or_else(|| "loan response was not an array".to_string())?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                row.get("loan")
                    .and_then(|loan| loan.get("loan_status"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            })
            .collect())
    }

    fn extract_spool_id(body_text: &str) -> Result<String, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        parsed
            .get("spool_id")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "missing spool_id".to_string())
    }

    fn extract_wishlist_item_id(body_text: &str, filament_name: &str) -> Result<String, String> {
        let parsed: serde_json::Value =
            serde_json::from_str(body_text).map_err(|error| error.to_string())?;
        let rows = parsed
            .as_array()
            .ok_or_else(|| "wishlist response was not an array".to_string())?;
        rows.iter()
            .find(|row| {
                row.get("filament_name")
                    .and_then(|value| value.as_str())
                    .map(|value| value == filament_name)
                    .unwrap_or(false)
            })
            .and_then(|row| row.get("id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "missing wishlist item id".to_string())
    }

    #[tokio::test]
    async fn companion_api_pairs_session_and_requires_csrf_for_writes() {
        let db_path = temp_db_path("paired-session");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let unauthorized = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools")
                        .header("host", "127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let authorized_read = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(authorized_read.status(), StatusCode::OK);

            let initial_history = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans?include_returned=true")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(initial_history.status(), StatusCode::OK);
            let initial_history_body = to_bytes(initial_history.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let initial_history_text = String::from_utf8(initial_history_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(extract_loan_statuses(&initial_history_text)?.is_empty());

            let printer_overview = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/printers/overview")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(printer_overview.status(), StatusCode::OK);
            let printer_body = to_bytes(printer_overview.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let printer_text =
                String::from_utf8(printer_body.to_vec()).map_err(|error| error.to_string())?;
            let slot_id = extract_first_slot_id(&printer_text)?;

            let active_loans_before_lend = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans/active")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(active_loans_before_lend.status(), StatusCode::OK);
            let active_loans_before_lend_body =
                to_bytes(active_loans_before_lend.into_body(), usize::MAX)
                    .await
                    .map_err(|error| error.to_string())?;
            let active_loans_before_lend_text =
                String::from_utf8(active_loans_before_lend_body.to_vec())
                    .map_err(|error| error.to_string())?;
            assert!(extract_active_loan_ids(&active_loans_before_lend_text)?.is_empty());

            let forbidden_write = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/weight")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::from(r#"{"grams":740}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(forbidden_write.status(), StatusCode::FORBIDDEN);

            let successful_write = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/weight")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"grams":740}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(successful_write.status(), StatusCode::OK);

            let assign_slot = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!(
                            "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                        ))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"spool_id":"spool_1"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(assign_slot.status(), StatusCode::OK);

            let replace_slot = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!(
                            "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                        ))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"spool_id":"spool_2"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(replace_slot.status(), StatusCode::BAD_REQUEST);

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/spool_1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"remaining_g\":740"));
            assert!(detail_text.contains("\"status\":\"IN_USE\""));

            let clear_slot = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!(
                            "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                        ))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"spool_id":null}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(clear_slot.status(), StatusCode::OK);

            let lend_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/lend")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"borrower_name":"Alice","grams_out":690,"note":"Prototype batch"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(lend_spool.status(), StatusCode::OK);

            let lend_body = to_bytes(lend_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let lend_text =
                String::from_utf8(lend_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(lend_text.contains("\"message\":\"Spool loan created\""));
            assert!(lend_text.contains("\"borrower_name\":\"Alice\""));
            assert!(lend_text.contains("\"grams_out\":690"));
            let loan_id = extract_loan_id(&lend_text)?;

            let active_loans_after_lend = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans/active")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(active_loans_after_lend.status(), StatusCode::OK);
            let active_loans_after_lend_body =
                to_bytes(active_loans_after_lend.into_body(), usize::MAX)
                    .await
                    .map_err(|error| error.to_string())?;
            let active_loans_after_lend_text =
                String::from_utf8(active_loans_after_lend_body.to_vec())
                    .map_err(|error| error.to_string())?;
            assert_eq!(
                extract_active_loan_ids(&active_loans_after_lend_text)?,
                vec![loan_id.clone()]
            );

            let history_after_lend = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans?include_returned=true")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(history_after_lend.status(), StatusCode::OK);
            let history_after_lend_body = to_bytes(history_after_lend.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let history_after_lend_text = String::from_utf8(history_after_lend_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert_eq!(
                extract_loan_statuses(&history_after_lend_text)?,
                vec!["ACTIVE".to_string()]
            );

            let borrowed_detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/spool_1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(borrowed_detail.status(), StatusCode::OK);
            let borrowed_detail_body = to_bytes(borrowed_detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let borrowed_detail_text = String::from_utf8(borrowed_detail_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(borrowed_detail_text.contains("\"status\":\"BORROWED\""));
            assert_eq!(
                extract_active_loan_id_from_spool_detail(&borrowed_detail_text)?,
                Some(loan_id.clone())
            );

            let return_loan = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!("/api/v1/loans/{loan_id}/return"))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"returned_grams":660,"note":"Returned after prototype"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(return_loan.status(), StatusCode::OK);
            let return_body = to_bytes(return_loan.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let return_text =
                String::from_utf8(return_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(return_text.contains("\"message\":\"Spool loan returned\""));
            assert!(return_text.contains("\"returned_grams\":660"));

            let returned_detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/spool_1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(returned_detail.status(), StatusCode::OK);
            let returned_detail_body = to_bytes(returned_detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let returned_detail_text = String::from_utf8(returned_detail_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(returned_detail_text.contains("\"status\":\"IN_STOCK\""));
            assert!(returned_detail_text.contains("\"remaining_g\":660"));
            assert_eq!(
                extract_active_loan_id_from_spool_detail(&returned_detail_text)?,
                None
            );

            let active_loans_after_return = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans/active")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(active_loans_after_return.status(), StatusCode::OK);
            let active_loans_after_return_body =
                to_bytes(active_loans_after_return.into_body(), usize::MAX)
                    .await
                    .map_err(|error| error.to_string())?;
            let active_loans_after_return_text =
                String::from_utf8(active_loans_after_return_body.to_vec())
                    .map_err(|error| error.to_string())?;
            assert!(extract_active_loan_ids(&active_loans_after_return_text)?.is_empty());

            let history_after_return = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/loans?include_returned=true")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(history_after_return.status(), StatusCode::OK);
            let history_after_return_body = to_bytes(history_after_return.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let history_after_return_text = String::from_utf8(history_after_return_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert_eq!(
                extract_loan_statuses(&history_after_return_text)?,
                vec!["RETURNED".to_string()]
            );

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_pairs_session_and_requires_csrf_for_writes failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_trusted_lan_requires_exact_host_and_pairing() {
        let db_path = temp_db_path("trusted-lan-session-status");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let session_status = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/auth/session")
                        .header("host", "127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(session_status.status(), StatusCode::OK);
            let session_status_body = to_bytes(session_status.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let session_status_text = String::from_utf8(session_status_body.to_vec())
                .map_err(|error| error.to_string())?;
            let session_status_json: serde_json::Value =
                serde_json::from_str(&session_status_text).map_err(|error| error.to_string())?;
            assert_eq!(
                session_status_json
                    .get("auth_mode")
                    .and_then(|value| value.as_str()),
                Some("pairing-session")
            );
            assert_eq!(
                session_status_json
                    .get("access_mode")
                    .and_then(|value| value.as_str()),
                Some("trusted-lan")
            );
            assert_eq!(
                session_status_json
                    .get("authenticated")
                    .and_then(|value| value.as_bool()),
                Some(false)
            );
            assert_eq!(
                session_status_json
                    .get("can_renew")
                    .and_then(|value| value.as_bool()),
                Some(false)
            );

            let protected_read = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools")
                        .header("host", "192.168.1.50:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(protected_read.status(), StatusCode::FORBIDDEN);

            let localhost_health = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/health")
                        .header("host", "localhost:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(localhost_health.status(), StatusCode::FORBIDDEN);

            let localhost_pair = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/pair")
                        .header("content-type", "application/json")
                        .header("host", "localhost:4278")
                        .header("origin", "http://localhost:4278")
                        .body(Body::from(r#"{"pairing_token":"unused-token"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(localhost_pair.status(), StatusCode::FORBIDDEN);

            let host_health = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/health")
                        .header("host", "127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(host_health.status(), StatusCode::OK);
            let host_health_body = to_bytes(host_health.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let host_health_text =
                String::from_utf8(host_health_body.to_vec()).map_err(|error| error.to_string())?;
            let host_health_json: serde_json::Value =
                serde_json::from_str(&host_health_text).map_err(|error| error.to_string())?;
            assert_eq!(
                host_health_json
                    .get("access_mode")
                    .and_then(|value| value.as_str()),
                Some("trusted-lan")
            );
            assert!(host_health_json
                .get("library_id")
                .and_then(|value| value.as_str())
                .is_some());
            assert!(host_health_json
                .get("device_name")
                .and_then(|value| value.as_str())
                .is_some());

            let removed_bootstrap_route = router
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/bootstrap")
                        .header("content-type", "application/json")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .body(Body::from("{}"))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(removed_bootstrap_route.status(), StatusCode::NOT_FOUND);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_trusted_lan_requires_exact_host_and_pairing failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_library_snapshot_exposes_host_summary() {
        let db_path = temp_db_path("trusted-lan-library-snapshot");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let snapshot_response = router
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/library/snapshot")
                        .header("host", "127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(snapshot_response.status(), StatusCode::OK);

            let snapshot_body = to_bytes(snapshot_response.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let snapshot_text =
                String::from_utf8(snapshot_body.to_vec()).map_err(|error| error.to_string())?;
            let snapshot_json: serde_json::Value =
                serde_json::from_str(&snapshot_text).map_err(|error| error.to_string())?;

            assert_eq!(
                snapshot_json.get("ok").and_then(|value| value.as_bool()),
                Some(true)
            );
            assert!(snapshot_json
                .get("captured_at")
                .and_then(|value| value.as_str())
                .is_some());
            assert!(snapshot_json
                .get("library_id")
                .and_then(|value| value.as_str())
                .is_some());
            assert!(snapshot_json
                .get("device_name")
                .and_then(|value| value.as_str())
                .is_some());
            assert_eq!(
                snapshot_json
                    .get("sync_mode")
                    .and_then(|value| value.as_str()),
                Some("STANDALONE")
            );
            assert_eq!(
                snapshot_json
                    .get("active_loans")
                    .and_then(|value| value.as_i64()),
                Some(0)
            );
            assert_eq!(
                snapshot_json
                    .get("printers")
                    .and_then(|value| value.as_i64()),
                Some(1)
            );
            assert_eq!(
                snapshot_json
                    .get("inventory")
                    .and_then(|value| value.get("total_spools"))
                    .and_then(|value| value.as_i64()),
                Some(2)
            );
            assert_eq!(
                snapshot_json
                    .get("inventory")
                    .and_then(|value| value.get("low_stock"))
                    .and_then(|value| value.as_i64()),
                Some(0)
            );

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_library_snapshot_exposes_host_summary failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_trusted_lan_pairs_renews_and_revokes_browser_sessions() {
        let db_path = temp_db_path("trusted-lan-pair-renew-revoke");
        let result = async {
            seed_db(&db_path)?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let pairing_token = "trusted-lan-pairing-token";
            db.create_trusted_lan_pairing(
                Some("Safari on iPad"),
                &hash_secret(pairing_token),
                600,
            )
            .map_err(|error| error.to_string())?;

            let state = trusted_lan_test_state(&db_path);
            let router = build_router(state.clone());

            let pair = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/pair")
                        .header("content-type", "application/json")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .body(Body::from(format!(
                            r#"{{"pairing_token":"{pairing_token}"}}"#
                        )))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(pair.status(), StatusCode::OK);
            let session_cookie = extract_named_cookie(pair.headers(), COMPANION_SESSION_COOKIE)?;
            let device_cookie =
                extract_named_cookie(pair.headers(), COMPANION_TRUSTED_LAN_DEVICE_COOKIE)?;
            let pair_body = to_bytes(pair.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let pair_body_text =
                String::from_utf8(pair_body.to_vec()).map_err(|error| error.to_string())?;
            let initial_csrf_token = extract_csrf_token(&pair_body_text)?;

            let second_pair = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/pair")
                        .header("content-type", "application/json")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .body(Body::from(format!(
                            r#"{{"pairing_token":"{pairing_token}"}}"#
                        )))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(second_pair.status(), StatusCode::UNAUTHORIZED);

            let authenticated_status = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/auth/session")
                        .header("host", "192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_SESSION_COOKIE}={session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(authenticated_status.status(), StatusCode::OK);
            let authenticated_status_body =
                to_bytes(authenticated_status.into_body(), usize::MAX)
                    .await
                    .map_err(|error| error.to_string())?;
            let authenticated_status_text =
                String::from_utf8(authenticated_status_body.to_vec())
                    .map_err(|error| error.to_string())?;
            let authenticated_status_json: serde_json::Value =
                serde_json::from_str(&authenticated_status_text)
                    .map_err(|error| error.to_string())?;
            assert_eq!(
                authenticated_status_json
                    .get("authenticated")
                    .and_then(|value| value.as_bool()),
                Some(true)
            );
            assert_eq!(
                authenticated_status_json
                    .get("access_mode")
                    .and_then(|value| value.as_str()),
                Some("trusted-lan")
            );

            let paired_browsers = db
                .list_trusted_lan_paired_browsers()
                .map_err(|error| error.to_string())?;
            assert_eq!(paired_browsers.len(), 1);
            assert_eq!(
                paired_browsers[0].display_name.as_deref(),
                Some("Safari on iPad")
            );
            assert_eq!(
                paired_browsers[0].last_origin.as_deref(),
                Some("http://192.168.1.50:4278")
            );
            let paired_browser_id = paired_browsers[0].id.clone();

            state
                .sessions
                .write()
                .map_err(|_| "Failed to clear session state".to_string())?
                .clear();

            let renewable_status = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/auth/session")
                        .header("host", "192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(renewable_status.status(), StatusCode::OK);
            let renewable_status_body = to_bytes(renewable_status.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let renewable_status_text = String::from_utf8(renewable_status_body.to_vec())
                .map_err(|error| error.to_string())?;
            let renewable_status_json: serde_json::Value =
                serde_json::from_str(&renewable_status_text).map_err(|error| error.to_string())?;
            assert_eq!(
                renewable_status_json
                    .get("authenticated")
                    .and_then(|value| value.as_bool()),
                Some(false)
            );
            assert_eq!(
                renewable_status_json
                    .get("can_renew")
                    .and_then(|value| value.as_bool()),
                Some(true)
            );

            let renew = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/renew")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(renew.status(), StatusCode::OK);
            let renewed_session_cookie =
                extract_named_cookie(renew.headers(), COMPANION_SESSION_COOKIE)?;
            let renew_body = to_bytes(renew.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let renew_body_text =
                String::from_utf8(renew_body.to_vec()).map_err(|error| error.to_string())?;
            let renewed_csrf_token = extract_csrf_token(&renew_body_text)?;
            assert_ne!(renewed_csrf_token, initial_csrf_token);

            let renewed_write = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/weight")
                        .header("content-type", "application/json")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_SESSION_COOKIE}={renewed_session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .header(COMPANION_CSRF_HEADER, &renewed_csrf_token)
                        .body(Body::from(r#"{"grams":735}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(renewed_write.status(), StatusCode::OK);

            db.revoke_trusted_lan_paired_browser(&paired_browser_id)
                .map_err(|error| error.to_string())?;

            state
                .sessions
                .write()
                .map_err(|_| "Failed to clear session state".to_string())?
                .clear();

            let revoked_status = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/auth/session")
                        .header("host", "192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(revoked_status.status(), StatusCode::OK);
            let revoked_status_body = to_bytes(revoked_status.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let revoked_status_text = String::from_utf8(revoked_status_body.to_vec())
                .map_err(|error| error.to_string())?;
            let revoked_status_json: serde_json::Value =
                serde_json::from_str(&revoked_status_text).map_err(|error| error.to_string())?;
            assert_eq!(
                revoked_status_json
                    .get("authenticated")
                    .and_then(|value| value.as_bool()),
                Some(false)
            );
            assert_eq!(
                revoked_status_json
                    .get("can_renew")
                    .and_then(|value| value.as_bool()),
                Some(false)
            );

            let denied_renew = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/auth/renew")
                        .header("host", "192.168.1.50:4278")
                        .header("origin", "http://192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(denied_renew.status(), StatusCode::UNAUTHORIZED);

            let revoked_session_read = router
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools")
                        .header("host", "192.168.1.50:4278")
                        .header(
                            "cookie",
                            format!(
                                "{COMPANION_SESSION_COOKIE}={renewed_session_cookie}; {COMPANION_TRUSTED_LAN_DEVICE_COOKIE}={device_cookie}"
                            ),
                        )
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(revoked_session_read.status(), StatusCode::UNAUTHORIZED);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "companion_api_trusted_lan_pairs_renews_and_revokes_browser_sessions failed: {message}"
            );
        }
    }

    #[tokio::test]
    async fn companion_api_qa_route_can_expire_sessions() {
        let db_path = temp_db_path("qa-expire-session");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(qa_test_state(&db_path));

            let AuthenticatedTestSession { session_cookie, .. } =
                pair_test_session(&router, &db_path).await?;

            let inventory_before = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools?limit=10&offset=0")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(inventory_before.status(), StatusCode::OK);

            let expire = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/qa/expire-session")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(expire.status(), StatusCode::OK);

            let inventory_after = router
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools?limit=10&offset=0")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(inventory_after.status(), StatusCode::UNAUTHORIZED);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_qa_route_can_expire_sessions failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_qa_delay_header_keeps_detail_route_working() {
        let db_path = temp_db_path("qa-delay-detail");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(qa_test_state(&db_path));

            let AuthenticatedTestSession { session_cookie, .. } =
                pair_test_session(&router, &db_path).await?;

            let started_at = tokio::time::Instant::now();
            let detail = router
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/spool_1?history_limit=4&usage_limit=4")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header("x-companion-qa-delay-ms", "40")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);
            assert!(started_at.elapsed() >= std::time::Duration::from_millis(30));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_qa_delay_header_keeps_detail_route_working failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_registers_owned_manual_spool() {
        let db_path = temp_db_path("owned-manual");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/manual")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r##"{"material":"PLA","filament_name":"Basic","color_name":"Red","vendor":"Bambu","initial_weight_g":1000,"qr_code":"QR-22","location":"Shelf A","hex_color":"#DC2626"}"##,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_spool.status(), StatusCode::OK);

            let create_body = to_bytes(create_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let create_text =
                String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(create_text.contains("\"message\":\"Filament added\""));
            let spool_id = extract_spool_id(&create_text)?;

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"ownership_type\":\"OWNED\""));
            assert!(detail_text.contains("\"hex_color\":\"#DC2626\""));

            Ok::<(), String>(())
        }
        .await;

        if let Err(error) = result {
            panic!("companion_api_registers_owned_manual_spool failed: {error}");
        }
    }

    #[tokio::test]
    async fn companion_api_lists_catalog_and_wishlist_items() {
        let db_path = temp_db_path("catalog-wishlist-list");
        let result = async {
            seed_db(&db_path)?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let masters = db
                .list_master_catalog(10, None)
                .map_err(|error| error.to_string())?;
            let master_id = masters
                .first()
                .map(|row| row.id.clone())
                .ok_or_else(|| "missing master catalog seed".to_string())?;
            let engine = InventoryEngine::new(db);
            engine
                .create_wishlist_item(crate::backend::inventory_engine::CreateWishlistItemInput {
                    id: "wish_seed_1".to_string(),
                    master_id: Some(master_id),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: "White".to_string(),
                    vendor: Some("Manual".to_string()),
                    quantity: Some(2),
                    note: Some("Restock".to_string()),
                })
                .map_err(|error| error.to_string())?;

            let router = build_router(test_state(&db_path));
            let AuthenticatedTestSession { session_cookie, .. } =
                pair_test_session(&router, &db_path).await?;

            let catalog = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/catalog/masters?limit=10")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(catalog.status(), StatusCode::OK);
            let catalog_body = to_bytes(catalog.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let catalog_text =
                String::from_utf8(catalog_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(catalog_text.contains("\"filament_name\":\"Basic\""));

            let wishlist = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/wishlist?limit=10")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(wishlist.status(), StatusCode::OK);
            let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_text =
                String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(wishlist_text.contains("\"id\":\"wish_seed_1\""));
            assert!(wishlist_text.contains("\"status\":\"WISHLIST\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("companion_api_lists_catalog_and_wishlist_items failed: {error}");
        }
    }

    #[tokio::test]
    async fn companion_api_registers_owned_catalog_spool() {
        let db_path = temp_db_path("owned-catalog");
        let result = async {
            seed_db(&db_path)?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let engine = InventoryEngine::new(db);
            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: "seed_catalog_spool".to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Blue Basic".to_string(),
                    color_name: "Blue".to_string(),
                    hex_color: Some("#2563EB".to_string()),
                    product_url: None,
                    vendor: Some("Bambu".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: None,
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: None,
                })
                .map_err(|error| error.to_string())?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let master_id = db
                .list_master_catalog(50, Some("Blue Basic"))
                .map_err(|error| error.to_string())?
                .into_iter()
                .find(|row| row.vendor == "Bambu")
                .map(|row| row.id)
                .ok_or_else(|| "missing bambu catalog master".to_string())?;

            let router = build_router(test_state(&db_path));
            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/owned")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(format!(
                            r#"{{"master_id":"{master_id}","initial_weight_g":900,"location":"Shelf B","qr_code":"QR-CAT-1"}}"#
                        )))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_spool.status(), StatusCode::OK);

            let create_body = to_bytes(create_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let create_text =
                String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
            let spool_id = extract_spool_id(&create_text)?;

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"ownership_type\":\"OWNED\""));
            assert!(detail_text.contains("\"location_id\":\"Shelf B\""));
            assert!(detail_text.contains("\"remaining_g\":900"));
            assert!(detail_text.contains("\"qr_code\":\"QR-CAT-1\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("companion_api_registers_owned_catalog_spool failed: {error}");
        }
    }

    #[tokio::test]
    async fn companion_api_creates_and_updates_wishlist_item() {
        let db_path = temp_db_path("wishlist-create-update");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_item = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/wishlist")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"material":"PETG","filament_name":"Solid","color_name":"Blue","vendor":"Bambu","quantity":3,"note":"Order soon"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_item.status(), StatusCode::OK);

            let wishlist = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/wishlist?limit=10")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(wishlist.status(), StatusCode::OK);
            let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_text =
                String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
            let item_id = extract_wishlist_item_id(&wishlist_text, "Solid")?;

            let update_item = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!("/api/v1/wishlist/{item_id}/status"))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"status":"ON_ORDER"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(update_item.status(), StatusCode::OK);

            let wishlist = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/wishlist?limit=10")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_text =
                String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(wishlist_text.contains(format!("\"id\":\"{item_id}\"").as_str()));
            assert!(wishlist_text.contains("\"status\":\"ON_ORDER\""));

            let delete_item = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!("/api/v1/wishlist/{item_id}/delete"))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from("{}"))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(delete_item.status(), StatusCode::OK);

            let wishlist = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/wishlist?limit=10")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_body = to_bytes(wishlist.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let wishlist_text =
                String::from_utf8(wishlist_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(!wishlist_text.contains(format!("\"id\":\"{item_id}\"").as_str()));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("companion_api_creates_and_updates_wishlist_item failed: {error}");
        }
    }

    #[tokio::test]
    async fn companion_api_creates_and_deletes_printer() {
        let db_path = temp_db_path("printer-create-delete");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_printer = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/printers")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"id":"printer_sync_test","model":"Bambu Lab P1S","name":"Sync Test Printer","ams_units":1,"slots_per_ams":4}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_printer.status(), StatusCode::OK);

            let overview = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/printers/overview")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(overview.status(), StatusCode::OK);
            let overview_body = to_bytes(overview.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let overview_text =
                String::from_utf8(overview_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(overview_text.contains("\"id\":\"printer_sync_test\""));
            assert!(overview_text.contains("\"name\":\"Sync Test Printer\""));

            let delete_printer = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/printers/printer_sync_test/delete")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from("{}"))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(delete_printer.status(), StatusCode::OK);

            let overview = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/printers/overview")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            let overview_body = to_bytes(overview.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let overview_text =
                String::from_utf8(overview_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(!overview_text.contains("\"id\":\"printer_sync_test\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("companion_api_creates_and_deletes_printer failed: {error}");
        }
    }

    #[tokio::test]
    async fn companion_api_registers_borrowed_in_spool() {
        let db_path = temp_db_path("borrowed-in");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/borrowed-in")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Return after fit-checks","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_spool.status(), StatusCode::OK);

            let create_body = to_bytes(create_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let create_text =
                String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(create_text.contains("\"message\":\"Borrowed-in spool registered\""));
            let spool_id = extract_spool_id(&create_text)?;

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"ownership_type\":\"BORROWED_IN\""));
            assert!(detail_text.contains("\"owner_name\":\"Carla\""));
            assert!(detail_text.contains("\"remaining_g\":860"));
            assert!(detail_text.contains("\"loan_direction\":\"INBOUND\""));
            assert!(detail_text.contains("\"location_id\":\"Borrowed Shelf\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_registers_borrowed_in_spool failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_finds_spool_by_qr() {
        let db_path = temp_db_path("find-by-qr");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession { session_cookie, .. } =
                pair_test_session(&router, &db_path).await?;

            let lookup = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/by-qr?qr_code=qr-1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(lookup.status(), StatusCode::OK);

            let lookup_body = to_bytes(lookup.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let lookup_text =
                String::from_utf8(lookup_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(lookup_text.contains("\"id\":\"spool_1\""));
            assert!(lookup_text.contains("\"qr_code\":\"qr-1\""));
            assert!(lookup_text.contains("\"filament_name\":\"Basic\""));

            let lookup_by_spool_id = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/by-qr?qr_code=spool_1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(lookup_by_spool_id.status(), StatusCode::OK);

            let lookup_by_spool_id_body = to_bytes(lookup_by_spool_id.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let lookup_by_spool_id_text = String::from_utf8(lookup_by_spool_id_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(lookup_by_spool_id_text.contains("\"id\":\"spool_1\""));

            let missing = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/by-qr?qr_code=missing")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(missing.status(), StatusCode::NOT_FOUND);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_finds_spool_by_qr failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_updates_borrowed_in_spool_metadata() {
        let db_path = temp_db_path("borrowed-in-update");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/borrowed-in")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Original owner note","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_spool.status(), StatusCode::OK);

            let create_body = to_bytes(create_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let create_text =
                String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
            let spool_id = extract_spool_id(&create_text)?;

            let update_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!("/api/v1/spools/{spool_id}/borrowed-in"))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"owner_name":"Nora","owner_contact":"nora@example.com","ownership_note":"Return after finishing the sample set"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(update_spool.status(), StatusCode::OK);

            let update_body = to_bytes(update_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let update_text =
                String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(update_text.contains("\"message\":\"Borrowed-in spool details updated\""));

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"owner_name\":\"Nora\""));
            assert!(detail_text.contains("\"owner_contact\":\"nora@example.com\""));
            assert!(
                detail_text.contains(
                    "\"ownership_note\":\"Return after finishing the sample set\""
                )
            );
            assert!(detail_text.contains("\"counterparty_name\":\"Nora\""));
            assert!(detail_text.contains("\"counterparty_contact\":\"nora@example.com\""));
            assert!(
                detail_text.contains(
                    "\"counterparty_note\":\"Return after finishing the sample set\""
                )
            );
            assert!(detail_text.contains("\"event_type\":\"DETAILS_UPDATED\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_updates_borrowed_in_spool_metadata failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_updates_spool_status_and_location() {
        let db_path = temp_db_path("spool-details-update");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let update = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/details")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"status":"LOST","location":"Archive Bin"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(update.status(), StatusCode::OK);

            let update_body = to_bytes(update.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let update_text =
                String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(update_text.contains("\"message\":\"Spool details updated\""));

            let detail = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/spools/spool_1")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail.status(), StatusCode::OK);

            let detail_body = to_bytes(detail.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_text =
                String::from_utf8(detail_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(detail_text.contains("\"status\":\"LOST\""));
            assert!(detail_text.contains("\"location_id\":\"Archive Bin\""));
            assert!(detail_text.contains("\"qr_code\":\"qr-1\""));
            assert!(detail_text.contains("\"event_type\":\"DETAILS_UPDATED\""));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_updates_spool_status_and_location failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_rejects_status_and_location_edits_for_loaded_spools() {
        let db_path = temp_db_path("spool-details-reject-loaded");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let printer_overview = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/printers/overview")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(printer_overview.status(), StatusCode::OK);
            let printer_body = to_bytes(printer_overview.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let printer_text =
                String::from_utf8(printer_body.to_vec()).map_err(|error| error.to_string())?;
            let slot_id = extract_first_slot_id(&printer_text)?;

            let assign = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!(
                            "/api/v1/printers/printer_1/slots/{slot_id}/assignment"
                        ))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"spool_id":"spool_1"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(assign.status(), StatusCode::OK);

            let update = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/details")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"status":"IN_STOCK","location":"Shelf B"}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(update.status(), StatusCode::BAD_REQUEST);

            let update_body = to_bytes(update.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let update_text =
                String::from_utf8(update_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(update_text.contains("Loaded spools use printer-slot actions"));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "companion_api_rejects_status_and_location_edits_for_loaded_spools failed: {message}"
            );
        }
    }

    #[tokio::test]
    async fn companion_api_hands_back_borrowed_in_spool() {
        let db_path = temp_db_path("borrowed-in-hand-back");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let create_spool = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/borrowed-in")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"owner_name":"Carla","owner_contact":"carla@example.com","ownership_note":"Return after fixture print","material":"PETG","filament_name":"Prototype","color_name":"Blue","vendor":"Generic","initial_weight_g":860,"location":"Borrowed Shelf"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(create_spool.status(), StatusCode::OK);

            let create_body = to_bytes(create_spool.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let create_text =
                String::from_utf8(create_body.to_vec()).map_err(|error| error.to_string())?;
            let spool_id = extract_spool_id(&create_text)?;

            let detail_before = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail_before.status(), StatusCode::OK);

            let detail_before_body = to_bytes(detail_before.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let detail_before_text = String::from_utf8(detail_before_body.to_vec())
                .map_err(|error| error.to_string())?;
            let loan_id = extract_active_loan_id_from_spool_detail(&detail_before_text)?
                .ok_or_else(|| "missing active inbound loan id".to_string())?;

            let hand_back = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(format!("/api/v1/loans/{loan_id}/hand-back"))
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(
                            r#"{"returned_grams":780,"note":"Handed back after fixture print"}"#,
                        ))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(hand_back.status(), StatusCode::OK);

            let hand_back_body = to_bytes(hand_back.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let hand_back_text = String::from_utf8(hand_back_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(hand_back_text.contains("\"message\":\"Borrowed-in spool handed back\""));
            assert!(hand_back_text.contains("\"returned_grams\":780"));
            assert!(hand_back_text.contains("\"loan_direction\":\"INBOUND\""));

            let detail_after = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/spools/{spool_id}"))
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(detail_after.status(), StatusCode::NOT_FOUND);

            let inventory_after = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/inventory/spools?limit=500&offset=0")
                        .header("host", "127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(inventory_after.status(), StatusCode::OK);
            let inventory_after_body = to_bytes(inventory_after.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let inventory_after_text = String::from_utf8(inventory_after_body.to_vec())
                .map_err(|error| error.to_string())?;
            assert!(!inventory_after_text.contains(&spool_id));

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_hands_back_borrowed_in_spool failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_shell_route_serves_browser_ui() {
        let db_path = temp_db_path("shell");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let response = router
                .oneshot(
                    Request::builder()
                        .uri("/companion")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(response.status(), StatusCode::OK);
            let cache_control = response
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            assert!(cache_control.contains("no-store"));

            let body = to_bytes(response.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let body_text = String::from_utf8(body.to_vec()).map_err(|error| error.to_string())?;
            assert!(body_text.contains("Filament Manager Companion"));
            assert!(body_text.contains("/companion/icon-light.png"));
            assert!(body_text.contains("companion-favicon"));
            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_shell_route_serves_browser_ui failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_shell_route_serves_module_assets() {
        let db_path = temp_db_path("shell-assets");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let module_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_api_client.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(module_response.status(), StatusCode::OK);
            let module_cache_control = module_response
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            assert!(module_cache_control.contains("no-store"));

            let module_body = to_bytes(module_response.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?;
            let module_text =
                String::from_utf8(module_body.to_vec()).map_err(|error| error.to_string())?;
            assert!(module_text.contains("createCompanionApiClient"));

            let icon_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/icon-dark.png")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(icon_response.status(), StatusCode::OK);
            let icon_content_type = icon_response
                .headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            assert!(icon_content_type.starts_with("image/png"));

            let storage_shell_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/storage_shell.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(storage_shell_response.status(), StatusCode::OK);

            let companion_app_shell_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_app_shell.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_app_shell_response.status(), StatusCode::OK);

            let companion_mutations_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_mutations.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_mutations_response.status(), StatusCode::OK);

            let companion_render_focus_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_render_focus.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_render_focus_response.status(), StatusCode::OK);

            let companion_click_router_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_click_router.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_click_router_response.status(), StatusCode::OK);

            let companion_data_controller_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_data_controller.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_data_controller_response.status(), StatusCode::OK);

            let companion_dom_events_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_dom_events.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_dom_events_response.status(), StatusCode::OK);

            let companion_input_router_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_input_router.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_input_router_response.status(), StatusCode::OK);

            let companion_shell_state_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_shell_state.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_shell_state_response.status(), StatusCode::OK);

            let companion_submit_router_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_submit_router.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_submit_router_response.status(), StatusCode::OK);

            let companion_runtime_state_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_runtime_state.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_runtime_state_response.status(), StatusCode::OK);

            let companion_i18n_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/companion_i18n.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(companion_i18n_response.status(), StatusCode::OK);

            let loans_shell_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/loans_shell.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(loans_shell_response.status(), StatusCode::OK);

            let settings_shell_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/settings_shell.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(settings_shell_response.status(), StatusCode::OK);

            let shell_chrome_response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/companion/shell_chrome.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(shell_chrome_response.status(), StatusCode::OK);

            let missing_asset = router
                .oneshot(
                    Request::builder()
                        .uri("/companion/missing.js")
                        .body(Body::empty())
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(missing_asset.status(), StatusCode::NOT_FOUND);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_shell_route_serves_module_assets failed: {message}");
        }
    }

    #[tokio::test]
    async fn companion_api_rejects_invalid_browser_lend_request() {
        let db_path = temp_db_path("invalid-lend");
        let result = async {
            seed_db(&db_path)?;
            let router = build_router(test_state(&db_path));

            let AuthenticatedTestSession {
                session_cookie,
                csrf_token,
                ..
            } = pair_test_session(&router, &db_path).await?;

            let missing_borrower = router
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/spools/spool_1/lend")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:4278")
                        .header("origin", "http://127.0.0.1:4278")
                        .header("cookie", format!("bfm_companion_session={session_cookie}"))
                        .header(COMPANION_CSRF_HEADER, &csrf_token)
                        .body(Body::from(r#"{"borrower_name":"   ","grams_out":700}"#))
                        .map_err(|error| error.to_string())?,
                )
                .await
                .map_err(|error| error.to_string())?;
            assert_eq!(missing_borrower.status(), StatusCode::BAD_REQUEST);

            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!("companion_api_rejects_invalid_browser_lend_request failed: {message}");
        }
    }
}
