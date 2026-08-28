use rand::RngExt;
use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::env;
use std::io::Read;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_BASE_URLS: [&str; 3] = [
    "https://us.store.bambulab.com",
    "https://eu.store.bambulab.com",
    "https://store.bambulab.com",
];
const DEFAULT_COLLECTION_HANDLE: &str = "bambu-lab-3d-printer-filament";
const DEFAULT_WEIGHT_G: i64 = 1000;
const USER_AGENT: &str = "BambuFilamentManager/0.28.0 (+local catalog maintenance)";
const REQUEST_TIMEOUT_SECS: u64 = 20;
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
const CATALOG_MIN_REQUEST_INTERVAL: Duration = Duration::from_secs(2);
const CATALOG_BLOCK_COOLDOWN: Duration = Duration::from_secs(5 * 60);
const DISCOVERY_MAX_PAGES_PER_STORE: usize = 4;
const DISCOVERY_MAX_REQUESTS: usize = 6;
const DISCOVERY_PAGE_DELAY_MS: u64 = 350;
const DISCOVERY_PAGE_DELAY_JITTER_MS: u64 = 250;
const TARGETED_REFRESH_MAX_PAGES: usize = 4;
const TARGETED_REFRESH_MAX_REQUESTS: usize = 4;
const TARGETED_DETAIL_MAX_REQUESTS: usize = 24;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BambuCatalogEntry {
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub image_url: Option<String>,
    pub product_url: String,
    pub default_weight_g: i64,
}

