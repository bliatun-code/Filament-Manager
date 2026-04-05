use rand::Rng;
use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::thread;
use std::time::Duration;

const DEFAULT_BASE_URLS: [&str; 3] = [
    "https://us.store.bambulab.com",
    "https://eu.store.bambulab.com",
    "https://store.bambulab.com",
];
const DEFAULT_COLLECTION_HANDLE: &str = "bambu-lab-3d-printer-filament";
const DEFAULT_WEIGHT_G: i64 = 1000;
const USER_AGENT: &str = "BambuFilamentManager/1.0";
const REQUEST_TIMEOUT_SECS: u64 = 20;
const MAX_FETCH_RETRIES: usize = 2;
const PRODUCT_FETCH_RETRIES: usize = 1;
const PRODUCT_REQUEST_DELAY_MS: u64 = 850;
const PRODUCT_REQUEST_DELAY_JITTER_MS: u64 = 450;
const PRODUCT_ANTIBOT_COOLDOWN_MS: u64 = 3500;
const MAX_CONSECUTIVE_ANTIBOT: usize = 4;
const MAX_DETECT_PROBES: usize = 3;
const DETECT_RETRY_JITTER_MS: u64 = 250;

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BambuCatalogRefreshSnapshot {
    pub entries: Vec<BambuCatalogEntry>,
    pub detected_store: String,
    pub detected_collection: String,
    pub warnings: Vec<String>,
    pub anti_bot_blocks: i64,
    pub products_discovered: i64,
    pub products_detailed: i64,
    pub partial: bool,
}

#[derive(Clone)]
struct DetectStoreResult {
    base_url: String,
    handle: String,
}

#[derive(Deserialize)]
struct ShopifyCollectionsResponse {
    collections: Option<Vec<ShopifyCollection>>,
}

#[derive(Deserialize)]
struct ShopifyCollection {
    handle: Option<String>,
    title: Option<String>,
}

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

#[derive(Clone)]
struct ProductSummary {
    name: String,
    seo_code: String,
    media_files: Vec<String>,
}

#[derive(Clone)]
struct ColorOption {
    color_name: String,
    image_url: Option<String>,
}

#[derive(Clone)]
struct ProductsPageResult {
    products: Vec<ShopifyProduct>,
    anti_bot_blocked: bool,
    request_failed: bool,
}

struct FetchResult {
    base_url: String,
    products: Vec<ShopifyProduct>,
}

struct NextStoreResult {
    base_url: String,
    entries: Vec<BambuCatalogEntry>,
    warnings: Vec<String>,
    anti_bot_blocks: i64,
    products_discovered: i64,
    products_detailed: i64,
    partial: bool,
}

pub fn refresh_bambu_catalog_snapshot(
    material_filters: Option<Vec<String>>,
) -> Result<BambuCatalogRefreshSnapshot, String> {
    let client = build_client()?;
    let filters = normalize_material_filters(material_filters);
    let detected = detect_store(&client)?;

    if let Some(result) = fetch_all_products(&client, &detected.base_url, &detected.handle, &filters)? {
        let mut entries = Vec::new();
        for product in &result.products {
            entries.extend(extract_colors(product, &result.base_url));
        }
        return Ok(BambuCatalogRefreshSnapshot {
            entries: dedupe_entries(entries),
            detected_store: result.base_url,
            detected_collection: detected.handle,
            warnings: Vec::new(),
            anti_bot_blocks: 0,
            products_discovered: 0,
            products_detailed: 0,
            partial: false,
        });
    }

    if let Some(next_result) = fetch_next_store_entries(&client, &detected.base_url, &detected.handle, &filters)? {
        return Ok(BambuCatalogRefreshSnapshot {
            entries: next_result.entries,
            detected_store: next_result.base_url,
            detected_collection: detected.handle,
            warnings: next_result.warnings,
            anti_bot_blocks: next_result.anti_bot_blocks,
            products_discovered: next_result.products_discovered,
            products_detailed: next_result.products_detailed,
            partial: next_result.partial,
        });
    }

    Ok(BambuCatalogRefreshSnapshot {
        entries: Vec::new(),
        detected_store: detected.base_url,
        detected_collection: detected.handle,
        warnings: vec!["No products found for any base URL.".to_string()],
        anti_bot_blocks: 0,
        products_discovered: 0,
        products_detailed: 0,
        partial: true,
    })
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
        rand::thread_rng().gen_range(0..=jitter_ms)
    };
    thread::sleep(Duration::from_millis(base_ms.saturating_add(jitter)));
}

