use std::collections::{BTreeMap, HashSet};
use std::io::Read;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::{blocking::Client, redirect::Policy};
use serde::Deserialize;

use super::{
    normalize_esun_color_name_for_catalog, normalize_whitespace, sort_esun_material_families,
    EsunCatalogEntry, EsunCatalogRefreshSnapshot, EsunCatalogSourceDiscovery, ESUN_USER_AGENT,
};

const REGISTRY_URL: &str = "https://raw.githubusercontent.com/TigerTag-Project/TigerTag-RFID-Guide/main/database/brands/id_esun.json";
const SOURCE_NAME: &str = "TigerTag public registry";
const COLLECTION_NAME: &str = "eSUN (supplemental)";
const PRODUCT_URL: &str = "https://tigersystem.io/en/catalog";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_ROWS: usize = 1_000;
// Reuse the same validated snapshot when discovery is followed by one or
// more material updates. Failed fetches are not cached.
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);

// Brand ID from database/brands/index.json. Other IDs come from the TigerTag
// reference tables for type, diameter and measure unit.
const ESUN_BRAND_ID: u16 = 47930;
const FILAMENT_TYPE: u8 = 0x8E;
const DIAMETER_1_75_MM: u8 = 0x38;
const GRAM_UNIT: u8 = 0x15;
const NOMINAL_WEIGHT_G: i64 = 1000;

type CachedCatalog = (Instant, Arc<RegistryCatalog>);
static CACHE: OnceLock<Mutex<Option<CachedCatalog>>> = OnceLock::new();

#[derive(Debug)]
struct RegistryCatalog {
    entries: Vec<EsunCatalogEntry>,
    skipped_rows: usize,
}

#[derive(Deserialize)]
struct RegistryRow {
    id: u32,
    brand: String,
    product_type: String,
    material: String,
    series: String,
    name: String,
    sku: Option<String>,
    barcode: Option<String>,
    measure: String,
    // The public product detail endpoint confirms this flag for refill rows.
    #[serde(rename = "info1")]
    refill: bool,
    info2: bool,
    info3: bool,
    color: Option<String>,
    color_info: Option<RegistryColor>,
    #[serde(rename = "RFID_Data")]
    rfid: RfidData,
}

#[derive(Deserialize)]
struct RfidData {
    id_brand: u16,
    id_type: u8,
    id_unit: u8,
    #[serde(rename = "data1")]
    diameter: u8,
    measure: i64,
}

#[derive(Deserialize)]
struct RegistryColor {
    #[serde(rename = "type")]
    kind: String,
    colors: Vec<String>,
}

pub(super) fn refresh(material: &str) -> Result<EsunCatalogRefreshSnapshot, String> {
    load_catalog()?.snapshot(material)
}

pub(super) fn discover() -> Result<EsunCatalogSourceDiscovery, String> {
    Ok(load_catalog()?.discovery())
}