#[derive(Clone, Debug)]
pub struct BambuKnownCatalogEntry {
    pub entry: BambuCatalogEntry,
    pub last_seen_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BambuCatalogRefreshSnapshot {
    pub entries: Vec<BambuCatalogEntry>,
    pub detected_store: String,
    pub detected_collection: String,
    pub discovered_materials: Vec<String>,
    pub warnings: Vec<String>,
    pub anti_bot_blocks: i64,
    pub products_discovered: i64,
    pub products_detailed: i64,
    pub reused_cached_products: i64,
    pub detail_fetches: i64,
    pub partial: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct BambuCatalogSourceDiscovery {
    pub detected_store: String,
    pub detected_collection: String,
    pub products_discovered: i64,
    pub discovered_materials: Vec<String>,
    pub detail_fetches: i64,
    pub output: String,
}

#[derive(Clone, Debug)]
struct DiscoveryHttpResponse {
    status: u16,
    content_type: Option<String>,
    final_url: String,
    body: String,
}

#[derive(Clone, Debug)]
enum DiscoveryAttemptError {
    Inconclusive(String),
    Unavailable(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct DetectStoreResult {
    base_url: String,
    handle: String,
}

static LAST_DISCOVERED_SOURCE: OnceLock<Mutex<Option<DetectStoreResult>>> = OnceLock::new();

#[derive(Debug, Default)]
struct BambuCatalogRequestGate {
    last_request_finished: Option<Instant>,
    blocked_until: Option<Instant>,
}

static BAMBU_CATALOG_REQUEST_GATE: OnceLock<Mutex<BambuCatalogRequestGate>> = OnceLock::new();

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct BambuCollectionProduct {
    id: String,
    #[serde(rename = "seoCode")]
    handle: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct BambuNextCollectionProps {
    size: usize,
    #[serde(rename = "initialPage")]
    initial_page: usize,
    #[serde(rename = "productList")]
    products: Vec<BambuCollectionProduct>,
    total: usize,
}

#[derive(Clone, Debug)]
struct BambuCollectionSnapshot {
    base_url: String,
    products: Vec<BambuCollectionProduct>,
}

#[derive(Debug)]
struct BambuCollectionFetchError {
    message: String,
    first_page_unavailable: bool,
}

#[derive(Debug, Deserialize)]
struct BambuJsonLdProductGroup {
    #[serde(default)]
    name: String,
    #[serde(default)]
    url: String,
    #[serde(rename = "hasVariant", default)]
    variants: Vec<BambuJsonLdVariant>,
}

#[derive(Debug, Deserialize)]
struct BambuJsonLdVariant {
    #[serde(default)]
    sku: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    image: Value,
}

pub fn refresh_bambu_catalog_snapshot(
    material_filters: Option<Vec<String>>,
    _known_entries: Option<Vec<BambuKnownCatalogEntry>>,
    _stale_before: Option<&str>,
) -> Result<BambuCatalogRefreshSnapshot, String> {
    let client = build_client()?;
    let material = require_single_material_filter(material_filters)?;
    let request_gate =
        BAMBU_CATALOG_REQUEST_GATE.get_or_init(|| Mutex::new(BambuCatalogRequestGate::default()));
    let mut request_gate = request_gate
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    ensure_bambu_catalog_gate_ready(&mut request_gate)?;
    let source = match last_discovered_source() {
        Some(source) => source,
        None => {
            let discovery = discover_bambu_catalog_source_with_client(&client, &mut request_gate)?;
            DetectStoreResult {
                base_url: discovery.detected_store,
                handle: discovery.detected_collection,
            }
        }
    };

    refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, &material, false, |url| {
        fetch_bambu_catalog_page_under_gate(&client, &mut request_gate, url)
    })
}

fn source_cache() -> &'static Mutex<Option<DetectStoreResult>> {
    LAST_DISCOVERED_SOURCE.get_or_init(|| Mutex::new(None))
}

fn remember_discovered_source(source: DetectStoreResult) {
    let mut cached = source_cache()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    *cached = Some(source);
}

fn last_discovered_source() -> Option<DetectStoreResult> {
    source_cache()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

fn require_single_material_filter(material_filters: Option<Vec<String>>) -> Result<String, String> {
    let filters = normalize_material_filters(material_filters);
    if filters.len() != 1 {
        return Err(
            "Bambu refresh requires exactly one material family; catalog mutation was skipped."
                .to_string(),
        );
    }
    let material = filters
        .into_iter()
        .next()
        .expect("one filter was validated");
    if !is_known_bambu_material(&material) {
        return Err(format!(
            "Bambu refresh does not recognize material family {material}; catalog mutation was skipped."
        ));
    }
    Ok(material)
}

fn refresh_bambu_catalog_snapshot_from_source_with_fetch<F>(
    source: &DetectStoreResult,
    material: &str,
    pause_between_pages: bool,
    mut fetch: F,
) -> Result<BambuCatalogRefreshSnapshot, String>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    let collection =
        fetch_complete_bambu_collection_with_fetch(source, pause_between_pages, &mut fetch)?;
    let discovered_materials = usable_materials_from_products(&collection.products);
    let selected_products: Vec<&BambuCollectionProduct> = collection
        .products
        .iter()
        .filter(|product| {
            is_supported_single_filament_product(&product.name)
                && infer_material(&product.name).eq_ignore_ascii_case(material)
        })
        .collect();
    if selected_products.is_empty() {
        return Err(format!(
            "Bambu refresh found no products for selected material family {material}; catalog mutation was skipped."
        ));
    }
    if selected_products.len() > TARGETED_DETAIL_MAX_REQUESTS {
        return Err(format!(
            "Bambu refresh found {} products for {material}, exceeding its {TARGETED_DETAIL_MAX_REQUESTS}-detail safety budget; catalog mutation was skipped.",
            selected_products.len()
        ));
    }

    let mut entries = Vec::new();
    for product in &selected_products {
        let product_url = build_product_url(&collection.base_url, &product.handle);
        let response = fetch(&product_url).map_err(|error| {
            format!(
                "Bambu refresh could not read selected product '{}' ({error}); catalog mutation was skipped.",
                product.handle
            )
        })?;
        validate_bambu_html_response(&response, "selected product detail")
            .map_err(|error| format!("Bambu refresh {error}; catalog mutation was skipped."))?;
        let product_entries = parse_bambu_product_group_entries(
            &response.body,
            product,
            material,
            &collection.base_url,
            &response.final_url,
        )
        .map_err(|error| {
            format!(
                "Bambu refresh could not completely decode selected product '{}' ({error}); catalog mutation was skipped.",
                product.handle
            )
        })?;
        entries.extend(product_entries);
    }
    let entries = ensure_unique_entries(entries)?;
    if entries.is_empty() {
        return Err(format!(
            "Bambu refresh produced no entries for selected material family {material}; catalog mutation was skipped."
        ));
    }

    Ok(BambuCatalogRefreshSnapshot {
        entries,
        detected_store: collection.base_url,
        detected_collection: source.handle.clone(),
        discovered_materials,
        warnings: Vec::new(),
        anti_bot_blocks: 0,
        products_discovered: collection.products.len() as i64,
        products_detailed: selected_products.len() as i64,
        reused_cached_products: 0,
        detail_fetches: selected_products.len() as i64,
        partial: false,
    })
}

/// Discovers the material families currently exposed by the Bambu storefront.
///
/// This operation is intentionally read-only and bounded. It only reads the
/// Next/RSC collection listing, never opens individual product pages,
/// and returns an error whenever the listing cannot be proven complete.
pub fn discover_bambu_catalog_source() -> Result<BambuCatalogSourceDiscovery, String> {
    let client = build_client()?;
    let request_gate =
        BAMBU_CATALOG_REQUEST_GATE.get_or_init(|| Mutex::new(BambuCatalogRequestGate::default()));
    let mut request_gate = request_gate
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    ensure_bambu_catalog_gate_ready(&mut request_gate)?;
    discover_bambu_catalog_source_with_client(&client, &mut request_gate)
}

fn discover_bambu_catalog_source_with_client(
    client: &Client,
    request_gate: &mut BambuCatalogRequestGate,
) -> Result<BambuCatalogSourceDiscovery, String> {
    let collection_handle = env::var("BAMBU_COLLECTION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_COLLECTION_HANDLE.to_string());
    let base_urls = discovery_base_urls();

    let discovery = discover_bambu_material_channels_with_fetch(
        &base_urls,
        &collection_handle,
        false,
        |url| fetch_bambu_catalog_page_under_gate(client, request_gate, url),
    )?;
    remember_discovered_source(DetectStoreResult {
        base_url: discovery.detected_store.clone(),
        handle: discovery.detected_collection.clone(),
    });
    Ok(discovery)
}

fn fetch_complete_bambu_collection_with_fetch<F>(
    source: &DetectStoreResult,
    pause_between_pages: bool,
    fetch: &mut F,
) -> Result<BambuCollectionSnapshot, String>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    let mut request_count = 0usize;
    fetch_complete_bambu_collection_core(
        source,
        pause_between_pages,
        &mut request_count,
        TARGETED_REFRESH_MAX_REQUESTS,
        TARGETED_REFRESH_MAX_PAGES,
        fetch,
    )
    .map_err(|error| format!("{} Catalog mutation was skipped.", error.message))
}

fn fetch_complete_bambu_collection_core<F>(
    source: &DetectStoreResult,
    pause_between_pages: bool,
    request_count: &mut usize,
    max_requests: usize,
    max_pages: usize,
    fetch: &mut F,
) -> Result<BambuCollectionSnapshot, BambuCollectionFetchError>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    let mut base_url = normalize_base_url(&source.base_url);
    let mut products = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_handles = HashSet::new();
    let mut expected_size = None;
    let mut expected_total = None;
    let mut expected_pages = None;

    for page in 1..=max_pages {
        if *request_count >= max_requests {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery stopped after its {max_requests}-request safety budget."
                ),
                first_page_unavailable: false,
            });
        }
        if pause_between_pages && page > 1 {
            sleep_with_jitter(DISCOVERY_PAGE_DELAY_MS, DISCOVERY_PAGE_DELAY_JITTER_MS);
        }

        let url = collection_page_url(&base_url, &source.handle, page);
        *request_count += 1;
        let response = fetch(&url).map_err(|error| BambuCollectionFetchError {
            message: format!(
                "Bambu collection discovery lost pagination at page {page} ({error})."
            ),
            first_page_unavailable: page == 1,
        })?;

