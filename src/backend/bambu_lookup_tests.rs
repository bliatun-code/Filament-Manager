use super::{
    append_known_entries_for_product_url, build_known_entry_lookup, decode_js_string_literal,
    extract_product_list, infer_material, normalize_material_filters, BambuCatalogEntry,
    BambuKnownCatalogEntry,
};

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

#[test]
fn extract_product_list_handles_utf8_prefix_content() {
    let decoded = r#"🎉 header {"productList":[{"name":"ABS - Orange","seoCode":"abs-orange","mediaFiles":["https://example.com/b.png"]}]}"#;
    let entries = extract_product_list(decoded);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "ABS - Orange");
}

#[test]
fn append_known_entries_for_product_url_reuses_cached_bambu_rows() {
    let lookup = build_known_entry_lookup(vec![BambuKnownCatalogEntry {
        entry: BambuCatalogEntry {
            material: "PLA".to_string(),
            filament_name: "PLA Basic".to_string(),
            color_name: "Red".to_string(),
            hex_color: Some("#ff0000".to_string()),
            image_url: None,
            product_url: "https://store.bambulab.com/products/pla-basic-red?variant=1".to_string(),
            default_weight_g: 1000,
        },
        last_seen_at: Some("2026-04-12 10:00:00".to_string()),
    }]);
    let mut entries = Vec::new();
    assert!(append_known_entries_for_product_url(
        "https://store.bambulab.com/products/pla-basic-red?variant=1",
        &lookup,
        None,
        &mut entries,
    ));
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].filament_name, "PLA Basic");
}

#[test]
fn append_known_entries_for_product_url_skips_stale_bambu_rows() {
    let lookup = build_known_entry_lookup(vec![BambuKnownCatalogEntry {
        entry: BambuCatalogEntry {
            material: "PLA".to_string(),
            filament_name: "PLA Basic".to_string(),
            color_name: "Red".to_string(),
            hex_color: Some("#ff0000".to_string()),
            image_url: None,
            product_url: "https://store.bambulab.com/products/pla-basic-red".to_string(),
            default_weight_g: 1000,
        },
        last_seen_at: Some("2026-03-01 10:00:00".to_string()),
    }]);
    let mut entries = Vec::new();
    assert!(!append_known_entries_for_product_url(
        "https://store.bambulab.com/products/pla-basic-red",
        &lookup,
        Some("2026-04-01 00:00:00"),
        &mut entries,
    ));
    assert!(entries.is_empty());
}
