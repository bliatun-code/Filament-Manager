use crate::credential_store::{CredentialKey, SecretValue};
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_runtime_auth::LibrarySyncRenewalFailureKind;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::trusted_lan_health::CompanionHealthCheckResponse;
use crate::with_inventory;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE, HOST, ORIGIN, SET_COOKIE};
use serde::{de::DeserializeOwned, Deserialize};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{Arc, Condvar, Mutex, OnceLock},
    time::{Duration, Instant},
};
use zeroize::{Zeroize, Zeroizing};

use mdns_sd::{HostnameResolutionEvent, ServiceDaemon};

const LIBRARY_SYNC_REQUEST_TIMEOUT: Duration = Duration::from_millis(2500);
const MDNS_RETRY_TIMEOUT: Duration = Duration::from_millis(750);
const LIBRARY_SYNC_CONNECT_TIMEOUT: Duration = Duration::from_millis(500);
const MDNS_ROUTE_FRESH_TTL: Duration = Duration::from_secs(5 * 60);
const MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF: Duration = Duration::from_secs(30);
const MDNS_HOST_CACHE_LIMIT: usize = 32;
const SHARED_RENEWAL_FAILED_ERROR: &str =
    "Desktop client session renewal failed. Please try again.";
const SHARED_RENEWAL_UNAUTHORIZED_ERROR: &str =
    "Desktop client session renewal returned 401. Pairing is no longer valid.";

#[derive(Clone)]
struct ResolvedMdnsRoute {
    generation: u64,
    client: reqwest::blocking::Client,
    fresh_until: Instant,
}

struct MdnsRouteLease {
    slot: Arc<MdnsHostSlot>,
    route: ResolvedMdnsRoute,
}

struct MdnsFallbackCandidate {
    slot: Arc<MdnsHostSlot>,
    route: ResolvedMdnsRoute,
}

struct LibrarySyncRequestOutcome {
    response: reqwest::blocking::Response,
    fallback_candidate: Option<MdnsFallbackCandidate>,
}

#[derive(Default)]
struct MdnsHostState {
    route: Option<ResolvedMdnsRoute>,
    resolving: bool,
    active_attempt: u64,
    last_failure: Option<(u64, String)>,
    invalidated_generation: u64,
    next_generation: u64,
}

#[derive(Default)]
struct MdnsHostSlot {
    state: Mutex<MdnsHostState>,
    resolution_completed: Condvar,
}

#[derive(Default)]
struct MdnsTransport {
    hosts: Mutex<HashMap<String, Arc<MdnsHostSlot>>>,
}

static LIBRARY_SYNC_HTTP_CLIENT: OnceLock<Result<reqwest::blocking::Client, String>> =
    OnceLock::new();
static LIBRARY_SYNC_MDNS_DAEMON: OnceLock<Mutex<Option<ServiceDaemon>>> = OnceLock::new();
static LIBRARY_SYNC_MDNS_TRANSPORT: OnceLock<MdnsTransport> = OnceLock::new();

#[derive(Deserialize)]
struct LibrarySyncAuthenticatedSessionResponse {
    ok: bool,
    csrf_token: String,
}

pub(crate) struct LibrarySyncAuthenticatedSessionState {
    pub(crate) csrf_token: String,
    pub(crate) session_id: String,
    pub(crate) device_token: String,
}

impl Drop for LibrarySyncAuthenticatedSessionState {
    fn drop(&mut self) {
        self.csrf_token.zeroize();
        self.session_id.zeroize();
        self.device_token.zeroize();
    }
}

pub(crate) fn library_sync_host_header_value(base_url: &str) -> Result<String, String> {
    let parsed =
        reqwest::Url::parse(base_url).map_err(|error| format!("Host URL is invalid: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Host URL is missing a hostname.".to_string())?;
    let host_header = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    match parsed.port() {
        Some(port) => Ok(format!("{host_header}:{port}")),
        None => Ok(host_header),
    }
}

pub(crate) fn extract_library_sync_pairing_token(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(parsed) = reqwest::Url::parse(trimmed)
        && let Some((_, value)) = parsed.query_pairs().find(|(key, _)| key == "pairing")
    {
        let token = value.trim().to_string();
        if !token.is_empty() {
            return Some(token);
        }
    }
    Some(trimmed.to_string())
}

pub(crate) fn extract_cookie_value_from_set_cookie(set_cookie: &str, name: &str) -> Option<String> {
    let first = set_cookie.split(';').next()?.trim();
    let (cookie_name, cookie_value) = first.split_once('=')?;
    if cookie_name.trim() != name || cookie_value.trim().is_empty() {
        return None;
    }
    Some(cookie_value.trim().to_string())
}

fn library_sync_http_client_builder() -> reqwest::blocking::ClientBuilder {
    // Companion endpoints are deliberately local-only. Never route a paired desktop request
    // through a system or environment proxy: apart from being unnecessary, that can prevent a
    // private `.local` name from reaching the selected LAN host.
    reqwest::blocking::Client::builder()
        .connect_timeout(LIBRARY_SYNC_CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
}

fn shared_library_sync_http_client(
    operation: &str,
) -> Result<&'static reqwest::blocking::Client, String> {
    LIBRARY_SYNC_HTTP_CLIENT
        .get_or_init(|| {
            library_sync_http_client_builder()
                .build()
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|error| format!("Failed to prepare {operation} client: {error}"))
}

/// Sends one private-LAN request without using a proxy. Stable `.local` names never enter the
/// system resolver: a shared mDNS daemon resolves them to private IPv4 addresses and each route
/// pins those addresses while the URL, `Host`, TLS name, and `Origin` stay on the stable hostname.
/// The last working route is periodically revalidated and invalidated after transport failures.
pub(crate) fn send_library_sync_request(
    base_url: &str,
    timeout: Duration,
    operation: &str,
    make_request: impl Fn(&reqwest::blocking::Client) -> reqwest::blocking::RequestBuilder,
) -> Result<reqwest::blocking::Response, String> {
    send_library_sync_request_with_fallback_candidate(
        base_url,
        timeout,
        operation,
        false,
        make_request,
    )
    .map(|outcome| outcome.response)
}

fn send_library_sync_request_with_fallback_candidate(
    base_url: &str,
    timeout: Duration,
    operation: &str,
    allow_identity_fallback: bool,
    make_request: impl Fn(&reqwest::blocking::Client) -> reqwest::blocking::RequestBuilder,
) -> Result<LibrarySyncRequestOutcome, String> {
    let request_started_at = Instant::now();
    if let Some((hostname, port)) = stable_local_host_and_port(base_url) {
        return send_mdns_local_request_with_fallback_candidate(
            mdns_transport(),
            (&hostname, port),
            timeout,
            operation,
            allow_identity_fallback,
            resolve_stable_local_hostname_with_mdns,
            make_request,
        );
    }

    let timeout = remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
        .ok_or_else(|| format!("{operation} timed out before it could start."))?;
    let client = shared_library_sync_http_client(operation)?;
    let response = make_request(client)
        .timeout(timeout)
        .send()
        .map_err(|error| format!("{operation} failed: {error}"))?;
    Ok(LibrarySyncRequestOutcome {
        response,
        fallback_candidate: None,
    })
}

fn remaining_library_sync_request_timeout(
    timeout: Duration,
    elapsed: Duration,
) -> Option<Duration> {
    let remaining = timeout.saturating_sub(elapsed);
    (!remaining.is_zero()).then_some(remaining)
}

fn stable_local_host_and_port(base_url: &str) -> Option<(String, u16)> {
    let parsed = reqwest::Url::parse(base_url).ok()?;
    let hostname = parsed
        .host_str()?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if !hostname.ends_with(".local") {
        return None;
    }
    Some((hostname, parsed.port_or_known_default()?))
}

fn mdns_transport() -> &'static MdnsTransport {
    LIBRARY_SYNC_MDNS_TRANSPORT.get_or_init(MdnsTransport::default)
}

#[cfg(test)]
fn send_mdns_local_request_with<Resolve, MakeRequest>(
    transport: &MdnsTransport,
    hostname: &str,
    port: u16,
    timeout: Duration,
    operation: &str,
    resolve: Resolve,
    make_request: MakeRequest,
) -> Result<reqwest::blocking::Response, String>
where
    Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    MakeRequest: Fn(&reqwest::blocking::Client) -> reqwest::blocking::RequestBuilder,
{
    send_mdns_local_request_with_fallback_candidate(
        transport,
        (hostname, port),
        timeout,
        operation,
        false,
        resolve,
        make_request,
    )
    .map(|outcome| outcome.response)
}

fn send_mdns_local_request_with_fallback_candidate<Resolve, MakeRequest>(
    transport: &MdnsTransport,
    host: (&str, u16),
    timeout: Duration,
    operation: &str,
    allow_identity_fallback: bool,
    resolve: Resolve,
    make_request: MakeRequest,
) -> Result<LibrarySyncRequestOutcome, String>
where
    Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    MakeRequest: Fn(&reqwest::blocking::Client) -> reqwest::blocking::RequestBuilder,
{
    let (hostname, port) = host;
    let request_started_at = Instant::now();
    let resolution_timeout = MDNS_RETRY_TIMEOUT.min(timeout);
    let initial =
        transport.current_route_with(hostname, port, resolution_timeout, operation, &resolve)?;
    let remaining_timeout =
        remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
            .ok_or_else(|| format!("{operation} timed out while resolving the local host."))?;

    let initial_request = make_request(&initial.route.client)
        .timeout(remaining_timeout)
        .build()
        .map_err(|error| format!("Failed to prepare {operation}: {error}"))?;
    let retry_safe_method = matches!(
        *initial_request.method(),
        reqwest::Method::GET | reqwest::Method::HEAD
    );
    let carries_credentials = initial_request.headers().contains_key(COOKIE)
        || initial_request.headers().contains_key(AUTHORIZATION);
    let retry_safe = retry_safe_method && !carries_credentials;
    let retry_safe_identity_preflight =
        allow_identity_fallback && retry_safe && initial_request.url().path() == "/api/v1/health";
    let first_error = match initial.route.client.execute(initial_request) {
        Ok(response) => {
            return Ok(LibrarySyncRequestOutcome {
                response,
                fallback_candidate: None,
            });
        }
        // Reqwest 0.13 does not reliably classify all lower-level connection failures as
        // `is_connect()` (a refused pinned address can surface as a request timeout). Retrying
        // after any error before a response is safe only for unauthenticated idempotent reads. A
        // write may have reached the server before its response path failed, and an authenticated
        // read must re-run the host identity preflight before cookies reach a newly resolved IP.
        // In both cases, invalidate the route for the next separate call without replaying here.
        Err(error) => error,
    };

    if !retry_safe {
        initial
            .slot
            .invalidate_without_resolution(initial.route.generation);
        return Err(format!("{operation} failed: {first_error}"));
    }

    // A read transport error can mean that a once-good DHCP address moved. Invalidate only the
    // generation that actually failed; if another request already refreshed it, join that result
    // instead of discarding the newer route.
    let refresh_timeout =
        remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
            .unwrap_or_default()
            .min(MDNS_RETRY_TIMEOUT);
    let refreshed = match transport.refresh_route_with(
        &initial,
        hostname,
        port,
        refresh_timeout,
        operation,
        &resolve,
    ) {
        Ok(refreshed) => refreshed,
        Err(resolution_error) if retry_safe_identity_preflight => {
            // A single connection error can be transient even while the pinned address remains
            // valid. If multicast discovery is also unavailable, retry only the credential-free
            // health preflight once against that exact previous route. A response lets the caller
            // verify the library identity before any later authenticated operation. Writes and
            // authenticated reads never enter this branch.
            let remaining_timeout = remaining_library_sync_request_timeout(
                timeout,
                request_started_at.elapsed(),
            )
            .ok_or_else(|| {
                format!("{operation} timed out after the cached address and mDNS refresh failed.")
            })?;
            let fallback_request = make_request(&initial.route.client)
                .timeout(remaining_timeout)
                .build()
                .map_err(|error| format!("Failed to prepare {operation} fallback: {error}"))?;
            match initial.route.client.execute(fallback_request) {
                Ok(response) => {
                    return Ok(LibrarySyncRequestOutcome {
                        response,
                        fallback_candidate: Some(MdnsFallbackCandidate {
                            slot: Arc::clone(&initial.slot),
                            route: initial.route.clone(),
                        }),
                    });
                }
                Err(fallback_error) => {
                    return Err(format!(
                        "{operation} failed to connect to the cached local address ({first_error}); \
                         refreshing the mDNS address also failed ({resolution_error}); retrying the \
                         credential-free health check on the cached address failed too: \
                         {fallback_error}"
                    ));
                }
            }
        }
        Err(resolution_error) => {
            return Err(format!(
                "{operation} failed to connect to the cached local address ({first_error}); \
                 refreshing the mDNS address also failed: {resolution_error}"
            ));
        }
    };

    let remaining_timeout =
        remaining_library_sync_request_timeout(timeout, request_started_at.elapsed())
            .ok_or_else(|| format!("{operation} timed out after refreshing the local host."))?;
    match make_request(&refreshed.route.client)
        .timeout(remaining_timeout)
        .send()
    {
        Ok(response) => Ok(LibrarySyncRequestOutcome {
            response,
            fallback_candidate: None,
        }),
        Err(error) => {
            refreshed
                .slot
                .invalidate_without_resolution(refreshed.route.generation);
            Err(format!(
                "{operation} failed after refreshing the local host address: {error}"
            ))
        }
    }
}

fn resolve_stable_local_hostname_with_mdns(
    hostname: &str,
    port: u16,
    timeout: Duration,
) -> Result<Vec<SocketAddr>, String> {
    if timeout.is_zero() {
        return Err(format!(
            "mDNS resolution for {hostname} had no request time remaining."
        ));
    }
    let fqdn = format!("{hostname}.");
    let timeout_millis = timeout.as_millis().clamp(1, u64::MAX as u128) as u64;
    let (daemon, receiver) = {
        let daemon_slot = LIBRARY_SYNC_MDNS_DAEMON.get_or_init(|| Mutex::new(None));
        let mut daemon_slot = match daemon_slot.lock() {
            Ok(daemon_slot) => daemon_slot,
            Err(poisoned) => {
                // A panic while creating or addressing the daemon must not make all future LAN
                // lookups fail until process restart. Discard the uncertain handle and recreate.
                let mut daemon_slot = poisoned.into_inner();
                *daemon_slot = None;
                daemon_slot
            }
        };
        let mut lookup = None;
        for _ in 0..2 {
            if daemon_slot.is_none() {
                *daemon_slot = Some(ServiceDaemon::new().map_err(|error| {
                    format!("Failed to start the shared mDNS resolver: {error}")
                })?);
            }
            let daemon = daemon_slot
                .as_ref()
                .expect("mDNS daemon was initialized")
                .clone();
            match daemon.resolve_hostname(&fqdn, Some(timeout_millis)) {
                Ok(receiver) => {
                    lookup = Some((daemon, receiver));
                    break;
                }
                Err(mdns_sd::Error::DaemonShutdown) => {
                    // A daemon handle cannot recover after its worker exits. Remove it while
                    // holding the shared slot lock so exactly one replacement is created.
                    *daemon_slot = None;
                }
                Err(error) => {
                    return Err(format!(
                        "mDNS lookup for {hostname} could not start: {error}"
                    ));
                }
            }
        }
        lookup.ok_or_else(|| {
            format!("mDNS lookup for {hostname} could not start after restarting the resolver.")
        })?
    };
    let deadline = Instant::now() + timeout;
    let mut resolved = Vec::new();

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining) {
            Ok(HostnameResolutionEvent::AddressesFound(found_hostname, addresses))
                if found_hostname
                    .trim_end_matches('.')
                    .eq_ignore_ascii_case(hostname) =>
            {
                resolved.extend(addresses.into_iter().filter_map(|address| {
                    match address.to_ip_addr() {
                        // The Companion listener is deliberately bound to one selected private IPv4
                        // interface. Do not use a link-local, public, or unrelated IPv6 response.
                        IpAddr::V4(address) if address.is_private() => {
                            Some(SocketAddr::new(IpAddr::V4(address), port))
                        }
                        _ => None,
                    }
                }));
                if !resolved.is_empty() {
                    break;
                }
            }
            Ok(HostnameResolutionEvent::SearchTimeout(_))
            | Ok(HostnameResolutionEvent::SearchStopped(_))
            | Err(_) => break,
            Ok(_) => {}
        }
    }

    let _ = daemon.stop_resolve_hostname(&fqdn);
    resolved.sort_unstable();
    resolved.dedup();
    if resolved.is_empty() {
        Err(format!(
            "mDNS did not return a private IPv4 address for {hostname}."
        ))
    } else {
        Ok(resolved)
    }
}

