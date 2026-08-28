use rand::RngExt;
use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
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
const CATALOG_MIN_REQUEST_INTERVAL: Duration = Duration::from_secs(2);
const CATALOG_BLOCK_COOLDOWN: Duration = Duration::from_secs(5 * 60);
const DISCOVERY_MAX_PAGES_PER_STORE: usize = 4;
const DISCOVERY_MAX_REQUESTS: usize = 6;
const DISCOVERY_PAGE_DELAY_MS: u64 = 350;
const DISCOVERY_PAGE_DELAY_JITTER_MS: u64 = 250;
const TARGETED_REFRESH_MAX_PAGES: usize = 4;
const TARGETED_REFRESH_MAX_REQUESTS: usize = 4;

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

#[derive(Clone, Deserialize)]
struct ShopifyImage {
    src: Option<String>,
}

#[derive(Clone, Deserialize)]
struct ShopifyVariant {
    id: Option<u64>,
    option1: Option<String>,
    featured_image: Option<ShopifyImage>,
}

#[derive(Clone, Deserialize)]
struct ShopifyOption {
    name: String,
}

#[derive(Clone, Deserialize)]
struct ShopifyProduct {
    title: String,
    handle: String,
    options: Option<Vec<ShopifyOption>>,
    images: Option<Vec<ShopifyImage>>,
    image: Option<ShopifyImage>,
    variants: Option<Vec<ShopifyVariant>>,
}

#[derive(Deserialize)]
struct ShopifyProductsResponse {
    products: Option<Vec<ShopifyProduct>>,
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
    let products =
        fetch_complete_bambu_collection_with_fetch(source, pause_between_pages, &mut fetch)?;
    let discovered_materials = usable_materials_from_products(&products, &source.base_url);
    let selected_products: Vec<&ShopifyProduct> = products
        .iter()
        .filter(|product| infer_material(&product.title).eq_ignore_ascii_case(material))
        .collect();
    if selected_products.is_empty() {
        return Err(format!(
            "Bambu refresh found no products for selected material family {material}; catalog mutation was skipped."
        ));
    }

    let mut entries = Vec::new();
    for product in selected_products {
        let product_entries = extract_colors(product, &source.base_url);
        if product_entries.is_empty() {
            return Err(format!(
                "Bambu refresh could not completely decode selected product '{}'; catalog mutation was skipped.",
                product.handle
            ));
        }
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
        detected_store: source.base_url.clone(),
        detected_collection: source.handle.clone(),
        discovered_materials,
        warnings: Vec::new(),
        anti_bot_blocks: 0,
        products_discovered: products.len() as i64,
        products_detailed: 0,
        reused_cached_products: 0,
        detail_fetches: 0,
        partial: false,
    })
}