        if body_looks_like_anti_bot_challenge(&response.body) {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery encountered a challenge page at page {page}."
                ),
                first_page_unavailable: false,
            });
        }
        if is_anti_bot_or_rate_limited(response.status) {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery was blocked or rate-limited (HTTP {}).",
                    response.status
                ),
                first_page_unavailable: false,
            });
        }
        if !(200..300).contains(&response.status) {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery received HTTP {} at page {page} from {base_url}.",
                    response.status
                ),
                first_page_unavailable: page == 1,
            });
        }
        if response
            .content_type
            .as_deref()
            .is_some_and(|content_type| {
                let content_type = content_type.to_ascii_lowercase();
                !content_type.contains("text/html")
                    && !content_type.contains("application/xhtml+xml")
            })
        {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery received an unexpected content type at page {page}."
                ),
                first_page_unavailable: false,
            });
        }

        if page == 1 {
            base_url = canonical_base_url(&response.final_url, &base_url);
        }
        let parsed = parse_bambu_next_collection_page(&response.body).map_err(|error| {
            BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery received an invalid or incomplete Next/RSC listing at page {page} ({error})."
                ),
                first_page_unavailable: false,
            }
        })?;

        if parsed.initial_page != page {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery requested page {page}, but the storefront returned page {}.",
                    parsed.initial_page
                ),
                first_page_unavailable: false,
            });
        }
        if page == 1 {
            if parsed.size == 0 || parsed.total == 0 {
                return Err(BambuCollectionFetchError {
                    message: "Bambu collection discovery found an empty or unbounded collection."
                        .to_string(),
                    first_page_unavailable: false,
                });
            }
            let page_count = parsed.total.div_ceil(parsed.size);
            if page_count == 0 || page_count > max_pages {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery needs {page_count} pages, exceeding its {max_pages}-page safety budget."
                    ),
                    first_page_unavailable: false,
                });
            }
            let remaining_requests = max_requests.saturating_sub(*request_count);
            if page_count.saturating_sub(1) > remaining_requests {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery cannot complete within its {max_requests}-request safety budget."
                    ),
                    first_page_unavailable: false,
                });
            }
            expected_size = Some(parsed.size);
            expected_total = Some(parsed.total);
            expected_pages = Some(page_count);
        } else if expected_size != Some(parsed.size) || expected_total != Some(parsed.total) {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery received inconsistent size or total metadata at page {page}."
                ),
                first_page_unavailable: false,
            });
        }

        let size = expected_size.expect("first collection page establishes size");
        let total = expected_total.expect("first collection page establishes total");
        let page_count = expected_pages.expect("first collection page establishes page count");
        let offset = (page - 1).saturating_mul(size);
        let expected_page_products = total.saturating_sub(offset).min(size);
        if parsed.products.len() != expected_page_products {
            return Err(BambuCollectionFetchError {
                message: format!(
                    "Bambu collection discovery expected {expected_page_products} products at page {page}, but received {}.",
                    parsed.products.len()
                ),
                first_page_unavailable: false,
            });
        }

        for product in parsed.products {
            let id = product.id.trim();
            let handle = product.handle.trim().trim_matches('/');
            let name = product.name.trim();
            if id.is_empty() || handle.is_empty() || name.is_empty() {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery received an invalid product summary at page {page}."
                    ),
                    first_page_unavailable: false,
                });
            }
            if !seen_ids.insert(id.to_ascii_lowercase()) {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery repeated product id '{id}' at page {page}."
                    ),
                    first_page_unavailable: false,
                });
            }
            if !seen_handles.insert(handle.to_ascii_lowercase()) {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery repeated product '{handle}' at page {page}."
                    ),
                    first_page_unavailable: false,
                });
            }
            products.push(BambuCollectionProduct {
                id: id.to_string(),
                handle: handle.to_string(),
                name: name.to_string(),
            });
        }

        if page == page_count {
            if products.len() != total {
                return Err(BambuCollectionFetchError {
                    message: format!(
                        "Bambu collection discovery accumulated {} products, but the storefront declared {total}.",
                        products.len()
                    ),
                    first_page_unavailable: false,
                });
            }
            return Ok(BambuCollectionSnapshot { base_url, products });
        }
    }

    Err(BambuCollectionFetchError {
        message: format!(
            "Bambu collection discovery did not complete within its {max_pages}-page safety budget."
        ),
        first_page_unavailable: false,
    })
}

fn collection_page_url(base_url: &str, collection_handle: &str, page: usize) -> String {
    let root = format!(
        "{}/collections/{}",
        normalize_base_url(base_url),
        collection_handle.trim_matches('/')
    );
    if page == 1 {
        root
    } else {
        format!("{root}?page={page}")
    }
}

fn canonical_base_url(final_url: &str, fallback: &str) -> String {
    let fallback = normalize_base_url(fallback);
    let Ok(final_url) = Url::parse(final_url) else {
        return fallback;
    };
    let Ok(fallback_url) = Url::parse(&fallback) else {
        return fallback;
    };
    if !matches!(final_url.scheme(), "http" | "https") {
        return fallback;
    }

    let same_origin = final_url.origin() == fallback_url.origin();
    let official_store_redirect = final_url.scheme() == "https"
        && fallback_url.scheme() == "https"
        && is_official_bambu_store_host(final_url.host_str())
        && is_official_bambu_store_host(fallback_url.host_str());
    if !same_origin && !official_store_redirect {
        return fallback;
    }

    let origin = final_url.origin().ascii_serialization();
    if origin == "null" {
        fallback
    } else {
        origin
    }
}

fn is_official_bambu_store_host(host: Option<&str>) -> bool {
    host.is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == "store.bambulab.com" || host.ends_with(".store.bambulab.com")
    })
}