fn fetch_text_with_status(
    client: &Client,
    url: &str,
    accept: &str,
    retries: usize,
    backoff_base_ms: u64,
    backoff_cap_ms: u64,
    jitter_ms: u64,
) -> Option<(u16, String)> {
    for attempt in 0..=retries {
        let response = client
            .get(url)
            .header("Accept", accept)
            .header("Accept-Language", "en-US,en;q=0.9")
            .send();

        match response {
            Ok(response) => {
                let status = response.status().as_u16();
                let body = response.text().unwrap_or_default();
                if (status == 429 || status >= 500) && attempt < retries {
                    let base = if status == 429 {
                        backoff_base_ms.max(1_800)
                    } else {
                        backoff_base_ms.max(700)
                    };
                    let wait_ms = (base.saturating_mul((attempt + 1) as u64)).min(backoff_cap_ms);
                    sleep_with_jitter(wait_ms, jitter_ms.max(DETECT_RETRY_JITTER_MS));
                    continue;
                }
                return Some((status, body));
            }
            Err(_) => {
                if attempt < retries {
                    let wait_ms = (backoff_base_ms.saturating_mul((attempt + 1) as u64))
                        .min(backoff_cap_ms);
                    sleep_with_jitter(wait_ms, jitter_ms.max(DETECT_RETRY_JITTER_MS));
                    continue;
                }
                return None;
            }
        }
    }

    None
}

fn fetch_json_collections(client: &Client, base_url: &str) -> Option<Vec<ShopifyCollection>> {
    let url = format!("{base_url}/collections.json?limit=250");
    let (status, body) = fetch_text_with_status(
        client,
        &url,
        "application/json",
        MAX_FETCH_RETRIES,
        800,
        12_000,
        DETECT_RETRY_JITTER_MS,
    )?;
    if status < 200 || status >= 300 {
        return None;
    }
    let parsed: ShopifyCollectionsResponse = serde_json::from_str(&body).ok()?;
    parsed.collections
}

fn score_collection(handle: &str, title: &str) -> i32 {
    let handle = handle.to_lowercase();
    let title = title.to_lowercase();
    let mut score = 0;
    if handle.contains(DEFAULT_COLLECTION_HANDLE) {
        score += 10;
    }
    if handle.contains("filament") {
        score += 6;
    }
    if title.contains("filament") {
        score += 4;
    }
    if handle.contains("bambu") {
        score += 2;
    }
    if title.contains("bambu") {
        score += 2;
    }
    if title.contains("spool") {
        score += 1;
    }
    score
}

fn is_anti_bot_or_rate_limited(status: u16) -> bool {
    status == 429 || status == 403 || status == 503
}

fn probe_collection(client: &Client, base_url: &str, handle: &str) -> bool {
    let url = format!("{base_url}/collections/{handle}/products.json?limit=1");
    if let Some((status, body)) = fetch_text_with_status(
        client,
        &url,
        "application/json",
        MAX_FETCH_RETRIES,
        800,
        12_000,
        DETECT_RETRY_JITTER_MS,
    ) {
        if status >= 200 && status < 300 {
            if let Ok(parsed) = serde_json::from_str::<ShopifyProductsResponse>(&body) {
                return parsed.products.is_some();
            }
            return false;
        }
    }

    let html_url = format!("{base_url}/collections/{handle}");
    if let Some((status, body)) = fetch_text_with_status(
        client,
        &html_url,
        "text/html,application/json",
        MAX_FETCH_RETRIES,
        800,
        12_000,
        DETECT_RETRY_JITTER_MS,
    ) {
        if status >= 200 && status < 300 {
            return body.contains("productList");
        }
    }

    false
}

