use crate::companion_error::CompanionApiError;
use crate::state::TrustedLanCompanionRuntime;
use axum::body::Body;
use axum::http::{
    header::{CACHE_CONTROL, COOKIE, EXPIRES, HOST, ORIGIN, PRAGMA},
    HeaderMap, HeaderValue, Method, Request, StatusCode,
};
use axum::middleware::Next;
use axum::response::Response;
use std::str::FromStr;
use std::time::Duration;

pub(crate) const COMPANION_CSRF_HEADER: &str = "x-csrf-token";
pub(crate) const COMPANION_QA_DELAY_HEADER: &str = "x-companion-qa-delay-ms";

pub(crate) async fn apply_companion_cache_policy(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    let is_dynamic_response =
        path.starts_with("/api/v1") || matches!(path, "/companion" | "/companion/");
    let mut response = next.run(request).await;
    let is_error = !response.status().is_success() && response.status() != StatusCode::NOT_MODIFIED;
    if is_dynamic_response || is_error {
        apply_no_store_headers(response.headers_mut());
    }
    response
}

fn apply_no_store_headers(headers: &mut HeaderMap) {
    headers.insert(
        CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    headers.insert(PRAGMA, HeaderValue::from_static("no-cache"));
    headers.insert(EXPIRES, HeaderValue::from_static("0"));
}

pub(crate) fn require_allowed_host(
    headers: &HeaderMap,
    runtime: &TrustedLanCompanionRuntime,
) -> Result<(), CompanionApiError> {
    let Some(host) = header_string(headers, HOST) else {
        return Err(CompanionApiError::Forbidden(
            "Host header is required for the trusted-LAN companion API".to_string(),
        ));
    };

    if is_allowed_host(host, runtime) {
        Ok(())
    } else {
        Err(CompanionApiError::Forbidden(
            "Host header is not allowed for the trusted-LAN companion API".to_string(),
        ))
    }
}

pub(crate) fn require_stable_request_host(
    headers: &HeaderMap,
    runtime: &TrustedLanCompanionRuntime,
) -> Result<(), CompanionApiError> {
    if !runtime.stable_request_host_required() {
        return Ok(());
    }
    let host = header_string(headers, HOST).ok_or_else(|| {
        CompanionApiError::Forbidden(
            "Stable Host header is required for the trusted-LAN companion API".to_string(),
        )
    })?;
    if normalized_authority(host)
        .zip(runtime.stable_host_authority())
        .is_some_and(|(actual, expected)| actual == expected)
    {
        Ok(())
    } else {
        Err(CompanionApiError::Forbidden(
            "Stable Host header is required for the trusted-LAN companion API".to_string(),
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
    normalized_authority(host)
        .is_some_and(|normalized| runtime.allowed_host_authorities().contains(&normalized))
}

fn normalized_authority(host: &str) -> Option<String> {
    if host != host.trim() {
        return None;
    }
    axum::http::uri::Authority::from_str(host)
        .ok()
        .map(|authority| authority.as_str().to_ascii_lowercase())
}

fn is_allowed_origin(origin: &str, runtime: &TrustedLanCompanionRuntime) -> bool {
    if origin != origin.trim() {
        return false;
    }
    let Ok(parsed) = reqwest::Url::parse(origin) else {
        return false;
    };
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return false;
    }
    let normalized = parsed.origin().ascii_serialization().to_ascii_lowercase();
    runtime
        .allowed_origins()
        .iter()
        .any(|allowed| normalized == allowed.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_host, is_allowed_origin};
    use crate::state::TrustedLanCompanionRuntime;

    fn stable_runtime() -> TrustedLanCompanionRuntime {
        let runtime = TrustedLanCompanionRuntime::new(4278)
            .with_selected_interface("Wi-Fi", "192.168.1.50")
            .with_advertised_hostname("filament-manager-a7c4.local")
            .with_enabled(true);
        runtime.mark_local_name_running();
        runtime
    }

    #[test]
    fn host_allowlist_accepts_only_the_current_endpoint_and_stable_name() {
        let runtime = stable_runtime();
        assert!(is_allowed_host("192.168.1.50:4278", &runtime));
        assert!(is_allowed_host(
            "FILAMENT-MANAGER-A7C4.LOCAL:4278",
            &runtime
        ));
        for rejected in [
            "192.168.1.51:4278",
            "filament-manager-a7c4.local:4279",
            "filament-manager-a7c4.local.evil:4278",
            " filament-manager-a7c4.local:4278",
            "user@filament-manager-a7c4.local:4278",
        ] {
            assert!(!is_allowed_host(rejected, &runtime), "{rejected}");
        }
    }

    #[test]
    fn origin_allowlist_requires_an_exact_http_origin() {
        let runtime = stable_runtime();
        assert!(is_allowed_origin(
            "http://filament-manager-a7c4.local:4278",
            &runtime
        ));
        for rejected in [
            "http://192.168.1.50:4278",
            "https://filament-manager-a7c4.local:4278",
            "http://filament-manager-a7c4.local:4279",
            "http://filament-manager-a7c4.local.evil:4278",
            "http://user:secret@filament-manager-a7c4.local:4278",
            "http://filament-manager-a7c4.local:4278/companion",
            "http://filament-manager-a7c4.local:4278/?query=1",
            " http://filament-manager-a7c4.local:4278",
        ] {
            assert!(!is_allowed_origin(rejected, &runtime), "{rejected}");
        }
    }
}
