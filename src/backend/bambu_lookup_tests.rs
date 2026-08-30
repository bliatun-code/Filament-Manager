use super::{
    bambu_material_families, bambu_response_is_blocking, canonical_base_url,
    discover_bambu_material_channels_with_fetch, infer_material, normalize_material_filters,
    official_bambu_hex_codes, parse_bambu_next_collection_page, read_bounded_utf8_response,
    refresh_bambu_catalog_snapshot_from_source_with_fetch, require_single_material_filter,
    resolve_bambu_hex, validate_bambu_refresh_snapshot_for_mutation, BambuCatalogEntry,
    BambuCatalogRefreshSnapshot, DetectStoreResult, DiscoveryHttpResponse,
    TARGETED_DETAIL_MAX_REQUESTS, USER_AGENT,
};
use std::collections::HashSet;
use std::io::Cursor;

fn html_response(final_url: &str, body: String) -> DiscoveryHttpResponse {
    DiscoveryHttpResponse {
        status: 200,
        content_type: Some("text/html; charset=utf-8".to_string()),
        final_url: final_url.to_string(),
        body,
    }
}

fn next_collection_html(
    page: usize,
    size: usize,
    total: usize,
    products: &[(String, String, String)],
    split_flight_payload: bool,
) -> String {
    let rsc = format!(
        "0:{}",
        serde_json::json!({
            "size": size,
            "initialPage": page,
            "productList": products
                .iter()
                .map(|(id, handle, name)| serde_json::json!({
                    "id": id,
                    "seoCode": handle,
                    "name": name,
                }))
                .collect::<Vec<_>>(),
            "total": total,
        })
    );
    let chunks = if split_flight_payload {
        let split = rsc.len() / 2;
        vec![&rsc[..split], &rsc[split..]]
    } else {
        vec![rsc.as_str()]
    };
    let scripts = chunks
        .into_iter()
        .map(|chunk| {
            format!(
                "<script>self.__next_f.push({})</script>",
                serde_json::json!([1, chunk])
            )
        })
        .collect::<String>();
    format!(
        "<!doctype html><html><body>{scripts}<script src=\"/cdn-cgi/challenge-platform/scripts/jsd/main.js\"></script><script src=\"https://static.cloudflareinsights.com/beacon.min.js\"></script></body></html>"
    )
}

fn collection_products(
    page: usize,
    size: usize,
    total: usize,
    material_names: &[&str],
) -> Vec<(String, String, String)> {
    material_names
        .iter()
        .enumerate()
        .map(|(index, name)| {
            let ordinal = (page - 1) * size + index + 1;
            (
                format!("id-{ordinal}"),
                format!("product-{ordinal}"),
                (*name).to_string(),
            )
        })
        .take(total.saturating_sub((page - 1) * size).min(size))
        .collect()
}

fn product_group_html(
    group_name: &str,
    product_url: &str,
    variants: &[(&str, &str, serde_json::Value)],
) -> String {
    let variants = variants
        .iter()
        .map(|(sku, name, image)| {
            serde_json::json!({
                "@type": "Product",
                "sku": sku,
                "name": name,
                "image": image,
            })
        })
        .collect::<Vec<_>>();
    format!(
        "<!doctype html><html><head><script type=\"application/ld+json\">{}</script></head></html>",
        serde_json::json!({
            "@context": "https://schema.org",
            "@type": "ProductGroup",
            "name": group_name,
            "url": product_url,
            "hasVariant": variants,
        })
    )
}

