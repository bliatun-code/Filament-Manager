use rusqlite::Connection;

use super::database_schema::table_has_column;
use super::filament_database::InventoryResult;

pub(crate) fn ensure_borrowed_in_schema(conn: &Connection) -> InventoryResult<()> {
    if !table_has_column(conn, "filament_spools", "ownership_type")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN ownership_type TEXT NOT NULL DEFAULT 'OWNED'",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_spools", "owner_name")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN owner_name TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_spools", "owner_contact")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN owner_contact TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "filament_spools", "ownership_note")? {
        conn.execute(
            "ALTER TABLE filament_spools
             ADD COLUMN ownership_note TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "spool_loans", "loan_direction")? {
        conn.execute(
            "ALTER TABLE spool_loans
             ADD COLUMN loan_direction TEXT NOT NULL DEFAULT 'OUTBOUND'",
            [],
        )?;
    }

    if !table_has_column(conn, "spool_loans", "loan_status")? {
        conn.execute(
            "ALTER TABLE spool_loans
             ADD COLUMN loan_status TEXT NOT NULL DEFAULT 'ACTIVE'",
            [],
        )?;
    }

    if !table_has_column(conn, "spool_loans", "counterparty_name")? {
        conn.execute(
            "ALTER TABLE spool_loans
             ADD COLUMN counterparty_name TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "spool_loans", "counterparty_contact")? {
        conn.execute(
            "ALTER TABLE spool_loans
             ADD COLUMN counterparty_contact TEXT",
            [],
        )?;
    }

    if !table_has_column(conn, "spool_loans", "counterparty_note")? {
        conn.execute(
            "ALTER TABLE spool_loans
             ADD COLUMN counterparty_note TEXT",
            [],
        )?;
    }

    conn.execute(
        "UPDATE filament_spools
         SET ownership_type = 'OWNED'
         WHERE ownership_type IS NULL
            OR trim(ownership_type) = ''",
        [],
    )?;
    conn.execute(
        "UPDATE spool_loans
         SET loan_direction = 'OUTBOUND'
         WHERE loan_direction IS NULL
            OR trim(loan_direction) = ''",
        [],
    )?;
    conn.execute(
        "UPDATE spool_loans
         SET loan_status = 'RETURNED'
         WHERE returned_at IS NOT NULL
           AND (loan_status IS NULL
             OR trim(loan_status) = ''
             OR loan_status = 'ACTIVE')",
        [],
    )?;
    conn.execute(
        "UPDATE spool_loans
         SET loan_status = 'ACTIVE'
         WHERE loan_status IS NULL
            OR trim(loan_status) = ''",
        [],
    )?;
    conn.execute(
        "UPDATE spool_loans
         SET counterparty_name = borrower_name
         WHERE (counterparty_name IS NULL OR trim(counterparty_name) = '')
           AND trim(borrower_name) != ''",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spools_ownership_type
         ON filament_spools(ownership_type, status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spool_loans_counterparty_time
         ON spool_loans(counterparty_name, lent_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spool_loans_direction_status
         ON spool_loans(loan_direction, loan_status, lent_at)",
        [],
    )?;

    Ok(())
}
