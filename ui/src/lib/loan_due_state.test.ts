import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLoanExpectedReturnDate,
  isLoanOverdue,
  loanDueState,
  normalizeLoanExpectedReturnDate,
  selectOverdueLoans,
  validateLoanExpectedReturnDate,
} from "./loan_due_state";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";

function loanRow(
  id: string,
  expectedReturnAt: string | null,
  returnedAt: string | null = null,
): NormalizedLoanDetailsRow {
  return {
    spool_status: returnedAt ? "IN_STOCK" : "BORROWED",
    spool_remaining_g: 500,
    spool_tare_weight_g: 200,
    material: "PLA",
    filament_name: "Basic",
    color_name: "Blue",
    vendor: "Generic",
    hex_color: "#2563eb",
    loan: {
      id,
      spool_id: `spool-${id}`,
      borrower_name: "Ada",
      loan_direction: "OUTBOUND",
      loan_status: returnedAt ? "RETURNED" : "ACTIVE",
      counterparty_name: "Ada",
      counterparty_contact: null,
      counterparty_note: null,
      grams_out: 500,
      lent_note: null,
      lent_at: "2026-08-01 10:00:00",
      expected_return_at: expectedReturnAt,
      returned_at: returnedAt,
      returned_grams: returnedAt ? 450 : null,
      consumed_grams: returnedAt ? 50 : null,
      return_note: null,
    },
  };
}

test("expected return dates use strict calendar-date validation", () => {
  assert.equal(normalizeLoanExpectedReturnDate(" 2028-02-29 "), "2028-02-29");
  assert.equal(normalizeLoanExpectedReturnDate("2026-02-29"), null);
  assert.equal(normalizeLoanExpectedReturnDate("2026-08-21T00:00:00Z"), null);
  assert.deepEqual(validateLoanExpectedReturnDate("", "2026-08-21"), {
    error: null,
    value: null,
  });
  assert.deepEqual(validateLoanExpectedReturnDate("2026-08-20", "2026-08-21"), {
    error: "PAST",
    value: null,
  });
  assert.deepEqual(validateLoanExpectedReturnDate("2026-08-21", "2026-08-21"), {
    error: null,
    value: "2026-08-21",
  });
  assert.equal(formatLoanExpectedReturnDate("2026-09-05", "en"), "Sep 5, 2026");
});

test("due state compares injected calendar dates and never marks returned loans overdue", () => {
  const overdue = loanRow("overdue", "2026-08-20");
  const dueToday = loanRow("today", "2026-08-21");
  const upcoming = loanRow("upcoming", "2026-08-22");
  const returned = loanRow("returned", "2026-08-20", "2026-08-19 12:00:00");

  assert.equal(loanDueState(overdue, "2026-08-21"), "OVERDUE");
  assert.equal(loanDueState(dueToday, "2026-08-21"), "DUE_TODAY");
  assert.equal(loanDueState(upcoming, "2026-08-21"), "UPCOMING");
  assert.equal(loanDueState(returned, "2026-08-21"), "NONE");
  assert.equal(isLoanOverdue(returned, "2026-08-21"), false);
  assert.deepEqual(
    selectOverdueLoans([upcoming, overdue, returned], "2026-08-21").map(
      (row) => row.loan.id,
    ),
    ["overdue"],
  );
});
