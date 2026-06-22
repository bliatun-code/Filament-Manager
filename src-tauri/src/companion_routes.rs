use crate::companion_api::*;
use crate::companion_state::CompanionApiState;
use axum::middleware;
use axum::routing::{get, post};
use axum::Router;

pub(super) fn build_router(state: CompanionApiState) -> Router {
    let protected = Router::new()
        .route("/inventory/spools", get(handle_list_spools))
        .route("/backup/full", get(handle_export_full_backup))
        .route("/catalog/masters", get(handle_list_catalog_masters))
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
