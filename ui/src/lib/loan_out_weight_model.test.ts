import assert from "node:assert/strict";
import test from "node:test";
import type { LoanableSpool } from "./loan_out_data_source";
import {
  formatLoanOutGrams,
  resolveLoanableSpoolTareWeight,
  toLoanedFilamentWeight,
  toMeasuredTotalWeight,
} from "./loan_out_weight_model";

function createLoanableSpool(overrides: Partial<LoanableSpool> = {}): LoanableSpool {
  return {
    colorName: "Black",
    filamentName: "PLA Basic",
    hexColor: "#111111",
    id: "spool-1",
    location: "Shelf 1",
    material: "PLA",
    remainingGrams: 650,
    spoolTareWeightGrams: 220,
    vendor: "Bambu",
    ...overrides,
  };
}

test("loan out weight helpers convert between measured total and filament grams", () => {
  const spool = createLoanableSpool({ spoolTareWeightGrams: 215 });

  assert.equal(resolveLoanableSpoolTareWeight(spool), 215);
  assert.equal(toMeasuredTotalWeight(spool, 650), 865);
  assert.equal(toLoanedFilamentWeight(spool, 865), 650);
});

test("loan out weight helpers clamp missing and below-tare values", () => {
  const spool = createLoanableSpool({ remainingGrams: null, spoolTareWeightGrams: 200 });

  assert.equal(toMeasuredTotalWeight(spool, null), 200);
  assert.equal(toLoanedFilamentWeight(spool, 150), 0);
  assert.equal(formatLoanOutGrams(null), "0 g");
});