impl MdnsTransport {
    fn current_route_with<Resolve>(
        &self,
        hostname: &str,
        port: u16,
        timeout: Duration,
        operation: &str,
        resolve: &Resolve,
    ) -> Result<MdnsRouteLease, String>
    where
        Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    {
        let slot = self.slot(hostname)?;
        let route = slot.current_route_with(hostname, port, timeout, operation, resolve)?;
        Ok(MdnsRouteLease { slot, route })
    }

    fn refresh_route_with<Resolve>(
        &self,
        failed: &MdnsRouteLease,
        hostname: &str,
        port: u16,
        timeout: Duration,
        operation: &str,
        resolve: &Resolve,
    ) -> Result<MdnsRouteLease, String>
    where
        Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    {
        let route = failed.slot.refresh_after_failure_with(
            failed.route.generation,
            hostname,
            port,
            timeout,
            operation,
            resolve,
        )?;
        Ok(MdnsRouteLease {
            slot: Arc::clone(&failed.slot),
            route,
        })
    }

    fn slot(&self, hostname: &str) -> Result<Arc<MdnsHostSlot>, String> {
        let mut hosts = self
            .hosts
            .lock()
            .map_err(|_| "The local-host route cache is unavailable.".to_string())?;
        if let Some(slot) = hosts.get(hostname) {
            return Ok(Arc::clone(slot));
        }
        if hosts.len() >= MDNS_HOST_CACHE_LIMIT {
            let evictable = hosts.iter().find_map(|(cached_hostname, slot)| {
                (Arc::strong_count(slot) == 1 && slot.is_inactive())
                    .then(|| cached_hostname.clone())
            });
            if let Some(evictable) = evictable {
                hosts.remove(&evictable);
            }
        }
        if hosts.len() >= MDNS_HOST_CACHE_LIMIT {
            return Err(
                "The local-host route cache is temporarily busy. Please try again.".to_string(),
            );
        }
        let slot = Arc::new(MdnsHostSlot::default());
        hosts.insert(hostname.to_string(), Arc::clone(&slot));
        Ok(slot)
    }
}

impl MdnsHostSlot {
    fn is_inactive(&self) -> bool {
        self.state
            .lock()
            .map(|state| !state.resolving)
            .unwrap_or(false)
    }

    fn current_route_with<Resolve>(
        &self,
        hostname: &str,
        port: u16,
        timeout: Duration,
        _operation: &str,
        resolve: &Resolve,
    ) -> Result<ResolvedMdnsRoute, String>
    where
        Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    {
        let attempt = {
            let mut state = self.lock_state()?;
            if let Some(route) = state.route.as_ref()
                && Instant::now() < route.fresh_until
            {
                return Ok(route.clone());
            }
            if state.resolving {
                let active_attempt = state.active_attempt;
                return self.wait_for_attempt(state, active_attempt, timeout);
            }
            start_resolution_attempt(&mut state)
        };
        self.perform_resolution(attempt, hostname, port, timeout, true, resolve)
    }

    fn refresh_after_failure_with<Resolve>(
        &self,
        failed_generation: u64,
        hostname: &str,
        port: u16,
        timeout: Duration,
        _operation: &str,
        resolve: &Resolve,
    ) -> Result<ResolvedMdnsRoute, String>
    where
        Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    {
        let attempt = {
            let mut state = self.lock_state()?;
            if state.resolving {
                let active_attempt = state.active_attempt;
                return self.wait_for_attempt(state, active_attempt, timeout);
            }
            if let Some(route) = state.route.as_ref() {
                if route.generation != failed_generation {
                    return Ok(route.clone());
                }
            } else if state.invalidated_generation >= failed_generation {
                return Err(state
                    .last_failure
                    .as_ref()
                    .map(|(_, error)| error.clone())
                    .unwrap_or_else(|| {
                        "The failed local-host route was already invalidated.".to_string()
                    }));
            }

            state.route = None;
            state.invalidated_generation = state.invalidated_generation.max(failed_generation);
            start_resolution_attempt(&mut state)
        };
        self.perform_resolution(attempt, hostname, port, timeout, false, resolve)
    }

    fn perform_resolution<Resolve>(
        &self,
        attempt: u64,
        hostname: &str,
        port: u16,
        timeout: Duration,
        retain_previous_on_failure: bool,
        resolve: &Resolve,
    ) -> Result<ResolvedMdnsRoute, String>
    where
        Resolve: Fn(&str, u16, Duration) -> Result<Vec<SocketAddr>, String>,
    {
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            resolve(hostname, port, timeout).and_then(|mut addresses| {
                addresses.sort_unstable();
                addresses.dedup();
                if addresses.is_empty() {
                    return Err(format!("mDNS returned no usable addresses for {hostname}."));
                }
                let client = library_sync_http_client_builder()
                    .resolve_to_addrs(hostname, &addresses)
                    .build()
                    .map_err(|error| format!("Failed to prepare pinned local client: {error}"))?;
                Ok(client)
            })
        }))
        .unwrap_or_else(|_| Err("The shared local-host resolver failed unexpectedly.".to_string()));

        let mut state = self.lock_state()?;
        state.resolving = false;
        let result = match outcome {
            Ok(client) => {
                state.next_generation = state.next_generation.saturating_add(1).max(1);
                let route = ResolvedMdnsRoute {
                    generation: state.next_generation,
                    client,
                    fresh_until: Instant::now() + MDNS_ROUTE_FRESH_TTL,
                };
                state.route = Some(route.clone());
                state.last_failure = None;
                Ok(route)
            }
            Err(error) => {
                state.last_failure = Some((attempt, error.clone()));
                if retain_previous_on_failure && let Some(route) = state.route.as_mut() {
                    // Keep the last-known-good route when multicast discovery has a transient
                    // miss, but retry discovery much sooner than a successfully resolved route.
                    // The cached address can still serve requests during this short backoff.
                    route.fresh_until = Instant::now() + MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF;
                    Ok(route.clone())
                } else {
                    state.route = None;
                    Err(error)
                }
            }
        };
        self.resolution_completed.notify_all();
        result
    }

    fn wait_for_attempt(
        &self,
        mut state: std::sync::MutexGuard<'_, MdnsHostState>,
        attempt: u64,
        timeout: Duration,
    ) -> Result<ResolvedMdnsRoute, String> {
        let deadline = Instant::now() + timeout;
        while state.resolving && state.active_attempt == attempt {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return state.route.as_ref().cloned().ok_or_else(|| {
                    "Timed out waiting for shared local-host resolution.".to_string()
                });
            }
            let (next_state, wait_result) = self
                .resolution_completed
                .wait_timeout(state, remaining)
                .map_err(|_| {
                    "The local-host resolver coordination state is unavailable.".to_string()
                })?;
            state = next_state;
            if wait_result.timed_out() && state.resolving && state.active_attempt == attempt {
                return state.route.as_ref().cloned().ok_or_else(|| {
                    "Timed out waiting for shared local-host resolution.".to_string()
                });
            }
        }
        if let Some(route) = state.route.as_ref() {
            return Ok(route.clone());
        }
        if let Some((failed_attempt, error)) = state.last_failure.as_ref()
            && *failed_attempt == attempt
        {
            return Err(error.clone());
        }
        Err("The shared local-host resolution completed without a route.".to_string())
    }

    fn invalidate_without_resolution(&self, failed_generation: u64) {
        if let Ok(mut state) = self.state.lock()
            && state
                .route
                .as_ref()
                .is_some_and(|route| route.generation == failed_generation)
        {
            state.route = None;
            state.invalidated_generation = state.invalidated_generation.max(failed_generation);
            self.resolution_completed.notify_all();
        }
    }

    fn confirm_fallback_route(&self, route: &ResolvedMdnsRoute) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        if state
            .route
            .as_ref()
            .is_some_and(|current| current.generation == route.generation)
        {
            return true;
        }
        if state.route.is_some() || state.resolving || state.next_generation != route.generation {
            return false;
        }
        let mut retained = route.clone();
        retained.fresh_until = Instant::now() + MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF;
        state.route = Some(retained);
        self.resolution_completed.notify_all();
        true
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, MdnsHostState>, String> {
        self.state
            .lock()
            .map_err(|_| "The local-host resolver state is unavailable.".to_string())
    }
}