fn parse_bambu_next_collection_page(body: &str) -> Result<BambuNextCollectionProps, String> {
    let flight_payload = decode_next_flight_payload(body)?;
    let mut candidates = Vec::new();
    for (position, _) in flight_payload.match_indices("\"productList\"") {
        for start in enclosing_json_object_starts(&flight_payload, position)
            .into_iter()
            .rev()
        {
            let Some(end) = find_matching_json_object_end(&flight_payload, start) else {
                continue;
            };
            let Ok(candidate) =
                serde_json::from_str::<BambuNextCollectionProps>(&flight_payload[start..end])
            else {
                continue;
            };
            candidates.push(candidate);
            break;
        }
    }
    if candidates.len() != 1 {
        return Err(format!(
            "expected exactly one collection payload, found {}",
            candidates.len()
        ));
    }
    let candidate = candidates
        .pop()
        .expect("exactly one collection payload was validated");
    if candidate.size == 0
        || candidate.total == 0
        || candidate.products.is_empty()
        || candidate.products.len() > candidate.size
    {
        return Err("collection payload had invalid size, total, or products".to_string());
    }
    Ok(candidate)
}

fn decode_next_flight_payload(body: &str) -> Result<String, String> {
    const MARKER: &str = "self.__next_f.push(";
    let lowered = body.to_ascii_lowercase();
    let mut search_from = 0usize;
    let mut payload = String::new();
    let mut chunks = 0usize;

    while let Some(relative_start) = body[search_from..].find(MARKER) {
        let call_start = search_from + relative_start + MARKER.len();
        let Some(relative_end) = lowered[call_start..].find("</script>") else {
            return Err("unterminated Next Flight script".to_string());
        };
        let script_end = call_start + relative_end;
        let call = body[call_start..script_end]
            .trim()
            .trim_end_matches(';')
            .trim();
        let expression = call
            .strip_suffix(')')
            .ok_or_else(|| "invalid Next Flight push call".to_string())?;
        let value: Value = serde_json::from_str(expression)
            .map_err(|_| "invalid Next Flight push payload".to_string())?;
        if let Some(chunk) = value
            .as_array()
            .and_then(|items| items.get(1))
            .and_then(Value::as_str)
        {
            payload.push_str(chunk);
            chunks += 1;
        }
        search_from = script_end + "</script>".len();
    }

    if chunks == 0 || payload.is_empty() {
        return Err("missing Next Flight collection payload".to_string());
    }
    Ok(payload)
}

fn enclosing_json_object_starts(input: &str, end: usize) -> Vec<usize> {
    let bytes = input.as_bytes();
    let mut stack = Vec::new();
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in bytes.iter().copied().enumerate().take(end) {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'\"' {
                in_string = false;
            }
            continue;
        }
        match byte {
            b'\"' => in_string = true,
            b'{' => stack.push(index),
            b'}' => {
                stack.pop();
            }
            _ => {}
        }
    }
    stack
}

fn find_matching_json_object_end(input: &str, start: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    if bytes.get(start) != Some(&b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in bytes.iter().copied().enumerate().skip(start) {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'\"' {
                in_string = false;
            }
            continue;
        }
        match byte {
            b'\"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    return Some(index + 1);
                }
            }
            _ => {}
        }
    }
    None
}

/// Rejects snapshots that are unsafe to import. Callers can use this guard
/// before any catalog mutation.
pub fn validate_bambu_refresh_snapshot_for_mutation(
    snapshot: &BambuCatalogRefreshSnapshot,
) -> Result<(), String> {
    if snapshot.partial {
        return Err("Bambu refresh was partial; catalog mutation was skipped.".to_string());
    }
    if snapshot.anti_bot_blocks > 0 {
        return Err(
            "Bambu refresh encountered anti-bot or rate-limit responses; catalog mutation was skipped."
                .to_string(),
        );
    }
    if !snapshot.warnings.is_empty() {
        return Err(
            "Bambu refresh returned source warnings; catalog mutation was skipped.".to_string(),
        );
    }
    if snapshot.products_discovered <= 0 || snapshot.entries.is_empty() {
        return Err(
            "Bambu refresh returned no usable products; catalog mutation was skipped.".to_string(),
        );
    }
    if snapshot.reused_cached_products != 0 {
        return Err(
            "Bambu refresh used cached product details; catalog mutation was skipped.".to_string(),
        );
    }
    if snapshot.products_detailed <= 0
        || snapshot.detail_fetches != snapshot.products_detailed
        || snapshot.detail_fetches as usize > TARGETED_DETAIL_MAX_REQUESTS
        || snapshot.products_detailed > snapshot.products_discovered
    {
        return Err(
            "Bambu refresh detail coverage did not match its bounded selected-product set; catalog mutation was skipped."
                .to_string(),
        );
    }
    let mut materials = HashSet::new();
    let mut entry_keys = HashSet::new();
    for entry in &snapshot.entries {
        materials.insert(entry.material.trim().to_uppercase());
        let key = format!(
            "{}::{}::{}",
            entry.material.trim().to_uppercase(),
            entry.filament_name.trim().to_lowercase(),
            entry.color_name.trim().to_lowercase()
        );
        if !entry_keys.insert(key) {
            return Err(
                "Bambu refresh returned duplicate catalog entries; catalog mutation was skipped."
                    .to_string(),
            );
        }
    }
    if materials.len() != 1 || materials.contains("") {
        return Err(
            "Bambu refresh returned more than one material family; catalog mutation was skipped."
                .to_string(),
        );
    }
    Ok(())
}

fn discovery_base_urls() -> Vec<String> {
    let explicit_base = env::var("BAMBU_BASE_URL")
        .ok()
        .map(|value| normalize_base_url(&value))
        .filter(|value| !value.is_empty());
    if let Some(base_url) = explicit_base {
        return vec![base_url];
    }

    DEFAULT_BASE_URLS
        .iter()
        .map(|value| normalize_base_url(value))
        .collect()
}

fn ensure_bambu_catalog_gate_ready(gate: &mut BambuCatalogRequestGate) -> Result<(), String> {
    let now = Instant::now();
    if let Some(blocked_until) = gate.blocked_until {
        if blocked_until > now {
            let remaining = blocked_until
                .saturating_duration_since(now)
                .as_secs()
                .max(1);
            return Err(format!(
                "Bambu catalog access is cooling down after a blocking response; try again in about {remaining} seconds. No request was sent."
            ));
        }
        gate.blocked_until = None;
    }
    Ok(())
}

