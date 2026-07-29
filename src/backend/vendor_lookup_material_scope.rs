use std::collections::HashSet;

pub(super) const ESUN_SITE_BASE_URL: &str = "https://www.esun3d.com";

const ESUN_GENERAL_MATERIALS_PATH: &str = "/general-materials/";
const ESUN_AESTHETIC_MATERIALS_PATH: &str = "/aesthetic-materials/";
const ESUN_ENGINEERING_MATERIALS_PATH: &str = "/engineering-materials/";
const ESUN_FUNCTIONAL_MATERIALS_PATH: &str = "/functional-materials/";
const ESUN_FLEXIBLE_MATERIALS_PATH: &str = "/flexibility-elasticity/";

pub(super) fn normalize_material_filters(material_filters: Option<Vec<String>>) -> Vec<String> {
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

pub(super) fn matches_material_filter(material: &str, material_filters: &[String]) -> bool {
    if material_filters.is_empty() {
        return true;
    }
    let normalized = material.trim().to_uppercase();
    material_filters.iter().any(|value| value == &normalized)
}

pub(super) fn esun_material_source_urls(material_filters: &[String]) -> Vec<String> {
    let mut urls = Vec::new();
    let mut seen = HashSet::new();

    for material in material_filters {
        for path in esun_material_source_paths(material) {
            let url = format!("{ESUN_SITE_BASE_URL}{path}");
            if seen.insert(url.clone()) {
                urls.push(url);
            }
        }
    }

    urls
}

pub(super) fn esun_material_source_paths(material: &str) -> &'static [&'static str] {
    match material {
        "PLA" => &[ESUN_GENERAL_MATERIALS_PATH, ESUN_AESTHETIC_MATERIALS_PATH],
        "PETG" | "PET" => &[ESUN_GENERAL_MATERIALS_PATH, ESUN_AESTHETIC_MATERIALS_PATH],
        "ABS" | "ASA" | "PA" | "PA12" | "PAHT" | "PC" => &[ESUN_ENGINEERING_MATERIALS_PATH],
        "TPU" => &[ESUN_FLEXIBLE_MATERIALS_PATH],
        "PVA" | "HIPS" => &[ESUN_FUNCTIONAL_MATERIALS_PATH],
        _ => &[ESUN_GENERAL_MATERIALS_PATH, ESUN_ENGINEERING_MATERIALS_PATH],
    }
}

pub(super) fn filter_product_urls_by_material_hints(
    product_urls: Vec<String>,
    material_filters: &[String],
) -> Vec<String> {
    if material_filters.is_empty() {
        return product_urls;
    }

    product_urls
        .into_iter()
        .filter(|url| {
            let normalized = url.to_lowercase();
            material_filters.iter().any(|material| {
                let keywords = esun_material_url_keywords(material);
                if keywords.is_empty() {
                    normalized.contains(&material.to_lowercase())
                } else {
                    keywords.iter().any(|keyword| normalized.contains(keyword))
                }
            })
        })
        .collect()
}

fn esun_material_url_keywords(material: &str) -> &'static [&'static str] {
    match material {
        "PLA" => &["pla"],
        "PETG" => &["petg", "epetg"],
        "ABS" => &["abs", "eabs"],
        "TPU" => &["tpu", "etpu", "tpe", "peba"],
        "ASA" => &["asa", "easa"],
        "PA" => &["pa-", "epa-", "/epa", "nylon"],
        "PA12" => &["pa12", "epa12"],
        "PAHT" => &["paht"],
        "PC" => &["pc"],
        "PET" => &["pet-"],
        "PVA" => &["pva"],
        "HIPS" => &["hips"],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_material_filters;

    #[test]
    fn material_filters_are_trimmed_normalized_and_deduplicated() {
        assert_eq!(
            normalize_material_filters(Some(vec![
                " petg ".to_string(),
                String::new(),
                "PLA".to_string(),
                "pla".to_string(),
            ])),
            vec!["PETG".to_string(), "PLA".to_string()]
        );
    }
}