impl MdnsFallbackCandidate {
    fn confirm(self) -> Result<(), String> {
        if self.slot.confirm_fallback_route(&self.route) {
            Ok(())
        } else {
            Err(
                "The local-host route changed before its verified identity could be accepted. \
                 Please retry."
                    .to_string(),
            )
        }
    }
}

fn start_resolution_attempt(state: &mut MdnsHostState) -> u64 {
    state.active_attempt = state.active_attempt.saturating_add(1).max(1);
    state.resolving = true;
    state.active_attempt
}

pub(crate) fn fetch_library_sync_host_json<T: DeserializeOwned>(
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let request_url = format!("{base_url}{path}");
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host request",
        |client| client.get(&request_url),
    )?;

    if !response.status().is_success() {
        return Err(format!("Host request returned {}.", response.status()));
    }

    let response_text = response
        .text()
        .map_err(|error| format!("Host response body could not be read: {error}"))?;

    serde_json::from_str(&response_text)
        .map_err(|error| format!("Host returned invalid JSON: {error}"))
}

pub(crate) fn pair_library_sync_host_session(
    base_url: &str,
    pairing_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let host_header = library_sync_host_header_value(base_url)?;
    let request_url = format!("{base_url}/api/v1/auth/pair");
    let request_body = serde_json::json!({ "pairing_token": pairing_token }).to_string();
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host pairing request",
        |client| {
            client
                .post(&request_url)
                .header(HOST, host_header.as_str())
                .header(ORIGIN, base_url)
                .header(CONTENT_TYPE, "application/json")
                .body(request_body.clone())
        },
    )?;

    if !response.status().is_success() {
        return Err(format!(
            "Host pairing request returned {}.",
            response.status()
        ));
    }

    let set_cookie_values: Vec<String> = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|header_value| header_value.to_str().ok().map(|value| value.to_string()))
        .collect();
    let mut session_id: Option<String> = None;
    let mut device_token: Option<String> = None;
    for set_cookie in &set_cookie_values {
        if session_id.is_none() {
            session_id = extract_cookie_value_from_set_cookie(set_cookie, "bfm_companion_session");
        }
        if device_token.is_none() {
            device_token =
                extract_cookie_value_from_set_cookie(set_cookie, "bfm_trusted_lan_device");
        }
    }

    let session_id = session_id
        .ok_or_else(|| "Host pairing response did not include a session cookie.".to_string())?;
    let device_token = device_token
        .ok_or_else(|| "Host pairing response did not include a device cookie.".to_string())?;
    let response_text = response
        .text()
        .map_err(|error| format!("Host pairing response could not be read: {error}"))?;
    let parsed: LibrarySyncAuthenticatedSessionResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Host pairing returned invalid JSON: {error}"))?;
    if !parsed.ok {
        return Err("Host pairing reported not ready.".to_string());
    }

    Ok(LibrarySyncAuthenticatedSessionState {
        csrf_token: parsed.csrf_token,
        session_id,
        device_token,
    })
}

pub(crate) fn renew_library_sync_host_session(
    base_url: &str,
    device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(None, Some(device_token))
        .ok_or_else(|| "Host session renewal requires a paired device token.".to_string())?;
    let request_url = format!("{base_url}/api/v1/auth/renew");
    let response = send_library_sync_request(
        base_url,
        LIBRARY_SYNC_REQUEST_TIMEOUT,
        "Host session renewal request",
        |client| {
            client
                .post(&request_url)
                .header(HOST, host_header.as_str())
                .header(ORIGIN, base_url)
                .header(reqwest::header::COOKIE, cookie_header.as_str())
        },
    )?;

    if !response.status().is_success() {
        return Err(format!(
            "Host session renewal request returned {}.",
            response.status()
        ));
    }

    let set_cookie_values: Vec<String> = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|header_value| header_value.to_str().ok().map(|value| value.to_string()))
        .collect();
    let session_id = set_cookie_values
        .iter()
        .find_map(|set_cookie| {
            extract_cookie_value_from_set_cookie(set_cookie, "bfm_companion_session")
        })
        .ok_or_else(|| {
            "Host session renewal response did not include a session cookie.".to_string()
        })?;
    let response_text = response
        .text()
        .map_err(|error| format!("Host session renewal response could not be read: {error}"))?;
    let parsed: LibrarySyncAuthenticatedSessionResponse = serde_json::from_str(&response_text)
        .map_err(|error| format!("Host session renewal returned invalid JSON: {error}"))?;
    if !parsed.ok {
        return Err("Host session renewal reported not ready.".to_string());
    }

    Ok(LibrarySyncAuthenticatedSessionState {
        csrf_token: parsed.csrf_token,
        session_id,
        device_token: device_token.to_string(),
    })
}

pub(crate) fn load_library_sync_device_token(
    state: &AppState,
    base_url: &str,
) -> Result<String, String> {
    load_library_sync_device_token_optional(state, base_url)?.ok_or_else(|| {
        "Desktop client must be paired with the host before protected sync can run.".to_string()
    })
}

pub(crate) fn load_library_sync_device_token_optional(
    state: &AppState,
    base_url: &str,
) -> Result<Option<String>, String> {
    load_library_sync_device_token_bytes_optional(state, base_url)?
        .map(|token| {
            std::str::from_utf8(token.as_slice())
                .map(str::to_string)
                .map_err(|error| {
                    format!("Desktop client credentials could not be decoded: {error}")
                })
        })
        .transpose()
}

pub(crate) fn load_library_sync_device_token_bytes_optional(
    state: &AppState,
    base_url: &str,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    let key = library_sync_device_token_key(base_url)?;
    Ok(state
        .credentials
        .get(&key)
        .map_err(|error| format!("Failed to read desktop client credentials: {error}"))?
        .map(|token| Zeroizing::new(token.expose_bytes().to_vec())))
}

pub(crate) fn store_library_sync_device_token(
    state: &AppState,
    base_url: &str,
    device_token: &str,
) -> Result<(), String> {
    let normalized = Zeroizing::new(device_token.trim().as_bytes().to_vec());
    store_library_sync_device_token_bytes(state, base_url, normalized.as_slice())
}

pub(crate) fn store_library_sync_device_token_bytes(
    state: &AppState,
    base_url: &str,
    device_token: &[u8],
) -> Result<(), String> {
    let key = library_sync_device_token_key(base_url)?;
    let secret = SecretValue::from_bytes(device_token.to_vec());
    state
        .credentials
        .set(&key, &secret)
        .map_err(|error| format!("Failed to store desktop client credentials: {error}"))?;

    let verification = state
        .credentials
        .get(&key)
        .map_err(|error| format!("Failed to verify desktop client credentials: {error}"))
        .and_then(|stored| {
            stored.ok_or_else(|| {
                "Desktop client credentials were not available after they were stored.".to_string()
            })
        })
        .and_then(|stored| {
            if stored.expose_bytes() == secret.expose_bytes() {
                Ok(())
            } else {
                Err(
                    "Desktop client credentials did not match after secure storage verification."
                        .to_string(),
                )
            }
        });
    if let Err(error) = verification {
        return match state.credentials.delete(&key) {
            Ok(_) => Err(error),
            Err(cleanup_error) => Err(format!(
                "{error} Cleanup of the unverified credential also failed: {cleanup_error}"
            )),
        };
    }
    Ok(())
}

pub(crate) fn delete_library_sync_device_token(
    state: &AppState,
    base_url: &str,
) -> Result<bool, String> {
    let key = library_sync_device_token_key(base_url)?;
    state
        .credentials
        .delete(&key)
        .map_err(|error| format!("Failed to remove desktop client credentials: {error}"))
}

pub(crate) fn library_sync_device_token_key(base_url: &str) -> Result<CredentialKey, String> {
    let normalized_base_url = normalize_library_sync_base_url(base_url)?;
    CredentialKey::library_sync_client_device_token(&normalized_base_url)
        .map_err(|error| format!("Desktop client credential identity is invalid: {error}"))
}

fn current_or_renewed_library_sync_auth(
    state: &AppState,
    base_url: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    current_or_renewed_library_sync_auth_with(state, base_url, renew_library_sync_host_session)
}

fn current_or_renewed_library_sync_auth_with(
    state: &AppState,
    base_url: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    current_or_renewed_library_sync_auth_under_gate_with(state, base_url, renew)
}

fn current_or_renewed_library_sync_auth_under_gate_with(
    state: &AppState,
    base_url: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    if let Some(session) = state.library_sync_auth.current()?
        && session.host_base_url == base_url
        && let Some(device_token) = session.device_token.as_ref()
    {
        return Ok(LibrarySyncAuthenticatedSessionState {
            csrf_token: session.csrf_token.clone(),
            session_id: session.session_id.clone(),
            device_token: device_token.clone(),
        });
    }
    let device_token = validated_library_sync_device_token(state, base_url, None)?;
    renew_with_failure_cooldown_under_gate_with(state, base_url, &device_token, renew)
}

pub(crate) fn renew_and_cache_library_sync_auth(
    state: &AppState,
    base_url: &str,
    device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    renew_and_cache_library_sync_auth_with(
        state,
        base_url,
        device_token,
        renew_library_sync_host_session,
    )
}

fn renew_and_cache_library_sync_auth_with(
    state: &AppState,
    base_url: &str,
    device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let current_device_token =
        validated_library_sync_device_token(state, base_url, Some(device_token))?;
    renew_with_failure_cooldown_under_gate_with(state, base_url, &current_device_token, renew)
}

fn renew_or_reuse_library_sync_auth(
    state: &AppState,
    base_url: &str,
    failed_session_id: &str,
    expected_device_token: &str,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    renew_or_reuse_library_sync_auth_with(
        state,
        base_url,
        failed_session_id,
        expected_device_token,
        renew_library_sync_host_session,
    )
}

fn renew_or_reuse_library_sync_auth_with(
    state: &AppState,
    base_url: &str,
    failed_session_id: &str,
    expected_device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    if let Some(kind) = state
        .library_sync_auth
        .recent_renewal_failure(base_url, expected_device_token)
    {
        return Err(shared_renewal_error(kind));
    }
    let current_device_token =
        validated_library_sync_device_token(state, base_url, Some(expected_device_token))?;

    // A dashboard wave can receive several 401 responses for the same expired session. The first
    // waiter renews it while holding the credential gate; later waiters reuse that newer runtime
    // session instead of serially rotating it again. Matching the durable device token preserves
    // the pairing/host/reset invariant while the gate is held.
    if let Some(session) = state.library_sync_auth.current()?
        && session.host_base_url == base_url
        && session.session_id != failed_session_id
        && session.device_token.as_deref() == Some(current_device_token.as_str())
    {
        return Ok(LibrarySyncAuthenticatedSessionState {
            csrf_token: session.csrf_token.clone(),
            session_id: session.session_id.clone(),
            device_token: current_device_token,
        });
    }

    renew_with_failure_cooldown_under_gate_with(state, base_url, &current_device_token, renew)
}