fn detect_store(client: &Client) -> Result<DetectStoreResult, String> {
    let explicit_base = env::var("BAMBU_BASE_URL")
        .ok()
        .map(|value| normalize_base_url(&value));
    let explicit_handle = env::var("BAMBU_COLLECTION").ok();

    let mut base_urls: Vec<String> = Vec::new();
    if let Some(base) = explicit_base.clone() {
        base_urls.push(base);
    }
    for candidate in DEFAULT_BASE_URLS.iter().map(|value| normalize_base_url(value)) {
        if !base_urls.iter().any(|existing| existing == &candidate) {
            base_urls.push(candidate);
        }
    }

    for base_url in &base_urls {
        if let Some(handle) = explicit_handle.as_deref() {
            if probe_collection(client, base_url, handle) {
                return Ok(DetectStoreResult {
                    base_url: base_url.clone(),
                    handle: handle.to_string(),
                });
            }
        }

        if let Some(collections) = fetch_json_collections(client, base_url) {
            let mut scored: Vec<(String, i32)> = collections
                .into_iter()
                .filter_map(|collection| {
                    let handle = collection.handle?;
                    let title = collection.title.unwrap_or_default();
                    let score = score_collection(&handle, &title);
                    if score > 0 {
                        Some((handle, score))
                    } else {
                        None
                    }
                })
                .collect();
            scored.sort_by(|a, b| b.1.cmp(&a.1));

            let mut candidate_handles: Vec<String> = scored.into_iter().map(|entry| entry.0).collect();
            candidate_handles.push(DEFAULT_COLLECTION_HANDLE.to_string());
            candidate_handles.dedup();

            for (index, handle) in candidate_handles.iter().enumerate() {
                if index >= MAX_DETECT_PROBES {
                    return Ok(DetectStoreResult {
                        base_url: base_url.clone(),
                        handle: handle.clone(),
                    });
                }
                if probe_collection(client, base_url, handle) {
                    return Ok(DetectStoreResult {
                        base_url: base_url.clone(),
                        handle: handle.clone(),
                    });
                }
            }
        }
    }

    let fallback_base = explicit_base
        .or_else(|| {
            base_urls
                .iter()
                .find(|url| url.contains("eu.store.bambulab.com"))
                .cloned()
        })
        .or_else(|| base_urls.first().cloned())
        .ok_or_else(|| "Could not determine Bambu store URL".to_string())?;

    Ok(DetectStoreResult {
        base_url: fallback_base,
        handle: explicit_handle.unwrap_or_else(|| DEFAULT_COLLECTION_HANDLE.to_string()),
    })
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

fn matches_material_filter(material: &str, filters: &[String]) -> bool {
    filters.is_empty() || filters.iter().any(|value| value == material.trim().to_uppercase().as_str())
}

fn infer_material(filament_name: &str) -> String {
    let upper = filament_name.trim().to_uppercase();
    for (prefix, value) in [
        ("PLA", "PLA"),
        ("PETG", "PETG"),
        ("ABS", "ABS"),
        ("TPU", "TPU"),
        ("PA6", "PA6"),
        ("PAHT", "PAHT"),
        ("PET", "PET"),
        ("PC", "PC"),
        ("ASA", "ASA"),
    ] {
        if upper.starts_with(prefix) {
            return value.to_string();
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
        .or_else(|_| Url::parse(&format!("{}/{}", base_url.trim_end_matches('/'), raw.trim_start_matches('/'))))
        .map(|url| url.to_string())
        .ok()
}

fn select_image(product: &ShopifyProduct, variant: Option<&ShopifyVariant>) -> Option<String> {
    if let Some(src) = variant.and_then(|value| value.featured_image.as_ref()).and_then(|image| image.src.as_deref()) {
        return Some(src.to_string());
    }
    if let Some(src) = product.image.as_ref().and_then(|image| image.src.as_deref()) {
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
        return vec![BambuCatalogEntry {
            material,
            filament_name,
            color_name: color_name.clone(),
            hex_color: estimate_hex(&color_name),
            image_url: normalize_maybe_url(select_image(product, None).as_deref(), base_url),
            product_url: build_product_url(base_url, &product.handle, None),
            default_weight_g: DEFAULT_WEIGHT_G,
        }];
    }

    let has_color_option = product
        .options
        .as_ref()
        .map(|options| {
            options
                .iter()
                .any(|option| option.name.to_lowercase().contains("color") || option.name.to_lowercase().contains("colour"))
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
                hex_color: estimate_hex(color_name),
                image_url: normalize_maybe_url(select_image(product, Some(variant)).as_deref(), base_url),
                product_url: build_product_url(base_url, &product.handle, variant.id),
                default_weight_g: DEFAULT_WEIGHT_G,
            })
        })
        .collect()
}

fn dedupe_entries(entries: Vec<BambuCatalogEntry>) -> Vec<BambuCatalogEntry> {
    let mut unique: HashMap<String, BambuCatalogEntry> = HashMap::new();
    for entry in entries {
        let key = format!(
            "{}::{}::{}",
            entry.material, entry.filament_name, entry.color_name
        );
        unique.insert(key, entry);
    }
    unique.into_values().collect()
}

fn fetch_products_page(
    client: &Client,
    base_url: &str,
    collection_handle: &str,
    page: usize,
) -> ProductsPageResult {
    let endpoints = [
        format!(
            "{base_url}/collections/{collection_handle}/products.json?limit=250&page={page}"
        ),
        format!("{base_url}/collections/{collection_handle}/products.json?limit=250"),
    ];

    let mut anti_bot_blocked = false;
    let mut request_failed = false;

    for endpoint in endpoints {
        let response = fetch_text_with_status(
            client,
            &endpoint,
            "application/json",
            MAX_FETCH_RETRIES,
            800,
            12_000,
            PRODUCT_REQUEST_DELAY_JITTER_MS,
        );

        let Some((status, body)) = response else {
            request_failed = true;
            continue;
        };

        if status < 200 || status >= 300 {
            if is_anti_bot_or_rate_limited(status) {
                anti_bot_blocked = true;
            }
            continue;
        }

        match serde_json::from_str::<ShopifyProductsResponse>(&body) {
            Ok(parsed) => {
                return ProductsPageResult {
                    products: parsed.products.unwrap_or_default(),
                    anti_bot_blocked,
                    request_failed,
                }
            }
            Err(_) => {
                request_failed = true;
            }
        }
    }

    ProductsPageResult {
        products: Vec::new(),
        anti_bot_blocked,
        request_failed,
    }
}

fn fetch_all_products(
    client: &Client,
    base_url: &str,
    collection_handle: &str,
    filters: &[String],
) -> Result<Option<FetchResult>, String> {
    let mut products = Vec::new();
    let mut page = 1usize;
    let mut has_page_failure_signals = false;

    loop {
        let page_result = fetch_products_page(client, base_url, collection_handle, page);
        if page_result.products.is_empty() {
            if page_result.request_failed || page_result.anti_bot_blocked {
                has_page_failure_signals = true;
            }
            break;
        }

        for product in page_result.products {
            if matches_material_filter(&infer_material(&product.title), filters) {
                products.push(product);
            }
        }

        page += 1;
    }

    if products.is_empty() {
        return Ok(None);
    }

    if has_page_failure_signals {
        return Ok(None);
    }

    Ok(Some(FetchResult {
        base_url: base_url.to_string(),
        products,
    }))
}

fn extract_raw_js_string(source: &str, start_index: usize) -> (String, usize) {
    let bytes = source.as_bytes();
    let mut i = start_index;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            let mut backslashes = 0usize;
            let mut j = i;
            while j > start_index && bytes[j - 1] == b'\\' {
                backslashes += 1;
                j -= 1;
            }
            if backslashes % 2 == 0 {
                return (source[start_index..i].to_string(), i);
            }
        }
        i += 1;
    }
    (source[start_index..].to_string(), source.len())
}