fn fetch_bambu_catalog_page_under_gate(
    client: &Client,
    gate: &mut BambuCatalogRequestGate,
    url: &str,
) -> Result<DiscoveryHttpResponse, String> {
    ensure_bambu_catalog_gate_ready(gate)?;
    if let Some(last_request_finished) = gate.last_request_finished {
        let elapsed = last_request_finished.elapsed();
        if elapsed < CATALOG_MIN_REQUEST_INTERVAL {
            thread::sleep(CATALOG_MIN_REQUEST_INTERVAL - elapsed);
        }
    }

    let mut response = match client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!("request failed without retry: {error}"));
        }
    };
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let final_url = response.url().to_string();
    let content_length = response.content_length();
    let blocked_status = is_anti_bot_or_rate_limited(status);
    let body = match read_bounded_utf8_response(&mut response, content_length, MAX_RESPONSE_BYTES) {
        Ok(body) => body,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            if blocked_status {
                gate.blocked_until = Some(Instant::now() + CATALOG_BLOCK_COOLDOWN);
            }
            return Err(format!(
                "response could not be read safely without retry: {error}"
            ));
        }
    };
    gate.last_request_finished = Some(Instant::now());
    if bambu_response_is_blocking(status, &body) {
        gate.blocked_until = Some(Instant::now() + CATALOG_BLOCK_COOLDOWN);
    }
    Ok(DiscoveryHttpResponse {
        status,
        content_type,
        final_url,
        body,
    })
}

fn bambu_response_is_blocking(status: u16, body: &str) -> bool {
    matches!(status, 403 | 429 | 503) || body_looks_like_anti_bot_challenge(body)
}

fn discover_bambu_material_channels_with_fetch<F>(
    base_urls: &[String],
    collection_handle: &str,
    pause_between_pages: bool,
    mut fetch: F,
) -> Result<BambuCatalogSourceDiscovery, String>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    if base_urls.is_empty() {
        return Err("Bambu material discovery has no storefront candidates.".to_string());
    }
    if collection_handle.trim().is_empty() {
        return Err("Bambu material discovery has no collection handle.".to_string());
    }

    let mut request_count = 0usize;
    let mut unavailable_reasons = Vec::new();
    for base_url in base_urls {
        match discover_bambu_material_channels_from_store(
            base_url,
            collection_handle,
            &mut request_count,
            pause_between_pages,
            &mut fetch,
        ) {
            Ok(snapshot) => return Ok(snapshot),
            Err(DiscoveryAttemptError::Inconclusive(message)) => return Err(message),
            Err(DiscoveryAttemptError::Unavailable(message)) => {
                unavailable_reasons.push(message);
            }
        }
    }

    Err(format!(
        "Bambu material discovery was inconclusive: no storefront returned a complete collection listing. {}",
        unavailable_reasons.join(" ")
    ))
}

fn discover_bambu_material_channels_from_store<F>(
    base_url: &str,
    collection_handle: &str,
    request_count: &mut usize,
    pause_between_pages: bool,
    fetch: &mut F,
) -> Result<BambuCatalogSourceDiscovery, DiscoveryAttemptError>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    let source = DetectStoreResult {
        base_url: normalize_base_url(base_url),
        handle: collection_handle.to_string(),
    };
    let collection = fetch_complete_bambu_collection_core(
        &source,
        pause_between_pages,
        request_count,
        DISCOVERY_MAX_REQUESTS,
        DISCOVERY_MAX_PAGES_PER_STORE,
        fetch,
    )
    .map_err(|error| {
        if error.first_page_unavailable {
            DiscoveryAttemptError::Unavailable(error.message)
        } else {
            DiscoveryAttemptError::Inconclusive(format!(
                "{} Previous channels were left unchanged.",
                error.message
            ))
        }
    })?;

    let discovered_materials = usable_materials_from_products(&collection.products);
    if discovered_materials.is_empty() {
        return Err(DiscoveryAttemptError::Inconclusive(format!(
            "Bambu material discovery could not infer any safely bounded material families at {}. Previous channels were left unchanged.",
            collection.base_url
        )));
    }
    let output = format!(
        "Detected store: {}\nDetected collection: {collection_handle}\nProducts discovered: {}\nDetail fetches: 0\nDiscovered materials: {}\nDiscovery quality: complete\n",
        collection.base_url,
        collection.products.len(),
        discovered_materials.join(", ")
    );
    Ok(BambuCatalogSourceDiscovery {
        detected_store: collection.base_url,
        detected_collection: collection_handle.to_string(),
        products_discovered: collection.products.len() as i64,
        discovered_materials,
        detail_fetches: 0,
        output,
    })
}

fn body_looks_like_anti_bot_challenge(body: &str) -> bool {
    let lowered: String = body
        .chars()
        .take(32 * 1024)
        .collect::<String>()
        .to_ascii_lowercase();
    [
        "attention required",
        "access denied",
        "complete the captcha",
        "solve the captcha",
        "captcha verification",
        "cf-chl-",
        "cf-mitigated",
        "just a moment",
        "rate limit",
        "too many requests",
        "verify you are human",
    ]
    .iter()
    .any(|signal| lowered.contains(signal))
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())
}

fn read_bounded_utf8_response<R: Read>(
    reader: &mut R,
    content_length: Option<u64>,
    max_bytes: u64,
) -> Result<String, String> {
    if content_length.is_some_and(|length| length > max_bytes) {
        return Err(format!(
            "declared response size exceeded the {max_bytes}-byte safety limit"
        ));
    }

    let initial_capacity = content_length.unwrap_or(0).min(max_bytes) as usize;
    let mut bytes = Vec::with_capacity(initial_capacity);
    reader
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| format!("response body read failed: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "response body exceeded the {max_bytes}-byte safety limit"
        ));
    }
    String::from_utf8(bytes).map_err(|_| "response body was not valid UTF-8".to_string())
}

