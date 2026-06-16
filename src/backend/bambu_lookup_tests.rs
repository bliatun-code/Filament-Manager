use super::{
    append_known_entries_for_product_url, build_known_entry_lookup, decode_js_string_literal,
    discovered_materials_from_names, extract_product_list, infer_material,
    normalize_material_filters, official_bambu_hex_codes, resolve_bambu_hex, BambuCatalogEntry,
    BambuKnownCatalogEntry,
};
use std::collections::HashSet;

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
fn discovered_materials_from_bambu_product_names_are_sorted_and_complete() {
    let values = discovered_materials_from_names(
        [
            "PLA Basic",
            "PETG HF",
            "ABS-GF",
            "TPU for AMS",
            "PA6-CF",
            "PAHT-CF",
            "PA-CF",
            "PPA-CF",
            "PET-CF",
            "PCTG",
            "PC FR",
            "PP",
            "PE Support",
            "PPS-CF",
            "PVA",
            "BVOH Support",
            "EVA",
            "HIPS",
            "PHA",
            "ASA Aero",
            "PLA Basic",
        ]
        .into_iter(),
    );
    assert_eq!(
        values,
        vec![
            "ABS".to_string(),
            "ASA".to_string(),
            "BVOH".to_string(),
            "EVA".to_string(),
            "HIPS".to_string(),
            "PA".to_string(),
            "PA6".to_string(),
            "PAHT".to_string(),
            "PC".to_string(),
            "PCTG".to_string(),
            "PE".to_string(),
            "PET".to_string(),
            "PETG".to_string(),
            "PHA".to_string(),
            "PLA".to_string(),
            "PP".to_string(),
            "PPA".to_string(),
            "PPS".to_string(),
            "PVA".to_string(),
            "TPU".to_string(),
        ]
    );
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
