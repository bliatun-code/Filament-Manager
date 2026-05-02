import test from "node:test";
import assert from "node:assert/strict";

import { filterLoans } from "./loan_display";
import { isLoanCurrentlyActive } from "./loan_state";
import { groupLoanUsageByPerson } from "./statistics_data_source";
import { groupedLoanUsage } from "./statistics_model";
import type { SpoolLoanDetailsRow } from "./tauri_client";

function loanRow(
  spoolId: string,
  overrides: Partial<SpoolLoanDetailsRow> = {},
): SpoolLoanDetailsRow {
  return {
    spool_status: "BORROWED",
    spool_remaining_g: 700,
    spool_tare_weight_g: null,
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    vendor: "Generic",
    hex_color: "#808080",
    ...overrides,
    loan: {
      id: `loan_${spoolId}`,
      spool_id: spoolId,
      borrower_name: "Alice",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      counterparty_name: "Alice",
      counterparty_contact: null,
      counterparty_note: null,
      grams_out: 700,
      lent_note: null,
      lent_at: "2026-04-01 10:00:00",
      expected_return_at: null,
      returned_at: null,
      returned_grams: null,
      consumed_grams: null,
      return_note: null,
      ...overrides.loan,
    },
  };
}

test("isLoanCurrentlyActive ignores legacy active rows for deleted spools", () => {
  assert.equal(isLoanCurrentlyActive(loanRow("active_spool")), true);
  assert.equal(
    isLoanCurrentlyActive(loanRow("deleted_spool", { spool_status: "DELETED" })),
    false,
  );
  assert.equal(
    isLoanCurrentlyActive(
      loanRow("returned_spool", {
        loan: {
          returned_at: "2026-04-02 10:00:00",
          loan_status: "RETURNED",
        },
      }),
    ),
    false,
  );
});

test("loan active filters and summaries skip deleted active rows", () => {
  const active = loanRow("active_spool");
  const deletedActive = loanRow("deleted_spool", { spool_status: "DELETED" });
  const returned = loanRow("returned_spool", {
    loan: {
      returned_at: "2026-04-02 10:00:00",
      loan_status: "RETURNED",
      consumed_grams: 120,
    },
  });
  const rows = [active, deletedActive, returned];

  assert.deepEqual(
    filterLoans(rows, "OUTBOUND", "ACTIVE", "").map((row) => row.loan.spool_id),
    ["active_spool"],
  );

  const byPerson = groupLoanUsageByPerson(rows, "OUTBOUND");
  assert.equal(byPerson.length, 1);
  assert.equal(byPerson[0].active_loans, 1);
  assert.equal(byPerson[0].completed_loans, 1);

  const byFilament = groupedLoanUsage(rows);
  assert.equal(byFilament.length, 1);
  assert.equal(byFilament[0].activeLoans, 1);
  assert.equal(byFilament[0].loans, 3);
});
