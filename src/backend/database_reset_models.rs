use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogResetStats {
    pub removed_count: i64,
    pub remaining_count: i64,
    pub reactivated_count: i64,
}