/// Discovers the material families currently exposed by the Bambu storefront.
///
/// This operation is intentionally read-only and bounded. It only reads the
/// Shopify collection product listing, never opens individual product pages,
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
) -> Result<Vec<ShopifyProduct>, String>
where
    F: FnMut(&str) -> Result<DiscoveryHttpResponse, String>,
{
    let mut products = Vec::new();
    let mut seen_handles = HashSet::new();
    for (request_index, page) in (1..=TARGETED_REFRESH_MAX_PAGES).enumerate() {
        if request_index >= TARGETED_REFRESH_MAX_REQUESTS {
            return Err(format!(
                "Bambu refresh stopped after its {TARGETED_REFRESH_MAX_REQUESTS}-request safety budget; catalog mutation was skipped."
            ));
        }
        if pause_between_pages && page > 1 {
            sleep_with_jitter(DISCOVERY_PAGE_DELAY_MS, DISCOVERY_PAGE_DELAY_JITTER_MS);
        }

        let url = format!(
            "{}/collections/{}/products.json?limit=250&page={page}",
            source.base_url, source.handle
        );
        let response = fetch(&url).map_err(|error| {
            format!(
                "Bambu refresh lost its collection listing at page {page} ({error}); catalog mutation was skipped."
            )
        })?;
        if body_looks_like_anti_bot_challenge(&response.body) {
            return Err(
                "Bambu refresh encountered a challenge page; catalog mutation was skipped."
                    .to_string(),
            );
        }
        if is_anti_bot_or_rate_limited(response.status) {
            return Err(format!(
                "Bambu refresh was blocked or rate-limited (HTTP {}); catalog mutation was skipped.",
                response.status
            ));
        }
        if !(200..300).contains(&response.status) {
            return Err(format!(
                "Bambu refresh received HTTP {} at collection page {page}; catalog mutation was skipped.",
                response.status
            ));
        }

        let parsed: ShopifyProductsResponse = serde_json::from_str(&response.body).map_err(|_| {
            format!(
                "Bambu refresh received invalid collection JSON at page {page}; catalog mutation was skipped."
            )
        })?;
        let page_products = parsed.products.ok_or_else(|| {
            format!(
                "Bambu refresh response omitted the product list at page {page}; catalog mutation was skipped."
            )
        })?;
        if page_products.is_empty() {
            if page == 1 {
                return Err(
                    "Bambu refresh found an empty collection; catalog mutation was skipped."
                        .to_string(),
                );
            }
            return Ok(products);
        }

        for product in page_products {
            let handle = product.handle.trim();
            let title = product.title.trim();
            if handle.is_empty() || title.is_empty() {
                return Err(format!(
                    "Bambu refresh received an invalid product summary at page {page}; catalog mutation was skipped."
                ));
            }
            if !seen_handles.insert(handle.to_ascii_lowercase()) {
                return Err(format!(
                    "Bambu refresh pagination repeated product '{handle}' at page {page}; catalog mutation was skipped."
                ));
            }
            products.push(product);
        }
    }

    Err(format!(
        "Bambu refresh did not reach the end of the collection within its {TARGETED_REFRESH_MAX_PAGES}-page safety budget; catalog mutation was skipped."
    ))
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
    if snapshot.products_detailed != 0
        || snapshot.detail_fetches != 0
        || snapshot.reused_cached_products != 0
    {
        return Err(
            "Bambu refresh used a legacy detail or cached-product path; catalog mutation was skipped."
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

    let response = match client
        .get(url)
        .header("Accept", "application/json")
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
    let body = match response.text() {
        Ok(body) => body,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!("response could not be read without retry: {error}"));
        }
    };
    gate.last_request_finished = Some(Instant::now());
    if bambu_response_is_blocking(status, &body) {
        gate.blocked_until = Some(Instant::now() + CATALOG_BLOCK_COOLDOWN);
    }
    Ok(DiscoveryHttpResponse { status, body })
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
    let mut seen_handles = HashSet::new();
    let mut products_discovered: Vec<ShopifyProduct> = Vec::new();

    for page in 1..=DISCOVERY_MAX_PAGES_PER_STORE {
        if *request_count >= DISCOVERY_MAX_REQUESTS {
            return Err(DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery stopped after its {DISCOVERY_MAX_REQUESTS}-request safety budget. Previous channels were left unchanged."
            )));
        }
        if pause_between_pages && page > 1 {
            sleep_with_jitter(DISCOVERY_PAGE_DELAY_MS, DISCOVERY_PAGE_DELAY_JITTER_MS);
        }

        let url = format!(
            "{base_url}/collections/{collection_handle}/products.json?limit=250&page={page}"
        );
        *request_count += 1;
        let response = fetch(&url).map_err(|error| {
            let message = format!("{base_url}: {error}");
            if page == 1 {
                DiscoveryAttemptError::Unavailable(message)
            } else {
                DiscoveryAttemptError::Inconclusive(format!(
                    "Bambu material discovery lost pagination at page {page} ({message}). Previous channels were left unchanged."
                ))
            }
        })?;

        if body_looks_like_anti_bot_challenge(&response.body) {
            return Err(DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery encountered a challenge page at {base_url}. Previous channels were left unchanged."
            )));
        }
        if is_anti_bot_or_rate_limited(response.status) {
            return Err(DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery was blocked or rate-limited at {base_url} (HTTP {}). Previous channels were left unchanged.",
                response.status
            )));
        }
        if !(200..300).contains(&response.status) {
            let message = format!("{base_url}: HTTP {}", response.status);
            if page == 1 {
                return Err(DiscoveryAttemptError::Unavailable(message));
            }
            return Err(DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery received an incomplete listing at page {page} ({message}). Previous channels were left unchanged."
            )));
        }

        let parsed: ShopifyProductsResponse = serde_json::from_str(&response.body).map_err(|_| {
            DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery received invalid collection JSON from {base_url}. Previous channels were left unchanged."
            ))
        })?;
        let products = parsed.products.ok_or_else(|| {
            DiscoveryAttemptError::Inconclusive(format!(
                "Bambu material discovery response from {base_url} omitted the product list. Previous channels were left unchanged."
            ))
        })?;

        if products.is_empty() {
            if page == 1 {
                return Err(DiscoveryAttemptError::Inconclusive(format!(
                    "Bambu material discovery found an empty collection at {base_url}. Previous channels were left unchanged."
                )));
            }
            let discovered_materials =
                usable_materials_from_products(&products_discovered, base_url);
            if discovered_materials.is_empty() {
                return Err(DiscoveryAttemptError::Inconclusive(format!(
                    "Bambu material discovery could not infer material families at {base_url}. Previous channels were left unchanged."
                )));
            }
            let output = format!(
                "Detected store: {base_url}\nDetected collection: {collection_handle}\nProducts discovered: {}\nDetail fetches: 0\nDiscovered materials: {}\nDiscovery quality: complete\n",
                seen_handles.len(),
                discovered_materials.join(", ")
            );
            return Ok(BambuCatalogSourceDiscovery {
                detected_store: base_url.to_string(),
                detected_collection: collection_handle.to_string(),
                products_discovered: seen_handles.len() as i64,
                discovered_materials,
                detail_fetches: 0,
                output,
            });
        }

        for product in products {
            let handle = product.handle.trim();
            let title = product.title.trim();
            if handle.is_empty() || title.is_empty() {
                return Err(DiscoveryAttemptError::Inconclusive(format!(
                    "Bambu material discovery received an invalid product summary from {base_url}. Previous channels were left unchanged."
                )));
            }
            if !seen_handles.insert(handle.to_ascii_lowercase()) {
                return Err(DiscoveryAttemptError::Inconclusive(format!(
                    "Bambu material discovery pagination repeated product '{handle}' at page {page}. Previous channels were left unchanged."
                )));
            }
            products_discovered.push(product);
        }
    }

    Err(DiscoveryAttemptError::Inconclusive(format!(
        "Bambu material discovery did not reach the end of the collection within its {DISCOVERY_MAX_PAGES_PER_STORE}-page safety budget. Previous channels were left unchanged."
    )))
}