fn normalize_base_url(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn sleep_with_jitter(base_ms: u64, jitter_ms: u64) {
    let jitter = if jitter_ms == 0 {
        0
    } else {
        rand::rng().random_range(0..=jitter_ms)
    };
    thread::sleep(Duration::from_millis(base_ms.saturating_add(jitter)));
}

fn is_anti_bot_or_rate_limited(status: u16) -> bool {
    status == 429 || status == 403 || status == 503
}

fn normalize_material_filters(material_filters: Option<Vec<String>>) -> Vec<String> {
    let mut values: Vec<String> = material_filters
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_uppercase())
        .filter(|value| !value.is_empty())
        .collect();
    values.sort();
    values.dedup();
    values
}

fn is_known_bambu_material(material: &str) -> bool {
    bambu_material_families()
        .iter()
        .any(|family| family.material.eq_ignore_ascii_case(material.trim()))
}

/// Returns only official material families exposed by a bounded number of
/// single-filament collection summaries. Discovery deliberately does not open
/// product pages; exact colors are resolved only for the one selected family.
fn usable_materials_from_products(products: &[BambuCollectionProduct]) -> Vec<String> {
    let mut materials: Vec<String> = bambu_material_families()
        .iter()
        .filter(|family| {
            let count = products
                .iter()
                .filter(|product| {
                    is_supported_single_filament_product(&product.name)
                        && infer_material(&product.name).eq_ignore_ascii_case(&family.material)
                })
                .count();
            count > 0 && count <= TARGETED_DETAIL_MAX_REQUESTS
        })
        .map(|family| family.material.clone())
        .collect();
    materials.sort();
    materials
}

fn is_supported_single_filament_product(name: &str) -> bool {
    let lowered = name.trim().to_ascii_lowercase();
    !lowered.is_empty()
        && ![
            "bundle",
            "combo",
            "sample",
            "swatch",
            "starter kit",
            "trial set",
            "variety pack",
            "reusable spool",
            "empty spool",
        ]
        .iter()
        .any(|marker| lowered.contains(marker))
}

const BAMBU_MATERIAL_FAMILIES_JSON: &str = include_str!("../data/bambu_material_families.json");

#[derive(Debug, Deserialize)]
struct BambuMaterialFamily {
    material: String,
    prefixes: Vec<String>,
}

static BAMBU_MATERIAL_FAMILIES: OnceLock<Vec<BambuMaterialFamily>> = OnceLock::new();

fn bambu_material_families() -> &'static [BambuMaterialFamily] {
    BAMBU_MATERIAL_FAMILIES
        .get_or_init(|| {
            serde_json::from_str(BAMBU_MATERIAL_FAMILIES_JSON)
                .expect("Bambu material family table must be valid JSON")
        })
        .as_slice()
}

fn infer_material(filament_name: &str) -> String {
    let upper = filament_name.trim().to_uppercase();
    for family in bambu_material_families() {
        for prefix in &family.prefixes {
            if upper.starts_with(&prefix.to_uppercase()) {
                return family.material.clone();
            }
        }
    }

    upper
        .split_whitespace()
        .next()
        .unwrap_or("UNKNOWN")
        .to_string()
}

const OFFICIAL_BAMBU_HEX_CODES_JSON: &str = include_str!("../data/bambu_official_hex_codes.json");

#[derive(Debug, Deserialize)]
struct OfficialBambuHexCode {
    filament: String,
    color: String,
    hex: String,
    kind: Option<String>,
    colors: Option<Vec<String>>,
}

static OFFICIAL_BAMBU_HEX_CODES: OnceLock<Vec<OfficialBambuHexCode>> = OnceLock::new();

fn official_bambu_hex_codes() -> &'static [OfficialBambuHexCode] {
    OFFICIAL_BAMBU_HEX_CODES
        .get_or_init(|| {
            serde_json::from_str(OFFICIAL_BAMBU_HEX_CODES_JSON)
                .expect("official Bambu hex code table must be valid JSON")
        })
        .as_slice()
}

fn official_key(value: &str) -> String {
    let key: String = value
        .replace('+', " plus ")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect();
    key.replace("colour", "color")
}

fn color_name_without_code(color_name: &str) -> &str {
    let trimmed = color_name.trim();
    if trimmed.ends_with(')')
        && let Some((name, _code)) = trimmed.rsplit_once('(')
    {
        return name.trim();
    }
    trimmed
}

fn official_color_key(filament_name: &str, color_name: &str) -> String {
    let filament_key = official_key(filament_name);
    let mut color = color_name_without_code(color_name).trim();
    if let Some(rest) = strip_leading_label(color, filament_name) {
        color = rest;
    }
    if filament_key == "plamatte" {
        color = color
            .strip_prefix("Matte ")
            .or_else(|| color.strip_prefix("matte "))
            .unwrap_or(color)
            .trim();
    }
    official_key(color)
}

fn strip_leading_label<'a>(value: &'a str, label: &str) -> Option<&'a str> {
    let trimmed = value.trim();
    let label = label.trim();
    if label.is_empty() || trimmed.len() <= label.len() {
        return None;
    }
    let prefix = trimmed.get(..label.len())?;
    if !prefix.eq_ignore_ascii_case(label) {
        return None;
    }
    let rest = trimmed.get(label.len()..)?.trim_start();
    let rest = rest
        .strip_prefix(['-', '·', ':'])
        .unwrap_or(rest)
        .trim_start();
    if rest.is_empty() {
        None
    } else {
        Some(rest)
    }
}

fn official_filament_key_candidates(filament_name: &str) -> Vec<String> {
    let filament_key = official_key(filament_name);
    let mut candidates = vec![filament_key.clone()];
    if filament_key == "tpu85atpu90a" {
        candidates.push("tpu85a".to_string());
        candidates.push("tpu90a".to_string());
    }
    candidates
}

fn official_bambu_hex(filament_name: &str, color_name: &str) -> Option<String> {
    let filament_keys = official_filament_key_candidates(filament_name);
    let color_key = official_color_key(filament_name, color_name);
    official_bambu_hex_codes()
        .iter()
        .find(|entry| {
            filament_keys.iter().any(|key| key == &entry.filament) && entry.color == color_key
        })
        .map(official_bambu_swatch_value)
}

