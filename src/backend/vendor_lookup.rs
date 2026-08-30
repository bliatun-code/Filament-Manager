use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use crate::backend::app_metadata::CATALOG_USER_AGENT;
use crate::backend::vendor_lookup_parsing::*;

const ESUN_STORE_BASE_URL: &str = "https://esun3dstore.com";
const ESUN_MAGENTO_BASE_URL: &str = "https://www.esun3d.com";
const ESUN_MAGENTO_GRAPHQL_URL: &str = "https://www.esun3d.com/graphql";
const ESUN_MAGENTO_COLLECTION: &str = "categoryList(url_key=filaments)";
const ESUN_GRAPHQL_PAGE_SIZE: usize = 200;
const ESUN_GRAPHQL_MAX_REQUESTS_PER_OPERATION: usize = 1;
const ESUN_GRAPHQL_MIN_REQUEST_INTERVAL: Duration = Duration::from_secs(2);
const ESUN_GRAPHQL_BLOCK_COOLDOWN: Duration = Duration::from_secs(5 * 60);
const ESUN_DISCOVERY_QUERY: &str = r#"
query EsunFilamentDiscovery($pageSize: Int!) {
  categoryList(filters: { url_key: { eq: "filaments" } }) {
    url_key
    products(pageSize: $pageSize, currentPage: 1) {
      total_count
      page_info {
        current_page
        total_pages
        page_size
      }
      items {
        __typename
        uid
        sku
        name
        url_key
        url_suffix
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code
            label
            values {
              label
              swatch_data {
                value
              }
            }
          }
        }
      }
    }
  }
}
"#;
const ESUN_SCOPED_CATALOG_QUERY: &str = r#"
query EsunFilamentMaterial($pageSize: Int!) {
  categoryList(filters: { url_key: { eq: "filaments" } }) {
    url_key
    products(pageSize: $pageSize, currentPage: 1) {
      total_count
      page_info {
        current_page
        total_pages
        page_size
      }
      items {
        __typename
        uid
        sku
        name
        url_key
        url_suffix
        image {
          url
        }
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code
            label
            values {
              label
              swatch_data {
                value
              }
            }
          }
        }
      }
    }
  }
}
"#;
const ESUN_USER_AGENT: &str = CATALOG_USER_AGENT;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunSearchResult {
    pub handle: String,
    pub title: String,
    pub filament_name: String,
    pub material: String,
    pub product_url: String,
    pub image_url: Option<String>,
    pub default_weight_g: Option<i64>,
    pub vendor: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunColorOption {
    pub color_name: String,
    pub hex_color: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunProductDetail {
    pub handle: String,
    pub title: String,
    pub filament_name: String,
    pub material: String,
    pub product_url: String,
    pub image_url: Option<String>,
    pub default_weight_g: Option<i64>,
    pub vendor: String,
    pub colors: Vec<EsunColorOption>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunCatalogEntry {
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub image_url: Option<String>,
    pub product_url: String,
    pub default_weight_g: i64,
}

#[derive(Clone, Debug)]
pub struct EsunKnownCatalogEntry {
    pub entry: EsunCatalogEntry,
    pub last_seen_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunCatalogRefreshSnapshot {
    pub entries: Vec<EsunCatalogEntry>,
    pub handles_found: i64,
    pub products_processed: i64,
    pub skipped_non_filament: i64,
    pub reused_cached_products: i64,
    pub detail_fetches: i64,
    pub warnings: Vec<String>,
    pub detected_store: String,
    pub detected_collection: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunCatalogSourceDiscovery {
    pub detected_store: String,
    pub detected_collection: String,
    pub products_discovered: i64,
    pub discovered_materials: Vec<String>,
    pub detail_fetches: i64,
    pub output: String,
}

#[derive(Debug, Default)]
struct EsunGraphqlRequestGate {
    last_request_finished: Option<Instant>,
    blocked_until: Option<Instant>,
}

static ESUN_GRAPHQL_REQUEST_GATE: OnceLock<Mutex<EsunGraphqlRequestGate>> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct EsunGraphqlEnvelope {
    data: Option<EsunGraphqlData>,
    #[serde(default)]
    errors: Vec<EsunGraphqlError>,
}

#[derive(Debug, Deserialize)]
struct EsunGraphqlError {
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct EsunGraphqlData {
    #[serde(rename = "categoryList", default)]
    category_list: Vec<EsunGraphqlCategory>,
}

#[derive(Debug, Deserialize)]
struct EsunGraphqlCategory {
    #[serde(default)]
    url_key: String,
    products: EsunGraphqlProducts,
}

#[derive(Debug, Deserialize)]
struct EsunGraphqlProducts {
    total_count: usize,
    page_info: EsunGraphqlPageInfo,
    #[serde(default)]
    items: Vec<Option<EsunGraphqlProduct>>,
}

#[derive(Debug, Deserialize)]
struct EsunGraphqlPageInfo {
    current_page: usize,
    total_pages: usize,
    page_size: usize,
}

#[derive(Clone, Debug, Deserialize)]
struct EsunGraphqlProduct {
    #[serde(rename = "__typename", default)]
    product_type: String,
    #[serde(default)]
    uid: String,
    #[serde(default)]
    sku: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    url_key: String,
    #[serde(default)]
    url_suffix: Option<String>,
    #[serde(default)]
    image: Option<EsunGraphqlImage>,
    #[serde(default)]
    configurable_options: Vec<EsunGraphqlConfigurableOption>,
}

#[derive(Clone, Debug, Deserialize)]
struct EsunGraphqlImage {
    #[serde(default)]
    url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct EsunGraphqlConfigurableOption {
    #[serde(default)]
    attribute_code: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    values: Vec<EsunGraphqlConfigurableValue>,
}

#[derive(Clone, Debug, Deserialize)]
struct EsunGraphqlConfigurableValue {
    #[serde(default)]
    label: String,
    #[serde(default)]
    swatch_data: Option<EsunGraphqlSwatchData>,
}

#[derive(Clone, Debug, Deserialize)]
struct EsunGraphqlSwatchData {
    #[serde(default)]
    value: String,
}

pub fn refresh_esun_catalog_snapshot(
    material_filters: Option<Vec<String>>,
    _known_entries: Option<Vec<EsunKnownCatalogEntry>>,
    _stale_before: Option<&str>,
) -> Result<EsunCatalogRefreshSnapshot, String> {
    let material_filters = normalize_material_filters(material_filters);
    let material = validate_single_esun_material_filter(&material_filters)?;
    let client = build_client()?;
    let response = fetch_esun_graphql_catalog(&client, ESUN_SCOPED_CATALOG_QUERY)?;
    let products = parse_esun_graphql_catalog_response(&response)?;
    build_esun_scoped_snapshot(products, material)
}

pub fn discover_esun_catalog_source() -> Result<EsunCatalogSourceDiscovery, String> {
    let client = build_client()?;
    let response = fetch_esun_graphql_catalog(&client, ESUN_DISCOVERY_QUERY)?;
    let products = parse_esun_graphql_catalog_response(&response)?;
    build_esun_source_discovery(&products)
}

pub fn search_esun_filaments(query: &str, limit: usize) -> Result<Vec<EsunSearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let client = build_client()?;
    let mut url =
        Url::parse(&format!("{ESUN_STORE_BASE_URL}/search")).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("type", "product")
        .append_pair("q", query);

    let html = fetch_text_with_client(&client, &url)?;
    Ok(parse_search_results(&html, limit.max(1)))
}

pub fn fetch_esun_product_detail(handle: &str) -> Result<EsunProductDetail, String> {
    let client = build_client()?;
    fetch_esun_product_detail_with_client(&client, handle)
}

fn fetch_esun_product_detail_with_client(
    client: &Client,
    handle: &str,
) -> Result<EsunProductDetail, String> {
    let handle = sanitize_handle(handle);
    if handle.is_empty() {
        return Err("Invalid eSUN product handle".to_string());
    }

    let url = Url::parse(&format!("{ESUN_STORE_BASE_URL}/products/{handle}"))
        .map_err(|error| error.to_string())?;
    let html = fetch_text_with_client(client, &url)?;

    let title = extract_meta_content(&html, "og:title")
        .map(|value| decode_html_entities(&value))
        .unwrap_or_else(|| format!("eSUN {}", handle.replace('-', " ")));
    let image_url = extract_meta_content(&html, "og:image").map(|value| normalize_url(&value));
    let material = infer_material(&title);
    let filament_name = infer_filament_name(&title);
    let default_weight_g = parse_weight_grams(&title);
    let colors =
        normalize_esun_color_options(parse_product_colors(&html), &material, &filament_name);

    Ok(EsunProductDetail {
        handle,
        title,
        filament_name,
        material,
        product_url: url.to_string(),
        image_url,
        default_weight_g,
        vendor: "eSUN".to_string(),
        colors,
    })
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(ESUN_USER_AGENT)
        .build()
        .map_err(|error| error.to_string())
}

#[derive(Debug)]
enum EsunGraphqlHttpError {
    Blocked(String),
    Failed(String),
}

impl EsunGraphqlHttpError {
    fn into_message(self) -> String {
        match self {
            Self::Blocked(message) | Self::Failed(message) => message,
        }
    }
}

fn fetch_esun_graphql_catalog(client: &Client, query: &str) -> Result<String, String> {
    debug_assert_eq!(ESUN_GRAPHQL_MAX_REQUESTS_PER_OPERATION, 1);

    let gate =
        ESUN_GRAPHQL_REQUEST_GATE.get_or_init(|| Mutex::new(EsunGraphqlRequestGate::default()));
    let mut gate = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    ensure_esun_request_gate_ready(&mut gate)?;
    wait_for_esun_request_interval(&gate);

    let payload = serde_json::json!({
        "query": query,
        "variables": { "pageSize": ESUN_GRAPHQL_PAGE_SIZE },
    });
    let payload = serde_json::to_string(&payload)
        .map_err(|error| format!("Could not encode eSUN GraphQL request: {error}"))?;

    let response = match client
        .post(ESUN_MAGENTO_GRAPHQL_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("Accept-Language", "en-US,en;q=0.9")
        .body(payload)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!(
                "eSUN GraphQL request failed without retry; local catalog data stays unchanged: {error}"
            ));
        }
    };

    let status_code = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body = match response.text() {
        Ok(body) => body,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!(
                "Could not read eSUN GraphQL response without retry; local catalog data stays unchanged: {error}"
            ));
        }
    };
    gate.last_request_finished = Some(Instant::now());

    if let Err(error) = validate_esun_graphql_http_response(status_code, &content_type, &body) {
        if matches!(error, EsunGraphqlHttpError::Blocked(_)) {
            gate.blocked_until = Some(Instant::now() + ESUN_GRAPHQL_BLOCK_COOLDOWN);
        }
        return Err(error.into_message());
    }

    Ok(body)
}

fn validate_esun_graphql_http_response(
    status_code: u16,
    content_type: &str,
    body: &str,
) -> Result<(), EsunGraphqlHttpError> {
    let body_lower = body.to_ascii_lowercase();
    let looks_html = content_type.to_ascii_lowercase().contains("text/html")
        || body_lower.trim_start().starts_with("<!doctype html")
        || body_lower.trim_start().starts_with("<html");
    let looks_challenged = [
        "just a moment",
        "cf-mitigated",
        "cloudflare",
        "attention required",
        "captcha",
        "access denied",
        "verify you are human",
        "too many requests",
        "rate limit",
    ]
    .iter()
    .any(|marker| body_lower.contains(marker));

    if matches!(status_code, 403 | 429 | 503) || looks_challenged || looks_html {
        return Err(EsunGraphqlHttpError::Blocked(format!(
            "eSUN GraphQL request was blocked or challenged (HTTP {status_code}); no retry was attempted and local catalog data stays unchanged."
        )));
    }
    if !(200..300).contains(&status_code) {
        return Err(EsunGraphqlHttpError::Failed(format!(
            "eSUN GraphQL request failed with HTTP {status_code}; no retry was attempted and local catalog data stays unchanged."
        )));
    }
    if !content_type
        .to_ascii_lowercase()
        .contains("application/json")
    {
        return Err(EsunGraphqlHttpError::Failed(format!(
            "eSUN GraphQL returned an unexpected content type ({content_type}); local catalog data stays unchanged."
        )));
    }
    if body.trim().is_empty() {
        return Err(EsunGraphqlHttpError::Failed(
            "eSUN GraphQL returned an empty response; local catalog data stays unchanged."
                .to_string(),
        ));
    }

    Ok(())
}

fn parse_esun_graphql_catalog_response(body: &str) -> Result<Vec<EsunGraphqlProduct>, String> {
    let envelope: EsunGraphqlEnvelope = serde_json::from_str(body).map_err(|error| {
        format!("eSUN GraphQL returned malformed JSON; local catalog data stays unchanged: {error}")
    })?;
    if !envelope.errors.is_empty() {
        let messages = envelope
            .errors
            .iter()
            .map(|error| normalize_whitespace(&error.message))
            .filter(|message| !message.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        let detail = if messages.is_empty() {
            "unspecified GraphQL error".to_string()
        } else {
            messages.join("; ")
        };
        return Err(format!(
            "eSUN GraphQL reported an error ({detail}); local catalog data stays unchanged."
        ));
    }

    let data = envelope.data.ok_or_else(|| {
        "eSUN GraphQL response had no data; local catalog data stays unchanged.".to_string()
    })?;
    let mut categories = data
        .category_list
        .into_iter()
        .filter(|category| category.url_key.eq_ignore_ascii_case("filaments"))
        .collect::<Vec<_>>();
    if categories.len() != 1 {
        return Err(format!(
            "eSUN GraphQL expected exactly one 'filaments' category, but received {}; local catalog data stays unchanged.",
            categories.len()
        ));
    }

    let products = categories.remove(0).products;
    if products.total_count == 0 {
        return Err(
            "eSUN GraphQL returned zero filament products; local catalog data stays unchanged."
                .to_string(),
        );
    }
    if products.total_count > ESUN_GRAPHQL_PAGE_SIZE {
        return Err(format!(
            "eSUN GraphQL reported {} products, above the bounded {}-product request; local catalog data stays unchanged.",
            products.total_count, ESUN_GRAPHQL_PAGE_SIZE
        ));
    }
    if products.items.len() != products.total_count {
        return Err(format!(
            "eSUN GraphQL returned a partial catalog ({} of {} products); local catalog data stays unchanged.",
            products.items.len(), products.total_count
        ));
    }
    if products.page_info.current_page != 1
        || products.page_info.total_pages != 1
        || products.page_info.page_size == 0
        || products.page_info.page_size > ESUN_GRAPHQL_PAGE_SIZE
    {
        return Err(format!(
            "eSUN GraphQL returned inconsistent pagination (page {}, {} pages, page size {}); local catalog data stays unchanged.",
            products.page_info.current_page,
            products.page_info.total_pages,
            products.page_info.page_size
        ));
    }

    let products = products
        .items
        .into_iter()
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| {
            "eSUN GraphQL returned a null product in the catalog; local catalog data stays unchanged."
                .to_string()
        })?;
    let mut product_identities = HashSet::new();
    let mut product_urls = HashSet::new();
    for product in &products {
        if product.name.trim().is_empty()
            || product.url_key.trim().is_empty()
            || (product.uid.trim().is_empty() && product.sku.trim().is_empty())
            || !matches!(
                product.product_type.as_str(),
                "ConfigurableProduct" | "SimpleProduct"
            )
        {
            return Err(
                "eSUN GraphQL returned an incomplete product row; local catalog data stays unchanged."
                    .to_string(),
            );
        }
        let identity = if product.uid.trim().is_empty() {
            product.sku.trim()
        } else {
            product.uid.trim()
        };
        if !product_identities.insert(identity.to_ascii_lowercase())
            || !product_urls.insert(product.url_key.trim().to_ascii_lowercase())
        {
            return Err(
                "eSUN GraphQL returned duplicate product identities; local catalog data stays unchanged."
                    .to_string(),
            );
        }
    }

    Ok(products)
}

fn validate_single_esun_material_filter(material_filters: &[String]) -> Result<&str, String> {
    if material_filters.len() != 1 {
        return Err(format!(
            "eSUN catalog refresh requires exactly one material family, but received {}. Run source discovery separately to refresh the available families.",
            material_filters.len()
        ));
    }
    let material = material_filters[0].as_str();
    if !is_supported_esun_material(material) {
        return Err(format!(
            "eSUN material family '{material}' is not one of the supported official filament families; local catalog data stays unchanged."
        ));
    }
    Ok(material)
}

fn build_esun_source_discovery(
    products: &[EsunGraphqlProduct],
) -> Result<EsunCatalogSourceDiscovery, String> {
    let mut material_is_complete: HashMap<String, bool> = HashMap::new();
    for product in products {
        if is_esun_resin_product(&product.name) {
            continue;
        }
        let material = infer_material(&product.name);
        if is_supported_esun_material(&material) {
            let product_is_complete = esun_graphql_product_url(product).is_ok()
                && esun_graphql_product_colors(product).is_ok();
            material_is_complete
                .entry(material)
                .and_modify(|complete| *complete &= product_is_complete)
                .or_insert(product_is_complete);
        }
    }
    let discovered_materials = sort_esun_material_families(
        material_is_complete
            .into_iter()
            .filter_map(|(material, complete)| complete.then_some(material))
            .collect(),
    );
    if discovered_materials.is_empty() {
        return Err(
            "eSUN catalog discovery found products but no supported filament material families; local discovery data stays unchanged."
                .to_string(),
        );
    }

    Ok(EsunCatalogSourceDiscovery {
        detected_store: ESUN_MAGENTO_BASE_URL.to_string(),
        detected_collection: ESUN_MAGENTO_COLLECTION.to_string(),
        products_discovered: products.len() as i64,
        detail_fetches: 0,
        output: format!(
            "Verified the official eSUN Magento filament category in one bounded request: {} products, {} material families, 0 detail requests.",
            products.len(),
            discovered_materials.len()
        ),
        discovered_materials,
    })
}

fn build_esun_scoped_snapshot(
    products: Vec<EsunGraphqlProduct>,
    requested_material: &str,
) -> Result<EsunCatalogRefreshSnapshot, String> {
    let matching_products = products
        .into_iter()
        .filter(|product| !is_esun_resin_product(&product.name))
        .filter(|product| infer_material(&product.name) == requested_material)
        .collect::<Vec<_>>();
    if matching_products.is_empty() {
        return Err(format!(
            "The verified eSUN filament category contained no products for exact material family '{requested_material}'; local catalog data stays unchanged."
        ));
    }

    let mut entries = Vec::new();
    let mut entry_keys = HashSet::new();
    for product in &matching_products {
        let colors = esun_graphql_product_colors(product)?;
        let product_url = esun_graphql_product_url(product)?;
        let filament_name = infer_filament_name(&product.name);
        let detail = EsunProductDetail {
            handle: if product.uid.trim().is_empty() {
                product.sku.clone()
            } else {
                product.uid.clone()
            },
            title: product.name.clone(),
            filament_name,
            material: requested_material.to_string(),
            product_url,
            image_url: product.image.as_ref().and_then(|image| {
                let value = image.url.trim();
                (!value.is_empty()).then(|| normalize_url(value))
            }),
            default_weight_g: parse_weight_grams(&product.name).or(Some(1000)),
            vendor: "eSUN".to_string(),
            colors,
        };
        append_entries_from_product_detail(&mut entries, &mut entry_keys, &detail);
    }
    if entries.is_empty() {
        return Err(format!(
            "eSUN material refresh produced no complete catalog entries for '{requested_material}'; local catalog data stays unchanged."
        ));
    }

    Ok(EsunCatalogRefreshSnapshot {
        entries,
        handles_found: matching_products.len() as i64,
        products_processed: matching_products.len() as i64,
        skipped_non_filament: 0,
        reused_cached_products: 0,
        detail_fetches: 0,
        warnings: Vec::new(),
        detected_store: ESUN_MAGENTO_BASE_URL.to_string(),
        detected_collection: format!("{ESUN_MAGENTO_COLLECTION}; material={requested_material}"),
    })
}

fn esun_graphql_product_url(product: &EsunGraphqlProduct) -> Result<String, String> {
    let url_key = product.url_key.trim().trim_matches('/');
    if url_key.is_empty() {
        return Err(
            "eSUN GraphQL product had no URL key; local catalog data stays unchanged.".to_string(),
        );
    }
    let suffix = product.url_suffix.as_deref().unwrap_or_default().trim();
    Ok(format!("{ESUN_MAGENTO_BASE_URL}/{url_key}{suffix}"))
}

fn esun_graphql_product_colors(
    product: &EsunGraphqlProduct,
) -> Result<Vec<EsunColorOption>, String> {
    let color_options = product
        .configurable_options
        .iter()
        .filter(|option| {
            option.attribute_code.eq_ignore_ascii_case("color")
                || option.label.eq_ignore_ascii_case("color")
                || option.label.eq_ignore_ascii_case("colour")
        })
        .collect::<Vec<_>>();
    if color_options.is_empty() {
        return if product.product_type == "SimpleProduct" {
            Ok(Vec::new())
        } else {
            Err(format!(
                "eSUN GraphQL omitted the color options for configurable product '{}'; local catalog data stays unchanged.",
                product.name
            ))
        };
    }

    let mut colors = Vec::new();
    let mut seen = HashSet::new();
    for option in color_options {
        for value in &option.values {
            let color_name = normalize_whitespace(value.label.trim());
            if color_name.is_empty() {
                return Err(format!(
                    "eSUN GraphQL returned an unnamed color for '{}'; local catalog data stays unchanged.",
                    product.name
                ));
            }
            if !seen.insert(color_name.to_ascii_lowercase()) {
                continue;
            }
            let hex_color = value
                .swatch_data
                .as_ref()
                .and_then(|swatch| normalize_esun_swatch_value(&swatch.value));
            colors.push(EsunColorOption {
                color_name,
                hex_color,
            });
        }
    }
    if colors.is_empty() {
        return Err(format!(
            "eSUN GraphQL returned an empty color option for '{}'; local catalog data stays unchanged.",
            product.name
        ));
    }

    Ok(colors)
}

fn fetch_text_with_client(client: &Client, url: &Url) -> Result<String, String> {
    let gate =
        ESUN_GRAPHQL_REQUEST_GATE.get_or_init(|| Mutex::new(EsunGraphqlRequestGate::default()));
    let mut gate = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    ensure_esun_request_gate_ready(&mut gate)?;
    wait_for_esun_request_interval(&gate);

    let response = match client
        .get(url.clone())
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Referer", ESUN_STORE_BASE_URL)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!("Lookup failed without retry: {error}"));
        }
    };
    let status = response.status();
    let body = match response.text() {
        Ok(body) => body,
        Err(error) => {
            gate.last_request_finished = Some(Instant::now());
            return Err(format!(
                "Lookup response could not be read without retry: {error}"
            ));
        }
    };
    gate.last_request_finished = Some(Instant::now());
    let body_lower = body.to_ascii_lowercase();
    if is_anti_bot_response(status.as_u16(), &body_lower) {
        gate.blocked_until = Some(Instant::now() + ESUN_GRAPHQL_BLOCK_COOLDOWN);
        return Err(format!(
            "Lookup blocked by anti-bot protection ({status}); no retry was attempted"
        ));
    }
    if status.is_success() {
        if body.trim().is_empty() {
            return Err("Lookup returned an empty response without retry".to_string());
        }
        return Ok(body);
    }

    let preview = normalize_whitespace(&strip_tags(&body))
        .chars()
        .take(120)
        .collect::<String>();
    if preview.is_empty() {
        return Err(format!("Lookup failed without retry: {status}"));
    }
    Err(format!("Lookup failed without retry: {status} ({preview})"))
}

