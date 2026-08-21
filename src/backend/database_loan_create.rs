use rusqlite::{params, Connection, OptionalExtension};

use super::database_ids::new_id;
use super::database_loan_models::SpoolLoanRow;
use super::database_result::{InventoryError, InventoryResult};
use super::database_rows::map_spool_loan_row;
use super::database_text::normalize_optional_text;
use super::loan_defaults::{
    ACTIVE_LOAN_PREDICATE_SQL, LOAN_DIRECTION_SELECT_SQL, LOAN_STATUS_SELECT_SQL,
};
use super::loan_expected_return::normalize_expected_return_date;

pub(crate) fn create_spool_loan(
    conn: &Connection,
    spool_id: &str,
    borrower_name: &str,
    grams_out: i64,
    lent_note: Option<&str>,
) -> InventoryResult<SpoolLoanRow> {
    let tx = conn.unchecked_transaction()?;
    let loan = create_spool_loan_in_transaction(
        &tx,
        spool_id,
        borrower_name,
        None,
        grams_out,
        lent_note,
        None,
    )?;
    tx.commit()?;
    Ok(loan)
}

pub(crate) fn create_spool_loan_in_transaction(
    conn: &Connection,
    spool_id: &str,
    borrower_name: &str,
    counterparty_contact: Option<&str>,
    grams_out: i64,
    lent_note: Option<&str>,
    expected_return_at: Option<&str>,
) -> InventoryResult<SpoolLoanRow> {
    let borrower = borrower_name.trim();
    if borrower.is_empty() {
        return Err(InventoryError::Db("borrower name is required".to_string()));
    }

    ensure_spool_can_be_loaned(conn, spool_id)?;
    let expected_return_at = normalize_expected_return_date(expected_return_at)?;

    conn.execute(
        "UPDATE ams_slots
         SET spool_id = NULL, last_seen_at = datetime('now')
         WHERE spool_id = ?1",
        params![spool_id],
    )?;

    let loan_id = new_id();
    conn.execute(
        "INSERT INTO spool_loans (
            id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
            counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
            expected_return_at
        ) VALUES (?1, ?2, ?3, 'OUTBOUND', 'ACTIVE', ?3, ?4, NULL, ?5, ?6, datetime('now'), ?7)",
        params![
            loan_id,
            spool_id,
            borrower,
            normalize_optional_text(counterparty_contact),
            grams_out.max(0),
            normalize_optional_text(lent_note),
            expected_return_at
        ],
    )?;

    let location = format!("Loaned to: {borrower}");
    conn.execute(
        "INSERT INTO inventory_locations (id, name, type)
         VALUES (?1, ?2, 'LOAN')
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name",
        params![location, location],
    )?;
    conn.execute(
        "UPDATE filament_spools
         SET status = 'BORROWED',
             location_id = ?2,
             current_weight_g = ?3,
             remaining_g = ?3,
             updated_at = datetime('now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![spool_id, location, grams_out.max(0)],
    )?;

    select_loan_by_id(conn, &loan_id)
}

pub(crate) fn create_inbound_spool_loan(
    conn: &Connection,
    spool_id: &str,
    counterparty_name: &str,
    counterparty_contact: Option<&str>,
    counterparty_note: Option<&str>,
    grams_out: i64,
) -> InventoryResult<SpoolLoanRow> {
    let tx = conn.unchecked_transaction()?;
    let loan = create_inbound_spool_loan_in_transaction(
        &tx,
        spool_id,
        counterparty_name,
        counterparty_contact,
        counterparty_note,
        grams_out,
    )?;
    tx.commit()?;
    Ok(loan)
}

pub(crate) fn create_inbound_spool_loan_in_transaction(
    conn: &Connection,
    spool_id: &str,
    counterparty_name: &str,
    counterparty_contact: Option<&str>,
    counterparty_note: Option<&str>,
    grams_out: i64,
) -> InventoryResult<SpoolLoanRow> {
    let counterparty = counterparty_name.trim();
    if counterparty.is_empty() {
        return Err(InventoryError::Db(
            "counterparty name is required".to_string(),
        ));
    }

    ensure_spool_can_be_loaned(conn, spool_id)?;

    let loan_id = new_id();
    conn.execute(
        "INSERT INTO spool_loans (
            id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
            counterparty_contact, counterparty_note, grams_out, lent_note, lent_at
        ) VALUES (?1, ?2, ?3, 'INBOUND', 'ACTIVE', ?3, ?4, ?5, ?6, ?5, datetime('now'))",
        params![
            loan_id,
            spool_id,
            counterparty,
            normalize_optional_text(counterparty_contact),
            normalize_optional_text(counterparty_note),
            grams_out.max(0)
        ],
    )?;

    select_loan_by_id(conn, &loan_id)
}

fn ensure_spool_can_be_loaned(conn: &Connection, spool_id: &str) -> InventoryResult<()> {
    let spool_exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM filament_spools WHERE id = ?1 AND deleted_at IS NULL LIMIT 1",
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if spool_exists.is_none() {
        return Err(InventoryError::NotFound);
    }

    let already_loaned: Option<i64> = conn
        .query_row(
            &format!(
                "SELECT 1
                 FROM spool_loans
                 WHERE spool_id = ?1
                   AND {ACTIVE_LOAN_PREDICATE_SQL}
                 LIMIT 1"
            ),
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    if already_loaned.is_some() {
        return Err(InventoryError::Db(
            "this spool already has an active loan".to_string(),
        ));
    }
    Ok(())
}

fn select_loan_by_id(conn: &Connection, loan_id: &str) -> InventoryResult<SpoolLoanRow> {
    conn.query_row(
        &format!(
            "SELECT id, spool_id, borrower_name,
                {LOAN_DIRECTION_SELECT_SQL} AS loan_direction,
                {LOAN_STATUS_SELECT_SQL} AS loan_status,
                COALESCE(NULLIF(counterparty_name, ''), borrower_name) AS counterparty_name,
                counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
                expected_return_at, returned_at, returned_grams, consumed_grams, return_note
         FROM spool_loans
         WHERE id = ?1
         LIMIT 1"
        ),
        params![loan_id],
        map_spool_loan_row,
    )
    .map_err(InventoryError::from)
}
