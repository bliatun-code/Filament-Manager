use rusqlite::{params, Connection, OptionalExtension};

use super::database_loan_models::SpoolLoanRow;
use super::database_result::{InventoryError, InventoryResult};
use super::database_rows::map_spool_loan_row;
use super::database_text::normalize_optional_text;
use super::inventory_domain::{LoanDirection, LoanStatus};
use super::loan_defaults::{ACTIVE_LOAN_PREDICATE_SQL, LOAN_STATUS_SELECT_SQL};

pub(crate) fn update_active_inbound_spool_loan_counterparty(
    conn: &Connection,
    spool_id: &str,
    counterparty_name: &str,
    counterparty_contact: Option<&str>,
    counterparty_note: Option<&str>,
) -> InventoryResult<()> {
    conn.execute(
        &format!(
            "UPDATE spool_loans
         SET borrower_name = ?1,
             counterparty_name = ?1,
             counterparty_contact = ?2,
             counterparty_note = ?3,
             lent_note = ?3
         WHERE spool_id = ?4
           AND COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') = 'INBOUND'
           AND {ACTIVE_LOAN_PREDICATE_SQL}"
        ),
        params![
            counterparty_name.trim(),
            normalize_optional_text(counterparty_contact),
            normalize_optional_text(counterparty_note),
            spool_id
        ],
    )?;
    Ok(())
}

pub(crate) fn close_inbound_spool_loan_without_returning_spool(
    conn: &Connection,
    loan_id: &str,
    returned_grams: i64,
    return_note: Option<&str>,
) -> InventoryResult<SpoolLoanRow> {
    let loan = select_loan_by_id_optional(conn, loan_id)?.ok_or(InventoryError::NotFound)?;
    if !LoanStatus::from_raw(Some(&loan.loan_status), loan.returned_at.as_deref()).is_active() {
        return Err(InventoryError::Db("loan already returned".to_string()));
    }
    if LoanDirection::from_raw(Some(&loan.loan_direction)) != LoanDirection::Inbound {
        return Err(InventoryError::Db(
            "this flow only supports inbound loans".to_string(),
        ));
    }

    let safe_returned = returned_grams.max(0);
    let consumed = (loan.grams_out - safe_returned).max(0);

    conn.execute(
        "UPDATE spool_loans
         SET loan_status = 'RETURNED',
             returned_at = datetime('now'),
             returned_grams = ?2,
             consumed_grams = ?3,
             return_note = ?4
         WHERE id = ?1",
        params![
            loan_id,
            safe_returned,
            consumed,
            normalize_optional_text(return_note)
        ],
    )?;

    select_loan_by_id(conn, loan_id)
}

fn select_loan_by_id_optional(
    conn: &Connection,
    loan_id: &str,
) -> InventoryResult<Option<SpoolLoanRow>> {
    let sql = select_loan_by_id_sql();
    conn.query_row(&sql, params![loan_id], map_spool_loan_row)
        .optional()
        .map_err(InventoryError::from)
}

fn select_loan_by_id(conn: &Connection, loan_id: &str) -> InventoryResult<SpoolLoanRow> {
    let sql = select_loan_by_id_sql();
    conn.query_row(&sql, params![loan_id], map_spool_loan_row)
        .map_err(InventoryError::from)
}

fn select_loan_by_id_sql() -> String {
    format!(
        "SELECT id, spool_id, borrower_name,
        COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') AS loan_direction,
        {LOAN_STATUS_SELECT_SQL} AS loan_status,
        COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
        counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
        expected_return_at, returned_at, returned_grams, consumed_grams, return_note
 FROM spool_loans
 WHERE id = ?1
 LIMIT 1"
    )
}
