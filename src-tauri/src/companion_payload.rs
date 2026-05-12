use crate::companion_error::CompanionApiError;
use crate::state::TrustedLanCompanionRuntime;
use axum::body::Body;
use axum::response::{IntoResponse, Response};

pub(crate) fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn normalize_optional_hex_color(
    value: Option<&str>,
) -> Result<Option<String>, CompanionApiError> {
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

pub(crate) fn build_companion_spool_qr_payload(
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

pub(crate) fn build_qr_svg(payload: &str) -> Result<String, CompanionApiError> {
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
    if let Some(initial_weight_g) = initial_weight_g {
        if initial_weight_g < 0 {
            return Err(CompanionApiError::BadRequest(
                "initial_weight_g must be zero or greater".to_string(),
            ));
        }
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

pub(crate) fn bytes_response(content_type: &'static str, content: &'static [u8]) -> Response {
    Response::builder()
        .header(axum::http::header::CONTENT_TYPE, content_type)
        .header(axum::http::header::CACHE_CONTROL, "no-store, max-age=0")
        .body(Body::from(content))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

pub(crate) fn html_response(content: &'static str) -> Response {
    text_response("text/html; charset=utf-8", content)
}

fn encode_versioned_qr_ref(reference: &str) -> String {
    format!("v1:{}", reference.trim())
}