#[test]
fn infer_material_uses_prefixes() {
    assert_eq!(infer_material("PLA Basic"), "PLA");
    assert_eq!(infer_material("PA6-CF"), "PA6");
    assert_eq!(infer_material("PA-CF"), "PA");
    assert_eq!(infer_material("PPA-CF"), "PPA");
    assert_eq!(infer_material("PCTG"), "PCTG");
    assert_eq!(infer_material("PPS-CF"), "PPS");
    assert_eq!(infer_material("PVA"), "PVA");
    assert_eq!(infer_material("PP"), "PP");
    assert_eq!(infer_material("PE Support"), "PE");
    assert_eq!(infer_material("BVOH Support"), "BVOH");
    assert_eq!(infer_material("EVA"), "EVA");
    assert_eq!(infer_material("HIPS"), "HIPS");
    assert_eq!(infer_material("PHA"), "PHA");
    assert_eq!(infer_material("Support for PLA"), "Support for PLA");
    assert_eq!(
        infer_material("Support For PLA/PETG"),
        "Support for PLA/PETG"
    );
    assert_eq!(infer_material("Custom Blend"), "CUSTOM");
}

#[test]
fn bambu_material_family_table_is_unique_and_ordered_by_specificity() {
    let families = bambu_material_families();
    assert!(!families.is_empty(), "Bambu material family table is empty");

    let mut seen_materials = HashSet::new();
    let mut seen_prefixes = HashSet::new();
    let mut flattened_prefixes: Vec<(String, String)> = Vec::new();
    for (family_index, family) in families.iter().enumerate() {
        assert!(
            !family.material.trim().is_empty(),
            "empty Bambu material family name at index {family_index}"
        );
        assert!(
            seen_materials.insert(family.material.trim().to_uppercase()),
            "duplicate Bambu material family {}",
            family.material
        );
        assert!(
            !family.prefixes.is_empty(),
            "Bambu material family {} has no prefixes",
            family.material
        );
        for prefix in &family.prefixes {
            assert!(
                prefix == prefix.trim(),
                "Bambu material prefix has surrounding whitespace: {prefix:?}"
            );
            assert!(
                !prefix.is_empty(),
                "empty Bambu material prefix for {}",
                family.material
            );
            let normalized = prefix.to_uppercase();
            assert!(
                seen_prefixes.insert(normalized.clone()),
                "duplicate Bambu material prefix {}",
                prefix
            );
            flattened_prefixes.push((family.material.clone(), normalized));
        }
    }

    for (left_position, (left_material, left_prefix)) in flattened_prefixes.iter().enumerate() {
        for (right_material, right_prefix) in flattened_prefixes.iter().skip(left_position + 1) {
            assert!(
                !right_prefix.starts_with(left_prefix),
                "Bambu material prefix {left_prefix:?} for {left_material} shadows \
                 later prefix {right_prefix:?} for {right_material}; put the more \
                 specific prefix first"
            );
        }
    }
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
fn official_bambu_hex_table_has_unique_valid_entries() {
    let entries = official_bambu_hex_codes();
    assert_eq!(entries.len(), 214);

    let mut seen = HashSet::new();
    for entry in entries {
        assert!(
            seen.insert((entry.filament.as_str(), entry.color.as_str())),
            "duplicate official Bambu hex entry for {} / {}",
            entry.filament,
            entry.color
        );
        assert!(
            entry.hex.len() == 7
                && entry.hex.starts_with('#')
                && entry.hex[1..].chars().all(|ch| ch.is_ascii_hexdigit()),
            "invalid official Bambu hex value {}",
            entry.hex
        );
        if let Some(kind) = entry.kind.as_deref() {
            assert!(
                kind == "multi" || kind == "gradient",
                "invalid official Bambu swatch kind {}",
                kind
            );
        }
        if let Some(colors) = entry.colors.as_ref() {
            assert!(
                colors.len() > 1,
                "official composite swatches need at least two colors"
            );
            for color in colors {
                assert!(
                    color.len() == 7
                        && color.starts_with('#')
                        && color[1..].chars().all(|ch| ch.is_ascii_hexdigit()),
                    "invalid official Bambu composite color {}",
                    color
                );
            }
        }
    }
}

#[test]
fn resolve_bambu_hex_prefers_official_color_tables() {
    assert_eq!(
        resolve_bambu_hex("PLA Basic", "Beige (10201)").as_deref(),
        Some("#F7E6DE")
    );
    assert_eq!(
        resolve_bambu_hex("PLA Matte", "Matte Plum (11204)").as_deref(),
        Some("#950051")
    );
    assert_eq!(
        resolve_bambu_hex("PLA Tough+", "Cyan (12601)").as_deref(),
        Some("#009BD8")
    );
    assert_eq!(
        resolve_bambu_hex("PETG HF", "Lake Blue (33507)").as_deref(),
        Some("#1F79E5")
    );
    assert_eq!(
        resolve_bambu_hex("ABS", "ABS Azure (40601)").as_deref(),
        Some("#489FDF")
    );
    assert_eq!(
        resolve_bambu_hex("PLA Basic Gradient", "Ocean to Meadow (10902)").as_deref(),
        Some("gradient(#307FE2,#54FF9B)")
    );
    assert_eq!(
        resolve_bambu_hex("PLA Silk Multi-Colour", "Dawn Radiance (13912)").as_deref(),
        Some("gradient(#EC984C,#6CD4BC,#A66EB9,#D87694)")
    );
    assert_eq!(
        resolve_bambu_hex("PLA Silk Multi-Color", "Mystic Magenta (13900)").as_deref(),
        Some("multi(#720062,#3A913F)")
    );
    assert_eq!(
        resolve_bambu_hex("TPU 85A / TPU 90A", "Frozen (51900)").as_deref(),
        Some("#FFFFFF")
    );
    assert_eq!(
        resolve_bambu_hex("PETG-CF", "Titan Gray  (31101)").as_deref(),
        Some("#565656")
    );
    assert_eq!(
        resolve_bambu_hex("ABS", "Azure").as_deref(),
        Some("#489FDF")
    );
    assert_eq!(
        resolve_bambu_hex("ABS", "Unknown Azure").as_deref(),
        Some("#1976d2")
    );
}

#[test]
fn next_rsc_parser_reassembles_split_flight_chunks_and_allows_normal_html() {
    let products = vec![
        (
            "id-1".to_string(),
            "pla-basic".to_string(),
            "PLA Basic".to_string(),
        ),
        (
            "id-2".to_string(),
            "petg-hf".to_string(),
            "PETG HF".to_string(),
        ),
    ];
    let html = next_collection_html(1, 12, 2, &products, true);
    let parsed = parse_bambu_next_collection_page(&html).expect("split RSC fixture");

    assert_eq!(parsed.size, 12);
    assert_eq!(parsed.initial_page, 1);
    assert_eq!(parsed.total, 2);
    assert_eq!(parsed.products.len(), 2);
    assert_eq!(parsed.products[0].handle, "pla-basic");
    assert!(!bambu_response_is_blocking(200, &html));
}

#[test]
fn discovery_completes_exactly_on_page_four_and_uses_canonical_redirect_origin() {
    let base_urls = vec!["https://us.store.bambulab.com".to_string()];
    let mut requested_urls = Vec::new();

    let discovery =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |url| {
            requested_urls.push(url.to_string());
            let page = requested_urls.len();
            let count = if page < 4 { 12 } else { 11 };
            let products = (0..count)
                .map(|index| {
                    let ordinal = (page - 1) * 12 + index + 1;
                    let name = match ordinal % 3 {
                        0 => "ABS",
                        1 => "PLA Basic",
                        _ => "PETG HF",
                    };
                    (
                        format!("id-{ordinal}"),
                        format!("product-{ordinal}"),
                        name.to_string(),
                    )
                })
                .collect::<Vec<_>>();
            Ok(html_response(
                &format!("https://eu.store.bambulab.com/collections/filament?page={page}"),
                next_collection_html(page, 12, 47, &products, page == 1),
            ))
        })
        .expect("47 products at 12 per page should complete on page four");

    assert_eq!(requested_urls.len(), 4);
    assert_eq!(
        requested_urls[0],
        "https://us.store.bambulab.com/collections/filament"
    );
    assert_eq!(
        requested_urls[1],
        "https://eu.store.bambulab.com/collections/filament?page=2"
    );
    assert_eq!(
        requested_urls[3],
        "https://eu.store.bambulab.com/collections/filament?page=4"
    );
    assert_eq!(discovery.detected_store, "https://eu.store.bambulab.com");
    assert_eq!(discovery.products_discovered, 47);
    assert_eq!(discovery.discovered_materials, ["ABS", "PETG", "PLA"]);
    assert_eq!(discovery.detail_fetches, 0);
    assert!(discovery.output.contains("Discovery quality: complete"));
}