fn parse_search_results(html: &str, limit: usize) -> Vec<EsunSearchResult> {
    if html.is_empty() {
        return Vec::new();
    }

    let mut cursor = 0usize;
    let mut seen_handles = HashSet::new();
    let mut results = Vec::new();

    while cursor < html.len() && results.len() < limit {
        let Some(href_rel) = html[cursor..].find("href=\"/products/") else {
            break;
        };
        let href_start = cursor + href_rel;
        let handle_start = href_start + "href=\"/products/".len();
        let Some(handle_end_rel) = html[handle_start..].find('\"') else {
            break;
        };
        let handle_end = handle_start + handle_end_rel;
        cursor = handle_end;

        let raw_handle = &html[handle_start..handle_end];
        let handle = sanitize_handle(raw_handle);
        if handle.is_empty() || !seen_handles.insert(handle.clone()) {
            continue;
        }

        let tag_start = html[..href_start].rfind("<a ").unwrap_or(href_start);
        let tag_end = match html[handle_end..].find('>') {
            Some(relative) => handle_end + relative,
            None => continue,
        };
        let tag = &html[tag_start..=tag_end.min(html.len() - 1)];
        let close_anchor = html[tag_end..]
            .find("</a>")
            .map(|relative| tag_end + relative)
            .unwrap_or_else(|| clamp_to_char_boundary(html, (tag_end + 400).min(html.len())));

        let title = extract_attr_value(tag, "title")
            .or_else(|| {
                if tag_end < close_anchor && close_anchor <= html.len() {
                    Some(strip_tags(&html[tag_end + 1..close_anchor]))
                } else {
                    None
                }
            })
            .unwrap_or_default();
        let title = decode_html_entities(title.trim());
        if title.is_empty() {
            continue;
        }

        let lower = title.to_lowercase();
        if !looks_like_filament(&lower) {
            continue;
        }

        let material = infer_material(&title);
        let filament_name = infer_filament_name(&title);
        let default_weight_g = parse_weight_grams(&title);

        results.push(EsunSearchResult {
            handle: handle.clone(),
            title,
            filament_name,
            material,
            product_url: format!("{ESUN_STORE_BASE_URL}/products/{handle}"),
            image_url: None,
            default_weight_g,
            vendor: "eSUN".to_string(),
        });
    }

    results
}