fn decode_js_string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut i = 0usize;

    while i < chars.len() {
        let ch = chars[i];
        if ch != '\\' {
            out.push(ch);
            i += 1;
            continue;
        }

        if i + 1 >= chars.len() {
            out.push('\\');
            break;
        }

        let next = chars[i + 1];
        match next {
            '\n' => {
                i += 2;
            }
            '\r' => {
                i += if i + 2 < chars.len() && chars[i + 2] == '\n' { 3 } else { 2 };
            }
            'n' => {
                out.push('\n');
                i += 2;
            }
            'r' => {
                out.push('\r');
                i += 2;
            }
            't' => {
                out.push('\t');
                i += 2;
            }
            'b' => {
                out.push('\u{0008}');
                i += 2;
            }
            'f' => {
                out.push('\u{000C}');
                i += 2;
            }
            'v' => {
                out.push('\u{000B}');
                i += 2;
            }
            '\\' | '"' | '\'' => {
                out.push(next);
                i += 2;
            }
            '0' => {
                out.push('\0');
                i += 2;
            }
            'x' => {
                if i + 3 < chars.len() {
                    let hex: String = chars[i + 2..=i + 3].iter().collect();
                    if let Ok(code) = u8::from_str_radix(&hex, 16) {
                        out.push(code as char);
                        i += 4;
                        continue;
                    }
                }
                out.push('x');
                i += 2;
            }
            'u' => {
                if i + 2 < chars.len() && chars[i + 2] == '{' {
                    let mut end = i + 3;
                    while end < chars.len() && chars[end] != '}' {
                        end += 1;
                    }
                    if end < chars.len() {
                        let hex: String = chars[i + 3..end].iter().collect();
                        if let Ok(code) = u32::from_str_radix(&hex, 16) {
                            if let Some(decoded) = char::from_u32(code) {
                                out.push(decoded);
                                i = end + 1;
                                continue;
                            }
                        }
                    }
                    out.push('u');
                    i += 2;
                } else if i + 5 < chars.len() {
                    let hex: String = chars[i + 2..=i + 5].iter().collect();
                    if let Ok(code) = u16::from_str_radix(&hex, 16) {
                        if let Some(decoded) = char::from_u32(code as u32) {
                            out.push(decoded);
                            i += 6;
                            continue;
                        }
                    }
                    out.push('u');
                    i += 2;
                } else {
                    out.push('u');
                    i += 2;
                }
            }
            _ => {
                out.push(next);
                i += 2;
            }
        }
    }

    out
}