#[test]
fn canonical_origin_accepts_only_same_origin_or_official_bambu_store_redirects() {
    assert_eq!(
        canonical_base_url(
            "https://eu.store.bambulab.com/collections/filament",
            "https://us.store.bambulab.com"
        ),
        "https://eu.store.bambulab.com"
    );
    assert_eq!(
        canonical_base_url(
            "https://attacker.example/collections/filament",
            "https://us.store.bambulab.com"
        ),
        "https://us.store.bambulab.com"
    );
    assert_eq!(
        canonical_base_url(
            "http://localhost:4200/collections/filament",
            "http://localhost:4200"
        ),
        "http://localhost:4200"
    );
}

#[test]
fn discovery_fails_closed_on_wrong_page_partial_page_and_duplicate_summary() {
    let base_urls = vec!["https://store.example".to_string()];
    let page_one = collection_products(1, 2, 3, &["PLA Basic", "PETG HF"]);

    let wrong_page =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            Ok(html_response(
                "https://store.example/collections/filament",
                next_collection_html(2, 2, 3, &page_one, false),
            ))
        })
        .expect_err("wrong initialPage must fail closed");
    assert!(wrong_page.contains("requested page 1"));

    let partial =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            let only_one = vec![page_one[0].clone()];
            Ok(html_response(
                "https://store.example/collections/filament",
                next_collection_html(1, 2, 3, &only_one, false),
            ))
        })
        .expect_err("short intermediate page must fail closed");
    assert!(partial.contains("expected 2 products"));

    let duplicate_page_one = vec![
        (
            "same-id".to_string(),
            "pla-basic".to_string(),
            "PLA Basic".to_string(),
        ),
        (
            "same-id".to_string(),
            "petg-hf".to_string(),
            "PETG HF".to_string(),
        ),
    ];
    let duplicate =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            Ok(html_response(
                "https://store.example/collections/filament",
                next_collection_html(1, 2, 2, &duplicate_page_one, false),
            ))
        })
        .expect_err("duplicate id must fail closed");
    assert!(duplicate.contains("repeated product id"));
}

