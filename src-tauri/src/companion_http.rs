use crate::companion_error::CompanionApiError;
use crate::state::TrustedLanCompanionRuntime;
use axum::body::{to_bytes, Body};
use axum::extract::{ConnectInfo, State};
use axum::http::{
    header::{CACHE_CONTROL, COOKIE, EXPIRES, HOST, ORIGIN, PRAGMA},
    HeaderMap, HeaderValue, Method, Request, StatusCode,
};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub(crate) const COMPANION_CSRF_HEADER: &str = "x-csrf-token";
pub(crate) const COMPANION_QA_DELAY_HEADER: &str = "x-companion-qa-delay-ms";
pub(crate) const COMPANION_REQUEST_BODY_LIMIT_BYTES: usize = 64 * 1024;

const COMPANION_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const COMPANION_RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
const COMPANION_RATE_LIMIT_REQUESTS: u32 = 240;
const COMPANION_AUTH_RATE_LIMIT_REQUESTS: u32 = 10;
const COMPANION_RATE_LIMIT_MAX_CLIENTS: usize = 512;

const COMPANION_CONTENT_SECURITY_POLICY: &str = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'";
const COMPANION_PERMISSIONS_POLICY: &str = "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()";

#[derive(Clone, Copy)]
pub(crate) struct CompanionHttpSecurityConfig {
    body_limit_bytes: usize,
    request_timeout: Duration,
    rate_limit_window: Duration,
    rate_limit_requests: u32,
    auth_rate_limit_requests: u32,
    max_tracked_clients: usize,
}

impl CompanionHttpSecurityConfig {
    pub(crate) fn production() -> Self {
        Self {
            body_limit_bytes: COMPANION_REQUEST_BODY_LIMIT_BYTES,
            request_timeout: COMPANION_REQUEST_TIMEOUT,
            rate_limit_window: COMPANION_RATE_LIMIT_WINDOW,
            rate_limit_requests: COMPANION_RATE_LIMIT_REQUESTS,
            auth_rate_limit_requests: COMPANION_AUTH_RATE_LIMIT_REQUESTS,
            max_tracked_clients: COMPANION_RATE_LIMIT_MAX_CLIENTS,
        }
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        body_limit_bytes: usize,
        request_timeout: Duration,
        rate_limit_window: Duration,
        rate_limit_requests: u32,
        auth_rate_limit_requests: u32,
    ) -> Self {
        Self {
            body_limit_bytes,
            request_timeout,
            rate_limit_window,
            rate_limit_requests,
            auth_rate_limit_requests,
            max_tracked_clients: 8,
        }
    }
}

#[derive(Clone)]
pub(crate) struct CompanionHttpSecurity {
    config: CompanionHttpSecurityConfig,
    requests: ClientRateLimiter,
    auth_attempts: ClientRateLimiter,
}

impl CompanionHttpSecurity {
    pub(crate) fn new(config: CompanionHttpSecurityConfig) -> Self {
        Self {
            config,
            requests: ClientRateLimiter::new(
                config.rate_limit_requests,
                config.rate_limit_window,
                config.max_tracked_clients,
            ),
            auth_attempts: ClientRateLimiter::new(
                config.auth_rate_limit_requests,
                config.rate_limit_window,
                config.max_tracked_clients,
            ),
        }
    }
}

#[derive(Clone)]
struct ClientRateLimiter {
    capacity: u32,
    refill_window: Duration,
    max_tracked_clients: usize,
    state: Arc<Mutex<ClientRateLimitState>>,
}

struct ClientRateLimitState {
    clients: HashMap<IpAddr, TokenBucket>,
    fallback: TokenBucket,
}

struct TokenBucket {
    available: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn full(capacity: u32, now: Instant) -> Self {
        Self {
            available: f64::from(capacity.max(1)),
            last_refill: now,
        }
    }

    fn consume(&mut self, capacity: u32, refill_window: Duration, now: Instant) -> Result<(), u64> {
        let capacity = capacity.max(1);
        let refill_seconds = refill_window.as_secs_f64().max(0.001);
        let elapsed_seconds = now.duration_since(self.last_refill).as_secs_f64();
        self.available = (self.available
            + elapsed_seconds * (f64::from(capacity) / refill_seconds))
            .min(f64::from(capacity));
        self.last_refill = now;

        if self.available >= 1.0 {
            self.available -= 1.0;
            return Ok(());
        }

        let retry_after = ((1.0 - self.available) * refill_seconds / f64::from(capacity))
            .ceil()
            .max(1.0) as u64;
        Err(retry_after)
    }
}

impl ClientRateLimiter {
    fn new(capacity: u32, refill_window: Duration, max_tracked_clients: usize) -> Self {
        let now = Instant::now();
        Self {
            capacity: capacity.max(1),
            refill_window,
            max_tracked_clients: max_tracked_clients.max(1),
            state: Arc::new(Mutex::new(ClientRateLimitState {
                clients: HashMap::new(),
                fallback: TokenBucket::full(capacity, now),
            })),
        }
    }