fn load_catalog() -> Result<Arc<RegistryCatalog>, String> {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    let mut cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some((loaded_at, catalog)) = cache.as_ref()
        && loaded_at.elapsed() < CACHE_TTL
    {
        return Ok(Arc::clone(catalog));
    }
    let client = Client::builder()
        .user_agent(ESUN_USER_AGENT)
        .timeout(Duration::from_secs(20))
        .redirect(Policy::none())
        .build()
        .map_err(|error| format!("Could not prepare the TigerTag registry request: {error}"))?;
    let response = client
        .get(REGISTRY_URL)
        .send()
        .map_err(|error| format!("Could not reach the TigerTag registry: {error}"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(format!(
            "The TigerTag registry returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    let catalog = Arc::new(parse_registry(response)?);
    *cache = Some((Instant::now(), Arc::clone(&catalog)));
    Ok(catalog)
}

fn parse_registry(reader: impl Read) -> Result<RegistryCatalog, String> {
    let mut body = Vec::new();
    reader
        .take((MAX_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut body)
        .map_err(|error| format!("Could not read the TigerTag registry: {error}"))?;
    if body.len() > MAX_RESPONSE_BYTES {
        return Err("The TigerTag eSUN registry exceeded the response size limit.".to_string());
    }

    let rows: Vec<RegistryRow> = serde_json::from_slice(&body)
        .map_err(|error| format!("Could not decode the TigerTag eSUN registry: {error}"))?;
    if rows.is_empty() || rows.len() > MAX_ROWS {
        return Err("The TigerTag eSUN registry was empty or exceeded its row limit.".to_string());
    }
    let mut product_ids = HashSet::new();
    if rows.iter().any(|row| {
        !row.brand.eq_ignore_ascii_case("esun")
            || row.rfid.id_brand != ESUN_BRAND_ID
            || !product_ids.insert(row.id)
    }) {
        return Err(
            "The TigerTag eSUN registry contained an unexpected brand or repeated product ID."
                .to_string(),
        );
    }

    let mut entries = BTreeMap::new();
    let source_rows = rows.len();
    for row in rows {
        if let Some(entry) = row.into_entry() {
            let key = (
                entry.material.clone(),
                entry.filament_name.clone(),
                entry.color_name.to_ascii_lowercase(),
            );
            // Leave conflicting swatches out. A duplicate with the same
            // swatch keeps the same product link regardless of source order.
            entries
                .entry(key)
                .and_modify(|prior: &mut Option<EsunCatalogEntry>| {
                    if let Some(previous) = prior {
                        if previous.hex_color != entry.hex_color {
                            *prior = None;
                        } else if entry.product_url < previous.product_url {
                            *previous = entry.clone();
                        }
                    }
                })
                .or_insert(Some(entry));
        }
    }
    let entries = entries.into_values().flatten().collect::<Vec<_>>();
    if entries.is_empty() {
        return Err("The TigerTag eSUN registry contained no verified variants.".to_string());
    }
    Ok(RegistryCatalog {
        skipped_rows: source_rows - entries.len(),
        entries,
    })
}

impl RegistryRow {
    fn into_entry(self) -> Option<EsunCatalogEntry> {
        // This is supplemental data. Require the packaging and nominal
        // weight the catalog can represent, and skip additional flags rather
        // than guessing how they change the identity.
        if self.id == 0
            || self.id == u32::MAX
            || self.product_type != "Filament"
            || self.rfid.id_type != FILAMENT_TYPE
            || self.rfid.diameter != DIAMETER_1_75_MM
            || self.refill
            || self.info2
            || self.info3
            || self.rfid.id_unit != GRAM_UNIT
            || self.rfid.measure != NOMINAL_WEIGHT_G
            || self.measure != "1000 g"
        {
            return None;
        }
        let (material, series) = canonical_series(&self.material, &self.series)?;
        let sku = self.sku.as_deref()?;
        let barcode = self.barcode.as_deref()?;
        let sku_prefix = format!("{series}175");
        if !sku
            .get(..sku_prefix.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(&sku_prefix))
            || !sku
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'+'))
            || !valid_esun_barcode(barcode)
        {
            return None;
        }

        let color_name = canonical_color(&self.name, material, series)?;
        let color = self.color.as_deref()?;
        let color_info = self.color_info?;
        if color_info.kind != "mono"
            || !matches!(color_info.colors.as_slice(), [only] if only.eq_ignore_ascii_case(color))
        {
            return None;
        }
        // The app stores opaque RGB swatches, so keep transparent variants
        // out of this supplemental source rather than dropping their alpha.
        let rgba = color.strip_prefix('#')?;
        if rgba.len() != 8
            || !rgba.bytes().all(|b| b.is_ascii_hexdigit())
            || !rgba[6..].eq_ignore_ascii_case("ff")
        {
            return None;
        }
        Some(EsunCatalogEntry {
            material: material.to_string(),
            filament_name: series.to_string(),
            color_name,
            hex_color: Some(format!("#{}", rgba[..6].to_ascii_uppercase())),
            image_url: None,
            product_url: format!("{PRODUCT_URL}/{}", self.id),
            default_weight_g: NOMINAL_WEIGHT_G,
        })
    }
}

// The named series map to catalog material families. Other labels in the
// source can refer to variants of an existing series under a second name.
fn canonical_series(material: &str, series: &str) -> Option<(&'static str, &'static str)> {
    match (material, series) {
        ("ABS", "ABS+") => Some(("ABS", "ABS+")),
        ("ABS", "ABS-ESD") => Some(("ABS", "ABS-ESD")),
        ("ABS-CF", "ABS-CF") => Some(("ABS", "ABS-CF")),
        ("ABS-GF", "ABS-GF") => Some(("ABS", "ABS-GF")),
        ("ASA+", "ASA+") => Some(("ASA", "ASA+")),
        ("HIPS", "HIPS") => Some(("HIPS", "HIPS")),
        ("PA", "PA") => Some(("PA", "PA")),
        ("PEBA", "PEBA-90A") => Some(("PEBA", "PEBA-90A")),
        ("PET-CF", "PET-CF") => Some(("PET", "PET-CF")),
        ("PETG-ESD", "PETG-ESD") => Some(("PETG", "PETG-ESD")),
        ("PLA+", "PLA+ with spool" | "PLA+") => Some(("PLA", "PLA+")),
        ("PLA", "PLA-CF") => Some(("PLA", "PLA-CF")),
        ("PLA", "PLA-Cast") => Some(("PLA", "PLA-Cast")),
        ("PLA-AERO", "PLA-LW") => Some(("PLA", "PLA-LW")),
        ("TPU", "TPU-64D") => Some(("TPU", "TPU-64D")),
        ("TPU", "TPU-85A") => Some(("TPU", "TPU-85A")),
        ("TPU", "TPU-95A") => Some(("TPU", "TPU-95A")),
        _ => None,
    }
}

fn canonical_color(name: &str, material: &str, series: &str) -> Option<String> {
    let name = normalize_whitespace(name);
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphabetic() || matches!(b, b' ' | b'-'))
        || matches!(
            name.to_ascii_lowercase().as_str(),
            "standard" | "default" | "rainbow" | "random" | "mixed"
        )
    {
        return None;
    }
    let name = normalize_esun_color_name_for_catalog(&name, material, series);
    Some(
        name.split_whitespace()
            .map(|word| match word.to_ascii_lowercase().as_str() {
                "rgb" => "RGB".to_string(),
                "gray" => "Grey".to_string(),
                _ => {
                    let mut title = word.to_ascii_lowercase();
                    if let Some(first) = title.get_mut(..1) {
                        first.make_ascii_uppercase();
                    }
                    title
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn valid_esun_barcode(barcode: &str) -> bool {
    // Some values in the source have a trailing ".0".
    let barcode = barcode.strip_suffix(".0").unwrap_or(barcode);
    barcode.starts_with("69225722")
        && barcode.len() == 13
        && barcode.bytes().all(|b| b.is_ascii_digit())
        && barcode
            .bytes()
            .enumerate()
            .map(|(i, digit)| u16::from(digit - b'0') * if i % 2 == 0 { 1 } else { 3 })
            .sum::<u16>()
            .is_multiple_of(10)
}

impl RegistryCatalog {
    fn snapshot(&self, material: &str) -> Result<EsunCatalogRefreshSnapshot, String> {
        let entries: Vec<_> = self
            .entries
            .iter()
            .filter(|entry| entry.material == material)
            .cloned()
            .collect();
        if entries.is_empty() {
            return Err(format!(
                "The TigerTag registry currently has no verified {material} eSUN variants."
            ));
        }
        let series_count = entries
            .iter()
            .map(|entry| &entry.filament_name)
            .collect::<HashSet<_>>()
            .len() as i64;
        let variant_count = entries.len();
        Ok(EsunCatalogRefreshSnapshot {
            entries,
            preserve_existing_entries: true,
            handles_found: series_count,
            products_processed: series_count,
            skipped_non_filament: 0,
            reused_cached_products: 0,
            detail_fetches: 0,
            warnings: vec![format!(
                "The TigerTag eSUN registry supplied {} verified 1 kg {material} spool variants. {} rows were skipped across the registry. Existing catalog entries are preserved.",
                variant_count, self.skipped_rows
            )],
            detected_store: SOURCE_NAME.to_string(),
            detected_collection: COLLECTION_NAME.to_string(),
        })
    }

    fn discovery(&self) -> EsunCatalogSourceDiscovery {
        let materials = self
            .entries
            .iter()
            .map(|entry| entry.material.clone())
            .collect::<HashSet<_>>();
        let discovered_materials = sort_esun_material_families(materials.into_iter().collect());
        let products_discovered = self
            .entries
            .iter()
            .map(|entry| (&entry.material, &entry.filament_name))
            .collect::<HashSet<_>>()
            .len() as i64;
        EsunCatalogSourceDiscovery {
            detected_store: SOURCE_NAME.to_string(),
            detected_collection: COLLECTION_NAME.to_string(),
            products_discovered,
            detail_fetches: 0,
            output: self.source_note(),
            discovered_materials,
        }
    }

    fn source_note(&self) -> String {
        format!(
            "The TigerTag eSUN registry supplements the catalog with {} verified 1 kg spool variants. {} rows were skipped (unsupported variants or duplicate records). Existing catalog entries are preserved.",
            self.entries.len(),
            self.skipped_rows
        )
    }
}

#[cfg(test)]
#[path = "vendor_lookup_esun_registry_tests.rs"]
mod tests;