#[test]
fn discovery_rejects_inconsistent_metadata_and_request_budget_overflow() {
    let base_urls = vec!["https://store.example".to_string()];
    let mut calls = 0usize;
    let inconsistent =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            calls += 1;
            let page = calls;
            let total = if page == 1 { 3 } else { 4 };
            let products = collection_products(page, 2, total, &["PLA Basic", "PETG HF"]);
            Ok(html_response(
                &format!("https://store.example/collections/filament?page={page}"),
                next_collection_html(page, 2, total, &products, false),
            ))
        })
        .expect_err("changed total must fail closed");
    assert!(inconsistent.contains("inconsistent size or total"));

    let over_page_cap =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            let products = collection_products(1, 12, 49, &["PLA Basic"; 12]);
            Ok(html_response(
                "https://store.example/collections/filament",
                next_collection_html(1, 12, 49, &products, false),
            ))
        })
        .expect_err("five-page listing must exceed the page cap");
    assert!(over_page_cap.contains("exceeding its 4-page safety budget"));
}

#[test]
fn discovery_stops_on_a_200_challenge_without_trying_another_store() {
    let base_urls = vec![
        "https://blocked.example".to_string(),
        "https://unused.example".to_string(),
    ];
    let mut requests = 0usize;
    let error = discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
        requests += 1;
        Ok(html_response(
            "https://blocked.example/collections/filament",
            "<html><title>Just a moment...</title><div>cf-chl-widget</div></html>".to_string(),
        ))
    })
    .expect_err("challenge response must be inconclusive");

    assert_eq!(requests, 1);
    assert!(error.contains("challenge page"));
    assert!(error.contains("left unchanged"));
}