fn append_entries_from_product_detail(
    entries: &mut Vec<EsunCatalogEntry>,
    entry_keys: &mut HashSet<String>,
    detail: &EsunProductDetail,
) {
    let default_weight_g = detail.default_weight_g.unwrap_or(1000).max(1);
    let colors = if detail.colors.is_empty() {
        vec![EsunColorOption {
            color_name: "Standard".to_string(),
            hex_color: None,
        }]
    } else {
        detail.colors.clone()
    };

    for color in colors {
        let normalized_color = if color.color_name.trim().is_empty() {
            "Standard".to_string()
        } else {
            normalize_esun_color_name_for_catalog(
                &color.color_name,
                &detail.material,
                &detail.filament_name,
            )
        };
        let key = format!(
            "{}|{}|{}",
            detail.material.to_lowercase(),
            detail.filament_name.to_lowercase(),
            normalized_color.to_lowercase()
        );
        if !entry_keys.insert(key) {
            continue;
        }
        entries.push(EsunCatalogEntry {
            material: detail.material.clone(),
            filament_name: detail.filament_name.clone(),
            color_name: normalized_color,
            hex_color: color.hex_color.clone(),
            image_url: detail.image_url.clone(),
            product_url: detail.product_url.clone(),
            default_weight_g,
        });
    }
}

