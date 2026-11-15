import assert from "node:assert/strict";
import test from "node:test";

import {
  activeLoanRowsForDisplay,
  lendInventorySpool,
  loadActiveLoanRowsSnapshot,
  loadLoanRowsPage,
  mergeLoanHistoryAndActiveRows,
  normalizeLoanDetailsRow,
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

test("normalizeLoanDetailsRow normalizes loan tokens without mutating raw rows", () => {
  const raw = loanDetailsRow("legacy-loan");
  raw.loan.loan_direction = "in-bound";
  raw.loan.loan_status = "active";
  raw.loan.returned_at = "2026-04-02 10:00:00";
  raw.spool_status = "DELETED";

  const normalized = normalizeLoanDetailsRow(raw);

  assert.equal(normalized.loan.loan_direction, "INBOUND");
  assert.equal(normalized.loan.loan_status, "RETURNED");
  assert.equal(normalized.spool_status, "DELETED");
  assert.equal(raw.loan.loan_direction, "in-bound");
  assert.equal(raw.loan.loan_status, "active");
});

test("loadActiveLoanRowsSnapshot reports offline without a complete client target", async () => {
  const result = await loadActiveLoanRowsSnapshot(
    { clientReadOnly: true },
    {
      listLocalActiveLoans: async () => {
        throw new Error("local active loans should not load in client mode");
      },
    },
  );

  assert.deepEqual(result, { rows: [], source: "OFFLINE" });
});

test("loadActiveLoanRowsSnapshot reuses cached active outbound loans in client mode", async () => {
  const { rows, source } = await loadActiveLoanRowsSnapshot(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
    },
    {
      fetchHostActiveLoans: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedActiveLoans: async () => ({
        captured_at: "cached-at",
        rows: [
          loanDetailsRow("active-outbound"),
          {
            ...loanDetailsRow("returned-outbound"),
            loan: {
              ...loanDetailsRow("returned-outbound").loan,
              returned_at: "2026-04-02 10:00:00",
            },
          },
          {
            ...loanDetailsRow("active-inbound"),
            loan: {
              ...loanDetailsRow("active-inbound").loan,
              loan_direction: "INBOUND",
            },
          },
        ],
      }),
      listLocalActiveLoans: async () => {
        throw new Error("local active loans should not load in client mode");
      },
    },
  );

  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["active-outbound"]);
  assert.equal(source, "CACHED");
  assert.equal(rows[0]?.loan.loan_direction, "OUTBOUND");
  assert.equal(rows[0]?.loan.loan_status, "ACTIVE");
});

test("loadActiveLoanRowsSnapshot uses live host loans when a client target is complete", async () => {
  const calls: Array<{ baseUrl: string; libraryId?: string | null }> = [];
  const { rows, source } = await loadActiveLoanRowsSnapshot(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
    },
    {
      fetchHostActiveLoans: async (baseUrl, libraryId) => {
        calls.push({ baseUrl, libraryId });
        return [
          loanDetailsRow("active-outbound"),
          {
            ...loanDetailsRow("active-inbound"),
            loan: {
              ...loanDetailsRow("active-inbound").loan,
              loan_direction: "INBOUND",
            },
          },
        ];
      },
      fetchCachedActiveLoans: async () => {
        throw new Error("cache should not load when live host loans succeed");
      },
      listLocalActiveLoans: async () => {
        throw new Error("local active loans should not load in client mode");
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1" },
  ]);
  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["active-outbound"]);
  assert.equal(source, "LIVE");
});

test("loadActiveLoanRowsSnapshot reports offline instead of throwing without a cache", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadActiveLoanRowsSnapshot(
      {
        clientReadOnly: true,
        clientHostBaseUrl: "http://host",
        clientLibraryId: "library-1",
        clientTargetGeneration: 7,
      },
      {
        fetchHostActiveLoans: async () => {
          throw new Error("host unavailable");
        },
        fetchCachedActiveLoans: async () => null,
      },
    );

    assert.deepEqual(result, { rows: [], source: "OFFLINE" });
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadActiveLoanRowsSnapshot loads local active loans outside client mode", async () => {
  const { rows, source } = await loadActiveLoanRowsSnapshot(
    { clientReadOnly: false },
    {
      listLocalActiveLoans: async () => [activeLoanRow("spool-1")],
    },
  );

  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["spool-1"]);
  assert.equal(source, "LIVE");
});