fn extract_next_data_payload(html: &str) -> String {
    let marker = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let Some(start) = html.find(marker) else {
        return String::new();
    };
    let json_start = start + marker.len();
    let Some(end) = html[json_start..].find("</script>") else {
        return String::new();
    };
    let raw = html[json_start..json_start + end].trim();
    if raw.is_empty() {
        return String::new();
    }

    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|value| serde_json::to_string(&value).ok())
        .unwrap_or_else(|| raw.to_string())
}

fn decode_next_payload(html: &str) -> String {
    let marker = "self.__next_f.push([1,\"";
    let mut index = 0usize;
    let mut parts: Vec<String> = Vec::new();

    while let Some(start_rel) = html[index..].find(marker) {
        let start = index + start_rel + marker.len();
        let (raw, end_index) = extract_raw_js_string(html, start);
        parts.push(decode_js_string_literal(&raw));
        index = end_index.saturating_add(1);
    }

    let mut combined = parts.join("");
    if !combined.contains("\"productList\"") {
        let next_data = extract_next_data_payload(html);
        if !next_data.is_empty() {
            combined.push_str(&next_data);
        }
    }

    combined
}

fn find_matching_bracket(
    text: &str,
    start: usize,
    open_char: char,
    close_char: char,
) -> Option<usize> {
    let chars: Vec<char> = text.chars().collect();
    if start >= chars.len() {
        return None;
    }

    let mut level = 0i32;
    let mut in_string = false;
    let mut escaped = false;

    for (i, ch) in chars.iter().enumerate().skip(start) {
        if escaped {
            escaped = false;
            continue;
        }
        if *ch == '\\' {
            escaped = true;
            continue;
        }
        if *ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if *ch == open_char {
            level += 1;
        } else if *ch == close_char {
            level -= 1;
            if level == 0 {
                return Some(i);
            }
        }
    }

    None
}