pub(crate) fn official_bambu_composite_swatch_update(
    filament_name: &str,
    color_name: &str,
) -> Option<(String, String)> {
    let filament_keys = official_filament_key_candidates(filament_name);
    let color_key = official_color_key(filament_name, color_name);
    official_bambu_hex_codes()
        .iter()
        .find(|entry| {
            filament_keys.iter().any(|key| key == &entry.filament) && entry.color == color_key
        })
        .and_then(|entry| {
            entry
                .colors
                .as_ref()
                .filter(|colors| colors.len() > 1)
                .map(|_| (entry.hex.clone(), official_bambu_swatch_value(entry)))
        })
}

fn official_bambu_swatch_value(entry: &OfficialBambuHexCode) -> String {
    let Some(colors) = entry.colors.as_ref().filter(|colors| colors.len() > 1) else {
        return entry.hex.clone();
    };
    let kind = match entry.kind.as_deref() {
        Some("multi") => "multi",
        Some("gradient") => "gradient",
        _ => "gradient",
    };
    format!("{kind}({})", colors.join(","))
}

fn resolve_bambu_hex(filament_name: &str, color_name: &str) -> Option<String> {
    official_bambu_hex(filament_name, color_name).or_else(|| estimate_hex(color_name))
}

fn estimate_hex(color_name: &str) -> Option<String> {
    let value = color_name.to_lowercase();
    let rules: [(&str, &str); 13] = [
        ("black|carbon|charcoal", "#111111"),
        ("white|ivory|cream", "#f5f5f5"),
        ("gray|grey", "#8a8a8a"),
        ("red|crimson|maroon", "#b00020"),
        ("orange|amber", "#f57c00"),
        ("yellow|gold", "#f9c74f"),
        ("green|emerald|olive|jade", "#2e7d32"),
        ("blue|navy|azure", "#1976d2"),
        ("purple|violet", "#7b1fa2"),
        ("pink|magenta", "#d81b60"),
        ("brown|chocolate|copper", "#8d6e63"),
        ("silver|metal|steel", "#b0bec5"),
        ("transparent|translucent|clear", "#e0f7fa"),
    ];

    for (keywords, hex) in rules {
        if keywords.split('|').any(|keyword| value.contains(keyword)) {
            return Some(hex.to_string());
        }
    }

    Some("#777777".to_string())
}

fn normalize_maybe_url(url: Option<&str>, base_url: &str) -> Option<String> {
    let raw = url?.trim();
    if raw.is_empty() {
        return None;
    }
    Url::parse(raw)
        .or_else(|_| {
            Url::parse(&format!(
                "{}/{}",
                base_url.trim_end_matches('/'),
                raw.trim_start_matches('/')
            ))
        })
        .map(|url| url.to_string())
        .ok()
}

fn build_product_url(base_url: &str, handle: &str) -> String {
    format!(
        "{}/products/{}",
        normalize_base_url(base_url),
        handle.trim_matches('/')
    )
}

fn validate_bambu_html_response(
    response: &DiscoveryHttpResponse,
    context: &str,
) -> Result<(), String> {
    if body_looks_like_anti_bot_challenge(&response.body) {
        return Err(format!(
            "encountered a challenge page while reading {context}"
        ));
    }
    if is_anti_bot_or_rate_limited(response.status) {
        return Err(format!(
            "was blocked or rate-limited while reading {context} (HTTP {})",
            response.status
        ));
    }
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "received HTTP {} while reading {context}",
            response.status
        ));
    }
    if response
        .content_type
        .as_deref()
        .is_some_and(|content_type| {
            let content_type = content_type.to_ascii_lowercase();
            !content_type.contains("text/html") && !content_type.contains("application/xhtml+xml")
        })
    {
        return Err(format!(
            "received an unexpected content type while reading {context}"
        ));
    }
    Ok(())
}

fn parse_bambu_product_group_entries(
    body: &str,
    summary: &BambuCollectionProduct,
    selected_material: &str,
    base_url: &str,
    response_final_url: &str,
) -> Result<Vec<BambuCatalogEntry>, String> {
    let values = extract_json_ld_values(body)?;
    let mut groups = Vec::new();
    for value in &values {
        collect_json_ld_product_groups(value, &mut groups);
    }
    if groups.len() != 1 {
        return Err(format!(
            "expected exactly one JSON-LD ProductGroup, found {}",
            groups.len()
        ));
    }
    let group: BambuJsonLdProductGroup = serde_json::from_value(
        groups
            .pop()
            .expect("exactly one JSON-LD ProductGroup was validated"),
    )
    .map_err(|_| "invalid JSON-LD ProductGroup".to_string())?;
    let filament_name = group.name.trim();
    if filament_name.is_empty() || !filament_name.eq_ignore_ascii_case(summary.name.trim()) {
        return Err("JSON-LD product name did not match the collection summary".to_string());
    }
    if !infer_material(filament_name).eq_ignore_ascii_case(selected_material) {
        return Err("JSON-LD product did not match the selected material family".to_string());
    }
    if group.variants.is_empty() {
        return Err("JSON-LD ProductGroup contained no variants".to_string());
    }

    let fallback_url = build_product_url(base_url, &summary.handle);
    let product_url = if group.url.trim().is_empty() {
        same_store_url(response_final_url, base_url).unwrap_or(fallback_url)
    } else {
        same_store_url(&group.url, base_url)
            .ok_or_else(|| "JSON-LD product URL did not match the detected store".to_string())?
    };
    let material = infer_material(filament_name);
    let mut entries: Vec<BambuCatalogEntry> = Vec::new();
    for variant in group.variants {
        if variant.sku.trim().is_empty() || variant.name.trim().is_empty() {
            return Err("JSON-LD ProductGroup contained an incomplete variant".to_string());
        }
        let (color_name, default_weight_g) =
            parse_bambu_variant_name(filament_name, &variant.name)?;
        let image_url = json_ld_image_url(&variant.image, base_url);
        if let Some(existing) = entries
            .iter_mut()
            .find(|entry| entry.color_name.eq_ignore_ascii_case(&color_name))
        {
            if existing.default_weight_g != default_weight_g {
                return Err(format!(
                    "JSON-LD variants for color '{color_name}' had conflicting weights"
                ));
            }
            if existing.image_url.is_none() {
                existing.image_url = image_url;
            }
            continue;
        }
        entries.push(BambuCatalogEntry {
            material: material.clone(),
            filament_name: filament_name.to_string(),
            color_name: color_name.clone(),
            hex_color: resolve_bambu_hex(filament_name, &color_name),
            image_url,
            product_url: product_url.clone(),
            default_weight_g,
        });
    }
    if entries.is_empty() {
        return Err("JSON-LD ProductGroup produced no exact colors".to_string());
    }
    Ok(entries)
}

