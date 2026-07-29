use crate::backend::vendor_lookup::{EsunCatalogEntry, EsunKnownCatalogEntry};
use reqwest::Url;
use std::collections::{HashMap, HashSet};

pub(super) fn build_known_entry_lookup(
    entries: Vec<EsunKnownCatalogEntry>,
) -> HashMap<String, Vec<EsunKnownCatalogEntry>> {
    let mut lookup = HashMap::new();
    for entry in entries {
        let key = normalize_catalog_product_url(&entry.entry.product_url);
        if key.is_empty() {
            continue;
        }
        lookup.entry(key).or_insert_with(Vec::new).push(entry);
    }
    lookup
}

pub(super) fn append_known_entries_for_product_url(
    product_url: &str,
    known_entries_by_product_url: &HashMap<String, Vec<EsunKnownCatalogEntry>>,
    stale_before: Option<&str>,
    entries: &mut Vec<EsunCatalogEntry>,
    entry_keys: &mut HashSet<String>,
) -> bool {
    let normalized = normalize_catalog_product_url(product_url);
    let Some(known_entries) = known_entries_by_product_url.get(&normalized) else {
        return false;
    };
    if known_entries
        .iter()
        .any(|known| is_known_entry_stale(known, stale_before))
    {
        return false;
    }
    let before = entries.len();
    for entry in known_entries {
        let key = format!(
            "{}|{}|{}",
            entry.entry.material.to_lowercase(),
            entry.entry.filament_name.to_lowercase(),
            entry.entry.color_name.to_lowercase()
        );
        if !entry_keys.insert(key) {
            continue;
        }
        entries.push(entry.entry.clone());
    }
    entries.len() > before
}

fn is_known_entry_stale(entry: &EsunKnownCatalogEntry, stale_before: Option<&str>) -> bool {
    match (entry.last_seen_at.as_deref(), stale_before) {
        (Some(last_seen_at), Some(cutoff)) => last_seen_at < cutoff,
        (None, Some(_)) => true,
        _ => false,
    }
}

fn normalize_catalog_product_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    match Url::parse(trimmed) {
        Ok(mut parsed) => {
            parsed.set_query(None);
            parsed.set_fragment(None);
            parsed.to_string()
        }
        Err(_) => trimmed.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::is_known_entry_stale;
    use crate::backend::vendor_lookup::{EsunCatalogEntry, EsunKnownCatalogEntry};

    fn known_entry(last_seen_at: Option<&str>) -> EsunKnownCatalogEntry {
        EsunKnownCatalogEntry {
            entry: EsunCatalogEntry {
                material: "PLA".to_string(),
                filament_name: "PLA+".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#FFFFFF".to_string()),
                image_url: None,
                product_url: "https://www.esun3d.com/pla-pro-product/".to_string(),
                default_weight_g: 1_000,
            },
            last_seen_at: last_seen_at.map(str::to_string),
        }
    }

    #[test]
    fn cache_entry_without_last_seen_is_stale_when_cutoff_is_present() {
        assert!(is_known_entry_stale(
            &known_entry(None),
            Some("2026-04-01 00:00:00")
        ));
    }

    #[test]
    fn cache_entry_at_cutoff_is_still_fresh() {
        let cutoff = "2026-04-01 00:00:00";
        assert!(!is_known_entry_stale(
            &known_entry(Some(cutoff)),
            Some(cutoff)
        ));
    }
}
