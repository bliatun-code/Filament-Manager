use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolLoanRow {
    pub id: String,
    pub spool_id: String,
    pub borrower_name: String,
    pub loan_direction: String,
    pub loan_status: String,
    pub counterparty_name: String,
    pub counterparty_contact: Option<String>,
    pub counterparty_note: Option<String>,
    pub grams_out: i64,
    pub lent_note: Option<String>,
    pub lent_at: String,
    pub expected_return_at: Option<String>,
    pub returned_at: Option<String>,
    pub returned_grams: Option<i64>,
    pub consumed_grams: Option<i64>,
    pub return_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActiveSpoolLoanRow {
    pub loan: SpoolLoanRow,
    pub spool_status: String,
    pub spool_remaining_g: Option<i64>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub hex_color: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoanUsageByPersonRow {
    pub loan_direction: String,
    pub borrower_name: String,
    pub total_consumed_g: i64,
    pub completed_loans: i64,
    pub active_loans: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpoolLoanDetailsRow {
    pub loan: SpoolLoanRow,
    pub spool_status: Option<String>,
    pub spool_remaining_g: Option<i64>,
    pub spool_tare_weight_g: Option<i64>,
    pub material: Option<String>,
    pub filament_name: Option<String>,
    pub color_name: Option<String>,
    pub vendor: Option<String>,
    pub hex_color: Option<String>,
}
