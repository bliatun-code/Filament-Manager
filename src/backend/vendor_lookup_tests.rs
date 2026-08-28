use super::{
    build_esun_scoped_snapshot, build_esun_source_discovery, infer_material, is_anti_bot_response,
    normalize_esun_swatch_value, parse_esun_graphql_catalog_response,
    validate_esun_graphql_http_response, validate_single_esun_material_filter,
    EsunGraphqlHttpError, ESUN_DISCOVERY_QUERY, ESUN_GRAPHQL_MAX_REQUESTS_PER_OPERATION,
    ESUN_MAGENTO_GRAPHQL_URL, ESUN_SCOPED_CATALOG_QUERY, ESUN_USER_AGENT,
};

const COMPLETE_MAGENTO_FIXTURE: &str = r##"
{
  "data": {
    "categoryList": [
      {
        "url_key": "filaments",
        "products": {
          "total_count": 4,
          "page_info": {
            "current_page": 1,
            "total_pages": 1,
            "page_size": 200
          },
          "items": [
            {
              "__typename": "ConfigurableProduct",
              "uid": "pla-uid",
              "sku": "PLA-HS",
              "name": "eSUN ePLA+HS Filament",
              "url_key": "epla-hs-product",
              "url_suffix": "",
              "image": { "url": "https://www.esun3d.com/media/pla.jpg" },
              "configurable_options": [
                {
                  "attribute_code": "color",
                  "label": "Color",
                  "values": [
                    { "label": "White", "swatch_data": { "value": "#ffffff" } },
                    { "label": "Black", "swatch_data": { "value": "#000000" } }
                  ]
                }
              ]
            },
            {
              "__typename": "SimpleProduct",
              "uid": "petg-uid",
              "sku": "PETG-HS",
              "name": "eSUN ePETG+HS Filament",
              "url_key": "epetg-hs-product",
              "url_suffix": null,
              "image": { "url": "https://www.esun3d.com/media/petg.jpg" },
              "configurable_options": []
            },
            {
              "__typename": "SimpleProduct",
              "uid": "pa12-uid",
              "sku": "PA12-CF",
              "name": "eSUN ePA12-CF Filament",
              "url_key": "epa12-cf-product",
              "url_suffix": "",
              "configurable_options": []
            },
            {
              "__typename": "SimpleProduct",
              "uid": "resin-uid",
              "sku": "RESIN-ABS",
              "name": "eSUN eResin ABS Pro",
              "url_key": "eresin-abs-product",
              "url_suffix": "",
              "configurable_options": []
            }
          ]
        }
      }
    ]
  }
}
"##;

#[test]
fn esun_graphql_operations_are_one_bounded_request_against_official_category() {
    assert_eq!(ESUN_GRAPHQL_MAX_REQUESTS_PER_OPERATION, 1);
    assert_eq!(ESUN_MAGENTO_GRAPHQL_URL, "https://www.esun3d.com/graphql");
    assert!(ESUN_USER_AGENT.starts_with("BambuFilamentManager/"));
    assert!(!ESUN_USER_AGENT.contains("Mozilla"));
    for query in [ESUN_DISCOVERY_QUERY, ESUN_SCOPED_CATALOG_QUERY] {
        assert!(query.contains("categoryList"));
        assert!(query.contains("url_key: { eq: \"filaments\" }"));
        assert!(query.contains("pageSize: $pageSize"));
        assert!(query.contains("currentPage: 1"));
        assert!(query.contains("__typename"));
    }
}

#[test]
fn discovery_uses_complete_listing_without_fetching_details_or_resin() {
    let products =
        parse_esun_graphql_catalog_response(COMPLETE_MAGENTO_FIXTURE).expect("valid fixture");
    let discovery = build_esun_source_discovery(&products).expect("discovery");

    assert_eq!(discovery.products_discovered, 4);
    assert_eq!(discovery.detail_fetches, 0);
    assert_eq!(
        discovery.discovered_materials,
        vec!["PLA".to_string(), "PETG".to_string(), "PA12".to_string()]
    );
    assert!(discovery.output.contains("one bounded request"));
}

#[test]
fn scoped_refresh_filters_one_exact_material_and_reads_magento_swatches() {
    let products =
        parse_esun_graphql_catalog_response(COMPLETE_MAGENTO_FIXTURE).expect("valid fixture");
    let snapshot = build_esun_scoped_snapshot(products, "PLA").expect("PLA snapshot");

    assert_eq!(snapshot.handles_found, 1);
    assert_eq!(snapshot.products_processed, 1);
    assert_eq!(snapshot.detail_fetches, 0);
    assert_eq!(snapshot.entries.len(), 2);
    assert!(snapshot.entries.iter().all(|entry| entry.material == "PLA"));
    assert_eq!(snapshot.entries[0].color_name, "White");
    assert_eq!(snapshot.entries[0].hex_color.as_deref(), Some("#FFFFFF"));
    assert_eq!(
        snapshot.entries[0].product_url,
        "https://www.esun3d.com/epla-hs-product"
    );
}

#[test]
fn scoped_refresh_requires_exactly_one_supported_material_before_network_work() {
    assert!(validate_single_esun_material_filter(&[]).is_err());
    assert!(
        validate_single_esun_material_filter(&["PLA".to_string(), "PETG".to_string()]).is_err()
    );
    assert!(validate_single_esun_material_filter(&["PAHT".to_string()]).is_err());
    assert_eq!(
        validate_single_esun_material_filter(&["PEEK".to_string()]).expect("supported"),
        "PEEK"
    );
}

