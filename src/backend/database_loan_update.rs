use rusqlite::{params, Connection};

use super::database_text::normalize_optional_text;
use super::filament_database::InventoryResult;

pub(crate) fn update_active_inbound_spool_loan_counterparty(
    conn: &Connection,
    spool_id: &str,
    counterparty_name: &str,
    counterparty_contact: Option<&str>,
    counterparty_note: Option<&str>,
) -> InventoryResult<()> {
    conn.execute(
        "UPDATE spool_loans
         SET borrower_name = ?1,
             counterparty_name = ?1,
             counterparty_contact = ?2,
             counterparty_note = ?3,
             lent_note = ?3
         WHERE spool_id = ?4
           AND COALESCE(NULLIF(loan_direction, ''), 'OUTBOUND') = 'INBOUND'
           AND returned_at IS NULL",
        params![
            counterparty_name.trim(),
            normalize_optional_text(counterparty_contact),
            normalize_optional_text(counterparty_note),
            spool_id
        ],
    )?;
    Ok(())
}
