use std::collections::HashSet;

use super::{
    append_known_entries_for_product_url, build_known_entry_lookup, dedupe_site_listing_candidates,
    esun_material_source_paths, esun_material_source_urls, extract_site_listing_candidates,
    filter_product_urls_by_material_hints, matches_listing_candidate_material, EsunCatalogEntry,
    EsunKnownCatalogEntry, EsunSiteListingCandidate, ESUN_FILTERED_DETAIL_FETCH_BUDGET,
};

#[test]
fn esun_material_source_paths_map_core_materials_to_scoped_pages() {
    assert_eq!(
        esun_material_source_paths("PLA"),
        &["/general-materials/", "/aesthetic-materials/"]
    );
    assert_eq!(
        esun_material_source_paths("TPU"),
        &["/flexibility-elasticity/"]
    );
    assert_eq!(
        esun_material_source_paths("ABS"),
        &["/engineering-materials/"]
    );
}

#[test]
fn esun_material_source_urls_dedupes_shared_pages() {
    let urls = esun_material_source_urls(&["PLA".to_string(), "PETG".to_string()]);
    assert_eq!(
        urls,
        vec![
            "https://www.esun3d.com/general-materials/".to_string(),
            "https://www.esun3d.com/aesthetic-materials/".to_string(),
        ]
    );
}

#[test]
fn filter_product_urls_by_material_hints_keeps_only_matching_material_candidates() {
    let urls = vec![
        "https://www.esun3d.com/pla-pro-product/".to_string(),
        "https://www.esun3d.com/petg-product/".to_string(),
        "https://www.esun3d.com/eabs-cf-product/".to_string(),
        "https://www.esun3d.com/etpu-95a-product/".to_string(),
    ];

    let filtered = filter_product_urls_by_material_hints(urls, &["ABS".to_string()]);
    assert_eq!(
        filtered,
        vec!["https://www.esun3d.com/eabs-cf-product/".to_string()]
    );
}

#[test]
fn extract_site_listing_candidates_preserves_title_hints() {
    let html = r#"
        <a href="/pla-pro-product/"><span>PLA+</span></a>
        <a href="/petg-product/" title="PETG">ignored</a>
    "#;
    let candidates = extract_site_listing_candidates(html);
    assert_eq!(
        candidates,
        vec![
            EsunSiteListingCandidate {
                product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
                title_hint: Some("PLA+".to_string()),
            },
            EsunSiteListingCandidate {
                product_url: "https://www.esun3d.com/petg-product/".to_string(),
                title_hint: Some("PETG".to_string()),
            },
        ]
    );
}

#[test]
fn dedupe_site_listing_candidates_keeps_best_title_hint() {
    let deduped = dedupe_site_listing_candidates(vec![
        EsunSiteListingCandidate {
            product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
            title_hint: Some("PLA".to_string()),
        },
        EsunSiteListingCandidate {
            product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
            title_hint: Some("PLA Pro Filament".to_string()),
        },
    ]);
    assert_eq!(
        deduped,
        vec![EsunSiteListingCandidate {
            product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
            title_hint: Some("PLA Pro Filament".to_string()),
        }]
    );
}

#[test]
fn matches_listing_candidate_material_uses_title_hint_before_detail() {
    let candidate = EsunSiteListingCandidate {
        product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
        title_hint: Some("PLA+".to_string()),
    };
    assert!(matches_listing_candidate_material(
        &candidate,
        &["PLA".to_string()]
    ));
    assert!(!matches_listing_candidate_material(
        &candidate,
        &["ABS".to_string()]
    ));
}

#[test]
fn append_known_entries_for_product_url_reuses_cached_catalog_rows() {
    let lookup = build_known_entry_lookup(vec![EsunKnownCatalogEntry {
        entry: EsunCatalogEntry {
            material: "PLA".to_string(),
            filament_name: "PLA+".to_string(),
            color_name: "White".to_string(),
            hex_color: Some("#ffffff".to_string()),
            image_url: None,
            product_url: "https://www.esun3d.com/pla-pro-product/?utm=1".to_string(),
            default_weight_g: 1000,
        },
        last_seen_at: Some("2026-04-12 10:00:00".to_string()),
    }]);
    let mut entries = Vec::new();
    let mut keys = HashSet::new();
    assert!(append_known_entries_for_product_url(
        "https://www.esun3d.com/pla-pro-product/",
        &lookup,
        None,
        &mut entries,
        &mut keys,
    ));
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].filament_name, "PLA+");
}

#[test]
fn append_known_entries_for_product_url_skips_stale_cache_rows() {
    let lookup = build_known_entry_lookup(vec![EsunKnownCatalogEntry {
        entry: EsunCatalogEntry {
            material: "PLA".to_string(),
            filament_name: "PLA+".to_string(),
            color_name: "White".to_string(),
            hex_color: Some("#ffffff".to_string()),
            image_url: None,
            product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
            default_weight_g: 1000,
        },
        last_seen_at: Some("2026-03-01 10:00:00".to_string()),
    }]);
    let mut entries = Vec::new();
    let mut keys = HashSet::new();
    assert!(!append_known_entries_for_product_url(
        "https://www.esun3d.com/pla-pro-product/",
        &lookup,
        Some("2026-04-01 00:00:00"),
        &mut entries,
        &mut keys,
    ));
    assert!(entries.is_empty());
}

#[test]
fn filtered_detail_fetch_budget_is_small_and_explicit() {
    assert_eq!(ESUN_FILTERED_DETAIL_FETCH_BUDGET, 18);
}