#[test]
fn graphql_parser_fails_closed_on_partial_or_empty_catalogs() {
    let partial = r#"
      {"data":{"categoryList":[{"url_key":"filaments","products":{
        "total_count":2,
        "page_info":{"current_page":1,"total_pages":1,"page_size":200},
        "items":[{"uid":"one","sku":"ONE","name":"ePLA Filament","url_key":"epla-product","url_suffix":""}]
      }}]}}
    "#;
    let empty = r#"
      {"data":{"categoryList":[{"url_key":"filaments","products":{
        "total_count":0,
        "page_info":{"current_page":1,"total_pages":0,"page_size":200},
        "items":[]
      }}]}}
    "#;

    assert!(parse_esun_graphql_catalog_response(partial)
        .expect_err("partial must fail")
        .contains("partial catalog"));
    assert!(parse_esun_graphql_catalog_response(empty)
        .expect_err("empty must fail")
        .contains("zero filament products"));
}

#[test]
fn scoped_refresh_rejects_configurable_products_without_color_options() {
    let response = r#"
      {"data":{"categoryList":[{"url_key":"filaments","products":{
        "total_count":1,
        "page_info":{"current_page":1,"total_pages":1,"page_size":200},
        "items":[{
          "__typename":"ConfigurableProduct",
          "uid":"pla-one",
          "sku":"PLA-ONE",
          "name":"eSUN ePLA Filament",
          "url_key":"epla-one",
          "url_suffix":"",
          "configurable_options":[]
        }]
      }}]}}
    "#;
    let products = parse_esun_graphql_catalog_response(response).expect("complete listing");

    let error = build_esun_scoped_snapshot(products, "PLA")
        .expect_err("missing configurable colors must fail closed");
    assert!(error.contains("omitted the color options"));
}

#[test]
fn graphql_parser_rejects_duplicate_product_identities_and_urls() {
    let duplicate = r#"
      {"data":{"categoryList":[{"url_key":"filaments","products":{
        "total_count":2,
        "page_info":{"current_page":1,"total_pages":1,"page_size":200},
        "items":[
          {"__typename":"SimpleProduct","uid":"same","sku":"ONE","name":"ePLA Filament","url_key":"epla","url_suffix":""},
          {"__typename":"SimpleProduct","uid":"same","sku":"TWO","name":"ePETG Filament","url_key":"epetg","url_suffix":""}
        ]
      }}]}}
    "#;

    assert!(parse_esun_graphql_catalog_response(duplicate)
        .expect_err("duplicate identity must fail")
        .contains("duplicate product identities"));
}

#[test]
fn graphql_parser_fails_closed_on_reported_errors() {
    let response = r#"{
      "errors":[{"message":"The request was rejected"}],
      "data":null
    }"#;

    let error = parse_esun_graphql_catalog_response(response).expect_err("errors must fail");
    assert!(error.contains("The request was rejected"));
    assert!(error.contains("local catalog data stays unchanged"));
}

#[test]
fn http_validation_treats_html_challenges_and_rate_limits_as_blocking() {
    assert!(matches!(
        validate_esun_graphql_http_response(
            200,
            "text/html; charset=utf-8",
            "<!doctype html><title>Just a moment</title>"
        ),
        Err(EsunGraphqlHttpError::Blocked(_))
    ));
    assert!(matches!(
        validate_esun_graphql_http_response(429, "application/json", "{}"),
        Err(EsunGraphqlHttpError::Blocked(_))
    ));
    assert!(matches!(
        validate_esun_graphql_http_response(503, "application/json", "{}"),
        Err(EsunGraphqlHttpError::Blocked(_))
    ));
    assert!(validate_esun_graphql_http_response(200, "application/json", "{}").is_ok());
    assert!(is_anti_bot_response(200, "<html>access denied</html>"));
    assert!(is_anti_bot_response(200, "verify you are human"));
    assert!(is_anti_bot_response(403, ""));
}

#[test]
fn material_inference_covers_all_official_families_longest_first() {
    let cases = [
        ("eSUN eTPU-95A Filament", "TPU"),
        ("eSUN TPE Filament", "TPE"),
        ("eSUN PVA Water Soluble Support for PLA", "PVA"),
        ("eSUN ePLA+HS Filament", "PLA"),
        ("eSUN ePETG+HS Filament", "PETG"),
        ("eSUN PET-CF Filament", "PET"),
        ("eSUN ePEEK Filament", "PEEK"),
        ("eSUN PEBA Filament", "PEBA"),
        ("eSUN PC-ABS Filament", "PC"),
        ("eSUN ePA12-CF Filament", "PA12"),
        ("eSUN ePA-CF Filament", "PA"),
        ("eSUN HIPS Filament", "HIPS"),
        ("eSUN eASA Filament", "ASA"),
        ("eSUN ABS+ Filament", "ABS"),
    ];

    for (title, expected) in cases {
        assert_eq!(infer_material(title), expected, "{title}");
    }
    assert_eq!(infer_material("eSUN eResin ABS Pro"), "UNKNOWN");
    assert_eq!(infer_material("eSUN PAHT-CF Filament"), "PA");
}

#[test]
fn normalize_esun_swatch_value_accepts_semicolon_multi_color_values() {
    assert_eq!(
        normalize_esun_swatch_value("#e68e5c;ec578e").as_deref(),
        Some("multi(#E68E5C,#EC578E)")
    );
}

#[test]
fn normalize_esun_color_name_repairs_known_magic_green_typos() {
    assert_eq!(
        super::normalize_esun_color_name_for_catalog("FUCHSIA GREEH", "PLA", "PLA-Silk Magic"),
        "FUCHSIA GREEN"
    );
    assert_eq!(
        super::normalize_esun_color_name_for_catalog("GRREN PURPLE", "PLA", "PLA-Silk Magic"),
        "GREEN PURPLE"
    );
}