fn renew_with_failure_cooldown_under_gate_with(
    state: &AppState,
    base_url: &str,
    device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    if let Some(kind) = state
        .library_sync_auth
        .recent_renewal_failure(base_url, device_token)
    {
        return Err(shared_renewal_error(kind));
    }

    match renew_and_cache_library_sync_auth_under_gate_with(state, base_url, device_token, renew) {
        Ok(renewed) => {
            state.library_sync_auth.clear_renewal_failure();
            Ok(renewed)
        }
        Err(error) => {
            let kind = if error.starts_with("Host session renewal request returned 401 ") {
                LibrarySyncRenewalFailureKind::Unauthorized
            } else {
                LibrarySyncRenewalFailureKind::Transient
            };
            state
                .library_sync_auth
                .record_renewal_failure(base_url, device_token, kind);
            Err(shared_renewal_error(kind))
        }
    }
}

fn shared_renewal_error(kind: LibrarySyncRenewalFailureKind) -> String {
    match kind {
        LibrarySyncRenewalFailureKind::Unauthorized => {
            SHARED_RENEWAL_UNAUTHORIZED_ERROR.to_string()
        }
        LibrarySyncRenewalFailureKind::Transient => SHARED_RENEWAL_FAILED_ERROR.to_string(),
    }
}

pub(crate) fn is_library_sync_pairing_unauthorized_error(error: &str) -> bool {
    error == SHARED_RENEWAL_UNAUTHORIZED_ERROR
}

fn renew_and_cache_library_sync_auth_under_gate_with(
    state: &AppState,
    base_url: &str,
    device_token: &str,
    renew: impl FnOnce(&str, &str) -> Result<LibrarySyncAuthenticatedSessionState, String>,
) -> Result<LibrarySyncAuthenticatedSessionState, String> {
    let renewed = match renew(base_url, device_token) {
        Ok(renewed) => renewed,
        Err(error) => {
            let _ = state.library_sync_auth.clear();
            return Err(error);
        }
    };
    state.library_sync_auth.replace_authenticated(
        base_url,
        renewed.session_id.clone(),
        renewed.csrf_token.clone(),
        renewed.device_token.clone(),
    )?;
    Ok(renewed)
}

fn validated_library_sync_device_token(
    state: &AppState,
    base_url: &str,
    expected_device_token: Option<&str>,
) -> Result<String, String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let current_host = settings
        .host_base_url
        .as_deref()
        .map(str::trim)
        .map(|host| host.trim_end_matches('/'))
        .filter(|host| !host.is_empty());
    if settings.mode != "CLIENT" || current_host != Some(base_url) {
        return Err(
            "Desktop client settings changed before authentication could be renewed.".to_string(),
        );
    }

    let current_device_token = load_library_sync_device_token(state, base_url)?;
    if expected_device_token.is_some_and(|expected| expected != current_device_token) {
        return Err(
            "Desktop client pairing changed before authentication could be renewed.".to_string(),
        );
    }
    Ok(current_device_token)
}

pub(crate) fn get_library_sync_host_json_authenticated<T: DeserializeOwned>(
    state: &AppState,
    base_url: &str,
    path: &str,
) -> Result<T, String> {
    let initial_auth_state = current_or_renewed_library_sync_auth(state, base_url)?;

    let execute = |session_id: &str,
                   device_token: &str|
     -> Result<reqwest::blocking::Response, String> {
        let host_header = library_sync_host_header_value(base_url)?;
        let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
            .ok_or_else(|| "Desktop sync read is missing session cookies.".to_string())?;
        let request_url = format!("{base_url}{path}");
        send_library_sync_request(
            base_url,
            LIBRARY_SYNC_REQUEST_TIMEOUT,
            "Desktop sync read request",
            |client| {
                client
                    .get(&request_url)
                    .header(HOST, host_header.as_str())
                    .header(ORIGIN, base_url)
                    .header(reqwest::header::COOKIE, cookie_header.as_str())
            },
        )
    };

    let mut response = execute(
        &initial_auth_state.session_id,
        &initial_auth_state.device_token,
    )?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed = renew_or_reuse_library_sync_auth(
            state,
            base_url,
            &initial_auth_state.session_id,
            &initial_auth_state.device_token,
        )?;
        response = execute(&renewed.session_id, &renewed.device_token)?;
    }

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Desktop sync read request returned {status}."));
    }

    let body_text = response
        .text()
        .map_err(|error| format!("Desktop sync read response could not be read: {error}"))?;
    serde_json::from_str(&body_text)
        .map_err(|error| format!("Desktop sync read returned invalid JSON: {error}"))
}

pub(crate) fn post_library_sync_host_write_json<T: serde::Serialize>(
    base_url: &str,
    path: &str,
    session_id: &str,
    device_token: &str,
    csrf_token: &str,
    payload: &T,
    timeout: Duration,
) -> Result<reqwest::blocking::Response, String> {
    let host_header = library_sync_host_header_value(base_url)?;
    let cookie_header = build_library_sync_cookie_header(Some(session_id), Some(device_token))
        .ok_or_else(|| "Desktop sync write is missing session cookies.".to_string())?;
    let request_url = format!("{base_url}{path}");
    let request_body = serde_json::to_string(payload)
        .map_err(|error| format!("Failed to encode desktop sync write payload: {error}"))?;
    send_library_sync_request(base_url, timeout, "Desktop sync write request", |client| {
        client
            .post(&request_url)
            .header(HOST, host_header.as_str())
            .header(ORIGIN, base_url)
            .header(reqwest::header::COOKIE, cookie_header.as_str())
            .header("x-csrf-token", csrf_token)
            .header(CONTENT_TYPE, "application/json")
            .body(request_body.clone())
    })
}

pub(crate) fn perform_library_sync_host_write<T: serde::Serialize>(
    state: &AppState,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<(), String> {
    perform_library_sync_host_write_and_parse::<T, serde_json::Value>(
        state, base_url, path, payload,
    )
    .map(|_| ())
}

pub(crate) fn perform_library_sync_host_write_and_parse<
    T: serde::Serialize,
    R: DeserializeOwned,
>(
    state: &AppState,
    base_url: &str,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    perform_library_sync_host_write_and_parse_with_timeout(
        state,
        base_url,
        path,
        payload,
        Duration::from_millis(2500),
    )
}

pub(crate) fn perform_library_sync_host_write_and_parse_with_timeout<
    T: serde::Serialize,
    R: DeserializeOwned,
>(
    state: &AppState,
    base_url: &str,
    path: &str,
    payload: &T,
    timeout: Duration,
) -> Result<R, String> {
    let initial_auth_state = current_or_renewed_library_sync_auth(state, base_url)?;

    let mut response = post_library_sync_host_write_json(
        base_url,
        path,
        &initial_auth_state.session_id,
        &initial_auth_state.device_token,
        &initial_auth_state.csrf_token,
        payload,
        timeout,
    )?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let renewed = renew_or_reuse_library_sync_auth(
            state,
            base_url,
            &initial_auth_state.session_id,
            &initial_auth_state.device_token,
        )?;
        response = post_library_sync_host_write_json(
            base_url,
            path,
            &renewed.session_id,
            &renewed.device_token,
            &renewed.csrf_token,
            payload,
            timeout,
        )?;
    }

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Desktop sync write request returned {status}."));
    }

    let body_text = response
        .text()
        .map_err(|error| format!("Desktop sync write response could not be read: {error}"))?;
    serde_json::from_str(&body_text)
        .map_err(|error| format!("Desktop sync write returned invalid JSON: {error}"))
}

