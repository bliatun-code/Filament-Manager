import test from "node:test";
import assert from "node:assert/strict";

import {
  compactLoanTimestamp,
  compactLoanTitle,
  filterLoans,
  formatGrams,
  formatLoanReference,
  toMeasuredTotalWeight,
  toReturnedFilamentWeight,
} from "./loan_display";
import { normalizeLoanDetailsRow, type NormalizedLoanDetailsRow } from "./loan_row_normalization";
import type { SpoolLoanDetailsRow } from "./tauri_client";

function loanRow(overrides: Partial<SpoolLoanDetailsRow> = {}): NormalizedLoanDetailsRow {
  return normalizeLoanDetailsRow({
    spool_status: "BORROWED",
    spool_remaining_g: 700,
    spool_tare_weight_g: 200,
    material: "PETG",
    filament_name: "PETG Basic",
    color_name: "Red (30201)",
    vendor: "Bambu",
    hex_color: "#C00028",
    ...overrides,
    loan: {
      id: "loan_1",
      spool_id: "spool_1775434431270",
      borrower_name: "Ada",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      counterparty_name: "Ada",
      counterparty_contact: null,
      counterparty_note: null,
      grams_out: 630,
      lent_note: null,
      lent_at: "2026-07-01 21:45:10",
      expected_return_at: null,
      returned_at: null,
      returned_grams: null,
      consumed_grams: null,
      return_note: null,
      ...overrides.loan,
    },
  });
}

test("loan display keeps compact title and reference formatting", () => {
  assert.equal(compactLoanTitle(loanRow(), "Unknown"), "PETG Basic · Red (30201)");
  assert.equal(
    compactLoanTitle(
      loanRow({
        filament_name: "PLA",
        material: "PLA",
        color_name: "PLA Green (10502)",
      }),
      "Unknown",
    ),
    "PLA Green (10502)",
  );
  assert.equal(formatLoanReference("spool_1775434431270"), "#431270");
  assert.equal(formatLoanReference(null), "—");
});

test("loan display formats timestamps, grams, and measured totals", () => {
  const row = loanRow();

  assert.equal(compactLoanTimestamp(row.loan.lent_at), "01.07 21:45");
  assert.equal(compactLoanTimestamp(null), "—");
  assert.equal(formatGrams(0), "0 g");
  assert.equal(formatGrams(null), "0 g");
  assert.equal(toMeasuredTotalWeight(row, row.loan.grams_out), 830);
  assert.equal(toReturnedFilamentWeight(row, 760), 560);
});

test("loan search includes optional contact information", () => {
  const row = loanRow({
    loan: {
      ...loanRow().loan,
      counterparty_contact: "ada@example.test",
    },
  });

  assert.deepEqual(filterLoans([row], "ALL", "ALL", "example.test"), [row]);
  assert.deepEqual(filterLoans([row], "ALL", "ALL", "not-present"), []);
});
