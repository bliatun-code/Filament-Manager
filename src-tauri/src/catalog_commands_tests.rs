use super::{normalize_material_filters, require_single_material_filter};

#[test]
fn catalog_refresh_normalizes_and_deduplicates_materials() {
    assert_eq!(
        normalize_material_filters(Some(vec![
            " pla ".to_string(),
            "PLA".to_string(),
            "".to_string(),
        ])),
        vec!["PLA".to_string()]
    );
}

#[test]
fn catalog_refresh_requires_exactly_one_material() {
    assert!(require_single_material_filter(None).is_err());
    assert!(require_single_material_filter(Some(Vec::new())).is_err());
    assert!(
        require_single_material_filter(Some(vec!["PLA".to_string(), "PETG".to_string()])).is_err()
    );
    assert_eq!(
        require_single_material_filter(Some(vec![" pla ".to_string()])).expect("one material"),
        vec!["PLA".to_string()]
    );
}
