use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilamentMasterSummary {
    pub id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub default_weight: i64,
    pub vendor: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilamentMasterCatalogRow {
    pub id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub product_url: Option<String>,
    pub default_weight: i64,
    pub vendor: String,
    pub last_seen_at: Option<String>,
    pub is_discontinued: bool,
    pub discontinued_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogLifecycleStats {
    pub reactivated_count: i64,
    pub discontinued_count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogSeedStats {
    pub scanned_count: i64,
    pub inserted_count: i64,
    pub updated_count: i64,
    pub skipped_invalid_count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EsunColorNormalizationStats {
    pub scanned_count: i64,
    pub normalized_count: i64,
    pub merged_count: i64,
    pub skipped_conflicts: i64,
}