#[test]
fn discovery_can_fall_back_after_a_non_blocking_missing_store() {
    let base_urls = vec![
        "https://missing.example".to_string(),
        "https://working.example".to_string(),
    ];
    let mut requests = Vec::new();
    let result =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |url| {
            requests.push(url.to_string());
            if url.starts_with("https://missing.example") {
                return Ok(DiscoveryHttpResponse {
                    status: 404,
                    content_type: Some("text/html".to_string()),
                    final_url: url.to_string(),
                    body: "not found".to_string(),
                });
            }
            let products = collection_products(1, 12, 1, &["PETG HF"]);
            Ok(html_response(
                url,
                next_collection_html(1, 12, 1, &products, false),
            ))
        })
        .expect("second store should be tried after a plain 404");

    assert_eq!(requests.len(), 2);
    assert_eq!(result.detected_store, "https://working.example");
    assert_eq!(result.discovered_materials, ["PETG"]);
}

#[test]
fn targeted_refresh_fetches_only_the_selected_family_and_dedupes_spool_variants() {
    let source = DetectStoreResult {
        base_url: "https://us.store.bambulab.com".to_string(),
        handle: "filament".to_string(),
    };
    let products = vec![
        (
            "id-1".to_string(),
            "pla-basic".to_string(),
            "PLA Basic".to_string(),
        ),
        (
            "id-2".to_string(),
            "petg-hf".to_string(),
            "PETG HF".to_string(),
        ),
    ];
    let mut requested_urls = Vec::new();
    let snapshot =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |url| {
            requested_urls.push(url.to_string());
            if url.contains("/collections/") {
                return Ok(html_response(
                    "https://eu.store.bambulab.com/collections/filament",
                    next_collection_html(1, 12, 2, &products, true),
                ));
            }
            if url == "https://eu.store.bambulab.com/products/pla-basic" {
                return Ok(html_response(
                    url,
                    product_group_html(
                        "PLA Basic",
                        url,
                        &[
                            (
                                "PLA-RED-REFILL",
                                "PLA Basic - Red (10200) / Refill / 1kg",
                                serde_json::json!("/images/red-refill.webp"),
                            ),
                            (
                                "PLA-RED-SPOOL",
                                "PLA Basic - Red (10200) / Filament with spool / 1 kg",
                                serde_json::json!("/images/red-spool.webp"),
                            ),
                            (
                                "PLA-JADE",
                                "PLA Basic - Jade White (10100) / Refill / 1000g",
                                serde_json::json!(["https://cdn.example/jade.webp"]),
                            ),
                        ],
                    ),
                ));
            }
            Err(format!("unexpected request: {url}"))
        })
        .expect("targeted PLA refresh");

    assert_eq!(
        requested_urls,
        [
            "https://us.store.bambulab.com/collections/filament",
            "https://eu.store.bambulab.com/products/pla-basic",
        ]
    );
    assert_eq!(snapshot.detected_store, "https://eu.store.bambulab.com");
    assert_eq!(snapshot.products_discovered, 2);
    assert_eq!(snapshot.products_detailed, 1);
    assert_eq!(snapshot.detail_fetches, 1);
    assert_eq!(snapshot.entries.len(), 2);
    assert_eq!(snapshot.entries[0].color_name, "Red (10200)");
    assert_eq!(snapshot.entries[0].default_weight_g, 1000);
    assert_eq!(snapshot.entries[1].color_name, "Jade White (10100)");
    assert_eq!(snapshot.entries[1].hex_color.as_deref(), Some("#FFFFFF"));
    assert!(validate_bambu_refresh_snapshot_for_mutation(&snapshot).is_ok());
}

