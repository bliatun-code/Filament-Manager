import assert from "node:assert/strict";
import test from "node:test";

import {
  lendInventorySpool,
  loadActiveLoanRows,
  loadLoanRowsPage,
  returnInventoryLoan,
} from "./loan_data_source";
import type {
  ActiveSpoolLoanRow,
  LendSpoolInput,
  ReturnSpoolLoanInput,
  SpoolLoanDetailsRow,
} from "./tauri_client";

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

function loanDetailsRow(spoolId: string): SpoolLoanDetailsRow {
  return {
    ...activeLoanRow(spoolId),
    spool_tare_weight_g: 200,
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

test("loadLoanRowsPage uses live host rows and cached timestamp in client mode", async () => {
  const hostCalls: Array<{ baseUrl: string; libraryId?: string | null; limit: number }> = [];
  const result = await loadLoanRowsPage(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      limit: 25,
    },
    {
      fetchHostLoans: async (baseUrl, libraryId, limit) => {
        hostCalls.push({ baseUrl, libraryId, limit });
        return [loanDetailsRow("host-spool")];
      },
      fetchCachedLoans: async () => ({
        captured_at: "cached-at",
        rows: [loanDetailsRow("cached-spool")],
      }),
    },
  );

  assert.deepEqual(hostCalls, [
    { baseUrl: "http://host", libraryId: "library-1", limit: 25 },
  ]);
  assert.equal(result.source, "LIVE");
  assert.equal(result.updatedAt, "cached-at");
  assert.equal(result.usedFallback, false);
  assert.deepEqual(result.rows.map((row) => row.loan.spool_id), ["host-spool"]);
});

test("loadLoanRowsPage falls back to cached client rows when host loans fail", async () => {
  const result = await loadLoanRowsPage(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostLoans: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedLoans: async () => ({
        captured_at: "cached-at",
        rows: [loanDetailsRow("cached-spool")],
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "cached-at");
  assert.equal(result.usedFallback, true);
  assert.deepEqual(result.rows.map((row) => row.loan.spool_id), ["cached-spool"]);
});

test("loadLoanRowsPage avoids local fallback when client host details are incomplete", async () => {
  const result = await loadLoanRowsPage(
    { clientReadOnly: true, clientHostBaseUrl: "", clientLibraryId: "library-1" },
    {
      fetchHostLoans: async () => {
        throw new Error("host loans should not load without a complete target");
      },
      listLocalLoans: async () => {
        throw new Error("local loans should not load in client mode");
      },
    },
  );

  assert.deepEqual(result, {
    rows: [],
    source: "OFFLINE",
    updatedAt: null,
    usedFallback: true,
  });
});

test("loadLoanRowsPage uses cached loans when client host details are incomplete", async () => {
  const result = await loadLoanRowsPage(
    { clientReadOnly: true, clientHostBaseUrl: "", clientLibraryId: "library-1" },
    {
      fetchHostLoans: async () => {
        throw new Error("host loans should not load without a complete target");
      },
      fetchCachedLoans: async () => ({
        captured_at: "cached-at",
        rows: [loanDetailsRow("cached-spool")],
      }),
      listLocalLoans: async () => {
        throw new Error("local loans should not load in client mode");
      },
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "cached-at");
  assert.equal(result.usedFallback, true);
  assert.deepEqual(result.rows.map((row) => row.loan.spool_id), ["cached-spool"]);
});

test("loadLoanRowsPage loads local rows outside client mode", async () => {
  const localCalls: Array<{ limit: number; includeReturned: boolean; direction?: string | null }> = [];
  const result = await loadLoanRowsPage(
    { clientReadOnly: false, limit: 75 },
    {
      listLocalLoans: async (limit, includeReturned, direction) => {
        localCalls.push({ limit, includeReturned, direction });
        return [loanDetailsRow("local-spool")];
      },
    },
  );

  assert.deepEqual(localCalls, [{ limit: 75, includeReturned: true, direction: "ALL" }]);
  assert.equal(result.source, "LIVE");
  assert.equal(result.usedFallback, false);
  assert.deepEqual(result.rows.map((row) => row.loan.spool_id), ["local-spool"]);
});

test("lendInventorySpool routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; input: LendSpoolInput }> = [];

  await lendInventorySpool(
    {
      spool_id: "spool-1",
      borrower_name: "Ada",
      grams_out: 250,
      note: "Bring back",
    },
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      lendHostSpool: async (baseUrl, _libraryId, input) => {
        calls.push({ baseUrl, input });
      },
    },
  );

  assert.deepEqual(calls, [
    {
      baseUrl: "http://host",
      input: {
        spool_id: "spool-1",
        borrower_name: "Ada",
        grams_out: 250,
        note: "Bring back",
      },
    },
  ]);
});

test("lendInventorySpool writes locally outside client mode", async () => {
  const calls: LendSpoolInput[] = [];

  await lendInventorySpool(
    {
      spool_id: "spool-1",
      borrower_name: "Ada",
      grams_out: 250,
      note: null,
    },
    { clientReadOnly: false },
    {
      lendLocalSpool: async (input) => {
        calls.push(input);
      },
    },
  );

  assert.deepEqual(calls.map((call) => call.spool_id), ["spool-1"]);
});

test("returnInventoryLoan routes client returns to the host with inbound flag", async () => {
  const calls: Array<{ baseUrl: string; input: ReturnSpoolLoanInput & { inbound?: boolean } }> = [];

  await returnInventoryLoan(
    {
      loan_id: "loan-1",
      returned_grams: 120,
      note: "Done",
      inbound: true,
    },
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      returnHostLoan: async (baseUrl, _libraryId, input) => {
        calls.push({ baseUrl, input });
      },
    },
  );

  assert.equal(calls[0]?.baseUrl, "http://host");
  assert.equal(calls[0]?.input.inbound, true);
});

test("returnInventoryLoan chooses the local inbound return command", async () => {
  const outboundCalls: ReturnSpoolLoanInput[] = [];
  const inboundCalls: ReturnSpoolLoanInput[] = [];

  await returnInventoryLoan(
    { loan_id: "loan-1", returned_grams: 120, note: null, inbound: true },
    { clientReadOnly: false },
    {
      returnLocalLoan: async (input) => {
        outboundCalls.push(input);
      },
      returnLocalInboundLoan: async (input) => {
        inboundCalls.push(input);
      },
    },
  );

  assert.deepEqual(outboundCalls, []);
  assert.deepEqual(inboundCalls.map((call) => call.loan_id), ["loan-1"]);
});

test("loan host writes reject missing host details", async () => {
  await assert.rejects(
    () =>
      returnInventoryLoan(
        { loan_id: "loan-1", returned_grams: 0, note: null },
        { clientReadOnly: true },
      ),
    /Host connection details/,
  );
});
