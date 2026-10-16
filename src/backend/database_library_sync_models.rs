use serde::{Deserialize, Serialize};

use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_location_models::InventoryLocationRow;
use super::database_printer_models::PrinterOverviewRow;
use super::database_spool_models::SpoolWithMasterRow;
use super::database_wishlist_models::WishlistItemRow;
use super::low_stock_policy::LowStockPolicy;
use super::statistics::{FilamentConsumptionRow, InventoryOverview};

pub(crate) type LibrarySyncClientAuthState = (String, String, String, Option<String>);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncSettingsRow {
    pub mode: String,
    pub device_name: String,
    pub library_id: String,
    pub host_base_url: Option<String>,
    pub target_generation: u64,
    pub host_device_name: Option<String>,
    pub client_auth_paired: bool,
    pub client_auth_paired_at: Option<String>,
    pub client_auth_expires_at: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_reachable_at: Option<String>,
    pub last_validation_message: Option<String>,
    pub low_stock_policy: LowStockPolicy,
    pub low_stock_policy_valid: bool,
    pub cached_snapshot: Option<LibrarySyncCachedSnapshotRow>,
    pub cached_spools: Option<LibrarySyncCachedSpoolListRow>,
    pub cached_printers: Option<LibrarySyncCachedPrinterOverviewRow>,
    pub cached_loans: Option<LibrarySyncCachedLoanListRow>,
    pub cached_consumption: Option<LibrarySyncCachedFilamentConsumptionListRow>,
    pub cached_wishlist: Option<LibrarySyncCachedWishlistListRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LibrarySyncCachedSnapshotRow {
    pub captured_at: String,
    #[serde(default)]
    pub app_version: Option<String>,
    pub library_id: String,
    pub device_name: String,
    pub sync_mode: String,
    pub inventory: InventoryOverview,
    pub total_spools: i64,
    pub in_use: i64,
    pub low_stock: i64,
    pub active_loans: i64,
    pub printers: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedSpoolListRow {
    pub captured_at: String,
    pub rows: Vec<SpoolWithMasterRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedLocationListRow {
    pub captured_at: String,
    pub rows: Vec<InventoryLocationRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedPrinterOverviewRow {
    pub captured_at: String,
    pub rows: Vec<PrinterOverviewRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedLoanListRow {
    pub captured_at: String,
    pub rows: Vec<SpoolLoanDetailsRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedFilamentConsumptionListRow {
    pub captured_at: String,
    pub rows: Vec<FilamentConsumptionRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LibrarySyncCachedWishlistListRow {
    pub captured_at: String,
    pub rows: Vec<WishlistItemRow>,
}

#[cfg(test)]
mod tests {
    use super::LibrarySyncCachedSnapshotRow;

    #[test]
    fn cached_host_snapshot_app_version_is_additive_for_existing_json() {
        let mut saved = serde_json::json!({
            "captured_at": "2026-10-17T10:00:00Z",
            "library_id": "library-a",
            "device_name": "Workshop Host",
            "sync_mode": "HOST",
            "inventory": {
                "total_spools": 0, "total_owned_spools": 0, "total_borrowed_in_spools": 0,
                "in_use": 0, "owned_in_use": 0, "borrowed_in_in_use": 0,
                "low_stock": 0, "owned_low_stock": 0, "borrowed_in_low_stock": 0,
                "total_consumption_30d": 0, "owned_consumption_30d": 0, "borrowed_in_consumption_30d": 0
            },
            "total_spools": 0, "in_use": 0, "low_stock": 0, "active_loans": 0, "printers": 0
        });
        let legacy: LibrarySyncCachedSnapshotRow = serde_json::from_value(saved.clone()).unwrap();
        assert_eq!(legacy.app_version, None);
        assert_eq!(legacy.library_id, "library-a");
        saved["app_version"] = serde_json::json!("0.32.1");
        let current: LibrarySyncCachedSnapshotRow = serde_json::from_value(saved).unwrap();
        assert_eq!(current.app_version.as_deref(), Some("0.32.1"));
        assert_eq!(current.inventory, legacy.inventory);
    }
}
