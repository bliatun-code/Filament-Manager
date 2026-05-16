use super::database_locations::ensure_location as ensure_location_row;
use super::database_result::InventoryResult;
use super::database_spool_assignment::{
    spool_assigned_to_printer as spool_assigned_to_printer_row,
    spool_assigned_to_specific_printer as spool_assigned_to_specific_printer_row,
};
use super::database_spool_delete::{
    purge_spool as purge_spool_row, soft_delete_spool as soft_delete_spool_row,
};
use super::database_spool_insert::insert_spool as insert_spool_row;
use super::database_spool_models::{SpoolRow, SpoolWithMasterRow};
use super::database_spool_queries::{
    get_spool_by_id as get_spool_by_id_row, get_spool_by_qr as get_spool_by_qr_row,
    get_spool_with_master_by_id as get_spool_with_master_by_id_row,
    list_low_stock_spools as list_low_stock_spool_rows,
    list_spools_with_master as list_spools_with_master_rows,
};
use super::filament_database::FilamentDatabase;

impl FilamentDatabase {
    pub fn insert_spool(&self, spool: &SpoolRow) -> InventoryResult<()> {
        insert_spool_row(self.connection(), spool)
    }

    pub fn get_spool_by_qr(&self, qr_code: &str) -> InventoryResult<Option<SpoolRow>> {
        get_spool_by_qr_row(self.connection(), qr_code)
    }

    pub fn get_spool_by_id(&self, spool_id: &str) -> InventoryResult<Option<SpoolRow>> {
        get_spool_by_id_row(self.connection(), spool_id)
    }

    pub fn get_spool_with_master_by_id(
        &self,
        spool_id: &str,
    ) -> InventoryResult<Option<SpoolWithMasterRow>> {
        get_spool_with_master_by_id_row(self.connection(), spool_id)
    }

    pub fn soft_delete_spool(&self, spool_id: &str) -> InventoryResult<()> {
        soft_delete_spool_row(self.connection(), spool_id)
    }

    pub fn purge_spool(&self, spool_id: &str) -> InventoryResult<()> {
        purge_spool_row(self.connection(), spool_id)
    }

    pub fn ensure_location(&self, name: &str) -> InventoryResult<String> {
        ensure_location_row(self.connection(), name)
    }

    pub fn list_spools_with_master(
        &self,
        limit: i64,
        offset: i64,
    ) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        list_spools_with_master_rows(self.connection(), limit, offset)
    }

    pub fn list_low_stock_spools(&self, threshold: i64) -> InventoryResult<Vec<SpoolRow>> {
        list_low_stock_spool_rows(self.connection(), threshold)
    }

    pub fn spool_assigned_to_printer(&self, spool_id: &str) -> InventoryResult<bool> {
        spool_assigned_to_printer_row(self.connection(), spool_id)
    }

    pub fn spool_assigned_to_specific_printer(
        &self,
        spool_id: &str,
        printer_id: &str,
    ) -> InventoryResult<bool> {
        spool_assigned_to_specific_printer_row(self.connection(), spool_id, printer_id)
    }
}
