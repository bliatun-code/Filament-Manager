use super::database_catalog_esun::normalize_esun_catalog_colors as normalize_esun_catalog_colors_rows;
use super::database_catalog_inputs::{
    ManualMasterInput, MasterCatalogUpdateInput, SourceCatalogEntryInput,
};
use super::database_catalog_lifecycle::reactivate_seen_vendor_material as reactivate_seen_vendor_material_rows;
use super::database_catalog_manual::upsert_manual_master as upsert_manual_master_row;
use super::database_catalog_queries::list_master_catalog as list_master_catalog_rows;
use super::database_catalog_schema::ensure_catalog_lifecycle_columns as ensure_catalog_lifecycle_columns_schema;
use super::database_catalog_source::{
    import_source_vendor_catalog as import_source_vendor_catalog_rows, SourceCatalogImportStats,
};
use super::database_catalog_update::update_master_catalog_entry as update_master_catalog_entry_row;
use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::filament_master_models::{EsunColorNormalizationStats, FilamentMasterCatalogRow};

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
        let transaction = self.connection().unchecked_transaction()?;
        let master_id = update_master_catalog_entry_row(&transaction, input)?;
        transaction.commit()?;
        Ok(master_id)
    }

    pub fn ensure_catalog_lifecycle_columns(&self) -> InventoryResult<()> {
        ensure_catalog_lifecycle_columns_schema(self.connection())
    }

    pub fn reactivate_seen_vendor_material(
        &self,
        vendor: &str,
        material: &str,
        refresh_started_at: &str,
    ) -> InventoryResult<i64> {
        reactivate_seen_vendor_material_rows(
            self.connection(),
            vendor,
            material,
            refresh_started_at,
        )
    }

    pub fn import_source_vendor_catalog(
        &self,
        vendor: &str,
        material: &str,
        refresh_started_at: &str,
        entries: &[SourceCatalogEntryInput<'_>],
    ) -> InventoryResult<SourceCatalogImportStats> {
        import_source_vendor_catalog_rows(
            self.connection(),
            vendor,
            material,
            refresh_started_at,
            entries,
        )
    }
}
