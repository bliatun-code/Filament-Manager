use crate::companion_api::*;
use crate::companion_http::{
    apply_companion_cache_policy, apply_companion_security_headers, enforce_companion_body_limit,
    enforce_companion_rate_limit, enforce_companion_request_timeout, CompanionHttpSecurity,
    CompanionHttpSecurityConfig,
};
use crate::companion_inventory_bulk_write_api::handle_execute_inventory_bulk_mutation;
use crate::companion_inventory_read_api::{
    handle_find_spool_by_qr, handle_get_spool_detail, handle_list_active_spool_loans,
    handle_list_catalog_masters, handle_list_printer_overview, handle_list_spool_loans,
    handle_list_spools, handle_list_wishlist_items, handle_spool_qr_image_svg,
};
use crate::companion_library_api::*;
use crate::companion_location_api::{
    handle_archive_location, handle_create_location, handle_delete_location,
    handle_list_library_locations, handle_list_locations, handle_merge_locations,
    handle_rename_location, handle_restore_location,
};
use crate::companion_state::CompanionApiState;
use crate::companion_wishlist_write_api::{
    handle_create_wishlist_item, handle_delete_wishlist_item, handle_receive_wishlist_item,
    handle_update_wishlist_item_status,
};
use axum::middleware;
use axum::routing::{get, post};
use axum::Router;

pub(super) fn build_router(state: CompanionApiState) -> Router {
    build_router_with_security_config(state, CompanionHttpSecurityConfig::production())
}

#[cfg(test)]
pub(super) fn build_router_for_test(
    state: CompanionApiState,
    security_config: CompanionHttpSecurityConfig,
) -> Router {
    build_router_with_security_config(state, security_config)
}

fn build_router_with_security_config(
    state: CompanionApiState,
    security_config: CompanionHttpSecurityConfig,
) -> Router {
    let host_validation_state = state.clone();
    let http_security = CompanionHttpSecurity::new(security_config);
    let protected = Router::new()
        .route("/library/revisions", get(handle_library_domain_revisions))
        .route("/library/snapshot", get(handle_library_snapshot))
        .route("/library/spools", get(handle_library_spools))
        .route("/library/locations", get(handle_list_library_locations))
        .route("/library/printers", get(handle_library_printers))
        .route(
            "/library/printer-settings",
            get(handle_library_printer_settings),
        )
        .route(
            "/library/filament-standards",
            get(handle_library_filament_standards),
        )
        .route("/library/loans", get(handle_library_loans))
        .route(
            "/library/statistics/filament-consumption",
            get(handle_library_filament_consumption),
        )
        .route(
            "/library/statistics/period-report",
            get(handle_library_statistics_period_report),
        )
        .route(
            "/library/catalog/masters",
            get(handle_library_catalog_masters),
        )
        .route("/library/wishlist", get(handle_library_wishlist_items))
        .route("/inventory/spools", get(handle_list_spools))
        .route(
            "/inventory/bulk-mutations",
            post(handle_execute_inventory_bulk_mutation),
        )
        .route("/locations", get(handle_list_locations))
        .route("/locations", post(handle_create_location))
        .route("/locations/merge", post(handle_merge_locations))
        .route(
            "/locations/{location_id}/rename",
            post(handle_rename_location),
        )
        .route(
            "/locations/{location_id}/archive",
            post(handle_archive_location),
        )
        .route(
            "/locations/{location_id}/restore",
            post(handle_restore_location),
        )
        .route(
            "/locations/{location_id}/delete",
            post(handle_delete_location),
        )
        .route("/backup/full", get(handle_export_full_backup))
        .route("/catalog/masters", get(handle_list_catalog_masters))
        .route("/catalog/audit", post(handle_audit_vendor_catalog))
        .route("/catalog/refresh", post(handle_refresh_vendor_catalog))
        .route(
            "/catalog/masters/{master_id}/details",
            post(handle_update_master_catalog_entry),
        )
        .route("/loans", get(handle_list_spool_loans))
        .route("/printers/overview", get(handle_list_printer_overview))
        .route("/printers", post(handle_create_printer))
        .route("/printers/{printer_id}/delete", post(handle_delete_printer))
        .route(
            "/printers/{printer_id}/bambu-live",
            post(handle_save_bambu_live_integration),
        )
        .route(
            "/printers/{printer_id}/bambu-live/delete",
            post(handle_delete_bambu_live_integration),
        )
        .route("/printers/active", post(handle_set_active_printer))
        .route("/loans/active", get(handle_list_active_spool_loans))
        .route("/wishlist", get(handle_list_wishlist_items))
        .route("/wishlist", post(handle_create_wishlist_item))
        .route(
            "/wishlist/{item_id}/status",
            post(handle_update_wishlist_item_status),
        )
        .route(
            "/wishlist/{item_id}/receive",
            post(handle_receive_wishlist_item),
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
            "/spools/{spool_id}/ownership",
            post(handle_update_spool_ownership),
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
        .route(
            "/printers/{printer_id}/slots/{slot_id}/spools/{spool_id}/bambu-live-weight-estimate/accept",
            post(handle_accept_bambu_live_weight_estimate),
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
        .route("/", get(handle_companion_root))
        .route("/companion", get(handle_companion_shell))
        .route("/companion/", get(handle_companion_shell))
        .route("/companion/{asset}", get(handle_companion_asset))
        .route("/api/v1/health", get(handle_health))
        .route("/api/v1/auth/session", get(handle_session_status))
        .route("/api/v1/auth/pair", post(handle_pair_session))
        .route("/api/v1/auth/renew", post(handle_renew_session))
        .route("/api/v1/qa/session", get(handle_qa_session))
        .route("/api/v1/qa/expire-session", post(handle_qa_expire_session))
        .with_state(state)
        .nest("/api/v1", protected)
        .layer(middleware::from_fn_with_state(
            http_security.clone(),
            enforce_companion_body_limit,
        ))
        .layer(middleware::from_fn_with_state(
            host_validation_state,
            require_companion_host,
        ))
        .layer(middleware::from_fn_with_state(
            http_security.clone(),
            enforce_companion_rate_limit,
        ))
        .layer(middleware::from_fn_with_state(
            http_security,
            enforce_companion_request_timeout,
        ))
        .layer(middleware::from_fn(apply_companion_cache_policy))
        .layer(middleware::from_fn(apply_companion_security_headers))
}