fn extract_product_list(decoded: &str) -> Vec<ProductSummary> {
    let Some(index) = decoded.find("\"productList\"") else {
        return Vec::new();
    };
    let Some(list_start_rel) = decoded[index..].find('[') else {
        return Vec::new();
    };
    let list_start = index + list_start_rel;
    let Some(list_end) = find_matching_bracket(decoded, list_start, '[', ']') else {
        return Vec::new();
    };

    let chars: Vec<char> = decoded.chars().collect();
    let list_json: String = chars[list_start..=list_end].iter().collect();

    let Ok(value) = serde_json::from_str::<serde_json::Value>(&list_json) else {
        return Vec::new();
    };

    let Some(array) = value.as_array() else {
        return Vec::new();
    };

    array
        .iter()
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.to_string();
            let seo_code = item.get("seoCode")?.as_str()?.to_string();
            let media_files = item
                .get("mediaFiles")
                .and_then(|value| value.as_array())
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|value| value.as_str().map(|entry| entry.to_string()))
                        .collect::<Vec<String>>()
                })
                .unwrap_or_default();
            Some(ProductSummary {
                name,
                seo_code,
                media_files,
            })
        })
        .collect()
}

fn extract_color_options(decoded: &str) -> Vec<ColorOption> {
    let needle = "{\"propertyKey\":\"Color\"";
    let mut index = 0usize;
    let mut options: HashMap<String, Option<String>> = HashMap::new();

    let chars: Vec<char> = decoded.chars().collect();

    while let Some(start_rel) = decoded[index..].find(needle) {
        let start = index + start_rel;
        let Some(end) = find_matching_bracket(decoded, start, '{', '}') else {
            break;
        };
        let obj_text: String = chars[start..=end].iter().collect();

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&obj_text) {
            if let Some(color_name) = value.get("propertyValue").and_then(|entry| entry.as_str()) {
                let image_url = value
                    .get("colorUrl")
                    .and_then(|entry| entry.as_str())
                    .map(|entry| entry.to_string());
                options.insert(color_name.to_string(), image_url);
            }
        }

        index = end.saturating_add(1);
    }

    options
        .into_iter()
        .map(|(color_name, image_url)| ColorOption {
            color_name,
            image_url,
        })
        .collect()
}

fn build_fallback_entry(product: &ProductSummary, base_url: &str) -> BambuCatalogEntry {
    BambuCatalogEntry {
        material: infer_material(&product.name),
        filament_name: product.name.clone(),
        color_name: "Standard".to_string(),
        hex_color: estimate_hex("Standard"),
        image_url: normalize_maybe_url(product.media_files.first().map(|value| value.as_str()), base_url),
        product_url: format!("{base_url}/products/{}", product.seo_code),
        default_weight_g: DEFAULT_WEIGHT_G,
    }
}