    fn check(&self, client_ip: Option<IpAddr>) -> Result<(), CompanionApiError> {
        let now = Instant::now();
        let mut state = self.state.lock().map_err(|_| {
            CompanionApiError::ServiceUnavailable(
                "Companion request limiter is unavailable".to_string(),
            )
        })?;

        let use_client_bucket = if let Some(client_ip) = client_ip {
            if !state.clients.contains_key(&client_ip)
                && state.clients.len() >= self.max_tracked_clients
            {
                let stale_after = self.refill_window.saturating_mul(2);
                state
                    .clients
                    .retain(|_, bucket| now.duration_since(bucket.last_refill) < stale_after);
            }
            state.clients.contains_key(&client_ip) || state.clients.len() < self.max_tracked_clients
        } else {
            false
        };

        let result = if let (true, Some(client_ip)) = (use_client_bucket, client_ip) {
            state
                .clients
                .entry(client_ip)
                .or_insert_with(|| TokenBucket::full(self.capacity, now))
                .consume(self.capacity, self.refill_window, now)
        } else {
            state
                .fallback
                .consume(self.capacity, self.refill_window, now)
        };

        result.map_err(CompanionApiError::RateLimited)
    }
}

pub(crate) async fn apply_companion_security_headers(
    request: Request<Body>,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        axum::http::header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(COMPANION_CONTENT_SECURITY_POLICY),
    );
    headers.insert(
        axum::http::header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        axum::http::header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );
    headers.insert(
        axum::http::header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static(COMPANION_PERMISSIONS_POLICY),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("cross-origin-opener-policy"),
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("cross-origin-resource-policy"),
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("origin-agent-cluster"),
        HeaderValue::from_static("?1"),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("x-permitted-cross-domain-policies"),
        HeaderValue::from_static("none"),
    );
    response
}

pub(crate) async fn enforce_companion_rate_limit(
    State(security): State<CompanionHttpSecurity>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let client_ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|connect_info| connect_info.0.ip());

    if let Err(error) = security.requests.check(client_ip) {
        return error.into_response();
    }
    let is_auth_attempt = request.method() == Method::POST
        && matches!(
            request.uri().path(),
            "/api/v1/auth/pair" | "/api/v1/auth/renew"
        );
    if is_auth_attempt && let Err(error) = security.auth_attempts.check(client_ip) {
        return error.into_response();
    }

    next.run(request).await
}

pub(crate) async fn enforce_companion_body_limit(
    State(security): State<CompanionHttpSecurity>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, security.config.body_limit_bytes).await {
        Ok(body) => body,
        Err(_) => return CompanionApiError::PayloadTooLarge.into_response(),
    };
    next.run(Request::from_parts(parts, Body::from(body))).await
}

pub(crate) async fn enforce_companion_request_timeout(
    State(security): State<CompanionHttpSecurity>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if !request_timeout_applies(request.method()) {
        // The handler may already have dispatched a non-cancellable SQLite transaction through
        // `spawn_blocking`. Returning 408 while that work continues would make the caller retry an
        // operation that may have committed. Mutations therefore wait for one definitive result;
        // bounded timeouts remain appropriate for idempotent reads.
        return next.run(request).await;
    }
    match tokio::time::timeout(security.config.request_timeout, next.run(request)).await {
        Ok(response) => response,
        Err(_) => CompanionApiError::RequestTimeout.into_response(),
    }
}

fn request_timeout_applies(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

pub(crate) async fn apply_companion_cache_policy(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    let is_dynamic_response =
        path.starts_with("/api/v1") || matches!(path, "/" | "/companion" | "/companion/");
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
    use super::{
        enforce_companion_request_timeout, is_allowed_host, is_allowed_origin,
        CompanionHttpSecurity, CompanionHttpSecurityConfig, TokenBucket,
    };
    use crate::state::TrustedLanCompanionRuntime;
    use axum::body::{to_bytes, Body};
    use axum::http::{Method, Request, StatusCode};
    use axum::middleware;
    use axum::response::IntoResponse;
    use axum::routing::post;
    use axum::Router;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

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

    #[test]
    fn token_bucket_reports_retry_after_and_refills_at_the_configured_rate() {
        let started_at = Instant::now();
        let mut bucket = TokenBucket::full(2, started_at);
        let window = Duration::from_secs(60);

        assert_eq!(bucket.consume(2, window, started_at), Ok(()));
        assert_eq!(bucket.consume(2, window, started_at), Ok(()));
        assert_eq!(bucket.consume(2, window, started_at), Err(30));
        assert_eq!(
            bucket.consume(2, window, started_at + Duration::from_secs(29)),
            Err(1)
        );
        assert_eq!(
            bucket.consume(2, window, started_at + Duration::from_secs(31)),
            Ok(())
        );
    }

    #[tokio::test]
    async fn mutating_request_outlives_read_deadline_and_commits_exactly_once() {
        let commits = Arc::new(AtomicUsize::new(0));
        let handler_commits = Arc::clone(&commits);
        let router = Router::new()
            .route(
                "/write",
                post(move || {
                    let commits = Arc::clone(&handler_commits);
                    async move {
                        tokio::time::sleep(Duration::from_millis(40)).await;
                        commits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::OK.into_response()
                    }
                }),
            )
            .layer(middleware::from_fn_with_state(
                CompanionHttpSecurity::new(CompanionHttpSecurityConfig::for_test(
                    1024,
                    Duration::from_millis(10),
                    Duration::from_secs(60),
                    10,
                    10,
                )),
                enforce_companion_request_timeout,
            ));

        let response = tower::ServiceExt::oneshot(
            router,
            Request::builder()
                .method(Method::POST)
                .uri("/write")
                .body(Body::empty())
                .expect("build mutation request"),
        )
        .await
        .expect("complete mutation request");

        assert_eq!(response.status(), StatusCode::OK);
        let _ = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read response");
        assert_eq!(commits.load(Ordering::SeqCst), 1);
    }
}
