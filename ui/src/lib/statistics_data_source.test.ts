import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFilamentConsumptionBreakdown,
  loadLoanBreakdownRows,
  loadStatisticsData,
  loadStatisticsPageData,
} from "./statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LibrarySyncSettings,
  PrinterOverviewRow,
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
} from "./tauri_client";

function overview(overrides: Partial<InventoryOverview> = {}): InventoryOverview {
  return {
    total_spools: 0,
    total_owned_spools: 0,
    total_borrowed_in_spools: 0,
    in_use: 0,
    owned_in_use: 0,
    borrowed_in_in_use: 0,
    low_stock: 0,
    owned_low_stock: 0,
    borrowed_in_low_stock: 0,
    total_consumption_30d: 0,
    owned_consumption_30d: 0,
    borrowed_in_consumption_30d: 0,
    ...overrides,
  };
}

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

function spoolRow(id: string): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `master-${id}`,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      remaining_g: 900,
    },
    master: {
      id: `master-${id}`,
      vendor: "Generic",
      material: "PLA",
      filament_name: `Basic ${id}`,
      color_name: "Gray",
      hex_color: "#808080",
      product_url: null,
      default_weight: 1000,
    },
  };
}

function printerRow(id: string): PrinterOverviewRow {
  return {
    printer: {
      id,
      name: "Printer",
      model: "generic",
      created_at: "2026-04-01 10:00:00",
      updated_at: "2026-04-01 10:00:00",
    },
    usage: {
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      total_used_g: 0,
      last_job_at: null,
    },
    slots: [],
  };
}

