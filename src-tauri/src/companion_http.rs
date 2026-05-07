use crate::companion_error::CompanionApiError;
use crate::state::TrustedLanCompanionRuntime;
use axum::http::{
    header::{COOKIE, HOST, ORIGIN},
    HeaderMap, Method,
};
use std::time::Duration;

pub(crate) const COMPANION_CSRF_HEADER: &str = "x-csrf-token";
pub(crate) const COMPANION_QA_DELAY_HEADER: &str = "x-companion-qa-delay-ms";

pub(crate) fn require_allowed_host(
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

pub(crate) fn require_allowed_origin(
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

pub(crate) async fn maybe_apply_qa_delay(
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

pub(crate) fn header_string(
    headers: &HeaderMap,
    header_name: axum::http::header::HeaderName,
) -> Option<&str> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
}

pub(crate) fn cookie_value_from_headers(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
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

pub(crate) fn requires_csrf(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

pub(crate) fn has_valid_csrf(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get(COMPANION_CSRF_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim() == expected)
        .unwrap_or(false)
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
