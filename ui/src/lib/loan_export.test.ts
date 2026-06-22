import assert from "node:assert/strict";
import test from "node:test";

import { buildLoansCsv } from "./loan_export";
import type { SpoolLoanDetailsRow } from "./tauri_client";

const rows: SpoolLoanDetailsRow[] = [
  {
    loan: {
      id: "loan-1",
      spool_id: "spool-1",
      borrower_name: "Erik",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      counterparty_name: 'Erik "Workshop"',
      grams_out: 1000,
      lent_at: "2026-06-20T10:00:00Z",
      returned_at: null,
      returned_grams: null,
      consumed_grams: null,
    },
    spool_status: "LOANED_OUT",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Blue, Clear",
    vendor: "Bambu",
  },
  {
    loan: {
      id: "loan-2",
      spool_id: "spool-2",
      borrower_name: "Lender",
      loan_direction: "INBOUND",
      loan_status: "RETURNED",
      counterparty_name: "Lender",
      grams_out: 850,
      lent_at: "2026-06-19T10:00:00Z",
      returned_at: "2026-06-21T10:00:00Z",
      returned_grams: 800,
      consumed_grams: 50,
    },
    spool_status: "HANDED_BACK",
    material: "PETG",
    filament_name: "Borrowed",
    color_name: "Gray",
    vendor: "Generic",
  },
];

test("buildLoansCsv matches the desktop loan export columns and escaping", () => {
  assert.equal(
    buildLoansCsv(rows),
    [
      "loan_id,spool_id,direction,counterparty,grams_out,lent_at,returned_at,returned_grams,consumed_grams,material,filament,color,vendor,status",
      'loan-1,spool-1,OUTBOUND,"Erik ""Workshop""",1000,2026-06-20T10:00:00Z,,0,0,PLA,Basic,"Blue, Clear",Bambu,LOANED_OUT',
      "loan-2,spool-2,INBOUND,Lender,850,2026-06-19T10:00:00Z,2026-06-21T10:00:00Z,800,50,PETG,Borrowed,Gray,Generic,HANDED_BACK",
      "",
    ].join("\n"),
  );
});

test("buildLoansCsv can export one loan direction from loaded host rows", () => {
  const csv = buildLoansCsv(rows, "INBOUND");
  assert.match(csv, /loan-2/);
  assert.doesNotMatch(csv, /loan-1/);
});
