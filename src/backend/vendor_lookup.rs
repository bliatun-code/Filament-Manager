use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::thread;
use std::time::Duration;

const ESUN_STORE_BASE_URL: &str = "https://esun3dstore.com";
const ESUN_SITE_BASE_URL: &str = "https://www.esun3d.com";
const ESUN_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ESUN_MAX_HTTP_ATTEMPTS: usize = 2;
const ESUN_RETRY_BASE_DELAY_MS: u64 = 1_600;
const ESUN_REQUEST_DELAY_MS: u64 = 550;
const ESUN_REQUEST_JITTER_MS: u64 = 220;
const ESUN_ANTI_BOT_BREAK_THRESHOLD: usize = 3;
const ESUN_EMPTY_PAGE_BREAK_THRESHOLD: usize = 2;

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunCatalogRefreshSnapshot {
    pub entries: Vec<EsunCatalogEntry>,
    pub handles_found: i64,
    pub products_processed: i64,
    pub skipped_non_filament: i64,
    pub warnings: Vec<String>,
    pub detected_store: String,
    pub detected_collection: String,
}

pub fn refresh_esun_catalog_snapshot(
    material_filters: Option<Vec<String>>,
) -> Result<EsunCatalogRefreshSnapshot, String> {
    let client = build_client()?;
    let material_filters = normalize_material_filters(material_filters);
    let mut warnings = Vec::new();

    match refresh_esun_catalog_snapshot_from_store(&client, &material_filters) {
        Ok(snapshot) => {
            let anti_bot_blocks = snapshot
                .warnings
                .iter()
                .filter(|warning| is_anti_bot_warning(warning))
                .count();
            let low_coverage = snapshot.handles_found > 0
                && snapshot.products_processed * 100 < snapshot.handles_found * 80;
            let should_fallback =
                snapshot.entries.is_empty() || anti_bot_blocks > 0 || low_coverage;

            if !should_fallback {
                return Ok(snapshot);
            }

            warnings.push(format!(
                "Primary source ({ESUN_STORE_BASE_URL}) incomplete (handles: {}, processed: {}, anti-bot blocks: {}); switching to fallback source.",
                snapshot.handles_found, snapshot.products_processed, anti_bot_blocks
            ));
            warnings.extend(snapshot.warnings);
        }
        Err(error) => {
            warnings.push(format!(
                "Primary source ({ESUN_STORE_BASE_URL}) failed: {error}"
            ));
        }
    }

    let mut fallback =
        refresh_esun_catalog_snapshot_from_site(&client, &material_filters).map_err(
            |fallback_error| {
        format!(
            "Could not refresh eSUN catalog from any source.\n{}\nFallback source ({ESUN_SITE_BASE_URL}) failed: {fallback_error}",
            warnings.join("\n")
        )
    },
        )?;

    if !warnings.is_empty() {
        fallback.warnings.splice(0..0, warnings);
    }

    Ok(fallback)
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

fn fetch_text_with_client(client: &Client, url: &Url) -> Result<String, String> {
    for attempt in 0..ESUN_MAX_HTTP_ATTEMPTS {
        let response = client
            .get(url.clone())
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", ESUN_STORE_BASE_URL)
            .send();

        match response {
            Ok(response) => {
                let status = response.status();
                let body = response.text().unwrap_or_default();
                if status.is_success() {
                    return Ok(body);
                }

                let body_lower = body.to_lowercase();
                if is_anti_bot_response(status.as_u16(), &body_lower) {
                    if attempt + 1 < ESUN_MAX_HTTP_ATTEMPTS {
                        sleep_retry_backoff(attempt);
                        continue;
                    }
                    return Err(format!("Lookup blocked by anti-bot protection: {status}"));
                }

                let preview = normalize_whitespace(&strip_tags(&body))
                    .chars()
                    .take(120)
                    .collect::<String>();
                if preview.is_empty() {
                    return Err(format!("Lookup failed: {status}"));
                }
                return Err(format!("Lookup failed: {status} ({preview})"));
            }
            Err(error) => {
                if attempt + 1 < ESUN_MAX_HTTP_ATTEMPTS {
                    sleep_retry_backoff(attempt);
                    continue;
                }
                return Err(error.to_string());
            }
        }
    }
    Err("Lookup failed after retry attempts".to_string())
}

fn fetch_esun_search_html(client: &Client, query: &str) -> Result<String, String> {
    let mut url =
        Url::parse(&format!("{ESUN_STORE_BASE_URL}/search")).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("type", "product")
        .append_pair("q", query);
    fetch_text_with_client(client, &url)
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
                if tag_end + 1 <= close_anchor && close_anchor <= html.len() {
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

fn extract_product_handles(html: &str) -> Vec<String> {
    if html.is_empty() {
        return Vec::new();
    }

    let mut cursor = 0usize;
    let mut handles = Vec::new();
    let mut seen = HashSet::new();

    while cursor < html.len() {
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

        let handle = sanitize_handle(&html[handle_start..handle_end]);
        if handle.is_empty() || !seen.insert(handle.clone()) {
            continue;
        }
        handles.push(handle);
    }

    handles
}

fn refresh_esun_catalog_snapshot_from_store(
    client: &Client,
    material_filters: &[String],
) -> Result<EsunCatalogRefreshSnapshot, String> {
    let mut warnings = Vec::new();
    let mut handles = Vec::new();

    let mut queries: Vec<String> = if material_filters.is_empty() {
        vec!["filament".to_string(), String::new()]
    } else {
        material_filters
            .iter()
            .map(|value| value.to_lowercase())
            .collect()
    };
    queries.sort();
    queries.dedup();

    for query in queries {
        match fetch_esun_search_html(client, &query) {
            Ok(html) => handles.extend(extract_product_handles(&html)),
            Err(error) => warnings.push(format!("search '{query}': {error}")),
        }
        if handles.len() >= if material_filters.is_empty() { 40 } else { 80 } {
            break;
        }
        pause_between_requests(handles.len() + query.len());
    }

    let mut seen_handles = HashSet::new();
    handles.retain(|handle| seen_handles.insert(handle.clone()));

    if handles.is_empty() {
        return Err("Could not discover products from store search.".to_string());
    }

    let (entries, products_processed, skipped_non_filament, mut item_warnings) =
        build_entries_from_store_handles(client, &handles, material_filters);
    warnings.append(&mut item_warnings);

    Ok(EsunCatalogRefreshSnapshot {
        entries,
        handles_found: handles.len() as i64,
        products_processed,
        skipped_non_filament,
        warnings,
        detected_store: ESUN_STORE_BASE_URL.to_string(),
        detected_collection: "search?type=product&q=".to_string(),
    })
}

fn build_entries_from_store_handles(
    client: &Client,
    handles: &[String],
    material_filters: &[String],
) -> (Vec<EsunCatalogEntry>, i64, i64, Vec<String>) {
    let mut entries = Vec::new();
    let mut entry_keys = HashSet::new();
    let mut products_processed = 0i64;
    let mut skipped_non_filament = 0i64;
    let mut warnings = Vec::new();
    let mut consecutive_anti_bot_errors = 0usize;

    for (index, handle) in handles.iter().enumerate() {
        pause_between_requests(index + 1);
        let detail = match fetch_esun_product_detail_with_client(client, handle) {
            Ok(detail) => {
                consecutive_anti_bot_errors = 0;
                detail
            }
            Err(error) => {
                warnings.push(format!("{handle}: {error}"));
                if is_anti_bot_warning(&error) {
                    consecutive_anti_bot_errors += 1;
                    if consecutive_anti_bot_errors >= ESUN_ANTI_BOT_BREAK_THRESHOLD {
                        warnings.push(
                            "Stopped store detail lookup early after repeated anti-bot responses."
                                .to_string(),
                        );
                        break;
                    }
                } else {
                    consecutive_anti_bot_errors = 0;
                }
                continue;
            }
        };

        products_processed += 1;
        if !looks_like_filament(&detail.title.to_lowercase()) {
            skipped_non_filament += 1;
            continue;
        }
        if !material_filters.is_empty()
            && !matches_material_filter(&detail.material, material_filters)
        {
            continue;
        }
        append_entries_from_product_detail(&mut entries, &mut entry_keys, &detail);
    }

    (entries, products_processed, skipped_non_filament, warnings)
}

fn refresh_esun_catalog_snapshot_from_site(
    client: &Client,
    material_filters: &[String],
) -> Result<EsunCatalogRefreshSnapshot, String> {
    let mut warnings = Vec::new();
    let mut product_urls = Vec::new();
    let mut consecutive_empty_pages = 0usize;

    for page in 1..=12 {
        if page > 1 {
            pause_between_requests(page as usize);
        }
        let page_url = if page == 1 {
            format!("{ESUN_SITE_BASE_URL}/filaments/")
        } else {
            format!("{ESUN_SITE_BASE_URL}/filaments/page/{page}/")
        };
        let url = Url::parse(&page_url).map_err(|error| error.to_string())?;
        match fetch_text_with_client(client, &url) {
            Ok(html) => {
                let discovered = extract_site_product_urls(&html);
                if discovered.is_empty() {
                    consecutive_empty_pages += 1;
                    if page == 1 {
                        warnings.push("No product links found on fallback index page.".to_string());
                    } else if consecutive_empty_pages >= ESUN_EMPTY_PAGE_BREAK_THRESHOLD {
                        warnings.push(format!(
                            "Stopped fallback pagination after {consecutive_empty_pages} empty pages."
                        ));
                        break;
                    }
                } else {
                    consecutive_empty_pages = 0;
                    product_urls.extend(discovered);
                }
            }
            Err(error) => {
                if is_anti_bot_warning(&error) {
                    warnings.push(format!(
                        "Stopped fallback pagination at page {page}: anti-bot response detected ({error})"
                    ));
                    break;
                }
                if page == 1 {
                    return Err(format!("Could not load fallback listing page: {error}"));
                }
                warnings.push(format!("Stopped pagination at page {page}: {error}"));
                break;
            }
        }
    }

    let mut seen_urls = HashSet::new();
    product_urls.retain(|url| seen_urls.insert(url.clone()));
    if product_urls.is_empty() {
        return Err("Fallback listing returned no product URLs.".to_string());
    }

    let mut entries = Vec::new();
    let mut entry_keys = HashSet::new();
    let mut products_processed = 0i64;
    let mut skipped_non_filament = 0i64;
    let mut consecutive_anti_bot_errors = 0usize;

    for (index, product_url) in product_urls.iter().enumerate() {
        pause_between_requests(index + 1);
        let detail = match fetch_esun_site_product_detail_with_client(client, product_url) {
            Ok(detail) => {
                consecutive_anti_bot_errors = 0;
                detail
            }
            Err(error) => {
                warnings.push(format!("{product_url}: {error}"));
                if is_anti_bot_warning(&error) {
                    consecutive_anti_bot_errors += 1;
                    if consecutive_anti_bot_errors >= ESUN_ANTI_BOT_BREAK_THRESHOLD {
                        warnings.push(
                            "Stopped fallback detail lookup early after repeated anti-bot responses."
                                .to_string(),
                        );
                        break;
                    }
                } else {
                    consecutive_anti_bot_errors = 0;
                }
                continue;
            }
        };

        products_processed += 1;
        if !looks_like_filament(&detail.title.to_lowercase()) {
            skipped_non_filament += 1;
            continue;
        }
        if !material_filters.is_empty()
            && !matches_material_filter(&detail.material, material_filters)
        {
            continue;
        }
        append_entries_from_product_detail(&mut entries, &mut entry_keys, &detail);
    }

    if entries.is_empty() {
        return Err("Fallback source produced zero filament entries.".to_string());
    }

    Ok(EsunCatalogRefreshSnapshot {
        entries,
        handles_found: product_urls.len() as i64,
        products_processed,
        skipped_non_filament,
        warnings,
        detected_store: ESUN_SITE_BASE_URL.to_string(),
        detected_collection: "/filaments/page/{n}/".to_string(),
    })
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

fn matches_material_filter(material: &str, material_filters: &[String]) -> bool {
    if material_filters.is_empty() {
        return true;
    }
    let normalized = material.trim().to_uppercase();
    material_filters.iter().any(|value| value == &normalized)
}

fn extract_site_product_urls(html: &str) -> Vec<String> {
    if html.is_empty() {
        return Vec::new();
    }

    let mut cursor = 0usize;
    let mut urls = Vec::new();
    let mut seen = HashSet::new();

    while cursor < html.len() {
        let Some(href_rel) = html[cursor..].find("href=\"") else {
            break;
        };
        let href_start = cursor + href_rel + "href=\"".len();
        let Some(href_end_rel) = html[href_start..].find('\"') else {
            break;
        };
        let href_end = href_start + href_end_rel;
        cursor = href_end;

        let href_raw = html[href_start..href_end].trim();
        if !href_raw.contains("-product/") {
            continue;
        }
        if href_raw.starts_with("javascript:") || href_raw.starts_with('#') {
            continue;
        }

        let normalized = if href_raw.starts_with("http://") || href_raw.starts_with("https://") {
            href_raw.to_string()
        } else if href_raw.starts_with('/') {
            format!("{ESUN_SITE_BASE_URL}{href_raw}")
        } else {
            format!("{ESUN_SITE_BASE_URL}/{href_raw}")
        };
        if !normalized.contains("esun3d.com") {
            continue;
        }

        let parsed = match Url::parse(&normalized) {
            Ok(url) => url,
            Err(_) => continue,
        };
        let mut cleaned = parsed.clone();
        cleaned.set_query(None);
        cleaned.set_fragment(None);
        let clean_url = cleaned.to_string();
        if seen.insert(clean_url.clone()) {
            urls.push(clean_url);
        }
    }

    urls
}

fn fetch_esun_site_product_detail_with_client(
    client: &Client,
    product_url: &str,
) -> Result<EsunProductDetail, String> {
    let mut url = Url::parse(product_url).map_err(|error| error.to_string())?;
    url.set_query(None);
    url.set_fragment(None);

    let html = fetch_text_with_client(client, &url)?;
    let page_title = extract_tag_content(&html, "title")
        .map(|value| normalize_whitespace(&decode_html_entities(&strip_tags(&value))))
        .unwrap_or_default();
    let og_title = extract_meta_content(&html, "og:title")
        .map(|value| normalize_whitespace(&decode_html_entities(&value)))
        .unwrap_or_default();
    let effective_title = if page_title.is_empty() {
        if og_title.is_empty() {
            "eSUN filament".to_string()
        } else {
            og_title.clone()
        }
    } else {
        page_title
    };

    let slug = url
        .path_segments()
        .and_then(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .last()
                .map(|segment| segment.to_string())
        })
        .unwrap_or_else(|| "unknown-product".to_string());

    let filament_name = if og_title.is_empty() {
        infer_filament_name(&effective_title)
    } else {
        og_title
    };
    let material = infer_material(&format!("{filament_name} {effective_title}"));
    let default_weight_g =
        parse_weight_grams(&effective_title).or_else(|| parse_weight_grams(&filament_name));
    let image_url = extract_meta_content(&html, "og:image").map(|value| normalize_url(&value));
    let colors = normalize_esun_color_options(
        parse_esun_site_product_colors(&html),
        &material,
        &filament_name,
    );

    Ok(EsunProductDetail {
        handle: sanitize_handle(&slug),
        title: effective_title,
        filament_name,
        material,
        product_url: url.to_string(),
        image_url,
        default_weight_g,
        vendor: "eSUN".to_string(),
        colors,
    })
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
                .and_then(normalize_hex);
            output.push(EsunColorOption {
                color_name,
                hex_color,
            });
        }
    }

    output
}

fn parse_esun_site_product_colors(html: &str) -> Vec<EsunColorOption> {
    if html.is_empty() {
        return Vec::new();
    }

    let mut output = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = 0usize;

    while cursor < html.len() {
        let Some(marker_rel) = html[cursor..].find("class=\"attr-color-item\"") else {
            break;
        };
        let marker_start = cursor + marker_rel;
        let block_start = html[..marker_start].rfind("<label").unwrap_or(marker_start);
        let block_end = html[marker_start..]
            .find("</label>")
            .map(|rel| marker_start + rel + "</label>".len())
            .unwrap_or_else(|| clamp_to_char_boundary(html, (marker_start + 1800).min(html.len())));
        let block = &html[block_start..block_end];
        cursor = block_end;

        let color_name = extract_tag_content(block, "p")
            .map(|value| normalize_whitespace(&decode_html_entities(&strip_tags(&value))))
            .unwrap_or_default();
        if color_name.is_empty() || !seen.insert(color_name.clone()) {
            continue;
        }

        let hex_color = extract_inline_hex_color(block)
            .or_else(|| extract_class_hex_color(block))
            .and_then(|hex| normalize_hex(&hex));

        output.push(EsunColorOption {
            color_name,
            hex_color,
        });
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
    prefixes.sort_by(|left, right| right.len().cmp(&left.len()));
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
    if cleaned.is_empty() {
        fallback
    } else {
        cleaned
    }
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

fn pause_between_requests(seed: usize) {
    if seed == 0 {
        return;
    }
    let jitter = ((seed as u64).wrapping_mul(97) % ESUN_REQUEST_JITTER_MS.max(1)) as u64;
    thread::sleep(Duration::from_millis(ESUN_REQUEST_DELAY_MS + jitter));
}

fn sleep_retry_backoff(attempt: usize) {
    let multiplier = (attempt as u64) + 1;
    let delay = ESUN_RETRY_BASE_DELAY_MS.saturating_mul(multiplier);
    thread::sleep(Duration::from_millis(delay));
}

fn is_anti_bot_response(status_code: u16, body_lower: &str) -> bool {
    status_code == 429
        || body_lower.contains("just a moment")
        || body_lower.contains("cf-mitigated")
        || body_lower.contains("cloudflare")
        || body_lower.contains("attention required")
}

fn is_anti_bot_warning(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.contains("anti-bot")
        || lower.contains("cloudflare")
        || lower.contains("429 too many requests")
        || lower.contains("just a moment")
        || lower.contains("cf-mitigated")
}

fn find_matching_bracket(text: &str, start: usize, open: char, close: char) -> Option<usize> {
    let bytes = text.as_bytes();
    if start >= bytes.len() || bytes[start] as char != open {
        return None;
    }

    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (index, byte) in bytes.iter().enumerate().skip(start) {
        let ch = *byte as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            continue;
        }
        if ch == open {
            depth += 1;
            continue;
        }
        if ch == close {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return Some(index);
            }
        }
    }

    None
}

fn sanitize_handle(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("/products/")
        .split(|ch| ch == '?' || ch == '#' || ch == '/' || ch == '\"')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn extract_attr_value(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('\"')?;
    Some(tag[start..start + end].to_string())
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let open_token = format!("<{tag}");
    let open_index = find_ascii_case_insensitive(html, &open_token)?;
    let content_start = open_index + html[open_index..].find('>')? + 1;
    let close_token = format!("</{tag}>");
    let content_end =
        content_start + find_ascii_case_insensitive(&html[content_start..], &close_token)?;
    Some(html[content_start..content_end].to_string())
}

fn find_ascii_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

fn extract_meta_content(html: &str, property: &str) -> Option<String> {
    let needle = format!("property=\"{property}\"");
    let index = html.find(&needle)?;
    let end = clamp_to_char_boundary(html, (index + 600).min(html.len()));
    extract_attr_value(&html[index..end], "content")
}

fn strip_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn looks_like_filament(title_lower: &str) -> bool {
    if title_lower.contains("swatch") || title_lower.contains("sample book") {
        return false;
    }
    title_lower.contains("filament") || title_lower.contains("refilament")
}

fn infer_material(title: &str) -> String {
    let rules = [
        ("PLA", "PLA"),
        ("PETG", "PETG"),
        ("ABS", "ABS"),
        ("TPU", "TPU"),
        ("ASA", "ASA"),
        ("PA12", "PA12"),
        ("PAHT", "PAHT"),
        ("PA", "PA"),
        ("PET", "PET"),
        ("PC", "PC"),
    ];
    let upper = title.to_uppercase();
    for (needle, material) in rules {
        if upper.contains(needle) {
            return material.to_string();
        }
    }
    "UNKNOWN".to_string()
}

fn infer_filament_name(title: &str) -> String {
    let mut name = title.trim().to_string();
    if name.to_lowercase().starts_with("esun ") {
        name = name[5..].trim().to_string();
    }

    for marker in [" 1.75mm", " 2.85mm", " 3.00mm", " 3d filament", " filament"] {
        if let Some(index) = find_ascii_case_insensitive(&name, marker) {
            name = name[..index].trim().to_string();
            break;
        }
    }

    if name.is_empty() {
        title.trim().to_string()
    } else {
        name
    }
}

fn parse_weight_grams(title: &str) -> Option<i64> {
    for token in title.split_whitespace().rev() {
        let clean = token
            .trim_matches(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '.'))
            .to_uppercase();
        if let Some(value) = clean.strip_suffix("KG") {
            if let Ok(number) = value.parse::<f64>() {
                return Some((number * 1000.0).round() as i64);
            }
        }
        if let Some(value) = clean.strip_suffix('G') {
            if let Ok(number) = value.parse::<f64>() {
                return Some(number.round() as i64);
            }
        }
    }
    None
}

fn normalize_hex(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let mut hex = if value.starts_with('#') {
        value.to_string()
    } else {
        format!("#{value}")
    };
    let digits = &hex[1..];
    if (digits.len() == 3 || digits.len() == 6) && digits.chars().all(|ch| ch.is_ascii_hexdigit()) {
        hex.make_ascii_uppercase();
        Some(hex)
    } else {
        None
    }
}

fn extract_inline_hex_color(value: &str) -> Option<String> {
    for marker in ["background-color:", "background:"] {
        if let Some(marker_index) = value.find(marker) {
            let rest = &value[marker_index + marker.len()..];
            if let Some(hash_index) = rest.find('#') {
                let hex_start = hash_index + 1;
                let hex: String = rest[hex_start..]
                    .chars()
                    .take_while(|ch| ch.is_ascii_hexdigit())
                    .take(6)
                    .collect();
                if hex.len() == 3 || hex.len() == 6 {
                    return Some(format!("#{hex}"));
                }
            }
        }
    }
    None
}

fn extract_class_hex_color(value: &str) -> Option<String> {
    let marker = "item-color-";
    let marker_index = value.find(marker)?;
    let start = marker_index + marker.len();
    let hex: String = value[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_hexdigit())
        .take(6)
        .collect();
    if hex.len() == 3 || hex.len() == 6 {
        Some(format!("#{hex}"))
    } else {
        None
    }
}

fn normalize_url(url: &str) -> String {
    if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.to_string()
    }
}

fn clamp_to_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}
