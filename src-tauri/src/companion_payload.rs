use crate::companion_assets::CachedCompanionAsset;
use crate::companion_error::CompanionApiError;
use crate::state::TrustedLanCompanionRuntime;
use axum::body::Body;
use axum::http::{
    header::{
        ACCEPT_ENCODING, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE, ETAG, IF_NONE_MATCH, VARY,
    },
    HeaderMap, StatusCode,
};
use axum::response::{IntoResponse, Response};

pub(crate) fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn normalize_optional_swatch_color(
    value: Option<&str>,
) -> Result<Option<String>, CompanionApiError> {
    let Some(value) = normalize_optional_text(value) else {
        return Ok(None);
    };

    normalize_swatch_value(&value).map(Some).ok_or_else(|| {
        CompanionApiError::BadRequest(
            "hex_color must use #RGB, #RRGGBB, gradient(...), or multi(...)".to_string(),
        )
    })
}

fn normalize_swatch_value(value: &str) -> Option<String> {
    if let Some(hex_color) = normalize_hex_color(value) {
        return Some(hex_color);
    }

    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    let composite = if lower.starts_with("multi(") && trimmed.ends_with(')') {
        Some(("multi", &trimmed[6..trimmed.len() - 1]))
    } else if lower.starts_with("gradient(") && trimmed.ends_with(')') {
        Some(("gradient", &trimmed[9..trimmed.len() - 1]))
    } else {
        None
    };
    if let Some((kind, inner)) = composite {
        let colors = normalize_swatch_color_list(inner)?;
        return Some(format!("{kind}({})", colors.join(",")));
    }

    let colors = normalize_swatch_color_list(trimmed)?;
    Some(format!("gradient({})", colors.join(",")))
}

fn normalize_swatch_color_list(value: &str) -> Option<Vec<String>> {
    let parts: Vec<_> = value
        .split([',', ';'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 2 {
        return None;
    }
    parts.into_iter().map(normalize_hex_color).collect()
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let without_hash = trimmed.strip_prefix('#').unwrap_or(trimmed);
    match without_hash.len() {
        3 | 6 if without_hash.chars().all(|char| char.is_ascii_hexdigit()) => {
            Some(format!("#{without_hash}").to_uppercase())
        }
        _ => None,
    }
}

pub(crate) fn build_companion_spool_qr_payload(
    runtime: &TrustedLanCompanionRuntime,
    reference: &str,
) -> Result<String, CompanionApiError> {
    let encoded_ref = encode_versioned_qr_ref(reference);
    let shell_url = runtime
        .snapshot()
        .shell_url
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            CompanionApiError::ServiceUnavailable(
                "Stable Companion QR address is not available.".to_string(),
            )
        })?;
    let mut url = reqwest::Url::parse(shell_url.trim()).map_err(|_| {
        CompanionApiError::Internal("Stable Companion QR address is invalid.".to_string())
    })?;
    url.query_pairs_mut().append_pair("spool_qr", &encoded_ref);
    Ok(url.to_string())
}

