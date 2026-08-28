use super::{
    bambu_material_families, bambu_response_is_blocking,
    discover_bambu_material_channels_with_fetch, infer_material, normalize_material_filters,
    official_bambu_hex_codes, refresh_bambu_catalog_snapshot_from_source_with_fetch,
    require_single_material_filter, resolve_bambu_hex,
    validate_bambu_refresh_snapshot_for_mutation, BambuCatalogEntry, BambuCatalogRefreshSnapshot,
    DetectStoreResult, DiscoveryHttpResponse, DISCOVERY_MAX_PAGES_PER_STORE,
    TARGETED_REFRESH_MAX_PAGES, USER_AGENT,
};
use std::collections::HashSet;

fn discovery_response(status: u16, products: &[(&str, &str)]) -> DiscoveryHttpResponse {
    DiscoveryHttpResponse {
        status,
        body: serde_json::json!({
            "products": products
                .iter()
                .map(|(handle, title)| serde_json::json!({
                    "handle": handle,
                    "title": title,
                    "options": [{"name": "Color"}],
                    "variants": [{"id": 1, "option1": "Red"}],
                }))
                .collect::<Vec<_>>(),
        })
        .to_string(),
    }
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
fn source_discovery_uses_bounded_collection_pages_without_detail_fetches() {
    let base_urls = vec!["https://store.example".to_string()];
    let mut requested_urls = Vec::new();
    let pages = [
        discovery_response(
            200,
            &[
                ("pla-basic", "PLA Basic"),
                ("petg-hf", "PETG HF"),
                ("abs", "ABS"),
            ],
        ),
        discovery_response(200, &[]),
    ];
    let mut page_index = 0usize;

    let result =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |url| {
            requested_urls.push(url.to_string());
            let response = pages
                .get(page_index)
                .cloned()
                .ok_or_else(|| "unexpected request".to_string())?;
            page_index += 1;
            Ok(response)
        })
        .expect("complete discovery");

    assert_eq!(
        requested_urls,
        [
            "https://store.example/collections/filament/products.json?limit=250&page=1",
            "https://store.example/collections/filament/products.json?limit=250&page=2",
        ]
    );
    assert_eq!(result.detected_store, "https://store.example");
    assert_eq!(result.detected_collection, "filament");
    assert_eq!(result.products_discovered, 3);
    assert_eq!(result.discovered_materials, ["ABS", "PETG", "PLA"]);
    assert_eq!(result.detail_fetches, 0);
    assert!(result.output.contains("Discovery quality: complete"));
}

#[test]
fn source_discovery_excludes_unknown_and_incompletely_decodable_channels() {
    let base_urls = vec!["https://store.example".to_string()];
    let pages = [
        DiscoveryHttpResponse {
            status: 200,
            body: serde_json::json!({
                "products": [
                    {
                        "handle": "abs",
                        "title": "ABS",
                        "options": [{"name": "Color"}],
                        "variants": [{"id": 1, "option1": "Black"}]
                    },
                    {
                        "handle": "pla-basic",
                        "title": "PLA Basic",
                        "options": [{"name": "Color"}],
                        "variants": [{"id": 2, "option1": "Red"}]
                    },
                    {"handle": "pla-broken", "title": "PLA Broken"},
                    {"handle": "hotend", "title": "Hotend Assembly - Stainless Steel"}
                ]
            })
            .to_string(),
        },
        discovery_response(200, &[]),
    ];
    let mut page_index = 0usize;

    let result = discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
        let response = pages
            .get(page_index)
            .cloned()
            .ok_or_else(|| "unexpected request".to_string())?;
        page_index += 1;
        Ok(response)
    })
    .expect("one fully decodable material remains");

    assert_eq!(result.products_discovered, 4);
    assert_eq!(result.discovered_materials, ["ABS"]);
}

