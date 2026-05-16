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
