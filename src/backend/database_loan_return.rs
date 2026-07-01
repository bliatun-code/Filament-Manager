use rusqlite::{params, Connection, OptionalExtension};

use super::database_ids::new_id;
use super::database_loan_models::SpoolLoanRow;
use super::database_result::{InventoryError, InventoryResult};
use super::database_rows::map_spool_loan_row;
use super::database_text::normalize_optional_text;
use super::inventory_domain::{LoanDirection, LoanStatus};
use super::loan_defaults::LOAN_STATUS_SELECT_SQL;

pub(crate) fn return_spool_loan(
    conn: &Connection,
    loan_id: &str,
    returned_grams: i64,
    return_note: Option<&str>,
) -> InventoryResult<SpoolLoanRow> {
    let tx = conn.unchecked_transaction()?;
    let loan = select_loan_by_id_optional(&tx, loan_id)?.ok_or(InventoryError::NotFound)?;
    if !LoanStatus::from_raw(Some(&loan.loan_status), loan.returned_at.as_deref()).is_active() {
        return Err(InventoryError::Db("loan already returned".to_string()));
    }
    if LoanDirection::from_raw(Some(&loan.loan_direction)) != LoanDirection::Outbound {
        return Err(InventoryError::Db(
            "inbound loans require a dedicated return flow".to_string(),
        ));
    }

    let safe_returned = returned_grams.max(0);
    let consumed = (loan.grams_out - safe_returned).max(0);

    tx.execute(
        "UPDATE spool_loans
         SET loan_status = 'RETURNED',
             returned_at = datetime('now'),
             returned_grams = ?2,
             consumed_grams = ?3,
             return_note = ?4
         WHERE id = ?1",
        params![loan_id, safe_returned, consumed, return_note],
    )?;

    let next_status = if safe_returned == 0 {
        "EMPTY"
    } else {
        "IN_STOCK"
    };
    tx.execute(
        "UPDATE filament_spools
         SET status = ?2,
             location_id = NULL,
             current_weight_g = ?3,
             remaining_g = ?3,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![loan.spool_id, next_status, safe_returned],
    )?;

    tx.execute(
        "INSERT INTO scales (id, name, protocol, created_at, updated_at)
         VALUES ('loan-return', 'Loan Return', 'VIRTUAL', datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            protocol = excluded.protocol,
            updated_at = datetime('now')",
        [],
    )?;

    tx.execute(
        "INSERT INTO weight_readings (id, scale_id, spool_id, grams, captured_at, source)
         VALUES (?1, 'loan-return', ?2, ?3, datetime('now'), 'LOAN_RETURN')",
        params![new_id(), loan.spool_id, safe_returned],
    )?;

    let updated = select_loan_by_id(&tx, loan_id)?;
    tx.commit()?;
    Ok(updated)
}

pub(crate) fn return_inbound_spool_loan(
    conn: &Connection,
    loan_id: &str,
    returned_grams: i64,
    return_note: Option<&str>,
) -> InventoryResult<SpoolLoanRow> {
    let tx = conn.unchecked_transaction()?;
    let loan = select_loan_by_id_optional(&tx, loan_id)?.ok_or(InventoryError::NotFound)?;
    if !LoanStatus::from_raw(Some(&loan.loan_status), loan.returned_at.as_deref()).is_active() {
        return Err(InventoryError::Db("loan already returned".to_string()));
    }
    if LoanDirection::from_raw(Some(&loan.loan_direction)) != LoanDirection::Inbound {
        return Err(InventoryError::Db(
            "this flow only supports inbound loans".to_string(),
        ));
    }

    let spool_exists: Option<i64> = tx
        .query_row(
            "SELECT 1
             FROM filament_spools
             WHERE id = ?1
               AND deleted_at IS NULL
             LIMIT 1",
            params![loan.spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if spool_exists.is_none() {
        return Err(InventoryError::NotFound);
    }

    let safe_returned = returned_grams.max(0);
    let consumed = (loan.grams_out - safe_returned).max(0);

    tx.execute(
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

    tx.execute(
        "UPDATE ams_slots
         SET spool_id = NULL, last_seen_at = datetime('now')
         WHERE spool_id = ?1",
        params![loan.spool_id],
    )?;

    tx.execute(
        "UPDATE filament_spools
         SET status = 'DELETED',
             deleted_at = datetime('now'),
             location_id = NULL,
             current_weight_g = ?2,
             remaining_g = ?2,
             updated_at = datetime('now')
         WHERE id = ?1
           AND deleted_at IS NULL",
        params![loan.spool_id, safe_returned],
    )?;

    let updated = select_loan_by_id(&tx, loan_id)?;
    tx.commit()?;
    Ok(updated)
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