pub(crate) fn build_qr_svg(payload: &str) -> Result<String, CompanionApiError> {
    use qrcode::render::svg;
    use qrcode::{EcLevel, QrCode};

    const MODULE_SCALE: u32 = 12;
    const QUIET_ZONE_MODULES: u32 = 4;
    const LOGO_SVG: &str = include_str!("../../ui/src/assets/filament-qr-logo.svg");
    const LOGO_WIDTH: f64 = 780.0;
    const LOGO_HEIGHT: f64 = 674.0;

    let smallest = QrCode::with_error_correction_level(payload.as_bytes(), EcLevel::H)
        .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let mut code = smallest.clone();
    if let qrcode::Version::Normal(minimum @ 2..=40) = smallest.version() {
        for version in minimum..=40 {
            let candidate = QrCode::with_version(
                payload.as_bytes(),
                qrcode::Version::Normal(version),
                EcLevel::H,
            )
            .map_err(|error| CompanionApiError::Internal(error.to_string()))?;
            if qr_logo_plate(&candidate).is_some() {
                code = candidate;
                break;
            }
        }
    }
    let image = code
        .render::<svg::Color>()
        .quiet_zone(true)
        .module_dimensions(MODULE_SCALE, MODULE_SCALE)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build();
    // Match the desktop plate's size and protect the complete structural map,
    // including alignment patterns that can occupy the center of longer QRs.
    let Some((plate_x, plate_y, plate_modules)) = qr_logo_plate(&code) else {
        return Ok(image);
    };
    let plate_size = plate_modules as u32 * MODULE_SCALE;
    let plate_x = (plate_x as u32 + QUIET_ZONE_MODULES) * MODULE_SCALE;
    let plate_y = (plate_y as u32 + QUIET_ZONE_MODULES) * MODULE_SCALE;
    let logo_width = plate_size - MODULE_SCALE * 2;
    let logo_scale = f64::from(logo_width) / LOGO_WIDTH;
    let logo_y = f64::from(plate_y) + (f64::from(plate_size) - LOGO_HEIGHT * logo_scale) / 2.0;
    let Some(qr_svg) = image.strip_suffix("</svg>") else {
        return Err(CompanionApiError::Internal(
            "Filament QR SVG geometry is invalid.".to_string(),
        ));
    };
    // Only the checked-in logo markup enters the SVG. The payload is encoded
    // as QR cells and never interpolated into XML.
    Ok(format!(
        "{qr_svg}<rect x=\"{plate_x}\" y=\"{plate_y}\" width=\"{plate_size}\" height=\"{plate_size}\" fill=\"#ffffff\"/><g shape-rendering=\"geometricPrecision\" transform=\"translate({logo_x} {logo_y:.6}) scale({logo_scale:.9})\">{LOGO_SVG}</g></svg>",
        logo_x = plate_x + MODULE_SCALE,
    ))
}

fn qr_logo_plate(code: &qrcode::QrCode) -> Option<(usize, usize, usize)> {
    use qrcode::canvas::{Canvas, Module};
    use qrcode::EcLevel;

    let width = code.width();
    let bounded_plate = (width * 21 / 100).min(11);
    let max_plate = if bounded_plate.is_multiple_of(2) {
        bounded_plate.saturating_sub(1)
    } else {
        bounded_plate
    };
    let mut reserved = Canvas::new(code.version(), EcLevel::H);
    reserved.draw_all_functional_patterns();
    for plate in (5..=max_plate).rev().filter(|size| size % 2 == 1) {
        let x = (width - plate) / 2;
        let y = x;
        let clear = (y - 1..=y + plate).all(|row| {
            (x - 1..=x + plate)
                .all(|column| reserved.get(column as i16, row as i16) == Module::Empty)
        });
        if clear {
            return Some((x, y, plate));
        }
    }
    None
}

pub(crate) struct NormalizedManualSpoolFields {
    pub(crate) material: String,
    pub(crate) filament_name: String,
    pub(crate) color_name: String,
}