#[test]
fn targeted_refresh_fails_closed_when_any_selected_detail_is_missing() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let products = vec![
        (
            "id-1".to_string(),
            "pla-basic".to_string(),
            "PLA Basic".to_string(),
        ),
        (
            "id-2".to_string(),
            "pla-matte".to_string(),
            "PLA Matte".to_string(),
        ),
        (
            "id-3".to_string(),
            "petg-hf".to_string(),
            "PETG HF".to_string(),
        ),
    ];
    let mut detail_requests = Vec::new();
    let error =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |url| {
            if url.contains("/collections/") {
                return Ok(html_response(
                    url,
                    next_collection_html(1, 12, 3, &products, false),
                ));
            }
            detail_requests.push(url.to_string());
            if url.ends_with("/pla-basic") {
                return Ok(html_response(
                    url,
                    product_group_html(
                        "PLA Basic",
                        url,
                        &[(
                            "PLA-BASIC-RED",
                            "PLA Basic - Red (10200) / Refill / 1kg",
                            serde_json::Value::Null,
                        )],
                    ),
                ));
            }
            Ok(DiscoveryHttpResponse {
                status: 503,
                content_type: Some("text/html".to_string()),
                final_url: url.to_string(),
                body: "service unavailable".to_string(),
            })
        })
        .expect_err("one missing selected detail invalidates the whole snapshot");

    assert_eq!(
        detail_requests,
        [
            "https://store.example/products/pla-basic",
            "https://store.example/products/pla-matte",
        ]
    );
    assert!(error.contains("blocked or rate-limited"));
}

#[test]
fn targeted_refresh_refuses_a_family_above_the_detail_budget_without_detail_calls() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let products = (0..=TARGETED_DETAIL_MAX_REQUESTS)
        .map(|index| {
            (
                format!("id-{index}"),
                format!("pla-{index}"),
                format!("PLA Special {index}"),
            )
        })
        .collect::<Vec<_>>();
    let mut requests = 0usize;
    let error =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |url| {
            requests += 1;
            assert!(
                url.contains("/collections/"),
                "no detail request is allowed"
            );
            Ok(html_response(
                url,
                next_collection_html(1, products.len(), products.len(), &products, false),
            ))
        })
        .expect_err("oversized family must fail before details");

    assert_eq!(requests, 1);
    assert!(error.contains("detail safety budget"));
}

#[test]
fn targeted_refresh_rejects_malformed_or_mismatched_product_group() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let products = collection_products(1, 12, 1, &["PLA Basic"]);
    let error =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |url| {
            if url.contains("/collections/") {
                return Ok(html_response(
                    url,
                    next_collection_html(1, 12, 1, &products, false),
                ));
            }
            Ok(html_response(
                url,
                product_group_html(
                    "PETG HF",
                    url,
                    &[(
                        "PETG-BLACK",
                        "PETG HF - Black (30101) / Refill / 1kg",
                        serde_json::Value::Null,
                    )],
                ),
            ))
        })
        .expect_err("mismatched ProductGroup must fail closed");
    assert!(error.contains("did not match the collection summary"));
}

#[test]
fn targeted_refresh_requires_exactly_one_known_material_family() {
    assert!(require_single_material_filter(None).is_err());
    assert!(require_single_material_filter(Some(vec!["PLA".into(), "PETG".into()])).is_err());
    assert!(require_single_material_filter(Some(vec!["Hotend".into()])).is_err());
    assert_eq!(
        require_single_material_filter(Some(vec![" pla ".into()])).expect("known material"),
        "PLA"
    );
}