test("active-only loan pages retain incoming and outgoing full details live and offline", async () => {
  const outbound = loanDetailsRow("older-outbound");
  const inbound = loanDetailsRow("older-inbound");
  inbound.loan.loan_direction = "INBOUND";
  inbound.spool_tare_weight_g = 240;
  const returned = loanDetailsRow("recent-returned");
  returned.loan.returned_at = "2026-04-02 10:00:00";
  const options = {
    activeOnly: true,
    clientReadOnly: true,
    clientHostBaseUrl: "http://host",
    clientLibraryId: "library-1",
    clientTargetGeneration: 7,
  };

  const live = await loadLoanRowsPage(options, {
    fetchHostLoans: async () => [outbound, inbound],
    fetchCachedLoans: async () => ({ captured_at: "now", rows: [] }),
  });
  assert.equal(live.source, "LIVE");
  assert.deepEqual(live.rows, [outbound, inbound]);

  const offline = await loadLoanRowsPage(options, {
    fetchHostLoans: async () => { throw new Error("Host unavailable"); },
    fetchCachedLoans: async (url, library, generation) => {
      assert.deepEqual([url, library, generation], ["http://host", "library-1", 7]);
      return { captured_at: "now", rows: [returned, outbound, inbound] };
    },
  });
  assert.equal(offline.source, "CACHED");
  assert.deepEqual(offline.rows, [outbound, inbound]);
});

test("active snapshot joins history without duplicates or stale closed loans", () => {
  const old = normalizeLoanDetailsRow(loanDetailsRow("older-active"));
  old.loan.lent_at = "2023-01-01 00:00:00";
  const returned = normalizeLoanDetailsRow(loanDetailsRow("recent-returned"));
  returned.loan.returned_at = "2026-04-02 10:00:00";
  returned.loan.loan_status = "RETURNED";
  const stale = normalizeLoanDetailsRow(loanDetailsRow("stale-active"));
  const historyRows = [returned, stale, old];
  assert.deepEqual(mergeLoanHistoryAndActiveRows(historyRows, [old]), [returned, old]);
  assert.deepEqual(mergeLoanHistoryAndActiveRows(historyRows, []), [returned]);

  const beforeReturn = normalizeLoanDetailsRow(loanDetailsRow("recent-returned"));
  const history = { rows: historyRows, source: "LIVE" as const, updatedAt: null, usedFallback: false };
  const active = { rows: [beforeReturn, old], source: "CACHED" as const, updatedAt: null, usedFallback: true };
  assert.deepEqual(activeLoanRowsForDisplay(active, history), [old]);
});

test("loadLoanRowsPage uses live host rows and cached timestamp in client mode", async () => {
  const hostCalls: Array<{ baseUrl: string; libraryId?: string | null; limit: number }> = [];
  const result = await loadLoanRowsPage(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      clientTargetGeneration: 7,
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

test("loadLoanRowsPage normalizes host loan direction and returned status", async () => {
  const result = await loadLoanRowsPage(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    {
      fetchHostLoans: async () => [
        {
          ...loanDetailsRow("normalized-host-spool"),
          loan: {
            ...loanDetailsRow("normalized-host-spool").loan,
            loan_direction: "in-bound",
            loan_status: "active",
            returned_at: "2026-04-02 10:00:00",
          },
        },
      ],
      fetchCachedLoans: async () => {
        throw new Error("cache timestamp unavailable");
      },
    },
  );

  assert.equal(result.rows[0]?.loan.loan_direction, "INBOUND");
  assert.equal(result.rows[0]?.loan.loan_status, "RETURNED");
});

test("loadLoanRowsPage falls back to cached client rows when host loans fail", async () => {
  const result = await loadLoanRowsPage(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
    },
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
  assert.equal(result.rows[0]?.loan.loan_direction, "OUTBOUND");
  assert.equal(result.rows[0]?.loan.loan_status, "ACTIVE");
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

test("loadLoanRowsPage ignores unscoped cache when client host details are incomplete", async () => {
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

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.updatedAt, null);
  assert.equal(result.usedFallback, true);
  assert.deepEqual(result.rows, []);
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
  assert.equal(result.rows[0]?.loan.loan_direction, "OUTBOUND");
  assert.equal(result.rows[0]?.loan.loan_status, "ACTIVE");
});

test("lendInventorySpool routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; input: LendSpoolInput }> = [];

  await lendInventorySpool(
    {
      spool_id: "spool-1",
      borrower_name: "Ada",
      counterparty_contact: "ada@example.test",
      grams_out: 250,
      note: "Bring back",
      expected_return_at: "2026-09-05",
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
        counterparty_contact: "ada@example.test",
        grams_out: 250,
        note: "Bring back",
        expected_return_at: "2026-09-05",
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
