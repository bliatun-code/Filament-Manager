use super::database_catalog_esun::normalize_esun_catalog_colors as normalize_esun_catalog_colors_rows;
use super::database_catalog_inputs::{ManualMasterInput, MasterCatalogUpdateInput};
use super::database_catalog_lifecycle::apply_vendor_discontinued_rules as apply_vendor_discontinued_rules_row;
use super::database_catalog_manual::upsert_manual_master as upsert_manual_master_row;
use super::database_catalog_queries::list_master_catalog as list_master_catalog_rows;
use super::database_catalog_schema::ensure_catalog_lifecycle_columns as ensure_catalog_lifecycle_columns_schema;
use super::database_catalog_update::update_master_catalog_entry as update_master_catalog_entry_row;
use super::database_result::InventoryResult;
use super::filament_database::FilamentDatabase;
use super::filament_master_models::{
    CatalogLifecycleStats, EsunColorNormalizationStats, FilamentMasterCatalogRow,
};

impl FilamentDatabase {
    pub fn list_master_catalog(
        &self,
        limit: i64,
        search: Option<&str>,
    ) -> InventoryResult<Vec<FilamentMasterCatalogRow>> {
        list_master_catalog_rows(self.connection(), limit, search)
    }

    pub fn upsert_manual_master(&self, input: ManualMasterInput<'_>) -> InventoryResult<String> {
        upsert_manual_master_row(self.connection(), input)
    }

    pub fn normalize_esun_catalog_colors(&self) -> InventoryResult<EsunColorNormalizationStats> {
        normalize_esun_catalog_colors_rows(self.connection())
    }

    pub fn update_master_catalog_entry(
        &self,
        input: MasterCatalogUpdateInput<'_>,
    ) -> InventoryResult<String> {
        update_master_catalog_entry_row(self.connection(), input)
    }

    pub fn ensure_catalog_lifecycle_columns(&self) -> InventoryResult<()> {
        ensure_catalog_lifecycle_columns_schema(self.connection())
    }

    pub fn apply_vendor_discontinued_rules(
        &self,
        vendor: &str,
        refresh_started_at: &str,
    ) -> InventoryResult<CatalogLifecycleStats> {
        apply_vendor_discontinued_rules_row(self.connection(), vendor, refresh_started_at)
    }

    pub fn apply_bambu_discontinued_rules(
        &self,
        refresh_started_at: &str,
    ) -> InventoryResult<CatalogLifecycleStats> {
        self.apply_vendor_discontinued_rules("Bambu", refresh_started_at)
    }
}