fn parse_product_colors(html: &str) -> Vec<EsunColorOption> {
    const MARKER: &str = "\"option_data\":[";
    let Some(marker_index) = html.find(MARKER) else {
        return Vec::new();
    };
    let array_start = marker_index + MARKER.len() - 1;
    let Some(array_end) = find_matching_bracket(html, array_start, '[', ']') else {
        return Vec::new();
    };
    let json = &html[array_start..=array_end];
    let value: Value = match serde_json::from_str(json) {
        Ok(parsed) => parsed,
        Err(_) => return Vec::new(),
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };

    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for item in items {
        let name = item.get("Name").and_then(Value::as_str).unwrap_or_default();
        if !name.eq_ignore_ascii_case("Color") && !name.eq_ignore_ascii_case("Colour") {
            continue;
        }

        let data = item.get("Data").and_then(Value::as_object);
        let Some(options) = item.get("Options").and_then(Value::as_array) else {
            continue;
        };

        for option in options {
            let Some(color_name_raw) = option.as_str() else {
                continue;
            };
            let color_name = decode_html_entities(color_name_raw.trim());
            if color_name.is_empty() || !seen.insert(color_name.clone()) {
                continue;
            }
            let hex_color = data
                .and_then(|map| map.get(&color_name))
                .and_then(|entry| entry.get("color"))
                .and_then(Value::as_str)
                .and_then(normalize_esun_swatch_value);
            output.push(EsunColorOption {
                color_name,
                hex_color,
            });
        }
    }

    output
}