#[test]
fn blocking_detection_is_specific_and_covers_cooldown_statuses() {
    assert!(bambu_response_is_blocking(403, "ordinary response"));
    assert!(bambu_response_is_blocking(429, "ordinary response"));
    assert!(bambu_response_is_blocking(503, "ordinary response"));
    assert!(bambu_response_is_blocking(
        200,
        "<html><title>Just a moment...</title><div>cf-chl-widget</div></html>"
    ));
    assert!(!bambu_response_is_blocking(
        200,
        "<!doctype html><html><script src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'></script><script src='https://static.cloudflareinsights.com/beacon.min.js'></script></html>"
    ));
    assert!(!bambu_response_is_blocking(
        200,
        "<!doctype html><html><script src='https://www.google.com/recaptcha/api.js'></script><p>Protected by reCAPTCHA</p></html>"
    ));
    assert!(bambu_response_is_blocking(
        200,
        "<html><p>Please complete the CAPTCHA to continue.</p></html>"
    ));
    assert_eq!(
        USER_AGENT,
        format!(
            "BambuFilamentManager/{} (+local catalog maintenance)",
            crate::backend::app_metadata::APP_VERSION
        )
    );
}

#[test]
fn response_body_reader_enforces_declared_and_streamed_size_and_utf8() {
    let mut exact = Cursor::new(b"12345678".to_vec());
    assert_eq!(
        read_bounded_utf8_response(&mut exact, Some(8), 8).expect("exact limit"),
        "12345678"
    );

    let mut declared_too_large = Cursor::new(b"small".to_vec());
    assert!(
        read_bounded_utf8_response(&mut declared_too_large, Some(9), 8)
            .expect_err("declared length must fail")
            .contains("declared response size")
    );

    let mut streamed_too_large = Cursor::new(b"123456789".to_vec());
    assert!(read_bounded_utf8_response(&mut streamed_too_large, None, 8)
        .expect_err("streamed length must fail")
        .contains("response body exceeded"));

    let mut invalid_utf8 = Cursor::new(vec![0xff]);
    assert!(read_bounded_utf8_response(&mut invalid_utf8, Some(1), 8)
        .expect_err("invalid UTF-8 must fail")
        .contains("not valid UTF-8"));
}

#[test]
fn refresh_snapshot_mutation_guard_requires_complete_bounded_detail_coverage() {
    let complete = BambuCatalogRefreshSnapshot {
        entries: vec![BambuCatalogEntry {
            material: "PLA".to_string(),
            filament_name: "PLA Basic".to_string(),
            color_name: "Red".to_string(),
            hex_color: Some("#ff0000".to_string()),
            image_url: None,
            product_url: "https://store.example/products/pla-basic".to_string(),
            default_weight_g: 1000,
        }],
        detected_store: "https://store.example".to_string(),
        detected_collection: "filament".to_string(),
        discovered_materials: vec!["PLA".to_string()],
        warnings: Vec::new(),
        anti_bot_blocks: 0,
        products_discovered: 1,
        products_detailed: 1,
        reused_cached_products: 0,
        detail_fetches: 1,
        partial: false,
    };
    assert!(validate_bambu_refresh_snapshot_for_mutation(&complete).is_ok());

    let mut mismatch = complete.clone();
    mismatch.detail_fetches = 0;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&mismatch).is_err());

    let mut cached = complete.clone();
    cached.reused_cached_products = 1;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&cached).is_err());

    let mut partial = complete.clone();
    partial.partial = true;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&partial).is_err());

    let mut blocked = complete.clone();
    blocked.anti_bot_blocks = 1;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&blocked).is_err());

    let mut duplicate = complete;
    duplicate.entries.push(duplicate.entries[0].clone());
    assert!(validate_bambu_refresh_snapshot_for_mutation(&duplicate).is_err());
}
