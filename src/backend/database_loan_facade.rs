use super::database_core::FilamentDatabase;
use super::database_export::export_loans_csv_for_direction as export_loan_rows_csv_for_direction;
use super::database_loan_create::{
    create_inbound_spool_loan as create_inbound_spool_loan_row,
    create_spool_loan as create_spool_loan_row,
};
use super::database_loan_models::{
    ActiveSpoolLoanRow, LoanUsageByPersonRow, SpoolLoanDetailsRow, SpoolLoanRow,
};
use super::database_loan_queries::{
    ensure_spool_not_outbound_loan_locked as ensure_spool_not_outbound_loan_locked_row,
    find_active_spool_loan_for_direction as find_active_spool_loan_for_direction_row,
    list_active_spool_loans as list_active_spool_loan_rows,
    list_loan_usage_by_person_for_direction as list_loan_usage_by_person_for_direction_rows,
    list_spool_loans_for_direction as list_spool_loans_for_direction_rows,
    spool_has_active_loan as spool_has_active_loan_row,
};
use super::database_loan_return::{
    return_inbound_spool_loan as return_inbound_spool_loan_row,
    return_spool_loan as return_spool_loan_row,
};
use super::database_loan_update::{
    close_inbound_spool_loan_without_returning_spool as close_inbound_spool_loan_without_returning_spool_row,
    update_active_inbound_spool_loan_counterparty as update_active_inbound_spool_loan_counterparty_row,
};
use super::database_result::InventoryResult;

impl FilamentDatabase {
    pub fn update_active_inbound_spool_loan_counterparty(
        &self,
        spool_id: &str,
        counterparty_name: &str,
        counterparty_contact: Option<&str>,
        counterparty_note: Option<&str>,
    ) -> InventoryResult<()> {
        update_active_inbound_spool_loan_counterparty_row(
            self.connection(),
            spool_id,
            counterparty_name,
            counterparty_contact,
            counterparty_note,
        )
    }

    pub fn close_inbound_spool_loan_without_returning_spool(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        close_inbound_spool_loan_without_returning_spool_row(
            self.connection(),
            loan_id,
            returned_grams,
            return_note,
        )
    }

    pub fn create_spool_loan(
        &self,
        spool_id: &str,
        borrower_name: &str,
        grams_out: i64,
        lent_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        create_spool_loan_row(
            self.connection(),
            spool_id,
            borrower_name,
            grams_out,
            lent_note,
        )
    }

    pub fn spool_has_active_loan(&self, spool_id: &str) -> InventoryResult<bool> {
        spool_has_active_loan_row(self.connection(), spool_id)
    }

    pub fn ensure_spool_not_outbound_loan_locked(&self, spool_id: &str) -> InventoryResult<()> {
        ensure_spool_not_outbound_loan_locked_row(self.connection(), spool_id)
    }

    pub fn create_inbound_spool_loan(
        &self,
        spool_id: &str,
        counterparty_name: &str,
        counterparty_contact: Option<&str>,
        counterparty_note: Option<&str>,
        grams_out: i64,
    ) -> InventoryResult<SpoolLoanRow> {
        create_inbound_spool_loan_row(
            self.connection(),
            spool_id,
            counterparty_name,
            counterparty_contact,
            counterparty_note,
            grams_out,
        )
    }

    pub fn return_spool_loan(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        return_spool_loan_row(self.connection(), loan_id, returned_grams, return_note)
    }

    pub fn return_inbound_spool_loan(
        &self,
        loan_id: &str,
        returned_grams: i64,
        return_note: Option<&str>,
    ) -> InventoryResult<SpoolLoanRow> {
        return_inbound_spool_loan_row(self.connection(), loan_id, returned_grams, return_note)
    }

    pub fn list_active_spool_loans(&self) -> InventoryResult<Vec<ActiveSpoolLoanRow>> {
        list_active_spool_loan_rows(self.connection())
    }

    pub fn find_active_spool_loan_for_direction(
        &self,
        spool_id: &str,
        direction: &str,
    ) -> InventoryResult<Option<ActiveSpoolLoanRow>> {
        find_active_spool_loan_for_direction_row(self.connection(), spool_id, direction)
    }

    pub fn list_loan_usage_by_person_for_direction(
        &self,
        limit: i64,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<LoanUsageByPersonRow>> {
        list_loan_usage_by_person_for_direction_rows(self.connection(), limit, direction)
    }

    #[cfg(test)]
    pub fn list_spool_loans(
        &self,
        limit: i64,
        include_returned: bool,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        self.list_spool_loans_for_direction(limit, include_returned, Some("OUTBOUND"))
    }

    pub fn list_spool_loans_for_direction(
        &self,
        limit: i64,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
        list_spool_loans_for_direction_rows(self.connection(), limit, include_returned, direction)
    }

    pub fn export_loans_csv(&self, include_returned: bool) -> InventoryResult<String> {
        export_loan_rows_csv_for_direction(self.connection(), include_returned, Some("OUTBOUND"))
    }

    pub fn export_loans_csv_for_direction(
        &self,
        include_returned: bool,
        direction: Option<&str>,
    ) -> InventoryResult<String> {
        export_loan_rows_csv_for_direction(self.connection(), include_returned, direction)
    }
}