fn fetch_next_store_entries(
    client: &Client,
    base_url: &str,
    collection_handle: &str,
    filters: &[String],
) -> Result<Option<NextStoreResult>, String> {
    let collection_url = format!("{base_url}/collections/{collection_handle}");
    let Some((status, html)) = fetch_text_with_status(
        client,
        &collection_url,
        "text/html,application/json",
        MAX_FETCH_RETRIES,
        800,
        12_000,
        PRODUCT_REQUEST_DELAY_JITTER_MS,
    ) else {
        return Ok(None);
    };
    if status < 200 || status >= 300 {
        return Ok(None);
    }

    let decoded = decode_next_payload(&html);
    let products = extract_product_list(&decoded);
    if products.is_empty() {
        return Ok(None);
    }

    let mut entries: Vec<BambuCatalogEntry> = Vec::new();
    let mut warnings: HashSet<String> = HashSet::new();
    let mut anti_bot_blocks = 0i64;
    let mut products_detailed = 0i64;
    let mut stop_detailed_fetch = false;
    let mut consecutive_anti_bot_blocks = 0usize;

    for (index, product) in products.iter().enumerate() {
        let material = infer_material(&product.name);
        if !matches_material_filter(&material, filters) {
            continue;
        }

        if index > 0 && PRODUCT_REQUEST_DELAY_MS > 0 {
            sleep_with_jitter(PRODUCT_REQUEST_DELAY_MS, PRODUCT_REQUEST_DELAY_JITTER_MS);
        }

        if stop_detailed_fetch {
            entries.push(build_fallback_entry(product, base_url));
            continue;
        }

        let product_url = format!("{base_url}/products/{}", product.seo_code);
        let product_response = fetch_text_with_status(
            client,
            &product_url,
            "text/html,application/json",
            PRODUCT_FETCH_RETRIES,
            1800,
            18_000,
            PRODUCT_REQUEST_DELAY_JITTER_MS,
        );

        let Some((product_status, product_html)) = product_response else {
            consecutive_anti_bot_blocks = 0;
            warnings.insert("Some product detail pages could not be fetched.".to_string());
            entries.push(build_fallback_entry(product, base_url));
            continue;
        };

        if product_status < 200 || product_status >= 300 {
            if is_anti_bot_or_rate_limited(product_status) {
                anti_bot_blocks += 1;
                consecutive_anti_bot_blocks += 1;
                warnings.insert(
                    "Product detail lookups hit anti-bot/rate-limit responses.".to_string(),
                );
                sleep_with_jitter(
                    PRODUCT_ANTIBOT_COOLDOWN_MS,
                    PRODUCT_REQUEST_DELAY_JITTER_MS,
                );
                if consecutive_anti_bot_blocks >= MAX_CONSECUTIVE_ANTIBOT {
                    stop_detailed_fetch = true;
                    warnings.insert(format!(
                        "Stopped detailed product lookup early after {} consecutive anti-bot responses.",
                        MAX_CONSECUTIVE_ANTIBOT
                    ));
                }
            } else {
                consecutive_anti_bot_blocks = 0;
                warnings.insert("Some product detail pages could not be fetched.".to_string());
            }
            entries.push(build_fallback_entry(product, base_url));
            continue;
        }

        products_detailed += 1;
        consecutive_anti_bot_blocks = 0;
        let product_decoded = decode_next_payload(&product_html);
        let colors = extract_color_options(&product_decoded);

        if colors.is_empty() {
            entries.push(BambuCatalogEntry {
                material,
                filament_name: product.name.clone(),
                color_name: "Standard".to_string(),
                hex_color: estimate_hex("Standard"),
                image_url: normalize_maybe_url(
                    product.media_files.first().map(|value| value.as_str()),
                    base_url,
                ),
                product_url,
                default_weight_g: DEFAULT_WEIGHT_G,
            });
            continue;
        }

        for color in colors {
            entries.push(BambuCatalogEntry {
                material: material.clone(),
                filament_name: product.name.clone(),
                color_name: color.color_name.clone(),
                hex_color: estimate_hex(&color.color_name),
                image_url: normalize_maybe_url(
                    color
                        .image_url
                        .as_deref()
                        .or_else(|| product.media_files.first().map(|value| value.as_str())),
                    base_url,
                ),
                product_url: product_url.clone(),
                default_weight_g: DEFAULT_WEIGHT_G,
            });
        }
    }

    let warning_list: Vec<String> = warnings.into_iter().collect();
    let partial = !warning_list.is_empty();

    Ok(Some(NextStoreResult {
        base_url: base_url.to_string(),
        entries: dedupe_entries(entries),
        warnings: warning_list,
        anti_bot_blocks,
        products_discovered: products.len() as i64,
        products_detailed,
        partial,
    }))
}

#[cfg(test)]
mod tests {
    use super::{decode_js_string_literal, extract_product_list, infer_material, normalize_material_filters};

    #[test]
    fn infer_material_uses_prefixes() {
        assert_eq!(infer_material("PLA Basic"), "PLA");
        assert_eq!(infer_material("PA6-CF"), "PA6");
        assert_eq!(infer_material("Custom Blend"), "CUSTOM");
    }

    #[test]
    fn normalize_material_filters_dedupes_values() {
        let values = normalize_material_filters(Some(vec![
            " pla ".to_string(),
            "PLA".to_string(),
            "petg".to_string(),
        ]));
        assert_eq!(values, vec!["PETG".to_string(), "PLA".to_string()]);
    }

    #[test]
    fn decode_js_string_literal_handles_common_escape_sequences() {
        let decoded = decode_js_string_literal("hello\\nworld\\u0021");
        assert_eq!(decoded, "hello\nworld!");
    }

    #[test]
    fn extract_product_list_reads_product_list_array() {
        let decoded = r#"{"productList":[{"name":"PLA Basic - Red","seoCode":"pla-basic-red","mediaFiles":["https://example.com/a.png"]}]}"#;
        let entries = extract_product_list(decoded);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "PLA Basic - Red");
        assert_eq!(entries[0].seo_code, "pla-basic-red");
    }
}
