pub(crate) const COMPANION_BROWSER_HTML: &str = include_str!("../companion_browser/index.html");

const COMPANION_BROWSER_APP_JS: &str = include_str!("../companion_browser/app.js");
const COMPANION_BROWSER_BAMBU_FILAMENT_CODE_LOOKUP_JS: &str =
    include_str!("../companion_browser/bambu_filament_code_lookup.js");
const COMPANION_BROWSER_API_CLIENT_JS: &str =
    include_str!("../companion_browser/companion_api_client.js");
const COMPANION_BROWSER_APP_SHELL_JS: &str =
    include_str!("../companion_browser/companion_app_shell.js");
const COMPANION_BROWSER_CLICK_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_click_router.js");
const COMPANION_BROWSER_DATA_CONTROLLER_JS: &str =
    include_str!("../companion_browser/companion_data_controller.js");
const COMPANION_BROWSER_DOMAIN_JS: &str = include_str!("../companion_browser/companion_domain.js");
const COMPANION_BROWSER_DOM_EVENTS_JS: &str =
    include_str!("../companion_browser/companion_dom_events.js");
const COMPANION_BROWSER_I18N_JS: &str = include_str!("../companion_browser/companion_i18n.js");
const COMPANION_BROWSER_INPUT_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_input_router.js");
const COMPANION_BROWSER_LIVE_RFID_CANDIDATES_JS: &str =
    include_str!("../companion_browser/companion_live_rfid_candidates.js");
const COMPANION_BROWSER_LOAN_STATE_JS: &str =
    include_str!("../companion_browser/companion_loan_state.js");
const COMPANION_BROWSER_LOAN_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_loan_mutations.js");
const COMPANION_BROWSER_MUTATION_HELPERS_JS: &str =
    include_str!("../companion_browser/companion_mutation_helpers.js");
const COMPANION_BROWSER_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_mutations.js");
const COMPANION_BROWSER_PRINTER_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_printer_mutations.js");
const COMPANION_BROWSER_QR_PAYLOAD_JS: &str = include_str!("../companion_browser/qr_payload.js");
const COMPANION_BROWSER_RENDER_FOCUS_JS: &str =
    include_str!("../companion_browser/companion_render_focus.js");
const COMPANION_BROWSER_RUNTIME_STATE_JS: &str =
    include_str!("../companion_browser/companion_runtime_state.js");
const COMPANION_BROWSER_SHELL_STATE_JS: &str =
    include_str!("../companion_browser/companion_shell_state.js");
const COMPANION_BROWSER_SPOOL_WEIGHT_JS: &str =
    include_str!("../companion_browser/companion_spool_weight.js");
const COMPANION_BROWSER_SPOOL_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_spool_mutations.js");
const COMPANION_BROWSER_STOCK_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_stock_mutations.js");
const COMPANION_BROWSER_SUBMIT_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_submit_router.js");
const COMPANION_BROWSER_THEME_JS: &str = include_str!("../companion_browser/companion_theme.js");
const COMPANION_BROWSER_WISHLIST_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_wishlist_mutations.js");
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
const COMPANION_BROWSER_THEME_CSS: &str = include_str!("../companion_browser/theme.css");
const COMPANION_ICON_LIGHT_PNG: &[u8] = include_bytes!("../icons/dock-light.png");
const COMPANION_ICON_DARK_PNG: &[u8] = include_bytes!("../icons/dock-dark.png");

#[derive(Clone, Copy)]
pub(crate) struct CompanionBrowserAsset {
    pub(crate) content_type: &'static str,
    pub(crate) content: &'static str,
}

#[derive(Clone, Copy)]
pub(crate) struct CompanionBinaryAsset {
    pub(crate) content_type: &'static str,
    pub(crate) content: &'static [u8],
}