fn normalize_esun_color_options(
    colors: Vec<EsunColorOption>,
    material: &str,
    filament_name: &str,
) -> Vec<EsunColorOption> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for color in colors {
        let color_name =
            normalize_esun_color_name_for_catalog(&color.color_name, material, filament_name);
        let final_name = if color_name.trim().is_empty() {
            "Standard".to_string()
        } else {
            color_name
        };
        if !seen.insert(final_name.to_lowercase()) {
            continue;
        }
        normalized.push(EsunColorOption {
            color_name: final_name,
            hex_color: color.hex_color.clone(),
        });
    }

    normalized
}

pub fn normalize_esun_color_name_for_catalog(
    raw: &str,
    material: &str,
    filament_name: &str,
) -> String {
    let normalized = normalize_esun_color_name(raw, material, filament_name);
    if normalized.trim().is_empty() {
        "Standard".to_string()
    } else {
        normalized
    }
}

fn normalize_esun_color_name(raw: &str, material: &str, filament_name: &str) -> String {
    let fallback = normalize_whitespace(&decode_html_entities(raw))
        .trim()
        .to_string();
    if fallback.is_empty() {
        return String::new();
    }

    let mut value = fallback.clone();
    let mut prefixes = vec![
        format!("{material} {filament_name}"),
        format!("{filament_name} {material}"),
        filament_name.to_string(),
        material.to_string(),
        "Color".to_string(),
        "Colour".to_string(),
    ];
    prefixes.retain(|prefix| !prefix.trim().is_empty());
    prefixes.sort_by_key(|right| std::cmp::Reverse(right.len()));
    prefixes.dedup();

    let mut changed = true;
    while changed && !value.is_empty() {
        changed = false;
        for prefix in &prefixes {
            let Some(remainder) = strip_prefix_ascii_case_insensitive(&value, prefix) else {
                continue;
            };
            let cleaned = remainder
                .trim_start_matches(|ch: char| {
                    ch.is_whitespace()
                        || matches!(
                            ch,
                            '-' | '–' | '—' | '_' | ':' | '|' | '/' | '·' | '[' | '('
                        )
                })
                .to_string();
            if cleaned != value {
                value = cleaned;
                changed = true;
                break;
            }
        }
    }

    let cleaned = value
        .trim_matches(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    '-' | '–' | '—' | '_' | ':' | '|' | '/' | '·' | ')' | ']'
                )
        })
        .to_string();
    let normalized = if cleaned.is_empty() {
        fallback
    } else {
        cleaned
    };
    normalize_esun_color_name_typos(&normalized)
}