fn body_looks_like_anti_bot_challenge(body: &str) -> bool {
    let lowered = body.to_ascii_lowercase();
    [
        "attention required",
        "access denied",
        "captcha",
        "cf-chl-",
        "cf-mitigated",
        "challenge-platform",
        "cloudflare",
        "just a moment",
        "rate limit",
        "too many requests",
        "verify you are human",
        "<!doctype html",
        "<html",
    ]
    .iter()
    .any(|signal| lowered.contains(signal))
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| error.to_string())
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

/// Returns only material families whose complete set of collection summaries
/// can be converted to catalog entries. This keeps accessories, unknown titles,
/// and partially described products from becoming permanently dead UI channels.
fn usable_materials_from_products(products: &[ShopifyProduct], base_url: &str) -> Vec<String> {
    #[derive(Default)]
    struct MaterialQuality {
        usable: bool,
        entry_keys: HashSet<String>,
    }

    let mut quality_by_material: HashMap<String, MaterialQuality> = HashMap::new();
    for product in products {
        let material = infer_material(&product.title);
        if !is_known_bambu_material(&material) {
            continue;
        }

        let material_key = material.to_uppercase();
        let quality = quality_by_material
            .entry(material_key)
            .or_insert_with(|| MaterialQuality {
                usable: true,
                entry_keys: HashSet::new(),
            });
        if !quality.usable {
            continue;
        }

        let entries = extract_colors(product, base_url);
        if entries.is_empty()
            || entries
                .iter()
                .any(|entry| !entry.material.eq_ignore_ascii_case(&material))
        {
            quality.usable = false;
            continue;
        }
        for entry in entries {
            let key = format!(
                "{}::{}::{}",
                entry.material.trim().to_uppercase(),
                entry.filament_name.trim().to_lowercase(),
                entry.color_name.trim().to_lowercase()
            );
            if !quality.entry_keys.insert(key) {
                quality.usable = false;
                break;
            }
        }
    }

    let mut materials: Vec<String> = bambu_material_families()
        .iter()
        .filter(|family| {
            quality_by_material
                .get(&family.material.to_uppercase())
                .is_some_and(|quality| quality.usable && !quality.entry_keys.is_empty())
        })
        .map(|family| family.material.clone())
        .collect();
    materials.sort();
    materials
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

fn parse_title_color(title: &str) -> Option<(String, String, String)> {
    let parts: Vec<&str> = title.split(" - ").collect();
    if parts.len() < 2 {
        return None;
    }
    let color_name = parts.last()?.trim();
    let filament_name = parts[..parts.len() - 1].join(" - ");
    let filament_name = filament_name.trim();
    if color_name.is_empty() || filament_name.is_empty() {
        return None;
    }
    let material = infer_material(filament_name);
    Some((material, filament_name.to_string(), color_name.to_string()))
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

fn select_image(product: &ShopifyProduct, variant: Option<&ShopifyVariant>) -> Option<String> {
    if let Some(src) = variant
        .and_then(|value| value.featured_image.as_ref())
        .and_then(|image| image.src.as_deref())
    {
        return Some(src.to_string());
    }
    if let Some(src) = product
        .image
        .as_ref()
        .and_then(|image| image.src.as_deref())
    {
        return Some(src.to_string());
    }
    product
        .images
        .as_ref()
        .and_then(|images| images.first())
        .and_then(|image| image.src.as_deref())
        .map(|src| src.to_string())
}

fn build_product_url(base_url: &str, handle: &str, variant_id: Option<u64>) -> String {
    match variant_id {
        Some(id) => format!("{base_url}/products/{handle}?variant={id}"),
        None => format!("{base_url}/products/{handle}"),
    }
}

fn extract_colors(product: &ShopifyProduct, base_url: &str) -> Vec<BambuCatalogEntry> {
    if let Some((material, filament_name, color_name)) = parse_title_color(&product.title) {
        let hex_color = resolve_bambu_hex(&filament_name, &color_name);
        return vec![BambuCatalogEntry {
            material,
            filament_name,
            color_name: color_name.clone(),
            hex_color,
            image_url: normalize_maybe_url(select_image(product, None).as_deref(), base_url),
            product_url: build_product_url(base_url, &product.handle, None),
            default_weight_g: DEFAULT_WEIGHT_G,
        }];
    }

    let has_color_option = product
        .options
        .as_ref()
        .map(|options| {
            options.iter().any(|option| {
                option.name.to_lowercase().contains("color")
                    || option.name.to_lowercase().contains("colour")
            })
        })
        .unwrap_or(false);
    if !has_color_option {
        return Vec::new();
    }

    let Some(variants) = product.variants.as_ref() else {
        return Vec::new();
    };

    let filament_name = product.title.trim().to_string();
    let material = infer_material(&filament_name);

    variants
        .iter()
        .filter_map(|variant| {
            let color_name = variant.option1.as_deref()?.trim();
            if color_name.is_empty() {
                return None;
            }
            Some(BambuCatalogEntry {
                material: material.clone(),
                filament_name: filament_name.clone(),
                color_name: color_name.to_string(),
                hex_color: resolve_bambu_hex(&filament_name, color_name),
                image_url: normalize_maybe_url(
                    select_image(product, Some(variant)).as_deref(),
                    base_url,
                ),
                product_url: build_product_url(base_url, &product.handle, variant.id),
                default_weight_g: DEFAULT_WEIGHT_G,
            })
        })
        .collect()
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
