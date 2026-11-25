use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WishlistItemRow {
    pub id: String,
    pub master_id: Option<String>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub status: String,
    pub quantity: i64,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DashboardPurchaseResult {
    Created {
        #[serde(rename = "itemId")]
        item_id: String,
        status: String,
    },
    Reused {
        #[serde(rename = "itemId")]
        item_id: String,
        status: String,
        #[serde(rename = "match")]
        matched_by: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct WishlistReceiptResult {
    pub spool_ids: Vec<String>,
    pub received_quantity: i64,
    pub remaining_quantity: i64,
    pub status: String,
}
