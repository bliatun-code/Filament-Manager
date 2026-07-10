import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLoanDetailsRow } from "./loan_row_normalization";
import { resolveLoanReturnSummary } from "./loan_return_summary";

function loanRow() {
  return normalizeLoanDetailsRow({
    spool_tare_weight_g: 250,
    vendor: "Bambu",
    loan: {
      id: "loan-1",
      spool_id: "spool-1",
      borrower_name: "Erik",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      grams_out: 1_000,
      lent_at: "2026-07-01 10:00:00",
    },
  });
}

test("return summary converts measured total weight into returned filament and usage", () => {
  assert.deepEqual(resolveLoanReturnSummary(loanRow(), "950"), {
    loanedGrams: 1_000,
    returnedGrams: 700,
    estimatedUsedGrams: 300,
  });
});

test("return summary clamps estimated usage when the returned weight exceeds the loan", () => {
  assert.deepEqual(resolveLoanReturnSummary(loanRow(), "1500"), {
    loanedGrams: 1_000,
    returnedGrams: 1_250,
    estimatedUsedGrams: 0,
  });
});

test("return summary leaves derived values empty while the existing input is invalid", () => {
  assert.deepEqual(resolveLoanReturnSummary(loanRow(), ""), {
    loanedGrams: 1_000,
    returnedGrams: null,
    estimatedUsedGrams: null,
  });
  assert.deepEqual(resolveLoanReturnSummary(loanRow(), "-1"), {
    loanedGrams: 1_000,
    returnedGrams: null,
    estimatedUsedGrams: null,
  });
});