pub(crate) fn companion_browser_assets() -> &'static [(&'static str, CompanionBrowserAsset)] {
    &[
        (
            "app.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_APP_JS,
            },
        ),
        (
            "bambu_filament_code_lookup.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_BAMBU_FILAMENT_CODE_LOOKUP_JS,
            },
        ),
        (
            "companion_api_client.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_API_CLIENT_JS,
            },
        ),
        (
            "companion_app_shell.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_APP_SHELL_JS,
            },
        ),
        (
            "companion_click_router.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_CLICK_ROUTER_JS,
            },
        ),
        (
            "companion_data_controller.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_DATA_CONTROLLER_JS,
            },
        ),
        (
            "companion_domain.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_DOMAIN_JS,
            },
        ),
        (
            "companion_dom_events.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_DOM_EVENTS_JS,
            },
        ),
        (
            "companion_i18n.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_I18N_JS,
            },
        ),
        (
            "companion_input_router.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_INPUT_ROUTER_JS,
            },
        ),
        (
            "companion_live_rfid_candidates.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_LIVE_RFID_CANDIDATES_JS,
            },
        ),
        (
            "companion_loan_state.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_LOAN_STATE_JS,
            },
        ),
        (
            "companion_loan_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_LOAN_MUTATIONS_JS,
            },
        ),
        (
            "companion_mutation_helpers.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_MUTATION_HELPERS_JS,
            },
        ),
        (
            "companion_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_MUTATIONS_JS,
            },
        ),
        (
            "companion_printer_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_PRINTER_MUTATIONS_JS,
            },
        ),
        (
            "qr_payload.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_QR_PAYLOAD_JS,
            },
        ),
        (
            "companion_render_focus.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_RENDER_FOCUS_JS,
            },
        ),
        (
            "companion_runtime_state.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_RUNTIME_STATE_JS,
            },
        ),
        (
            "companion_shell_state.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SHELL_STATE_JS,
            },
        ),
        (
            "companion_spool_weight.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SPOOL_WEIGHT_JS,
            },
        ),
        (
            "companion_spool_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SPOOL_MUTATIONS_JS,
            },
        ),
        (
            "companion_stock_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_STOCK_MUTATIONS_JS,
            },
        ),
        (
            "companion_submit_router.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SUBMIT_ROUTER_JS,
            },
        ),
        (
            "companion_theme.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_THEME_JS,
            },
        ),
        (
            "companion_wishlist_mutations.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_WISHLIST_MUTATIONS_JS,
            },
        ),
        (
            "detail_content.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_DETAIL_CONTENT_JS,
            },
        ),
        (
            "companion_logic.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_COMPANION_LOGIC_JS,
            },
        ),
        (
            "formatters.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_FORMATTERS_JS,
            },
        ),
        (
            "loans_shell.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_LOANS_SHELL_JS,
            },
        ),
        (
            "printer_slot_labels.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_PRINTER_SLOT_LABELS_JS,
            },
        ),
        (
            "printer_workspace.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_PRINTER_WORKSPACE_JS,
            },
        ),
        (
            "printers_shell.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_PRINTERS_SHELL_JS,
            },
        ),
        (
            "session_state.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SESSION_STATE_JS,
            },
        ),
        (
            "settings_shell.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SETTINGS_SHELL_JS,
            },
        ),
        (
            "shell_chrome.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_SHELL_CHROME_JS,
            },
        ),
        (
            "storage_shell.js",
            CompanionBrowserAsset {
                content_type: "application/javascript; charset=utf-8",
                content: COMPANION_BROWSER_STORAGE_SHELL_JS,
            },
        ),
        (
            "app.css",
            CompanionBrowserAsset {
                content_type: "text/css; charset=utf-8",
                content: COMPANION_BROWSER_CSS,
            },
        ),
        (
            "theme.css",
            CompanionBrowserAsset {
                content_type: "text/css; charset=utf-8",
                content: COMPANION_BROWSER_THEME_CSS,
            },
        ),
    ]
}

pub(crate) fn companion_browser_asset(path: &str) -> Option<CompanionBrowserAsset> {
    companion_browser_assets()
        .iter()
        .find_map(|(asset_path, asset)| (*asset_path == path).then_some(*asset))
}

pub(crate) fn companion_browser_binary_asset(path: &str) -> Option<CompanionBinaryAsset> {
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
