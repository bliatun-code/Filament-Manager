use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrustedLanSettingsRow {
    pub enabled: bool,
    pub selected_interface_name: Option<String>,
    pub selected_interface_address: Option<String>,
    pub listen_port: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrustedLanPairedBrowserRow {
    pub id: String,
    pub display_name: Option<String>,
    pub paired_at: String,
    pub last_seen_at: Option<String>,
    pub last_origin: Option<String>,
    pub revoked_at: Option<String>,
}
