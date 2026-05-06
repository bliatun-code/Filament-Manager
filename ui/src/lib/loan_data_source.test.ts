import assert from "node:assert/strict";
import test from "node:test";

import { loadActiveLoanRows } from "./loan_data_source";
import type { ActiveSpoolLoanRow } from "./tauri_client";

function activeLoanRow(spoolId: string): ActiveSpoolLoanRow {
  return {
    spool_status: "BORROWED",
    spool_remaining_g: 400,
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    vendor: "Generic",
    hex_color: "#808080",
    loan: {
      id: `loan-${spoolId}`,
      spool_id: spoolId,
      borrower_name: "Ada",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      counterparty_name: "Ada",
      counterparty_contact: null,
      counterparty_note: null,
      grams_out: 500,
      lent_note: null,
      lent_at: "2026-04-01 10:00:00",
      expected_return_at: null,
      returned_at: null,
      returned_grams: null,
      consumed_grams: null,
      return_note: null,
    },
  };
}

test("loadActiveLoanRows returns no local active loans in client mode", async () => {
  const rows = await loadActiveLoanRows(
    { clientReadOnly: true },
    {
      listLocalActiveLoans: async () => {
        throw new Error("local active loans should not load in client mode");
      },
    },
  );

  assert.deepEqual(rows, []);
});

test("loadActiveLoanRows loads local active loans outside client mode", async () => {
  const rows = await loadActiveLoanRows(
    { clientReadOnly: false },
    {
      listLocalActiveLoans: async () => [activeLoanRow("spool-1")],
    },
  );

  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["spool-1"]);
});