#[test]
fn source_discovery_rejects_a_200_challenge_without_trying_another_store() {
    let base_urls = vec![
        "https://blocked.example".to_string(),
        "https://unused.example".to_string(),
    ];
    let mut requests = 0usize;

    let error = discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
        requests += 1;
        Ok(DiscoveryHttpResponse {
            status: 200,
            body: "<html><title>Just a moment...</title><div>cf-chl-widget</div></html>"
                .to_string(),
        })
    })
    .expect_err("challenge must be inconclusive");

    assert_eq!(requests, 1);
    assert!(error.contains("challenge page"));
    assert!(error.contains("left unchanged"));
}

#[test]
fn source_discovery_rejects_duplicate_or_no_growth_pagination() {
    let base_urls = vec!["https://store.example".to_string()];
    let pages = [
        discovery_response(200, &[("pla-basic", "PLA Basic")]),
        discovery_response(200, &[("PLA-BASIC", "PLA Basic")]),
    ];
    let mut page_index = 0usize;

    let error = discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
        let response = pages
            .get(page_index)
            .cloned()
            .ok_or_else(|| "unexpected request".to_string())?;
        page_index += 1;
        Ok(response)
    })
    .expect_err("duplicate pagination must be inconclusive");

    assert!(error.contains("repeated product"));
    assert!(error.contains("page 2"));
}

#[test]
fn source_discovery_rejects_empty_and_unterminated_collections() {
    let base_urls = vec!["https://store.example".to_string()];
    let empty_error =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            Ok(discovery_response(200, &[]))
        })
        .expect_err("empty first page must be inconclusive");
    assert!(empty_error.contains("empty collection"));

    let mut request_count = 0usize;
    let unterminated_error =
        discover_bambu_material_channels_with_fetch(&base_urls, "filament", false, |_| {
            request_count += 1;
            let handle = format!("pla-{request_count}");
            let body = serde_json::json!({
                "products": [{"handle": handle, "title": "PLA Basic"}],
            })
            .to_string();
            Ok(DiscoveryHttpResponse { status: 200, body })
        })
        .expect_err("unterminated pagination must be inconclusive");

    assert_eq!(request_count, DISCOVERY_MAX_PAGES_PER_STORE);
    assert!(unterminated_error.contains("page safety budget"));
}

#[test]
fn source_discovery_can_move_to_one_available_store_within_the_global_budget() {
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
                    body: String::new(),
                });
            }
            if url.ends_with("page=1") {
                return Ok(discovery_response(200, &[("petg-hf", "PETG HF")]));
            }
            Ok(discovery_response(200, &[]))
        })
        .expect("second store should complete discovery");

    assert_eq!(requests.len(), 3);
    assert_eq!(result.detected_store, "https://working.example");
    assert_eq!(result.discovered_materials, ["PETG"]);
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
fn targeted_refresh_reads_only_complete_collection_json_for_one_material() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let pages = [
        discovery_response(200, &[("pla-basic", "PLA Basic"), ("petg-hf", "PETG HF")]),
        discovery_response(200, &[]),
    ];
    let mut page_index = 0usize;
    let mut requested_urls = Vec::new();

    let snapshot =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |url| {
            requested_urls.push(url.to_string());
            let response = pages
                .get(page_index)
                .cloned()
                .ok_or_else(|| "unexpected request".to_string())?;
            page_index += 1;
            Ok(response)
        })
        .expect("complete targeted refresh");

    assert_eq!(
        requested_urls,
        [
            "https://store.example/collections/filament/products.json?limit=250&page=1",
            "https://store.example/collections/filament/products.json?limit=250&page=2",
        ]
    );
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].material, "PLA");
    assert_eq!(snapshot.discovered_materials, ["PETG", "PLA"]);
    assert_eq!(snapshot.products_discovered, 2);
    assert_eq!(snapshot.products_detailed, 0);
    assert_eq!(snapshot.detail_fetches, 0);
    assert_eq!(snapshot.reused_cached_products, 0);
    assert!(!snapshot.partial);
    assert!(validate_bambu_refresh_snapshot_for_mutation(&snapshot).is_ok());
}