test("loadFilamentConsumptionBreakdown uses host consumption in client mode", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string | null | undefined; limit: number; printerId: string | null }> = [];
  const rows = await loadFilamentConsumptionBreakdown(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
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

test("loadFilamentConsumptionBreakdown avoids local fallback for incomplete client host details", async () => {
  const rows = await loadFilamentConsumptionBreakdown(
    { clientReadOnly: true, clientHostBaseUrl: " ", clientLibraryId: "library-1" },
    {
      fetchHostConsumption: async () => {
        throw new Error("host consumption should not load without a complete target");
      },
      listLocalConsumption: async () => {
        throw new Error("local consumption should not load in client mode");
      },
    },
  );

  assert.deepEqual(rows, []);
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

test("loadStatisticsPageData keeps incomplete client settings in client mode", async () => {
  const result = await loadStatisticsPageData({
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: " ",
        library_id: "library-1",
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
  assert.equal(result.syncState.clientHostBaseUrl, " ");
});

test("loadStatisticsData avoids local fallback when client host details are incomplete", async () => {
  const result = await loadStatisticsData(
    syncSettings({
      mode: "CLIENT",
      host_base_url: " ",
      library_id: "library-1",
      cached_spools: {
        captured_at: "spool-cache",
        rows: [spoolRow("cached-spool")],
      },
      cached_printers: {
        captured_at: "printer-cache",
        rows: [printerRow("cached-printer")],
      },
      cached_loans: {
        captured_at: "loan-cache",
        rows: [loanRow("cached-loan")],
      },
    }),
    {
      loadLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
      listLocalConsumption: async () => {
        throw new Error("local consumption should not load in client mode");
      },
      listLocalPrinterOverview: async () => {
        throw new Error("local printers should not load in client mode");
      },
      listLocalLoanUsageByPerson: async () => {
        throw new Error("local loan usage should not load in client mode");
      },
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "printer-cache");
  assert.equal(result.overview?.total_spools, 1);
  assert.deepEqual(result.printers.map((row) => row.printer.id), ["cached-printer"]);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["cached-spool"]);
  assert.deepEqual(result.loanUsage.map((row) => row.borrower_name), ["Ada"]);
});

test("loadStatisticsData prefers cached spool rows over stale snapshot totals", async () => {
  const result = await loadStatisticsData(
    syncSettings({
      mode: "CLIENT",
      host_base_url: " ",
      library_id: "library-1",
      cached_snapshot: {
        captured_at: "snapshot-cache",
        library_id: "library-1",
        device_name: "Cached Host",
        sync_mode: "HOST",
        inventory: overview({
          total_spools: 99,
          total_owned_spools: 99,
          low_stock: 99,
          owned_low_stock: 99,
        }),
        total_spools: 99,
        in_use: 0,
        low_stock: 99,
        active_loans: 0,
        printers: 0,
      },
      cached_spools: {
        captured_at: "spool-cache",
        rows: [spoolRow("cached-spool")],
      },
    }),
    {
      loadLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
      listLocalConsumption: async () => {
        throw new Error("local consumption should not load in client mode");
      },
      listLocalPrinterOverview: async () => {
        throw new Error("local printers should not load in client mode");
      },
      listLocalLoanUsageByPerson: async () => {
        throw new Error("local loan usage should not load in client mode");
      },
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.overview?.total_spools, 1);
  assert.equal(result.overview?.low_stock, 0);
});

test("loadStatisticsData keeps partial client host data and cache when host calls fail", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const hostSpoolCalls: Array<{ clientHostBaseUrl?: string | null; clientLibraryId?: string | null }> = [];
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: " http://host ",
        library_id: " library-1 ",
      }),
      {
        fetchHostSnapshot: async () => {
          throw new Error("snapshot unavailable");
        },
        fetchHostPrinterOverview: async () => {
          throw new Error("printer overview unavailable");
        },
        fetchHostLoans: async () => {
          throw new Error("loans unavailable");
        },
        loadHostSpools: async (options) => {
          hostSpoolCalls.push({
            clientHostBaseUrl: options.clientHostBaseUrl,
            clientLibraryId: options.clientLibraryId,
          });
          return [spoolRow("spool-1")];
        },
        fetchHostConsumption: async (baseUrl, libraryId) => {
          assert.equal(baseUrl, "http://host");
          assert.equal(libraryId, "library-1");
          return [consumptionRow("host-consumption")];
        },
        fetchCachedPrinterOverview: async () => ({
          captured_at: "printer-cache",
          rows: [printerRow("cached-printer")],
        }),
        fetchCachedLoans: async () => ({
          captured_at: "loan-cache",
          rows: [loanRow("cached-spool")],
        }),
        fetchCachedSpools: async () => null,
      },
    );

    assert.deepEqual(hostSpoolCalls, [
      { clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    ]);
    assert.equal(result.source, "CACHED");
    assert.equal(result.updatedAt, "printer-cache");
    assert.equal(result.overview?.total_spools, 1);
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["cached-printer"]);
    assert.deepEqual(result.loanDetails.map((row) => row.loan.spool_id), ["cached-spool"]);
    assert.deepEqual(result.loanUsage.map((row) => row.borrower_name), ["Ada"]);
    assert.deepEqual(result.consumptionRows.map((row) => row.filament_name), [
      "host-consumption",
    ]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData marks cached spool fallback as cached statistics", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        cached_spools: {
          captured_at: "spool-cache",
          rows: [spoolRow("cached-spool")],
        },
      }),
      {
        fetchHostSnapshot: async () => {
          throw new Error("snapshot unavailable");
        },
        fetchHostPrinterOverview: async () => [printerRow("live-printer")],
        fetchHostLoans: async () => [loanRow("live-loan")],
        loadHostSpools: async () => {
          throw new Error("host spools unavailable");
        },
        fetchHostConsumption: async () => [consumptionRow("live-consumption")],
        fetchCachedPrinterOverview: async () => null,
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => {
          throw new Error("cached spools endpoint unavailable");
        },
      },
    );

    assert.equal(result.source, "CACHED");
    assert.equal(result.updatedAt, "spool-cache");
    assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["cached-spool"]);
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["live-printer"]);
    assert.deepEqual(result.loanDetails.map((row) => row.loan.spool_id), ["live-loan"]);
    assert.equal(result.overview?.total_spools, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
