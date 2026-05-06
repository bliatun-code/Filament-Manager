import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFilamentConsumptionBreakdown,
  loadLoanBreakdownRows,
  loadStatisticsPageData,
} from "./statistics_data_source";
import type {
  FilamentConsumptionRow,
  LibrarySyncSettings,
  SpoolLoanDetailsRow,
} from "./tauri_client";

function consumptionRow(id: string): FilamentConsumptionRow {
  return {
    material: "PLA",
    filament_name: id,
    color_name: "Gray",
    vendor: "Generic",
    hex_color: "#808080",
    used_grams: 100,
    jobs: 1,
    ownership_type: "OWNED",
    owner_name: null,
  };
}

function loanRow(spoolId: string): SpoolLoanDetailsRow {
  return {
    spool_status: "BORROWED",
    spool_remaining_g: 400,
    spool_tare_weight_g: null,
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

function syncSettings(overrides: Partial<LibrarySyncSettings> = {}): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "desktop",
    library_id: "library-1",
    client_auth_paired: false,
    ...overrides,
  };
}

test("loadFilamentConsumptionBreakdown uses host consumption in client mode", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string | null | undefined; limit: number; printerId: string | null }> = [];
  const rows = await loadFilamentConsumptionBreakdown(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      printerId: "printer-1",
    },
    {
      fetchHostConsumption: async (baseUrl, libraryId, limit, printerId) => {
        calls.push({ baseUrl, libraryId, limit, printerId });
        return [consumptionRow("host-spool")];
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1", limit: 500, printerId: "printer-1" },
  ]);
  assert.deepEqual(rows.map((row) => row.filament_name), ["host-spool"]);
});

test("loadFilamentConsumptionBreakdown uses local consumption outside client host mode", async () => {
  const calls: Array<{ limit: number; printerId?: string | null }> = [];
  const rows = await loadFilamentConsumptionBreakdown(
    { clientReadOnly: false, printerId: null, limit: 25 },
    {
      listLocalConsumption: async (limit, printerId) => {
        calls.push({ limit, printerId });
        return [consumptionRow("local-spool")];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 25, printerId: null }]);
  assert.deepEqual(rows.map((row) => row.filament_name), ["local-spool"]);
});

test("loadLoanBreakdownRows reuses cached client loan details", async () => {
  const cachedRows = [loanRow("client-spool")];
  const rows = await loadLoanBreakdownRows(
    { clientReadOnly: true, cachedLoanDetails: cachedRows, direction: "OUTBOUND" },
    {
      listLocalLoans: async () => {
        throw new Error("local loans should not be loaded in client mode");
      },
    },
  );

  assert.equal(rows, cachedRows);
});

test("loadLoanBreakdownRows loads local loans outside client mode", async () => {
  const calls: Array<{ limit: number; includeReturned: boolean; direction?: string | null }> = [];
  const rows = await loadLoanBreakdownRows(
    { clientReadOnly: false, cachedLoanDetails: [], direction: "INBOUND", limit: 50 },
    {
      listLocalLoans: async (limit, includeReturned, direction) => {
        calls.push({ limit, includeReturned, direction });
        return [loanRow("local-spool")];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 50, includeReturned: true, direction: "INBOUND" }]);
  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["local-spool"]);
});

test("loadStatisticsPageData loads sync settings once and returns derived sync state", async () => {
  const result = await loadStatisticsPageData({
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        host_device_name: "Host",
      }),
    loadData: async () => ({
      overview: null,
      printers: [],
      spoolRows: [],
      consumptionRows: [],
      loanDetails: [],
      loanUsage: [],
      inboundLoanUsage: [],
      updatedAt: null,
      source: "OFFLINE",
    }),
  });

  assert.equal(result.syncState.clientReadOnly, true);
  assert.equal(result.syncState.clientHostDeviceName, "Host");
  assert.equal(result.syncState.clientHostBaseUrl, "http://host");
});