fn extract_json_ld_values(body: &str) -> Result<Vec<Value>, String> {
    let lowered = body.to_ascii_lowercase();
    let mut values = Vec::new();
    let mut search_from = 0usize;
    while let Some(relative_start) = lowered[search_from..].find("<script") {
        let tag_start = search_from + relative_start;
        let Some(relative_tag_end) = lowered[tag_start..].find('>') else {
            return Err("unterminated JSON-LD script tag".to_string());
        };
        let tag_end = tag_start + relative_tag_end;
        let tag = &lowered[tag_start..=tag_end];
        let Some(relative_script_end) = lowered[tag_end + 1..].find("</script>") else {
            return Err("unterminated script element".to_string());
        };
        let script_end = tag_end + 1 + relative_script_end;
        if tag.contains("application/ld+json") {
            let raw = body[tag_end + 1..script_end].trim();
            if raw.is_empty() {
                return Err("empty JSON-LD script".to_string());
            }
            values
                .push(serde_json::from_str(raw).map_err(|_| "invalid JSON-LD script".to_string())?);
        }
        search_from = script_end + "</script>".len();
    }
    if values.is_empty() {
        return Err("missing JSON-LD product data".to_string());
    }
    Ok(values)
}

fn collect_json_ld_product_groups(value: &Value, groups: &mut Vec<Value>) {
    match value {
        Value::Object(object) => {
            if object
                .get("@type")
                .is_some_and(|value| json_ld_type_matches(value, "ProductGroup"))
            {
                groups.push(value.clone());
                return;
            }
            for nested in object.values() {
                collect_json_ld_product_groups(nested, groups);
            }
        }
        Value::Array(values) => {
            for nested in values {
                collect_json_ld_product_groups(nested, groups);
            }
        }
        _ => {}
    }
}

fn json_ld_type_matches(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(value) => value.eq_ignore_ascii_case(expected),
        Value::Array(values) => values
            .iter()
            .any(|value| json_ld_type_matches(value, expected)),
        _ => false,
    }
}

fn parse_bambu_variant_name(
    filament_name: &str,
    variant_name: &str,
) -> Result<(String, i64), String> {
    let variant_name = variant_name.trim();
    let prefix_length = filament_name.trim().len();
    let Some(prefix) = variant_name.get(..prefix_length) else {
        return Err(format!(
            "variant '{variant_name}' did not start with product name '{filament_name}'"
        ));
    };
    if variant_name.len() <= prefix_length || !prefix.eq_ignore_ascii_case(filament_name.trim()) {
        return Err(format!(
            "variant '{variant_name}' did not start with product name '{filament_name}'"
        ));
    }
    let remainder = variant_name
        .get(prefix_length..)
        .expect("validated prefix ended on a character boundary")
        .trim_start();
    let remainder = remainder
        .strip_prefix('-')
        .ok_or_else(|| format!("variant '{variant_name}' omitted its color separator"))?
        .trim_start();
    let segments: Vec<&str> = remainder
        .split(" / ")
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect();
    let color_name = segments
        .first()
        .copied()
        .filter(|color| !color.is_empty())
        .ok_or_else(|| format!("variant '{variant_name}' omitted its color"))?;
    let default_weight_g = segments
        .iter()
        .skip(1)
        .find_map(|segment| parse_weight_grams(segment))
        .unwrap_or(DEFAULT_WEIGHT_G);
    Ok((color_name.to_string(), default_weight_g))
}

fn parse_weight_grams(value: &str) -> Option<i64> {
    let compact = value.trim().to_ascii_lowercase().replace(' ', "");
    let grams = if let Some(number) = compact.strip_suffix("kg") {
        number.parse::<f64>().ok()? * 1000.0
    } else {
        let number = compact.strip_suffix('g')?;
        number.parse::<f64>().ok()?
    };
    if !grams.is_finite() || !(1.0..=10_000.0).contains(&grams) {
        return None;
    }
    Some(grams.round() as i64)
}

fn json_ld_image_url(image: &Value, base_url: &str) -> Option<String> {
    match image {
        Value::String(value) => normalize_maybe_url(Some(value), base_url),
        Value::Array(values) => values
            .iter()
            .find_map(|value| json_ld_image_url(value, base_url)),
        Value::Object(object) => object
            .get("url")
            .or_else(|| object.get("contentUrl"))
            .and_then(|value| json_ld_image_url(value, base_url)),
        _ => None,
    }
}

fn same_store_url(value: &str, base_url: &str) -> Option<String> {
    let normalized = normalize_maybe_url(Some(value), base_url)?;
    let parsed = Url::parse(&normalized).ok()?;
    let base = Url::parse(base_url).ok()?;
    if parsed.origin() == base.origin() {
        Some(parsed.to_string())
    } else {
        None
    }
}

fn ensure_unique_entries(
    entries: Vec<BambuCatalogEntry>,
) -> Result<Vec<BambuCatalogEntry>, String> {
    let mut seen = HashSet::new();
    for entry in &entries {
        let key = format!(
            "{}::{}::{}",
            entry.material.trim().to_uppercase(),
            entry.filament_name.trim().to_lowercase(),
            entry.color_name.trim().to_lowercase()
        );
        if !seen.insert(key) {
            return Err(
                "Bambu refresh returned duplicate catalog entries; catalog mutation was skipped."
                    .to_string(),
            );
        }
    }
    Ok(entries)
}

#[cfg(test)]
#[path = "bambu_lookup_tests.rs"]
mod tests;