pub(crate) fn normalize_owned_manual_fields(
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

pub(crate) fn validate_initial_weight(
    initial_weight_g: Option<i64>,
) -> Result<(), CompanionApiError> {
    if let Some(initial_weight_g) = initial_weight_g
        && initial_weight_g < 0
    {
        return Err(CompanionApiError::BadRequest(
            "initial_weight_g must be zero or greater".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn text_response(content_type: &'static str, content: &'static str) -> Response {
    (
        [
            (axum::http::header::CONTENT_TYPE, content_type),
            (axum::http::header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        content,
    )
        .into_response()
}

pub(crate) fn string_response(content_type: &'static str, content: String) -> Response {
    (
        [
            (axum::http::header::CONTENT_TYPE, content_type),
            (axum::http::header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        content,
    )
        .into_response()
}

pub(crate) fn static_asset_response(
    request_headers: &HeaderMap,
    asset: &CachedCompanionAsset,
) -> Response {
    let can_gzip = asset.gzip_content.is_some();
    if request_headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| weak_etag_matches(value, &asset.weak_etag))
    {
        let mut builder = Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(CACHE_CONTROL, "private, no-cache")
            .header(ETAG, asset.weak_etag.as_str());
        if can_gzip {
            builder = builder.header(VARY, ACCEPT_ENCODING.as_str());
        }
        return builder
            .body(Body::empty())
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }

    let serve_gzip = can_gzip && accepts_gzip(request_headers);
    let mut builder = Response::builder()
        .header(CONTENT_TYPE, asset.content_type)
        .header(CACHE_CONTROL, "private, no-cache")
        .header(ETAG, asset.weak_etag.as_str());
    if can_gzip {
        builder = builder.header(VARY, ACCEPT_ENCODING.as_str());
    }
    if serve_gzip {
        builder = builder.header(CONTENT_ENCODING, "gzip");
    }

    let content = if serve_gzip {
        asset
            .gzip_content
            .clone()
            .unwrap_or_else(|| asset.content.clone())
    } else {
        asset.content.clone()
    };
    builder
        .body(Body::from(content))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

pub(crate) fn html_response(content: &'static str) -> Response {
    text_response("text/html; charset=utf-8", content)
}

fn encode_versioned_qr_ref(reference: &str) -> String {
    format!("v1:{}", reference.trim())
}

fn accepts_gzip(headers: &HeaderMap) -> bool {
    let Some(value) = headers
        .get(ACCEPT_ENCODING)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };

    let mut gzip_quality = None;
    let mut wildcard_quality = None;
    for entry in value.split(',') {
        let mut parts = entry.trim().split(';');
        let coding = parts.next().unwrap_or_default().trim();
        let mut quality = 1.0;
        for parameter in parts {
            let Some((name, value)) = parameter.trim().split_once('=') else {
                continue;
            };
            if name.trim().eq_ignore_ascii_case("q") {
                quality = value
                    .trim()
                    .parse::<f32>()
                    .ok()
                    .filter(|quality| quality.is_finite() && (0.0..=1.0).contains(quality))
                    .unwrap_or(0.0);
                break;
            }
        }
        if coding.eq_ignore_ascii_case("gzip") {
            gzip_quality = Some(quality);
        } else if coding == "*" {
            wildcard_quality = Some(quality);
        }
    }

    gzip_quality.or(wildcard_quality).unwrap_or(0.0) > 0.0
}

fn weak_etag_matches(if_none_match: &str, current_etag: &str) -> bool {
    let current = current_etag
        .trim()
        .strip_prefix("W/")
        .unwrap_or(current_etag.trim());
    if_none_match.split(',').any(|candidate| {
        let candidate = candidate.trim();
        candidate == "*" || candidate.strip_prefix("W/").unwrap_or(candidate) == current
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::TrustedLanCompanionRuntime;

    #[test]
    fn spool_qr_svg_keeps_high_correction_black_cells_and_the_full_quiet_zone() {
        use qrcode::render::svg;
        use qrcode::{EcLevel, QrCode};

        let payload = "http://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_1775592053186";
        let code = QrCode::with_version(payload, qrcode::Version::Normal(14), EcLevel::H).unwrap();
        let plain = code
            .render::<svg::Color>()
            .quiet_zone(true)
            .module_dimensions(12, 12)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#ffffff"))
            .build();
        let branded = build_qr_svg(payload).expect("branded spool QR");

        // The selected centered encoding's matrix and quiet zone survive unchanged;
        // only a small structurally safe white plate and transparent logo follow.
        assert!(branded.starts_with(plain.strip_suffix("</svg>").unwrap()));
        assert!(branded.contains("M48 48h12v12"));
        assert!(branded.contains("width=\"132\" height=\"132\" fill=\"#ffffff\""));
        assert!(branded.contains(include_str!("../../ui/src/assets/filament-qr-logo.svg")));
        assert!(branded.ends_with("</g></svg>"));
        assert!(!branded.contains(payload));
    }

    #[test]
    fn spool_qr_svg_leaves_tiny_matrices_uncovered_and_rejects_unencodable_data() {
        let short = build_qr_svg("1").expect("short QR");
        assert!(short.contains("width=\"348\" height=\"348\""));
        assert!(!short.contains("<circle"));
        assert!(!short.contains("<g "));

        assert!(matches!(
            build_qr_svg(&"x".repeat(10_000)),
            Err(CompanionApiError::Internal(_))
        ));
    }

    #[test]
    fn spool_qr_svg_never_interpolates_untrusted_payload_into_logo_markup() {
        let payload = "v1:<script>alert('qr-injection')</script>";
        let image = build_qr_svg(payload).expect("QR with arbitrary encoded text");
        assert!(!image.contains("<script"));
        assert!(!image.contains("qr-injection"));
        assert!(!image.contains(payload));
    }

    #[test]
    fn spool_qr_logo_plate_preserves_functional_modules_with_a_one_module_buffer() {
        use qrcode::canvas::{Canvas, Module};
        use qrcode::{EcLevel, QrCode, Version};

        for version in 1..=40 {
            let code = QrCode::with_version("x", Version::Normal(version), EcLevel::H)
                .expect("normal QR version");
            let Some((x, y, size)) = qr_logo_plate(&code) else {
                continue;
            };
            assert!((5..=11).contains(&size));
            assert_eq!(size % 2, 1);
            assert_eq!(x * 2 + size, code.width());
            assert_eq!(y * 2 + size, code.width());
            assert!(size * 100 <= code.width() * 21);
            let mut functional = Canvas::new(code.version(), EcLevel::H);
            functional.draw_all_functional_patterns();
            for row in y - 1..=y + size {
                for column in x - 1..=x + size {
                    assert_eq!(
                        functional.get(column as i16, row as i16),
                        Module::Empty,
                        "logo would cover a functional module in QR version {version}"
                    );
                }
            }
        }

        let version7 = QrCode::with_version("x", Version::Normal(7), EcLevel::H).unwrap();
        assert!(qr_logo_plate(&version7).is_none());
    }

    #[test]
    fn normalizes_optional_swatch_colors() {
        assert_eq!(
            normalize_optional_swatch_color(Some("abc123")).unwrap(),
            Some("#ABC123".to_string())
        );
        assert_eq!(
            normalize_optional_swatch_color(Some("Gradient(#ec984c; #6cd4bc)")).unwrap(),
            Some("gradient(#EC984C,#6CD4BC)".to_string())
        );
        assert_eq!(
            normalize_optional_swatch_color(Some("multi(#720062,3a913f)")).unwrap(),
            Some("multi(#720062,#3A913F)".to_string())
        );
        assert_eq!(normalize_optional_swatch_color(Some("   ")).unwrap(), None);
    }

    #[test]
    fn rejects_invalid_optional_swatch_colors() {
        assert!(normalize_optional_swatch_color(Some("not-a-color")).is_err());
        assert!(normalize_optional_swatch_color(Some("multi(#EC984C,not-a-color)")).is_err());
    }

    #[test]
    fn parses_gzip_quality_and_weak_etag_lists() {
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCEPT_ENCODING,
            "br, gzip;q=0.8".parse().expect("valid header"),
        );
        assert!(accepts_gzip(&headers));

        headers.insert(
            ACCEPT_ENCODING,
            "*;q=1, gzip;q=0".parse().expect("valid header"),
        );
        assert!(!accepts_gzip(&headers));
        headers.insert(
            ACCEPT_ENCODING,
            "gzip;q=invalid".parse().expect("valid header"),
        );
        assert!(!accepts_gzip(&headers));
        assert!(weak_etag_matches("\"old\", W/\"current\"", "W/\"current\""));
        assert!(weak_etag_matches("*", "W/\"current\""));
        assert!(!weak_etag_matches("W/\"other\"", "W/\"current\""));
    }

    #[test]
    fn spool_qr_requires_the_stable_address_when_one_is_configured() {
        let runtime = TrustedLanCompanionRuntime::new(4278)
            .with_selected_interface("Wi-Fi", "192.168.1.50")
            .with_advertised_hostname("filament-manager-a7c4.local")
            .with_enabled(true);

        assert!(matches!(
            build_companion_spool_qr_payload(&runtime, "spool-1"),
            Err(CompanionApiError::ServiceUnavailable(_))
        ));

        runtime.mark_local_name_running();
        assert_eq!(
            build_companion_spool_qr_payload(&runtime, "spool-1").expect("stable QR URL"),
            "http://filament-manager-a7c4.local:4278/companion?spool_qr=v1%3Aspool-1"
        );
    }
}
