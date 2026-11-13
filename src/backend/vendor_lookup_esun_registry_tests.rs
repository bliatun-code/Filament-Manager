use serde_json::{json, Value};

use super::*;

fn abs_gf_silver() -> Value {
    json!({
        "id": 57449588, "brand": "eSun", "product_type": "Filament",
        "material": "ABS-GF", "series": "ABS-GF", "name": " SILVER ",
        "sku": "ABS-GF175S1TZ1", "barcode": "6922572207141",
        "measure": "1000 g", "info1": false, "info2": false, "info3": false,
        "color": "#959796FF", "color_info": {"type":"mono", "colors":["#959796FF"]},
        "RFID_Data": {"id_brand":47930, "id_type":142, "id_unit":21, "data1":56, "measure":1000}
    })
}

fn pla_plus_purple() -> Value {
    let mut row = abs_gf_silver();
    row["id"] = 2358133083u32.into();
    row["material"] = "PLA+".into();
    row["series"] = "PLA+ with spool".into();
    row["name"] = "PURPLE".into();
    row["sku"] = "PLA+175Z1P1".into();
    row["barcode"] = "6922572219144.0".into();
    row
}

fn parse(rows: Vec<Value>) -> Result<RegistryCatalog, String> {
    let bytes = serde_json::to_vec(&rows).unwrap();
    parse_registry(bytes.as_slice())
}

#[test]
fn decodes_canonical_opaque_variants_and_reports_supplemental_scope() {
    let catalog = parse(vec![abs_gf_silver(), pla_plus_purple()]).unwrap();
    let abs = catalog.snapshot("ABS").unwrap();
    assert!(abs.preserve_existing_entries);
    assert_eq!(abs.entries.len(), 1);
    let silver = &abs.entries[0];
    assert_eq!(silver.material, "ABS");
    assert_eq!(silver.filament_name, "ABS-GF");
    assert_eq!(silver.color_name, "Silver");
    assert_eq!(silver.default_weight_g, 1000);
    assert_eq!(silver.hex_color.as_deref(), Some("#959796"));
    assert_eq!(
        silver.product_url,
        "https://tigersystem.io/en/catalog/57449588"
    );
    assert_eq!(
        catalog.snapshot("PLA").unwrap().entries[0].filament_name,
        "PLA+"
    );
    assert!(catalog
        .snapshot("PEEK")
        .unwrap_err()
        .contains("no verified PEEK"));
    let discovery = catalog.discovery();
    assert_eq!(discovery.discovered_materials, ["PLA", "ABS"]);
    assert_eq!(discovery.products_discovered, 2);
    assert_eq!(discovery.detail_fetches, 0);
    assert!(discovery.detected_collection.contains("supplemental"));
}

#[test]
fn accepts_a_named_spool_with_a_mixed_case_vendor_sku() {
    let mut row = pla_plus_purple();
    row["id"] = 3356701024u32.into();
    row["material"] = "PLA".into();
    row["series"] = "PLA-Cast".into();
    row["name"] = "WHITE".into();
    row["sku"] = "PLA-Cast175T1Y1".into();
    row["barcode"] = "6922572224339".into();
    let snapshot = parse(vec![row]).unwrap().snapshot("PLA").unwrap();
    assert_eq!(snapshot.entries[0].filament_name, "PLA-Cast");
    assert_eq!(snapshot.entries[0].color_name, "White");
}

#[test]
fn skips_unsupported_packaging_and_uncertain_identities() {
    let mut rows = vec![abs_gf_silver()];
    for (field, value) in [
        ("info1", json!(true)),
        ("info2", json!(true)),
        ("info3", json!(true)),
        ("material", json!("PLA")),
        ("series", json!("ABS-GF bundle")),
        ("sku", json!("ESUN-ABS-GF-175-SILVER")),
        ("barcode", json!("6922572207140")),
        ("barcode", Value::Null),
        ("color", json!("#95979680")),
        (
            "color_info",
            json!({"type":"multi","colors":["#959796FF","#ABCDDCFF"]}),
        ),
        ("measure", json!("500 g")),
        ("product_type", json!("Resin")),
    ] {
        let mut row = abs_gf_silver();
        row["id"] = (rows.len() as u32).into();
        row[field] = value;
        rows.push(row);
    }
    for (field, value) in [
        ("measure", 500),
        ("data1", 221),
        ("id_type", 173),
        ("id_unit", 35),
    ] {
        let mut row = abs_gf_silver();
        row["id"] = (rows.len() as u32).into();
        row["RFID_Data"][field] = value.into();
        rows.push(row);
    }
    let skipped = rows.len() - 1;
    let catalog = parse(rows).unwrap();
    assert_eq!(catalog.entries.len(), 1);
    assert_eq!(catalog.skipped_rows, skipped);
}

#[test]
fn rejects_wrong_brand_duplicate_ids_and_invalid_responses() {
    let mut wrong_brand = abs_gf_silver();
    wrong_brand["brand"] = "Another brand".into();
    let mut wrong_brand_id = abs_gf_silver();
    wrong_brand_id["RFID_Data"]["id_brand"] = 12.into();
    assert!(parse(vec![wrong_brand])
        .unwrap_err()
        .contains("unexpected brand"));
    assert!(parse(vec![wrong_brand_id])
        .unwrap_err()
        .contains("unexpected brand"));
    assert!(parse(vec![abs_gf_silver(), abs_gf_silver()])
        .unwrap_err()
        .contains("repeated product ID"));
    assert!(parse(vec![]).unwrap_err().contains("empty"));
    assert!(parse_registry(&b"<html>Unavailable</html>"[..])
        .unwrap_err()
        .contains("decode"));
    assert!(parse_registry(std::io::repeat(b' '))
        .unwrap_err()
        .contains("size limit"));
}

#[test]
fn identical_rows_coalesce_and_conflicting_swatches_are_skipped() {
    let first = abs_gf_silver();
    let mut second = first.clone();
    second["id"] = 57449589.into();
    let duplicate = parse(vec![second.clone(), first.clone()]).unwrap();
    assert_eq!(duplicate.entries.len(), 1);
    assert_eq!(duplicate.skipped_rows, 1);
    assert!(duplicate.entries[0].product_url.ends_with("/57449588"));

    second["color"] = "#939594FF".into();
    second["color_info"]["colors"][0] = "#939594FF".into();
    let conflicting = parse(vec![first, second, pla_plus_purple()]).unwrap();
    assert_eq!(conflicting.entries.len(), 1);
    assert_eq!(conflicting.skipped_rows, 2);
    assert!(conflicting.snapshot("ABS").is_err());
}