fn normalize_esun_color_name_typos(value: &str) -> String {
    value.replace("GREEH", "GREEN").replace("GRREN", "GREEN")
}

fn strip_prefix_ascii_case_insensitive(value: &str, prefix: &str) -> Option<String> {
    let prefix = prefix.trim();
    if prefix.is_empty() {
        return None;
    }
    let trimmed = value.trim_start();
    let head = trimmed.get(..prefix.len())?;
    if !head.eq_ignore_ascii_case(prefix) {
        return None;
    }
    Some(trimmed.get(prefix.len()..)?.to_string())
}

fn ensure_esun_request_gate_ready(gate: &mut EsunGraphqlRequestGate) -> Result<(), String> {
    let now = Instant::now();
    if let Some(blocked_until) = gate.blocked_until {
        if blocked_until > now {
            let remaining = blocked_until
                .saturating_duration_since(now)
                .as_secs()
                .max(1);
            return Err(format!(
                "eSUN access is cooling down after a blocking response; try again in about {remaining} seconds. No request was sent."
            ));
        }
        gate.blocked_until = None;
    }
    Ok(())
}

fn wait_for_esun_request_interval(gate: &EsunGraphqlRequestGate) {
    if let Some(last_request_finished) = gate.last_request_finished {
        let elapsed = last_request_finished.elapsed();
        if elapsed < ESUN_GRAPHQL_MIN_REQUEST_INTERVAL {
            thread::sleep(ESUN_GRAPHQL_MIN_REQUEST_INTERVAL - elapsed);
        }
    }
}

fn is_anti_bot_response(status_code: u16, body_lower: &str) -> bool {
    matches!(status_code, 403 | 429 | 503)
        || body_lower.contains("just a moment")
        || body_lower.contains("cf-mitigated")
        || body_lower.contains("cloudflare")
        || body_lower.contains("attention required")
        || body_lower.contains("access denied")
        || body_lower.contains("captcha")
        || body_lower.contains("too many requests")
        || body_lower.contains("rate limit")
        || body_lower.contains("verify you are human")
}

#[cfg(test)]
#[path = "vendor_lookup_tests.rs"]
mod tests;