pub(crate) fn ensure_library_sync_host_matches(
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<CompanionHealthCheckResponse, String> {
    let (parsed, fallback_candidate) = if expected_library_id.is_some() {
        let request_url = format!("{base_url}/api/v1/health");
        let outcome = send_library_sync_request_with_fallback_candidate(
            base_url,
            LIBRARY_SYNC_REQUEST_TIMEOUT,
            "Host request",
            true,
            |client| client.get(&request_url),
        )?;
        let LibrarySyncRequestOutcome {
            response,
            fallback_candidate,
        } = outcome;
        let status = response.status();
        let response_text = if status.is_success() {
            response
                .text()
                .map_err(|error| format!("Host response body could not be read: {error}"))?
        } else {
            String::new()
        };
        parse_library_sync_health_response(status, &response_text, fallback_candidate)?
    } else {
        let parsed = fetch_library_sync_host_json(base_url, "/api/v1/health")?;
        (parsed, None)
    };

    verify_and_confirm_library_sync_host_identity(parsed, expected_library_id, fallback_candidate)
}

fn parse_library_sync_health_response(
    status: reqwest::StatusCode,
    response_text: &str,
    fallback_candidate: Option<MdnsFallbackCandidate>,
) -> Result<(CompanionHealthCheckResponse, Option<MdnsFallbackCandidate>), String> {
    if !status.is_success() {
        return Err(format!("Host request returned {status}."));
    }
    let parsed = serde_json::from_str(response_text)
        .map_err(|error| format!("Host returned invalid JSON: {error}"))?;
    Ok((parsed, fallback_candidate))
}

fn verify_and_confirm_library_sync_host_identity(
    parsed: CompanionHealthCheckResponse,
    expected_library_id: Option<&str>,
    fallback_candidate: Option<MdnsFallbackCandidate>,
) -> Result<CompanionHealthCheckResponse, String> {
    if !parsed.ok {
        return Err("Host reported not ready.".to_string());
    }

    match expected_library_id {
        Some(expected_library_id) => {
            let remote_library_id = parsed
                .library_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Host health response did not include a library ID.".to_string())?;

            if remote_library_id != expected_library_id {
                return Err(format!(
                    "Connected to a different library ({}).",
                    remote_library_id
                ));
            }
            if let Some(fallback_candidate) = fallback_candidate {
                fallback_candidate.confirm()?;
            }
        }
        None if fallback_candidate.is_some() => {
            return Err(
                "A retained local-host route requires an expected library ID before it can be \
                 accepted."
                    .to_string(),
            );
        }
        None => {}
    }

    Ok(parsed)
}

pub(crate) fn build_library_sync_cookie_header(
    session_id: Option<&str>,
    device_token: Option<&str>,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(session_id) = session_id.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("bfm_companion_session={session_id}"));
    }
    if let Some(device_token) = device_token
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(format!("bfm_trusted_lan_device={device_token}"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_library_sync_cookie_header, current_or_renewed_library_sync_auth,
        current_or_renewed_library_sync_auth_with, extract_cookie_value_from_set_cookie,
        extract_library_sync_pairing_token, library_sync_host_header_value,
        library_sync_http_client_builder, load_library_sync_device_token,
        load_library_sync_device_token_optional, parse_library_sync_health_response,
        remaining_library_sync_request_timeout, renew_and_cache_library_sync_auth_with,
        renew_or_reuse_library_sync_auth_with, send_mdns_local_request_with,
        send_mdns_local_request_with_fallback_candidate, stable_local_host_and_port,
        store_library_sync_device_token, verify_and_confirm_library_sync_host_identity,
        LibrarySyncAuthenticatedSessionState, MdnsTransport, MDNS_HOST_CACHE_LIMIT,
        MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF, MDNS_ROUTE_FRESH_TTL,
        SHARED_RENEWAL_FAILED_ERROR, SHARED_RENEWAL_UNAUTHORIZED_ERROR,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::inventory_maintenance_commands::reset_app_data_inner;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use crate::trusted_lan_health::CompanionHealthCheckResponse;
    use reqwest::header::{COOKIE, HOST, ORIGIN};
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
    use std::{
        io::{Read, Write},
        net::{SocketAddr, TcpListener},
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc, Arc, Barrier,
        },
        thread,
    };

    fn test_state() -> AppState {
        AppState {
            db_path: String::new(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    fn credential_test_state(host: &str) -> AppState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-library-renew-race-{}-{suffix}.sqlite",
            std::process::id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply schema");
        let profile_id = db
            .initialize_fresh_credential_store_profile()
            .expect("initialize credential profile");
        let mut settings = db
            .get_library_sync_settings()
            .expect("read library settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(host.to_string());
        db.save_library_sync_settings(&settings)
            .expect("save client settings");
        drop(db);
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory()
                .scoped_to_profile_id(&profile_id)
                .expect("scope credential store"),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    fn expire_cached_route(transport: &MdnsTransport, hostname: &str) {
        let hosts = transport.hosts.lock().expect("lock route cache");
        let slot = hosts.get(hostname).expect("cached hostname");
        let mut state = slot.state.lock().expect("lock cached route");
        state.route.as_mut().expect("cached route").fresh_until = Instant::now()
            .checked_sub(Duration::from_secs(1))
            .expect("expired route deadline");
    }

    fn test_health(library_id: Option<&str>, ok: bool) -> CompanionHealthCheckResponse {
        CompanionHealthCheckResponse {
            ok,
            api_version: "v1".to_string(),
            auth_mode: "pairing".to_string(),
            access_mode: Some("LAN".to_string()),
            library_id: library_id.map(str::to_string),
            device_name: Some("Test Host".to_string()),
            sync_mode: Some("HOST".to_string()),
        }
    }

    #[test]
    fn host_header_value_keeps_ports_and_formats_ipv6_hosts() {
        assert_eq!(
            library_sync_host_header_value("http://192.168.1.10:4278").unwrap(),
            "192.168.1.10:4278"
        );
        assert_eq!(
            library_sync_host_header_value("http://host.local").unwrap(),
            "host.local"
        );
        assert_eq!(
            library_sync_host_header_value("http://[::1]:4278").unwrap(),
            "[::1]:4278"
        );
    }

    #[test]
    fn stable_local_retry_keeps_the_hostname_and_uses_the_url_port() {
        assert_eq!(
            stable_local_host_and_port("HTTP://Filament-Manager-A1B2.Local:4278/"),
            Some(("filament-manager-a1b2.local".to_string(), 4278)),
        );
        assert_eq!(
            stable_local_host_and_port("https://host.local"),
            Some(("host.local".to_string(), 443)),
        );
        assert_eq!(stable_local_host_and_port("http://192.168.1.50:4278"), None);
        assert_eq!(stable_local_host_and_port("http://host.example:4278"), None);
    }

    #[test]
    fn local_name_retry_uses_one_total_request_budget() {
        assert_eq!(
            remaining_library_sync_request_timeout(
                Duration::from_millis(2500),
                Duration::from_millis(750),
            ),
            Some(Duration::from_millis(1750)),
        );
        assert_eq!(
            remaining_library_sync_request_timeout(
                Duration::from_millis(2500),
                Duration::from_millis(2500),
            ),
            None,
        );
    }

    #[test]
    fn pinned_local_address_keeps_the_stable_request_hostname() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test host");
        let port = listener.local_addr().expect("read local port").port();
        let expected_host = format!("host: paired-host.local:{port}");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client request");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read client request");
            let received = String::from_utf8_lossy(&request[..read]);
            assert!(
                received.to_ascii_lowercase().contains(&expected_host),
                "{received}"
            );
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .expect("write local response");
        });

        let client = library_sync_http_client_builder()
            .resolve_to_addrs(
                "paired-host.local",
                &[SocketAddr::from(([127, 0, 0, 1], port))],
            )
            .build()
            .expect("build pinned client");
        let response = client
            .get(format!("http://paired-host.local:{port}/api/v1/health"))
            .timeout(Duration::from_secs(1))
            .send()
            .expect("complete pinned request");
        assert!(response.status().is_success());
        server.join().expect("join local test host");
    }

    #[test]
    fn concurrent_cold_local_requests_share_one_resolution() {
        const WORKERS: usize = 12;
        let transport = Arc::new(MdnsTransport::default());
        let start = Arc::new(Barrier::new(WORKERS + 1));
        let resolver_release = Arc::new(Barrier::new(2));
        let resolver_calls = Arc::new(AtomicUsize::new(0));
        let mut workers = Vec::new();

        for _ in 0..WORKERS {
            let transport = Arc::clone(&transport);
            let start = Arc::clone(&start);
            let resolver_release = Arc::clone(&resolver_release);
            let resolver_calls = Arc::clone(&resolver_calls);
            workers.push(thread::spawn(move || {
                start.wait();
                let resolve = |hostname: &str, port: u16, timeout: Duration| {
                    assert_eq!(hostname, "cold-host.local");
                    assert_eq!(port, 4278);
                    assert_eq!(timeout, Duration::from_millis(500));
                    resolver_calls.fetch_add(1, Ordering::SeqCst);
                    resolver_release.wait();
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))])
                };
                transport
                    .current_route_with(
                        "cold-host.local",
                        4278,
                        Duration::from_millis(500),
                        "Concurrent cold lookup",
                        &resolve,
                    )
                    .expect("resolve shared cold route")
                    .route
                    .generation
            }));
        }

        start.wait();
        resolver_release.wait();
        let generations = workers
            .into_iter()
            .map(|worker| worker.join().expect("join cold lookup worker"))
            .collect::<Vec<_>>();

        assert_eq!(resolver_calls.load(Ordering::SeqCst), 1);
        assert!(generations.iter().all(|generation| *generation == 1));
    }

    #[test]
    fn cold_resolution_failure_is_not_negative_cached() {
        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);

        let first_error = transport
            .current_route_with(
                "cold-retry.local",
                4278,
                Duration::from_millis(100),
                "Fail cold lookup",
                &|_, _, _| {
                    resolver_calls.fetch_add(1, Ordering::SeqCst);
                    Err("simulated cold multicast miss".to_string())
                },
            )
            .err()
            .expect("cold lookup must fail");
        assert_eq!(first_error, "simulated cold multicast miss");

        let recovered = transport
            .current_route_with(
                "cold-retry.local",
                4278,
                Duration::from_millis(100),
                "Retry cold lookup",
                &|_, port, _| {
                    resolver_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))])
                },
            )
            .expect("a separate request retries cold resolution immediately");

        assert_eq!(recovered.route.generation, 1);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn concurrent_cold_failure_wave_shares_error_and_a_later_request_retries() {
        const WAITERS: usize = 6;
        let transport = Arc::new(MdnsTransport::default());
        let (owner_started_tx, owner_started_rx) = mpsc::channel();
        let (release_owner_tx, release_owner_rx) = mpsc::channel();
        let owner_transport = Arc::clone(&transport);
        let owner = thread::spawn(move || {
            owner_transport.current_route_with(
                "cold-wave.local",
                4278,
                Duration::from_secs(1),
                "Fail shared cold lookup",
                &|_, _, _| {
                    owner_started_tx.send(()).expect("signal cold owner");
                    release_owner_rx.recv().expect("release cold owner");
                    Err("simulated shared cold failure".to_string())
                },
            )
        });
        owner_started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("cold resolver owner started");

        let slot = transport.slot("cold-wave.local").expect("read cold slot");
        let (waiter_ready_tx, waiter_ready_rx) = mpsc::channel();
        let mut waiters = Vec::new();
        for _ in 0..WAITERS {
            let slot = Arc::clone(&slot);
            let waiter_ready_tx = waiter_ready_tx.clone();
            waiters.push(thread::spawn(move || {
                let state = slot.lock_state().expect("lock resolving cold slot");
                assert!(state.resolving);
                let attempt = state.active_attempt;
                waiter_ready_tx
                    .send(attempt)
                    .expect("signal waiting cold request");
                slot.wait_for_attempt(state, attempt, Duration::from_secs(1))
            }));
        }
        drop(waiter_ready_tx);
        for _ in 0..WAITERS {
            assert_eq!(
                waiter_ready_rx
                    .recv_timeout(Duration::from_secs(1))
                    .expect("cold request joined shared attempt"),
                1
            );
        }

        release_owner_tx.send(()).expect("release cold resolver");
        let owner_error = owner
            .join()
            .expect("join cold resolver owner")
            .err()
            .expect("cold owner must fail");
        assert_eq!(owner_error, "simulated shared cold failure");
        for waiter in waiters {
            let waiter_error = waiter
                .join()
                .expect("join cold waiter")
                .err()
                .expect("cold waiter must share failure");
            assert_eq!(waiter_error, "simulated shared cold failure");
        }

        let later_resolver_calls = AtomicUsize::new(0);
        let recovered = transport
            .current_route_with(
                "cold-wave.local",
                4278,
                Duration::from_millis(100),
                "Recover after shared cold failure",
                &|_, port, _| {
                    later_resolver_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))])
                },
            )
            .expect("later cold request must start a new resolution");
        assert_eq!(recovered.route.generation, 1);
        assert_eq!(later_resolver_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn local_route_is_shared_per_hostname_and_honors_each_url_port() {
        let first_listener = TcpListener::bind("127.0.0.1:0").expect("bind first host port");
        let first_port = first_listener.local_addr().expect("read first port").port();
        let second_listener = TcpListener::bind("127.0.0.1:0").expect("bind second host port");
        let second_port = second_listener
            .local_addr()
            .expect("read second port")
            .port();
        assert_ne!(first_port, second_port);
        drop(first_listener);
        let expected_host = format!("host: multi-port.local:{second_port}");
        let server = thread::spawn(move || {
            let (mut stream, _) = second_listener
                .accept()
                .expect("accept second-port request");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read second-port request");
            let received = String::from_utf8_lossy(&request[..read]).to_ascii_lowercase();
            assert!(received.contains(&expected_host), "{received}");
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .expect("write second-port response");
        });

        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);
        let resolve = |hostname: &str, requested_port: u16, _timeout: Duration| {
            assert_eq!(hostname, "multi-port.local");
            resolver_calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![SocketAddr::from(([127, 0, 0, 1], requested_port))])
        };
        let first_route = transport
            .current_route_with(
                "multi-port.local",
                first_port,
                Duration::from_millis(500),
                "Resolve first port",
                &resolve,
            )
            .expect("resolve first-port route");
        let second_route = transport
            .current_route_with(
                "multi-port.local",
                second_port,
                Duration::from_millis(500),
                "Reuse route for second port",
                &resolve,
            )
            .expect("reuse route for second port");

        assert_eq!(resolver_calls.load(Ordering::SeqCst), 1);
        assert_eq!(first_route.route.generation, second_route.route.generation);
        let response = second_route
            .route
            .client
            .get(format!(
                "http://multi-port.local:{second_port}/api/v1/health"
            ))
            .timeout(Duration::from_secs(1))
            .send()
            .expect("request URL port overrides resolved socket port");
        assert!(response.status().is_success());
        server.join().expect("join second-port host");
    }

    #[test]
    fn expired_route_is_revalidated_even_when_the_previous_address_still_responds() {
        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);
        let resolve = |_: &str, port: u16, _: Duration| {
            let address_suffix = resolver_calls.fetch_add(1, Ordering::SeqCst) + 1;
            Ok(vec![SocketAddr::from((
                [
                    127,
                    0,
                    0,
                    u8::try_from(address_suffix).expect("test address suffix"),
                ],
                port,
            ))])
        };
        let initial = transport
            .current_route_with(
                "aged-host.local",
                4278,
                Duration::from_millis(100),
                "Seed aged route",
                &resolve,
            )
            .expect("seed route");
        expire_cached_route(&transport, "aged-host.local");

        let refreshed = transport
            .current_route_with(
                "aged-host.local",
                4278,
                Duration::from_millis(100),
                "Refresh aged route",
                &resolve,
            )
            .expect("refresh aged route");

        assert_eq!(initial.route.generation, 1);
        assert_eq!(refreshed.route.generation, 2);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn failed_periodic_revalidation_uses_short_lkg_backoff_then_retries() {
        let transport = MdnsTransport::default();
        let initial = transport
            .current_route_with(
                "lkg-host.local",
                4278,
                Duration::from_millis(100),
                "Seed last-known-good route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
            )
            .expect("seed route");
        expire_cached_route(&transport, "lkg-host.local");
        let refresh_calls = AtomicUsize::new(0);

        let fallback = transport
            .current_route_with(
                "lkg-host.local",
                4278,
                Duration::from_millis(100),
                "Refresh last-known-good route",
                &|_, _, _| {
                    refresh_calls.fetch_add(1, Ordering::SeqCst);
                    Err("simulated multicast miss".to_string())
                },
            )
            .expect("retain last-known-good route");
        let warm_fallback = transport
            .current_route_with(
                "lkg-host.local",
                4278,
                Duration::from_millis(100),
                "Reuse last-known-good route",
                &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                    panic!("failed refresh must be backed off")
                },
            )
            .expect("reuse last-known-good route");

        let retained_backoff = fallback
            .route
            .fresh_until
            .saturating_duration_since(Instant::now());
        assert!(
            MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF < MDNS_ROUTE_FRESH_TTL,
            "a failed refresh must not inherit the successful-route TTL"
        );
        assert!(!retained_backoff.is_zero());
        assert!(retained_backoff <= MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF);
        assert_eq!(fallback.route.generation, initial.route.generation);
        assert_eq!(warm_fallback.route.generation, initial.route.generation);
        assert_eq!(refresh_calls.load(Ordering::SeqCst), 1);

        expire_cached_route(&transport, "lkg-host.local");
        let recovered = transport
            .current_route_with(
                "lkg-host.local",
                4278,
                Duration::from_millis(100),
                "Recover retained last-known-good route",
                &|_, port, _| {
                    refresh_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![SocketAddr::from(([127, 0, 0, 2], port))])
                },
            )
            .expect("retry discovery after retained-route backoff");
        assert_eq!(recovered.route.generation, 2);
        assert_eq!(refresh_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn resolver_panic_releases_waiters_and_allows_a_later_refresh() {
        let transport = MdnsTransport::default();
        transport
            .current_route_with(
                "panic-host.local",
                4278,
                Duration::from_millis(100),
                "Seed panic route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
            )
            .expect("seed route");
        expire_cached_route(&transport, "panic-host.local");

        let fallback = transport
            .current_route_with(
                "panic-host.local",
                4278,
                Duration::from_millis(100),
                "Panicking route refresh",
                &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                    panic!("simulated resolver panic")
                },
            )
            .expect("panic keeps last-known-good route");
        assert_eq!(fallback.route.generation, 1);
        expire_cached_route(&transport, "panic-host.local");

        let recovered = transport
            .current_route_with(
                "panic-host.local",
                4278,
                Duration::from_millis(100),
                "Recovered route refresh",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 2], port))]),
            )
            .expect("refresh after resolver panic");
        assert_eq!(recovered.route.generation, 2);
    }

    #[test]
    fn route_waiter_obeys_its_own_resolution_deadline() {
        let transport = Arc::new(MdnsTransport::default());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let owner_transport = Arc::clone(&transport);
        let owner = thread::spawn(move || {
            owner_transport.current_route_with(
                "slow-owner.local",
                4278,
                Duration::from_secs(1),
                "Slow owner route",
                &|_, port, _| {
                    started_tx.send(()).expect("signal resolver owner");
                    release_rx.recv().expect("release resolver owner");
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))])
                },
            )
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("resolver owner started");

        let wait_started = Instant::now();
        let error = match transport.current_route_with(
            "slow-owner.local",
            4278,
            Duration::from_millis(30),
            "Bounded route waiter",
            &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                panic!("waiter must not resolve independently")
            },
        ) {
            Ok(_) => panic!("cold waiter must respect its deadline"),
            Err(error) => error,
        };
        assert!(error.contains("Timed out"), "{error}");
        assert!(wait_started.elapsed() < Duration::from_millis(250));

        release_tx.send(()).expect("release resolver owner");
        owner
            .join()
            .expect("join resolver owner")
            .expect("owner completes route");
    }

    #[test]
    fn hostname_route_cache_stays_bounded() {
        let transport = MdnsTransport::default();
        for index in 0..(MDNS_HOST_CACHE_LIMIT + 8) {
            let hostname = format!("cache-{index}.local");
            let slot = transport.slot(&hostname).expect("allocate bounded slot");
            drop(slot);
            assert!(
                transport.hosts.lock().expect("read route cache").len() <= MDNS_HOST_CACHE_LIMIT
            );
        }
        assert_eq!(
            transport
                .hosts
                .lock()
                .expect("read final route cache")
                .len(),
            MDNS_HOST_CACHE_LIMIT
        );
    }

    #[test]
    fn concurrent_stale_route_failures_share_one_refresh() {
        const WORKERS: usize = 10;
        let transport = Arc::new(MdnsTransport::default());
        let resolver_calls = Arc::new(AtomicUsize::new(0));
        let seed_resolver_calls = Arc::clone(&resolver_calls);
        let seed = transport
            .current_route_with(
                "refresh-host.local",
                4278,
                Duration::from_millis(500),
                "Seed shared stale route",
                &move |_, port, _| {
                    seed_resolver_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))])
                },
            )
            .expect("seed shared stale route");
        assert_eq!(seed.route.generation, 1);

        let start = Arc::new(Barrier::new(WORKERS + 1));
        let routes_loaded = Arc::new(Barrier::new(WORKERS + 1));
        let resolver_release = Arc::new(Barrier::new(2));
        let (refresh_started_tx, refresh_started_rx) = mpsc::channel();
        let mut workers = Vec::new();
        for _ in 0..WORKERS {
            let transport = Arc::clone(&transport);
            let start = Arc::clone(&start);
            let routes_loaded = Arc::clone(&routes_loaded);
            let resolver_release = Arc::clone(&resolver_release);
            let refresh_started = refresh_started_tx.clone();
            let resolver_calls = Arc::clone(&resolver_calls);
            workers.push(thread::spawn(move || {
                start.wait();
                let failed = transport
                    .current_route_with(
                        "refresh-host.local",
                        4278,
                        Duration::from_millis(500),
                        "Read shared stale route",
                        &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                            panic!("stale route should already be cached")
                        },
                    )
                    .expect("read shared stale route");
                routes_loaded.wait();
                transport
                    .refresh_route_with(
                        &failed,
                        "refresh-host.local",
                        4278,
                        Duration::from_millis(500),
                        "Refresh stale route",
                        &move |_, port, _| {
                            let call = resolver_calls.fetch_add(1, Ordering::SeqCst);
                            assert_eq!(call, 1, "only one worker may perform the refresh");
                            refresh_started.send(()).expect("signal refresh owner");
                            resolver_release.wait();
                            Ok(vec![SocketAddr::from(([127, 0, 0, 2], port))])
                        },
                    )
                    .expect("join shared route refresh")
                    .route
                    .generation
            }));
        }

        start.wait();
        routes_loaded.wait();
        refresh_started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("shared refresh started");
        resolver_release.wait();
        let generations = workers
            .into_iter()
            .map(|worker| worker.join().expect("join refresh worker"))
            .collect::<Vec<_>>();

        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
        assert!(generations.iter().all(|generation| *generation == 2));
    }

    #[test]
    fn stale_cached_address_is_refreshed_once_and_retried_on_connect_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind refreshed local host");
        let port = listener.local_addr().expect("read refreshed port").port();
        let base_url = format!("http://retry-host.local:{port}");
        let request_url = format!("{base_url}/api/v1/health");
        let expected_host = format!("host: retry-host.local:{port}");
        let expected_origin = format!("origin: {base_url}");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept retried request");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read retried request");
            let received = String::from_utf8_lossy(&request[..read]).to_ascii_lowercase();
            assert!(received.contains(&expected_host), "{received}");
            assert!(received.contains(&expected_origin), "{received}");
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .expect("write retried response");
        });

        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);
        let resolve = |hostname: &str, requested_port: u16, _timeout: Duration| {
            assert_eq!(hostname, "retry-host.local");
            assert_eq!(requested_port, port);
            let call = resolver_calls.fetch_add(1, Ordering::SeqCst);
            let address = if call == 0 {
                SocketAddr::from(([192, 0, 2, 1], requested_port))
            } else {
                SocketAddr::from(([127, 0, 0, 1], requested_port))
            };
            Ok(vec![address])
        };

        let stale = transport
            .current_route_with(
                "retry-host.local",
                port,
                Duration::from_millis(500),
                "Seed stale route",
                &resolve,
            )
            .expect("seed stale route");
        assert_eq!(stale.route.generation, 1);

        let response = send_mdns_local_request_with(
            &transport,
            "retry-host.local",
            port,
            Duration::from_secs(2),
            "Stale route request",
            resolve,
            |client| {
                client
                    .get(&request_url)
                    .header(HOST, format!("retry-host.local:{port}"))
                    .header(ORIGIN, &base_url)
            },
        )
        .expect("refresh stale route and retry");

        assert!(response.status().is_success());
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
        let cached = transport
            .current_route_with(
                "retry-host.local",
                port,
                Duration::from_millis(500),
                "Read refreshed route",
                &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                    panic!("refreshed route should stay cached")
                },
            )
            .expect("reuse refreshed route");
        assert_eq!(cached.route.generation, 2);
        server.join().expect("join refreshed local host");
    }

    #[test]
    fn transient_lkg_transport_failure_retries_only_the_identity_preflight() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind retained host port");
        let port = listener
            .local_addr()
            .expect("read retained host port")
            .port();
        let expected_host = format!("host: retained-health.local:{port}");
        let server = thread::spawn(move || {
            let (mut first_stream, _) = listener.accept().expect("accept first health request");
            let mut first_request = [0_u8; 2048];
            let first_read = first_stream
                .read(&mut first_request)
                .expect("read first health request");
            let first_received =
                String::from_utf8_lossy(&first_request[..first_read]).to_ascii_lowercase();
            assert!(first_received.contains(&expected_host), "{first_received}");
            first_stream
                .write_all(b"not-an-http-response")
                .expect("write malformed first response");
            drop(first_stream);

            let (mut retry_stream, _) = listener.accept().expect("accept retried health request");
            let mut retry_request = [0_u8; 2048];
            let retry_read = retry_stream
                .read(&mut retry_request)
                .expect("read retried health request");
            let retry_received =
                String::from_utf8_lossy(&retry_request[..retry_read]).to_ascii_lowercase();
            assert!(retry_received.contains(&expected_host), "{retry_received}");
            retry_stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                )
                .expect("write recovered health response");
        });

        let transport = MdnsTransport::default();
        transport
            .current_route_with(
                "retained-health.local",
                port,
                Duration::from_millis(100),
                "Seed retained health route",
                &|_, requested_port, _| {
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], requested_port))])
                },
            )
            .expect("seed retained health route");
        expire_cached_route(&transport, "retained-health.local");

        let failed_resolver_calls = AtomicUsize::new(0);
        let request_builds = AtomicUsize::new(0);
        let request_url = format!("http://retained-health.local:{port}/api/v1/health");
        let outcome = send_mdns_local_request_with_fallback_candidate(
            &transport,
            ("retained-health.local", port),
            Duration::from_secs(2),
            "Transient retained health request",
            true,
            |_, _, _| {
                failed_resolver_calls.fetch_add(1, Ordering::SeqCst);
                Err("simulated multicast outage".to_string())
            },
            |client| {
                request_builds.fetch_add(1, Ordering::SeqCst);
                client.get(&request_url)
            },
        )
        .expect("credential-free health preflight retries the retained address once");
        assert!(outcome.response.status().is_success());
        assert_eq!(failed_resolver_calls.load(Ordering::SeqCst), 2);
        assert_eq!(request_builds.load(Ordering::SeqCst), 2);

        let candidate = outcome
            .fallback_candidate
            .expect("health fallback stays unconfirmed until identity validation");
        assert!(
            transport
                .hosts
                .lock()
                .expect("read unconfirmed route cache")
                .get("retained-health.local")
                .expect("read unconfirmed route slot")
                .state
                .lock()
                .expect("read unconfirmed route state")
                .route
                .is_none(),
            "a mere HTTP response must not retain the fallback route"
        );
        candidate.confirm().expect("confirm matching host identity");

        let retained = transport
            .current_route_with(
                "retained-health.local",
                port,
                Duration::from_millis(100),
                "Reuse recovered health route",
                &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                    panic!("successful health fallback uses the short retained-route backoff")
                },
            )
            .expect("reuse recovered health route");
        assert_eq!(retained.route.generation, 1);
        assert!(
            retained
                .route
                .fresh_until
                .saturating_duration_since(Instant::now())
                <= MDNS_RETAINED_ROUTE_REVALIDATION_BACKOFF
        );
        server.join().expect("join retained health host");
    }

    #[test]
    fn identity_fallback_cannot_replace_a_concurrently_refreshed_route() {
        let transport = MdnsTransport::default();
        let initial = transport
            .current_route_with(
                "fallback-race.local",
                4278,
                Duration::from_millis(100),
                "Seed fallback race route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
            )
            .expect("seed fallback race route");
        let refreshed = transport
            .refresh_route_with(
                &initial,
                "fallback-race.local",
                4278,
                Duration::from_millis(100),
                "Refresh fallback race route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 2], port))]),
            )
            .expect("install newer route");

        assert_eq!(refreshed.route.generation, 2);
        assert!(!initial.slot.confirm_fallback_route(&initial.route));
        let current = transport
            .current_route_with(
                "fallback-race.local",
                4278,
                Duration::from_millis(100),
                "Read fallback race route",
                &|_, _, _| -> Result<Vec<SocketAddr>, String> {
                    panic!("newer route must remain cached")
                },
            )
            .expect("read newer route");
        assert_eq!(current.route.generation, 2);
    }

    #[test]
    fn fallback_candidate_is_retained_only_after_matching_expected_library_identity() {
        let transport = MdnsTransport::default();
        let initial = transport
            .current_route_with(
                "confirm-identity.local",
                4278,
                Duration::from_millis(100),
                "Seed identity confirmation route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
            )
            .expect("seed identity confirmation route");
        initial
            .slot
            .invalidate_without_resolution(initial.route.generation);
        let candidate = super::MdnsFallbackCandidate {
            slot: Arc::clone(&initial.slot),
            route: initial.route.clone(),
        };

        let parsed = verify_and_confirm_library_sync_host_identity(
            test_health(Some("library-a"), true),
            Some("library-a"),
            Some(candidate),
        )
        .expect("matching expected identity confirms fallback route");
        assert_eq!(parsed.library_id.as_deref(), Some("library-a"));
        let retained = initial.slot.state.lock().expect("read retained route");
        assert_eq!(
            retained.route.as_ref().map(|route| route.generation),
            Some(initial.route.generation)
        );
    }

    #[test]
    fn wrong_library_or_not_ready_health_never_retain_fallback_candidate() {
        for (name, health, expected_error) in [
            (
                "wrong-library",
                test_health(Some("library-b"), true),
                "Connected to a different library",
            ),
            (
                "not-ready",
                test_health(Some("library-a"), false),
                "Host reported not ready",
            ),
        ] {
            let transport = MdnsTransport::default();
            let hostname = format!("{name}.local");
            let initial = transport
                .current_route_with(
                    &hostname,
                    4278,
                    Duration::from_millis(100),
                    "Seed rejected identity route",
                    &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
                )
                .expect("seed rejected identity route");
            initial
                .slot
                .invalidate_without_resolution(initial.route.generation);
            let candidate = super::MdnsFallbackCandidate {
                slot: Arc::clone(&initial.slot),
                route: initial.route.clone(),
            };

            let error = verify_and_confirm_library_sync_host_identity(
                health,
                Some("library-a"),
                Some(candidate),
            )
            .err()
            .expect("unverified identity must reject fallback route");
            assert!(error.contains(expected_error), "{error}");
            assert!(initial
                .slot
                .state
                .lock()
                .expect("read rejected identity route")
                .route
                .is_none());
        }
    }

    #[test]
    fn missing_expected_library_identity_never_retain_fallback_candidate() {
        let transport = MdnsTransport::default();
        let initial = transport
            .current_route_with(
                "pairing-fallback.local",
                4278,
                Duration::from_millis(100),
                "Seed pairing fallback route",
                &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
            )
            .expect("seed pairing fallback route");
        initial
            .slot
            .invalidate_without_resolution(initial.route.generation);
        let candidate = super::MdnsFallbackCandidate {
            slot: Arc::clone(&initial.slot),
            route: initial.route.clone(),
        };

        let error = verify_and_confirm_library_sync_host_identity(
            test_health(Some("library-a"), true),
            None,
            Some(candidate),
        )
        .err()
        .expect("pairing without expected identity must reject fallback route");
        assert!(error.contains("requires an expected library ID"), "{error}");
        assert!(initial
            .slot
            .state
            .lock()
            .expect("read pairing fallback route")
            .route
            .is_none());
    }

    #[test]
    fn invalid_status_or_json_never_retain_fallback_candidate() {
        for (name, status, body, expected_error) in [
            (
                "http-error",
                reqwest::StatusCode::SERVICE_UNAVAILABLE,
                "{}",
                "Host request returned 503",
            ),
            (
                "invalid-json",
                reqwest::StatusCode::OK,
                "not-json",
                "Host returned invalid JSON",
            ),
        ] {
            let transport = MdnsTransport::default();
            let hostname = format!("{name}.local");
            let initial = transport
                .current_route_with(
                    &hostname,
                    4278,
                    Duration::from_millis(100),
                    "Seed malformed health route",
                    &|_, port, _| Ok(vec![SocketAddr::from(([127, 0, 0, 1], port))]),
                )
                .expect("seed malformed health route");
            initial
                .slot
                .invalidate_without_resolution(initial.route.generation);
            let candidate = super::MdnsFallbackCandidate {
                slot: Arc::clone(&initial.slot),
                route: initial.route.clone(),
            };

            let error = parse_library_sync_health_response(status, body, Some(candidate))
                .err()
                .expect("invalid health response must reject candidate");
            assert!(error.contains(expected_error), "{error}");
            assert!(initial
                .slot
                .state
                .lock()
                .expect("read malformed health route")
                .route
                .is_none());
        }
    }

    #[test]
    fn failed_lkg_transport_fallback_clears_route_and_next_request_resolves_immediately() {
        let closed_listener = TcpListener::bind("127.0.0.1:0").expect("bind closed host port");
        let port = closed_listener
            .local_addr()
            .expect("read closed host port")
            .port();
        drop(closed_listener);

        let transport = MdnsTransport::default();
        transport
            .current_route_with(
                "failed-lkg.local",
                port,
                Duration::from_millis(100),
                "Seed failed last-known-good route",
                &|_, requested_port, _| {
                    Ok(vec![SocketAddr::from(([127, 0, 0, 1], requested_port))])
                },
            )
            .expect("seed last-known-good route");
        expire_cached_route(&transport, "failed-lkg.local");

        let failed_resolver_calls = AtomicUsize::new(0);
        let request_builds = AtomicUsize::new(0);
        let request_url = format!("http://failed-lkg.local:{port}/api/v1/health");
        let error = send_mdns_local_request_with_fallback_candidate(
            &transport,
            ("failed-lkg.local", port),
            Duration::from_millis(900),
            "Failed retained route request",
            true,
            |_, _, _| {
                failed_resolver_calls.fetch_add(1, Ordering::SeqCst);
                Err("simulated multicast outage".to_string())
            },
            |client| {
                request_builds.fetch_add(1, Ordering::SeqCst);
                client.get(&request_url)
            },
        )
        .err()
        .expect("retained route transport must fail");
        assert!(error.contains("simulated multicast outage"), "{error}");
        assert_eq!(failed_resolver_calls.load(Ordering::SeqCst), 2);
        assert_eq!(request_builds.load(Ordering::SeqCst), 2);

        let recovery_resolver_calls = AtomicUsize::new(0);
        let recovered = transport
            .current_route_with(
                "failed-lkg.local",
                port,
                Duration::from_millis(100),
                "Resolve after failed retained route",
                &|_, requested_port, _| {
                    recovery_resolver_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![SocketAddr::from(([127, 0, 0, 2], requested_port))])
                },
            )
            .expect("transport failure must leave no retained backoff route");
        assert_eq!(recovered.route.generation, 2);
        assert_eq!(recovery_resolver_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_post_invalidates_the_route_without_replaying_the_request() {
        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);
        let request_builds = AtomicUsize::new(0);
        let resolve = |hostname: &str, requested_port: u16, _timeout: Duration| {
            assert_eq!(hostname, "write-host.local");
            resolver_calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![SocketAddr::from(([192, 0, 2, 1], requested_port))])
        };
        transport
            .current_route_with(
                "write-host.local",
                4278,
                Duration::from_millis(500),
                "Seed failed write route",
                &resolve,
            )
            .expect("seed failed write route");

        let request_url = "http://write-host.local:4278/api/v1/snapshot";
        let result = send_mdns_local_request_with(
            &transport,
            "write-host.local",
            4278,
            Duration::from_millis(900),
            "Failed write",
            resolve,
            |client| {
                request_builds.fetch_add(1, Ordering::SeqCst);
                client.post(request_url).body("write-once")
            },
        );

        assert!(result.is_err());
        assert_eq!(request_builds.load(Ordering::SeqCst), 1);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 1);

        let refreshed = transport
            .current_route_with(
                "write-host.local",
                4278,
                Duration::from_millis(500),
                "Resolve after failed write",
                &resolve,
            )
            .expect("failed write invalidates route for the next call");
        assert_eq!(refreshed.route.generation, 2);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn failed_authenticated_get_requires_a_new_identity_preflight_before_replay() {
        let transport = MdnsTransport::default();
        let resolver_calls = AtomicUsize::new(0);
        let request_builds = AtomicUsize::new(0);
        let resolve = |hostname: &str, requested_port: u16, _timeout: Duration| {
            assert_eq!(hostname, "protected-host.local");
            resolver_calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![SocketAddr::from(([192, 0, 2, 1], requested_port))])
        };
        transport
            .current_route_with(
                "protected-host.local",
                4278,
                Duration::from_millis(500),
                "Seed protected route",
                &resolve,
            )
            .expect("seed protected route");

        let result = send_mdns_local_request_with(
            &transport,
            "protected-host.local",
            4278,
            Duration::from_millis(900),
            "Failed protected read",
            resolve,
            |client| {
                request_builds.fetch_add(1, Ordering::SeqCst);
                client
                    .get("http://protected-host.local:4278/api/v1/library/snapshot")
                    .header(COOKIE, "bfm_companion_session=secret-session")
            },
        );

        assert!(result.is_err());
        assert_eq!(request_builds.load(Ordering::SeqCst), 1);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 1);

        let refreshed = transport
            .current_route_with(
                "protected-host.local",
                4278,
                Duration::from_millis(500),
                "Identity preflight after failed protected read",
                &resolve,
            )
            .expect("protected read invalidates route for the next preflight");
        assert_eq!(refreshed.route.generation, 2);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn pairing_token_accepts_raw_tokens_and_pairing_urls() {
        assert_eq!(
            extract_library_sync_pairing_token("http://192.168.1.10:4278/companion?pairing=abc123")
                .as_deref(),
            Some("abc123")
        );
        assert_eq!(
            extract_library_sync_pairing_token(" raw-token ").as_deref(),
            Some("raw-token")
        );
        assert_eq!(extract_library_sync_pairing_token(" "), None);
    }

    #[test]
    fn cookie_helpers_trim_and_omit_empty_values() {
        assert_eq!(
            extract_cookie_value_from_set_cookie(
                "bfm_companion_session = abc ; Path=/",
                "bfm_companion_session"
            ),
            Some("abc".to_string())
        );
        assert_eq!(
            extract_cookie_value_from_set_cookie(
                "bfm_companion_session=abc; Path=/",
                "bfm_companion_session"
            )
            .as_deref(),
            Some("abc")
        );
        assert_eq!(
            build_library_sync_cookie_header(Some(" session "), Some(" device ")).as_deref(),
            Some("bfm_companion_session=session; bfm_trusted_lan_device=device")
        );
        assert_eq!(build_library_sync_cookie_header(Some(" "), None), None);
    }

    #[test]
    fn device_token_round_trips_through_secure_store_with_normalized_host_key() {
        let state = test_state();

        store_library_sync_device_token(
            &state,
            " HTTP://Host.Local:4278/ ",
            " long-lived-device-token ",
        )
        .expect("store device token");

        assert_eq!(
            load_library_sync_device_token(&state, "http://host.local:4278")
                .expect("load device token"),
            "long-lived-device-token"
        );
        assert_eq!(
            load_library_sync_device_token_optional(&state, "http://other.local:4278")
                .expect("load missing token"),
            None
        );
        assert!(
            load_library_sync_device_token_optional(&state, "http://user:password@host.local:4278")
                .is_err(),
            "production credential lookups must reject embedded credentials"
        );
    }

    #[test]
    fn warm_runtime_auth_does_not_require_another_credential_store_read() {
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        state
            .library_sync_auth
            .replace_authenticated(host, "session-id", "csrf-token", "runtime-device-token")
            .expect("save warm runtime auth");

        // No device token exists in the credential store. A successful read therefore proves
        // the warm path stayed entirely in the zeroized runtime session instead of reopening
        // Keychain or Credential Manager.
        let auth = current_or_renewed_library_sync_auth(&state, host)
            .expect("read warm runtime authentication");
        assert_eq!(auth.session_id, "session-id");
        assert_eq!(auth.csrf_token, "csrf-token");
        assert_eq!(auth.device_token, "runtime-device-token");

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn concurrent_unauthorized_wave_renews_the_failed_session_once() {
        const REQUEST_COUNT: usize = 8;
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");
        state
            .library_sync_auth
            .replace_authenticated(host, "failed-session", "failed-csrf", "device-token")
            .expect("seed failed runtime session");

        let start = Arc::new(Barrier::new(REQUEST_COUNT + 1));
        let renewal_count = Arc::new(AtomicUsize::new(0));
        let mut requests = Vec::with_capacity(REQUEST_COUNT);
        for _ in 0..REQUEST_COUNT {
            let request_state = state.clone();
            let request_start = Arc::clone(&start);
            let request_renewal_count = Arc::clone(&renewal_count);
            requests.push(thread::spawn(move || {
                request_start.wait();
                renew_or_reuse_library_sync_auth_with(
                    &request_state,
                    host,
                    "failed-session",
                    "device-token",
                    move |base_url, device_token| {
                        request_renewal_count.fetch_add(1, Ordering::SeqCst);
                        assert_eq!(base_url, host);
                        assert_eq!(device_token, "device-token");
                        Ok(LibrarySyncAuthenticatedSessionState {
                            csrf_token: "renewed-csrf".to_string(),
                            session_id: "renewed-session".to_string(),
                            device_token: device_token.to_string(),
                        })
                    },
                )
            }));
        }

        start.wait();
        for request in requests {
            let auth = request
                .join()
                .expect("join unauthorized request")
                .expect("reuse renewed authentication");
            assert_eq!(auth.session_id, "renewed-session");
            assert_eq!(auth.csrf_token, "renewed-csrf");
            assert_eq!(auth.device_token, "device-token");
        }
        assert_eq!(renewal_count.load(Ordering::SeqCst), 1);
        let runtime = state
            .library_sync_auth
            .current()
            .expect("read renewed runtime auth")
            .expect("renewed runtime auth");
        assert_eq!(runtime.session_id, "renewed-session");
        assert_eq!(runtime.device_token.as_deref(), Some("device-token"));

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_unauthorized_wave_attempts_one_renewal_and_allows_a_later_retry() {
        const REQUEST_COUNT: usize = 8;
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");
        state
            .library_sync_auth
            .replace_authenticated(host, "failed-session", "failed-csrf", "device-token")
            .expect("seed failed runtime session");

        let start = Arc::new(Barrier::new(REQUEST_COUNT + 1));
        let renewal_count = Arc::new(AtomicUsize::new(0));
        let mut requests = Vec::with_capacity(REQUEST_COUNT);
        for _ in 0..REQUEST_COUNT {
            let request_state = state.clone();
            let request_start = Arc::clone(&start);
            let request_renewal_count = Arc::clone(&renewal_count);
            requests.push(thread::spawn(move || {
                request_start.wait();
                renew_or_reuse_library_sync_auth_with(
                    &request_state,
                    host,
                    "failed-session",
                    "device-token",
                    move |_, _| {
                        request_renewal_count.fetch_add(1, Ordering::SeqCst);
                        thread::sleep(Duration::from_millis(100));
                        Err("sensitive renewal transport detail".to_string())
                    },
                )
            }));
        }

        start.wait();
        for request in requests {
            let error = match request.join().expect("join failed unauthorized request") {
                Ok(_) => panic!("failed renewal wave must fail"),
                Err(error) => error,
            };
            assert_eq!(error, SHARED_RENEWAL_FAILED_ERROR);
            assert!(!error.contains("sensitive"));
        }
        assert_eq!(renewal_count.load(Ordering::SeqCst), 1);
        assert!(state
            .library_sync_auth
            .current()
            .expect("read cleared runtime auth")
            .is_none());

        // A slower dashboard command may reach the cold path after the first 401 request has
        // already cleared runtime auth. It must share the same short failure cooldown instead of
        // starting another network renewal in the same wave.
        let cold_renewal_count = Arc::clone(&renewal_count);
        let cold_error =
            match current_or_renewed_library_sync_auth_with(&state, host, move |_, _| {
                cold_renewal_count.fetch_add(1, Ordering::SeqCst);
                Err("late cold renewal should not run".to_string())
            }) {
                Ok(_) => panic!("late cold request must share the failed wave"),
                Err(error) => error,
            };
        assert_eq!(cold_error, SHARED_RENEWAL_FAILED_ERROR);
        assert_eq!(renewal_count.load(Ordering::SeqCst), 1);

        thread::sleep(Duration::from_millis(1_050));
        let retry_renewal_count = Arc::clone(&renewal_count);
        let renewed = current_or_renewed_library_sync_auth_with(
            &state,
            host,
            move |base_url, device_token| {
                retry_renewal_count.fetch_add(1, Ordering::SeqCst);
                assert_eq!(base_url, host);
                assert_eq!(device_token, "device-token");
                Ok(LibrarySyncAuthenticatedSessionState {
                    csrf_token: "retry-csrf".to_string(),
                    session_id: "retry-session".to_string(),
                    device_token: device_token.to_string(),
                })
            },
        )
        .expect("retry after cooldown");
        assert_eq!(renewed.session_id, "retry-session");
        assert_eq!(renewal_count.load(Ordering::SeqCst), 2);

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn unauthorized_renewal_cooldown_preserves_pairing_repair_classification() {
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");
        state
            .library_sync_auth
            .replace_authenticated(host, "failed-session", "failed-csrf", "device-token")
            .expect("seed failed runtime session");

        let first_error = match renew_or_reuse_library_sync_auth_with(
            &state,
            host,
            "failed-session",
            "device-token",
            |_, _| {
                Err(
                    "Host session renewal request returned 401 Unauthorized. sensitive detail"
                        .to_string(),
                )
            },
        ) {
            Ok(_) => panic!("revoked pairing must fail renewal"),
            Err(error) => error,
        };
        assert_eq!(first_error, SHARED_RENEWAL_UNAUTHORIZED_ERROR);
        assert!(first_error.contains("401"));
        assert!(!first_error.contains("sensitive"));

        let cold_error = match current_or_renewed_library_sync_auth_with(&state, host, |_, _| {
            panic!("cooldown must suppress a late cold renewal")
        }) {
            Ok(_) => panic!("revoked pairing cooldown must remain failed"),
            Err(error) => error,
        };
        assert_eq!(cold_error, SHARED_RENEWAL_UNAUTHORIZED_ERROR);
        assert!(cold_error.contains("401"));

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn transport_url_digits_do_not_misclassify_renewal_as_unauthorized() {
        let host = "http://host401.local:4010";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");
        state
            .library_sync_auth
            .replace_authenticated(host, "failed-session", "failed-csrf", "device-token")
            .expect("seed failed runtime session");

        let error = match renew_or_reuse_library_sync_auth_with(
            &state,
            host,
            "failed-session",
            "device-token",
            |_, _| {
                Err("Host session renewal request failed while connecting to http://host401.local:4010/api/v1/auth/renew"
                    .to_string())
            },
        ) {
            Ok(_) => panic!("transport failure must fail renewal"),
            Err(error) => error,
        };
        assert_eq!(error, SHARED_RENEWAL_FAILED_ERROR);
        assert!(!error.contains("401"));

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn reset_waits_for_in_flight_renewal_and_clears_the_renewed_session() {
        let host = "http://host.local:4278";
        let state = credential_test_state(host);
        store_library_sync_device_token(&state, host, "device-token").expect("store device token");

        let remote_started = Arc::new(Barrier::new(2));
        let release_remote = Arc::new(Barrier::new(2));
        let renew_started = Arc::clone(&remote_started);
        let renew_release = Arc::clone(&release_remote);
        let renew_state = state.clone();
        let (renewed_tx, renewed_rx) = mpsc::channel();
        let renew = std::thread::spawn(move || {
            let result = renew_and_cache_library_sync_auth_with(
                &renew_state,
                host,
                "device-token",
                move |base_url, device_token| {
                    assert_eq!(base_url, host);
                    assert_eq!(device_token, "device-token");
                    renew_started.wait();
                    renew_release.wait();
                    Ok(LibrarySyncAuthenticatedSessionState {
                        csrf_token: "renewed-csrf".to_string(),
                        session_id: "renewed-session".to_string(),
                        device_token: device_token.to_string(),
                    })
                },
            );
            renewed_tx.send(result).expect("report renewal result");
        });

        remote_started.wait();
        let reset_start = Arc::new(Barrier::new(2));
        let reset_worker_start = Arc::clone(&reset_start);
        let reset_state = state.clone();
        let (reset_tx, reset_rx) = mpsc::channel();
        let reset = std::thread::spawn(move || {
            reset_worker_start.wait();
            reset_tx
                .send(reset_app_data_inner(&reset_state))
                .expect("report reset result");
        });
        reset_start.wait();
        assert!(
            reset_rx.recv_timeout(Duration::from_millis(200)).is_err(),
            "reset completed while renewal still held the credential mutation gate"
        );

        release_remote.wait();
        renewed_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("renewal completed")
            .expect("renewal result");
        renew.join().expect("join renewal");
        reset_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("reset completed")
            .expect("reset result");
        reset.join().expect("join reset");

        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_none());
        assert!(load_library_sync_device_token_optional(&state, host)
            .expect("read reset profile token")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }
}
