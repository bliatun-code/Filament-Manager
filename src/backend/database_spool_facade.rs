use super::database_core::FilamentDatabase;
use super::database_locations::ensure_location as ensure_location_row;
use super::database_low_stock_policy::load_low_stock_policy;
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
    list_all_spools_with_master as list_all_spools_with_master_rows,
    list_spools_with_master as list_spools_with_master_rows,
    list_spools_with_master_by_rfid as list_spools_with_master_by_rfid_rows,
};

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
        let policy = load_low_stock_policy(self.connection())?;
        Ok(
            get_spool_with_master_by_id_row(self.connection(), spool_id)?.map(|mut row| {
                row.low_stock_threshold_g =
                    Some(policy.threshold_for_material(&row.master.material));
                row
            }),
        )
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
        let mut rows = list_spools_with_master_rows(self.connection(), limit, offset)?;
        apply_low_stock_thresholds(self.connection(), &mut rows)?;
        Ok(rows)
    }

    pub fn list_all_spools_with_master(&self) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        let mut rows = list_all_spools_with_master_rows(self.connection())?;
        apply_low_stock_thresholds(self.connection(), &mut rows)?;
        Ok(rows)
    }

    pub fn list_spools_with_master_by_rfid(
        &self,
        rfid_tag: &str,
    ) -> InventoryResult<Vec<SpoolWithMasterRow>> {
        let mut rows = list_spools_with_master_by_rfid_rows(self.connection(), rfid_tag)?;
        apply_low_stock_thresholds(self.connection(), &mut rows)?;
        Ok(rows)
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

fn apply_low_stock_thresholds(
    connection: &rusqlite::Connection,
    rows: &mut [SpoolWithMasterRow],
) -> InventoryResult<()> {
    let policy = load_low_stock_policy(connection)?;
    for row in rows {
        row.low_stock_threshold_g = Some(policy.threshold_for_material(&row.master.material));
    }
    Ok(())
}