#[test]
fn targeted_refresh_fails_closed_for_challenge_duplicate_and_incomplete_family() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let challenge =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |_| {
            Ok(DiscoveryHttpResponse {
                status: 200,
                body: "<html><title>Just a moment...</title><div>captcha</div></html>".into(),
            })
        })
        .expect_err("challenge must fail closed");
    assert!(challenge.contains("challenge page"));

    let duplicate_pages = [
        discovery_response(200, &[("pla-basic", "PLA Basic")]),
        discovery_response(200, &[("PLA-BASIC", "PLA Basic")]),
    ];
    let mut duplicate_page = 0usize;
    let duplicate =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |_| {
            let response = duplicate_pages[duplicate_page].clone();
            duplicate_page += 1;
            Ok(response)
        })
        .expect_err("duplicate pagination must fail closed");
    assert!(duplicate.contains("repeated product"));

    let incomplete_pages = [
        DiscoveryHttpResponse {
            status: 200,
            body: serde_json::json!({
                "products": [{"handle": "pla-broken", "title": "PLA Broken"}]
            })
            .to_string(),
        },
        discovery_response(200, &[]),
    ];
    let mut incomplete_page = 0usize;
    let incomplete =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |_| {
            let response = incomplete_pages[incomplete_page].clone();
            incomplete_page += 1;
            Ok(response)
        })
        .expect_err("incomplete selected family must fail closed");
    assert!(incomplete.contains("could not completely decode"));
}

#[test]
fn targeted_refresh_rejects_unterminated_collection_at_fixed_page_budget() {
    let source = DetectStoreResult {
        base_url: "https://store.example".to_string(),
        handle: "filament".to_string(),
    };
    let mut request_count = 0usize;
    let error =
        refresh_bambu_catalog_snapshot_from_source_with_fetch(&source, "PLA", false, |_| {
            request_count += 1;
            let handle = format!("pla-{request_count}");
            Ok(discovery_response(200, &[(handle.as_str(), "PLA Basic")]))
        })
        .expect_err("unterminated collection must fail closed");

    assert_eq!(request_count, TARGETED_REFRESH_MAX_PAGES);
    assert!(error.contains("page safety budget"));
}

#[test]
fn blocking_detection_and_user_agent_cover_catalog_contract() {
    assert!(bambu_response_is_blocking(403, "{}"));
    assert!(bambu_response_is_blocking(429, "{}"));
    assert!(bambu_response_is_blocking(503, "{}"));
    assert!(bambu_response_is_blocking(
        200,
        "<html>Verify you are human</html>"
    ));
    assert!(bambu_response_is_blocking(
        200,
        "<html>Access denied</html>"
    ));
    assert!(bambu_response_is_blocking(
        200,
        "<!doctype html><title>Store unavailable</title>"
    ));
    assert!(!bambu_response_is_blocking(200, r#"{"products":[]}"#));
    assert_eq!(
        USER_AGENT,
        "BambuFilamentManager/0.28.0 (+local catalog maintenance)"
    );
}

#[test]
fn refresh_snapshot_mutation_guard_rejects_partial_blocked_and_empty_results() {
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
        products_detailed: 0,
        reused_cached_products: 0,
        detail_fetches: 0,
        partial: false,
    };
    assert!(validate_bambu_refresh_snapshot_for_mutation(&complete).is_ok());

    let mut partial = complete.clone();
    partial.partial = true;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&partial).is_err());

    let mut blocked = complete.clone();
    blocked.anti_bot_blocks = 1;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&blocked).is_err());

    let mut legacy = complete.clone();
    legacy.products_detailed = 1;
    assert!(validate_bambu_refresh_snapshot_for_mutation(&legacy).is_err());

    let mut multiple_materials = complete.clone();
    let mut petg = multiple_materials.entries[0].clone();
    petg.material = "PETG".to_string();
    multiple_materials.entries.push(petg);
    assert!(validate_bambu_refresh_snapshot_for_mutation(&multiple_materials).is_err());

    let mut duplicate = complete.clone();
    duplicate.entries.push(duplicate.entries[0].clone());
    assert!(validate_bambu_refresh_snapshot_for_mutation(&duplicate).is_err());

    let mut empty = complete;
    empty.entries.clear();
    assert!(validate_bambu_refresh_snapshot_for_mutation(&empty).is_err());
}
