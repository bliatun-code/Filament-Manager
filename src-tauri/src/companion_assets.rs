use axum::body::Bytes;
use flate2::write::GzEncoder;
use flate2::Compression;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write;
use std::sync::OnceLock;

#[path = "companion_locale_assets.generated.rs"]
mod companion_locale_assets;
use companion_locale_assets::COMPANION_BROWSER_LOCALE_ASSETS;

pub(crate) const COMPANION_BROWSER_HTML: &str = include_str!("../companion_browser/index.html");

const COMPANION_BROWSER_APP_JS: &str = include_str!("../companion_browser/app.js");
const COMPANION_BROWSER_APP_ERROR_JS: &str = include_str!("../companion_browser/app_error.js");
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
const COMPANION_BROWSER_SHARED_CONTRACTS_JS: &str =
    include_str!("../companion_browser/shared_contracts.generated.js");
const COMPANION_BROWSER_DOM_EVENTS_JS: &str =
    include_str!("../companion_browser/companion_dom_events.js");
const COMPANION_BROWSER_I18N_JS: &str = include_str!("../companion_browser/companion_i18n.js");
const COMPANION_BROWSER_LOCALE_FORMAT_JS: &str =
    include_str!("../companion_browser/locale_format.js");
const COMPANION_BROWSER_MESSAGE_FORMAT_JS: &str =
    include_str!("../companion_browser/message_format.js");
const COMPANION_BROWSER_PSEUDO_LOCALE_JS: &str =
    include_str!("../companion_browser/pseudo_locale.js");
const COMPANION_BROWSER_SUPPORTED_LOCALES_JS: &str =
    include_str!("../companion_browser/supported_locales.js");
const COMPANION_BROWSER_INPUT_ROUTER_JS: &str =
    include_str!("../companion_browser/companion_input_router.js");
const COMPANION_BROWSER_LIVE_RFID_CANDIDATES_JS: &str =
    include_str!("../companion_browser/companion_live_rfid_candidates.js");
const COMPANION_BROWSER_LIVE_REGIONS_JS: &str =
    include_str!("../companion_browser/companion_live_regions.js");
const COMPANION_BROWSER_LOAN_STATE_JS: &str =
    include_str!("../companion_browser/companion_loan_state.js");
const COMPANION_BROWSER_LOAN_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_loan_mutations.js");
const COMPANION_BROWSER_MUTATION_HELPERS_JS: &str =
    include_str!("../companion_browser/companion_mutation_helpers.js");
const COMPANION_BROWSER_MUTATIONS_JS: &str =
    include_str!("../companion_browser/companion_mutations.js");
const COMPANION_BROWSER_OVERLAY_FOCUS_JS: &str =
    include_str!("../companion_browser/companion_overlay_focus.js");
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
const COMPANION_BROWSER_WORKSPACE_CSS: &str = include_str!("../companion_browser/workspace.css");
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

#[derive(Clone)]
pub(crate) struct CachedCompanionAsset {
    pub(crate) content_type: &'static str,
    pub(crate) content: Bytes,
    pub(crate) gzip_content: Option<Bytes>,
    pub(crate) weak_etag: String,
}

static CACHED_COMPANION_ASSETS: OnceLock<HashMap<&'static str, CachedCompanionAsset>> =
    OnceLock::new();

const COMPANION_BROWSER_BASE_ASSETS: &[(&str, CompanionBrowserAsset)] = &[
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
        "shared_contracts.generated.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SHARED_CONTRACTS_JS,
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
        "app_error.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_APP_ERROR_JS,
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
        "supported_locales.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_SUPPORTED_LOCALES_JS,
        },
    ),
    (
        "locale_format.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_LOCALE_FORMAT_JS,
        },
    ),
    (
        "message_format.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_MESSAGE_FORMAT_JS,
        },
    ),
    (
        "pseudo_locale.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_PSEUDO_LOCALE_JS,
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
        "companion_live_regions.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_LIVE_REGIONS_JS,
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
        "companion_overlay_focus.js",
        CompanionBrowserAsset {
            content_type: "application/javascript; charset=utf-8",
            content: COMPANION_BROWSER_OVERLAY_FOCUS_JS,
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
    (
        "workspace.css",
        CompanionBrowserAsset {
            content_type: "text/css; charset=utf-8",
            content: COMPANION_BROWSER_WORKSPACE_CSS,
        },
    ),
];

pub(crate) fn companion_browser_assets(
) -> impl Iterator<Item = (&'static str, CompanionBrowserAsset)> + Clone {
    COMPANION_BROWSER_BASE_ASSETS
        .iter()
        .copied()
        .chain(COMPANION_BROWSER_LOCALE_ASSETS.iter().copied())
}

pub(crate) fn cached_companion_browser_asset(path: &str) -> Option<&'static CachedCompanionAsset> {
    CACHED_COMPANION_ASSETS
        .get_or_init(build_cached_companion_assets)
        .get(path)
}

fn build_cached_companion_assets() -> HashMap<&'static str, CachedCompanionAsset> {
    let mut assets = HashMap::with_capacity(companion_browser_assets().count() + 2);
    for (path, asset) in companion_browser_assets() {
        assets.insert(
            path,
            cached_companion_asset(asset.content_type, asset.content.as_bytes()),
        );
    }
    for (path, asset) in [
        (
            "icon-light.png",
            CompanionBinaryAsset {
                content_type: "image/png",
                content: COMPANION_ICON_LIGHT_PNG,
            },
        ),
        (
            "icon-dark.png",
            CompanionBinaryAsset {
                content_type: "image/png",
                content: COMPANION_ICON_DARK_PNG,
            },
        ),
    ] {
        assets.insert(
            path,
            cached_companion_asset(asset.content_type, asset.content),
        );
    }
    assets
}

fn cached_companion_asset(
    content_type: &'static str,
    content: &'static [u8],
) -> CachedCompanionAsset {
    let gzip_content = is_compressible_content_type(content_type)
        .then(|| gzip_bytes(content))
        .flatten()
        .filter(|compressed| compressed.len() < content.len())
        .map(Bytes::from);

    CachedCompanionAsset {
        content_type,
        content: Bytes::from_static(content),
        gzip_content,
        weak_etag: weak_etag(content),
    }
}

fn is_compressible_content_type(content_type: &str) -> bool {
    content_type.starts_with("text/")
        || content_type.starts_with("application/javascript")
        || content_type.starts_with("application/json")
        || content_type.starts_with("image/svg+xml")
}

fn gzip_bytes(content: &[u8]) -> Option<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(content).ok()?;
    encoder.finish().ok()
}

fn weak_etag(content: &[u8]) -> String {
    let digest = Sha256::digest(content);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    format!("W/\"{hex}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caches_stable_asset_validators_and_compressed_text() {
        let asset = cached_companion_browser_asset("app.css").expect("cached CSS asset");
        assert!(asset.weak_etag.starts_with("W/\""));
        assert!(asset.weak_etag.ends_with('"'));
        assert!(asset.gzip_content.is_some());
        assert_eq!(asset.content_type, "text/css; charset=utf-8");

        let workspace =
            cached_companion_browser_asset("workspace.css").expect("cached workspace CSS asset");
        assert!(workspace.content.starts_with(b"#app {"));
        assert!(workspace.gzip_content.is_some());
        assert_eq!(workspace.content_type, "text/css; charset=utf-8");

        let icon = cached_companion_browser_asset("icon-dark.png").expect("cached icon");
        assert!(icon.gzip_content.is_none());
    }
}
