import assert from "node:assert/strict";
import test from "node:test";

import {
  loadLoanBreakdownRows,
  loadStatisticsData,
  loadStatisticsPageData,
} from "./statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LibrarySyncSettings,
  PrinterOverviewRow,
  StatisticsPeriod,
  StatisticsPeriodReport,
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
} from "./tauri_client";

const reportingPeriod: StatisticsPeriod = {
  start_at_utc: "2026-08-01T00:00:00Z",
  end_at_utc: "2026-09-01T00:00:00Z",
};

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

function periodReport(
  overrides: Partial<StatisticsPeriodReport> = {},
): StatisticsPeriodReport {
  return {
    period: reportingPeriod,
    total_used_g: 100,
    owned_used_g: 100,
    borrowed_in_used_g: 0,
    total_jobs: 1,
    successful_jobs: 1,
    failed_jobs: 0,
    printer_usage: [],
    filament_consumption: [consumptionRow("period-consumption")],
    ...overrides,
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

function spoolRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `master-${id}`,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      remaining_g: 900,
      ...overrides,
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

test("loadLoanBreakdownRows reuses cached client loan details", async () => {
  const cachedRows = [loanRow("client-spool")];
  const cachedRow = cachedRows[0]!;
  cachedRow.loan.loan_direction = "in-bound";
  cachedRow.loan.loan_status = "active";
  cachedRow.loan.returned_at = "2026-04-02 10:00:00";
  const rows = await loadLoanBreakdownRows(
    { clientReadOnly: true, cachedLoanDetails: cachedRows, direction: "OUTBOUND" },
    {
      listLocalLoans: async () => {
        throw new Error("local loans should not be loaded in client mode");
      },
    },
  );

  assert.notEqual(rows[0], cachedRows[0]);
  assert.equal(rows[0]?.loan.loan_direction, "INBOUND");
  assert.equal(rows[0]?.loan.loan_status, "RETURNED");
  assert.equal(cachedRow.loan.loan_direction, "in-bound");
  assert.equal(cachedRow.loan.loan_status, "active");
});

test("loadLoanBreakdownRows loads local loans outside client mode", async () => {
  const calls: Array<{ limit: number; includeReturned: boolean; direction?: string | null }> = [];
  const rows = await loadLoanBreakdownRows(
    { clientReadOnly: false, cachedLoanDetails: [], direction: "INBOUND", limit: 50 },
    {
      listLocalLoans: async (limit, includeReturned, direction) => {
        calls.push({ limit, includeReturned, direction });
        const row = loanRow("local-spool");
        row.loan.loan_direction = "in-bound";
        row.loan.loan_status = "active";
        row.loan.returned_at = "2026-04-02 10:00:00";
        return [row];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 50, includeReturned: true, direction: "INBOUND" }]);
  assert.deepEqual(rows.map((row) => row.loan.spool_id), ["local-spool"]);
  assert.equal(rows[0]?.loan.loan_direction, "INBOUND");
  assert.equal(rows[0]?.loan.loan_status, "RETURNED");
});

test("loadStatisticsPageData loads sync settings once and returns derived sync state", async () => {
  let forwardedPeriod: StatisticsPeriod | null = null;
  const result = await loadStatisticsPageData(reportingPeriod, {
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        host_device_name: "Host",
      }),
    loadData: async (_settings, period) => {
      forwardedPeriod = period;
      return {
      overview: null,
      printers: [],
      spoolRows: [],
      consumptionRows: [],
      loanDetails: [],
      loanUsage: [],
      inboundLoanUsage: [],
      periodReport: null,
      periodStatus: "UNAVAILABLE",
      updatedAt: null,
      source: "OFFLINE",
      };
    },
  });

  assert.deepEqual(forwardedPeriod, reportingPeriod);
  assert.equal(result.syncState.clientReadOnly, true);
  assert.equal(result.syncState.clientHostDeviceName, "Host");
  assert.equal(result.syncState.clientHostBaseUrl, "http://host");
});

test("loadStatisticsPageData keeps incomplete client settings in client mode", async () => {
  const result = await loadStatisticsPageData(reportingPeriod, {
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
      periodReport: null,
      periodStatus: "UNAVAILABLE",
      updatedAt: null,
      source: "OFFLINE",
    }),
  });

  assert.equal(result.syncState.clientReadOnly, true);
  assert.equal(result.syncState.clientHostBaseUrl, " ");
});

test("loadStatisticsData ignores unscoped caches when client host details are incomplete", async () => {
  const result = await loadStatisticsData(
    syncSettings({
      mode: "CLIENT",
      host_base_url: " ",
      library_id: "library-1",
      cached_spools: {
        captured_at: "spool-cache",
        rows: [
          spoolRow("cached-spool", {
            ownership_type: "borrowed-in",
            status: "IN_USE",
          }),
        ],
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
    reportingPeriod,
    {
      loadLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
      loadLocalPeriodReport: async () => {
        throw new Error("local period report should not load in client mode");
      },
      listLocalPrinterOverview: async () => {
        throw new Error("local printers should not load in client mode");
      },
      listLocalLoanUsageByPerson: async () => {
        throw new Error("local loan usage should not load in client mode");
      },
    },
  );

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.updatedAt, null);
  assert.equal(result.overview, null);
  assert.deepEqual(result.printers, []);
  assert.deepEqual(result.spoolRows, []);
  assert.deepEqual(result.loanDetails, []);
});

test("loadStatisticsData ignores unscoped snapshot and spool caches", async () => {
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
          total_consumption_30d: 777,
          owned_consumption_30d: 777,
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
    reportingPeriod,
    {
      loadLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
      loadLocalPeriodReport: async () => {
        throw new Error("local period report should not load in client mode");
      },
      listLocalPrinterOverview: async () => {
        throw new Error("local printers should not load in client mode");
      },
      listLocalLoanUsageByPerson: async () => {
        throw new Error("local loan usage should not load in client mode");
      },
    },
  );

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.updatedAt, null);
  assert.equal(result.overview, null);
  assert.deepEqual(result.spoolRows, []);
});

test("loadStatisticsData marks local statistics loads as live", async () => {
  const result = await loadStatisticsData(
    syncSettings(),
    reportingPeriod,
    {
      loadLocalSpools: async () => [spoolRow("local-spool")],
      loadLocalOverview: async () => overview({
        total_spools: 1,
        total_consumption_30d: 777,
        owned_consumption_30d: 777,
      }),
      loadLocalPeriodReport: async (period) => {
        assert.deepEqual(period, reportingPeriod);
        return periodReport();
      },
      listLocalPrinterOverview: async () => [printerRow("local-printer")],
      listLocalLoanUsageByPerson: async (_days, direction) => [
        {
          loan_direction: direction ?? "OUTBOUND",
          borrower_name: direction === "INBOUND" ? "Borrower" : "Ada",
          total_consumed_g: direction === "INBOUND" ? 5 : 10,
          completed_loans: 1,
          active_loans: 0,
        },
      ],
    },
  );

  assert.equal(result.source, "LIVE");
  assert.equal(result.updatedAt, null);
  assert.equal(result.overview?.total_spools, 1);
  assert.equal(result.overview?.owned_consumption_30d, 777);
  assert.equal(result.periodStatus, "AVAILABLE");
  assert.deepEqual(result.consumptionRows.map((row) => row.filament_name), [
    "period-consumption",
  ]);
  assert.deepEqual(result.printers.map((row) => row.printer.id), ["local-printer"]);
  assert.deepEqual(result.loanUsage.map((row) => row.borrower_name), ["Ada"]);
  assert.deepEqual(result.inboundLoanUsage.map((row) => row.borrower_name), ["Borrower"]);
});

test("loadStatisticsData ignores unscoped cached client loan details", async () => {
  const cachedLoan = loanRow("cached-inbound");
  cachedLoan.loan.loan_direction = "in-bound";
  cachedLoan.loan.loan_status = "active";
  cachedLoan.loan.returned_at = "2026-04-02 10:00:00";

  const result = await loadStatisticsData(
    syncSettings({
      mode: "CLIENT",
      cached_loans: {
        captured_at: "loan-cache",
        rows: [cachedLoan],
      },
    }),
    reportingPeriod,
  );

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.updatedAt, null);
  assert.deepEqual(result.loanDetails, []);
  assert.deepEqual(result.loanUsage, []);
  assert.deepEqual(result.inboundLoanUsage, []);
  assert.equal(cachedLoan.loan.loan_direction, "in-bound");
  assert.equal(cachedLoan.loan.loan_status, "active");
});

test("loadStatisticsData marks mixed live and cached client data as partial", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const hostSpoolCalls: Array<{ clientHostBaseUrl?: string | null; clientLibraryId?: string | null }> = [];
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: " http://host ",
        library_id: " library-1 ",
        target_generation: 7,
      }),
      reportingPeriod,
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
        fetchHostPeriodReport: async (baseUrl, libraryId, period) => {
          assert.equal(baseUrl, "http://host");
          assert.equal(libraryId, "library-1");
          assert.deepEqual(period, reportingPeriod);
          return periodReport({
            filament_consumption: [consumptionRow("host-consumption")],
          });
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
    assert.equal(result.source, "PARTIAL");
    assert.equal(result.updatedAt, "printer-cache");
    assert.equal(result.overview?.total_spools, 1);
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["cached-printer"]);
    assert.deepEqual(result.loanDetails.map((row) => row.loan.spool_id), ["cached-spool"]);
    assert.deepEqual(result.loanUsage.map((row) => row.borrower_name), ["Ada"]);
    assert.deepEqual(result.consumptionRows.map((row) => row.filament_name), [
      "host-consumption",
    ]);
    assert.equal(result.periodStatus, "AVAILABLE");
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData reserves cached source for a fully unavailable Host", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
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
        loadHostSpools: async () => {
          throw new Error("spools unavailable");
        },
        fetchHostPeriodReport: async () => {
          throw new Error("period report unavailable");
        },
        fetchCachedPrinterOverview: async () => ({
          captured_at: "printer-cache",
          rows: [printerRow("cached-printer")],
        }),
        fetchCachedLoans: async () => ({
          captured_at: "loan-cache",
          rows: [loanRow("cached-loan")],
        }),
        fetchCachedSpools: async () => ({
          captured_at: "spool-cache",
          rows: [spoolRow("cached-spool")],
        }),
      },
    );

    assert.equal(result.source, "CACHED");
    assert.equal(result.updatedAt, "spool-cache");
    assert.equal(result.periodStatus, "UNAVAILABLE");
    assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["cached-spool"]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData preserves a live period report when every other Host slice fails", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const livePeriodReport = periodReport({ total_used_g: 123 });
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
      {
        fetchHostSnapshot: async () => {
          throw new Error("snapshot unavailable");
        },
        fetchHostPrinterOverview: async () => {
          throw new Error("printers unavailable");
        },
        fetchHostLoans: async () => {
          throw new Error("loans unavailable");
        },
        loadHostSpools: async () => {
          throw new Error("spools unavailable");
        },
        fetchHostPeriodReport: async () => livePeriodReport,
        fetchCachedPrinterOverview: async () => null,
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => null,
      },
    );

    assert.equal(result.source, "PARTIAL");
    assert.equal(result.periodStatus, "AVAILABLE");
    assert.equal(result.periodReport?.total_used_g, 123);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData treats an empty cached slice as an available cached snapshot", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
      {
        fetchHostSnapshot: async () => {
          throw new Error("snapshot unavailable");
        },
        fetchHostPrinterOverview: async () => {
          throw new Error("printers unavailable");
        },
        fetchHostLoans: async () => {
          throw new Error("loans unavailable");
        },
        loadHostSpools: async () => {
          throw new Error("spools unavailable");
        },
        fetchHostPeriodReport: async () => {
          throw new Error("period unavailable");
        },
        fetchCachedPrinterOverview: async () => ({
          captured_at: "empty-cache",
          rows: [],
        }),
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => null,
      },
    );

    assert.equal(result.source, "CACHED");
    assert.equal(result.updatedAt, "empty-cache");
    assert.deepEqual(result.printers, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData marks an older host snapshot as not periodizable", async () => {
  const result = await loadStatisticsData(
    syncSettings({
      mode: "CLIENT",
      host_base_url: "http://host",
      library_id: "library-1",
    }),
    reportingPeriod,
    {
      fetchHostSnapshot: async () => ({
        captured_at: "snapshot-live",
        library_id: "library-1",
        device_name: "Host",
        sync_mode: "HOST",
        inventory: overview({
          total_spools: 1,
          total_consumption_30d: 321,
          owned_consumption_30d: 321,
        }),
        total_spools: 1,
        in_use: 0,
        low_stock: 0,
        active_loans: 0,
        printers: 1,
      }),
      fetchHostPrinterOverview: async () => [printerRow("live-printer")],
      fetchHostLoans: async () => [],
      loadHostSpools: async () => [spoolRow("live-spool")],
      fetchHostPeriodReport: async (baseUrl, libraryId, period) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        assert.deepEqual(period, reportingPeriod);
        return null;
      },
      fetchCachedPrinterOverview: async () => null,
      fetchCachedLoans: async () => null,
      fetchCachedSpools: async () => null,
    },
  );

  assert.equal(result.source, "LIVE");
  assert.equal(result.periodStatus, "LEGACY_HOST");
  assert.equal(result.periodReport, null);
  assert.deepEqual(result.consumptionRows, []);
  assert.equal(result.overview?.owned_consumption_30d, 321);
});

test("loadStatisticsData distinguishes a period report failure from an older host", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
      {
        fetchHostSnapshot: async () => ({
          captured_at: "snapshot-live",
          library_id: "library-1",
          device_name: "Host",
          sync_mode: "HOST",
          inventory: overview({ total_spools: 1 }),
          total_spools: 1,
          in_use: 0,
          low_stock: 0,
          active_loans: 0,
          printers: 1,
        }),
        fetchHostPrinterOverview: async () => [printerRow("live-printer")],
        fetchHostLoans: async () => [],
        loadHostSpools: async () => [spoolRow("live-spool")],
        fetchHostPeriodReport: async () => {
          throw new Error("period endpoint unavailable");
        },
        fetchCachedPrinterOverview: async () => null,
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => null,
      },
    );

    assert.equal(result.source, "PARTIAL");
    assert.equal(result.periodStatus, "UNAVAILABLE");
    assert.equal(result.periodReport, null);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData timestamps the fallback slice when snapshot is live", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
      {
        fetchHostSnapshot: async () => ({
          captured_at: "snapshot-live",
          library_id: "library-1",
          device_name: "Host",
          sync_mode: "HOST",
          inventory: overview({ total_spools: 1 }),
          total_spools: 1,
          in_use: 0,
          low_stock: 0,
          active_loans: 0,
          printers: 1,
        }),
        fetchHostPrinterOverview: async () => {
          throw new Error("printer overview unavailable");
        },
        fetchHostLoans: async () => [loanRow("live-loan")],
        loadHostSpools: async () => [spoolRow("live-spool")],
        fetchHostPeriodReport: async () => periodReport(),
        fetchCachedPrinterOverview: async () => ({
          captured_at: "printer-cache",
          rows: [printerRow("cached-printer")],
        }),
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => null,
      },
    );

    assert.equal(result.source, "PARTIAL");
    assert.equal(result.updatedAt, "printer-cache");
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["cached-printer"]);
    assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["live-spool"]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("loadStatisticsData marks mixed cached spool and live data as partial", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadStatisticsData(
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-1",
        target_generation: 7,
      }),
      reportingPeriod,
      {
        fetchHostSnapshot: async () => {
          throw new Error("snapshot unavailable");
        },
        fetchHostPrinterOverview: async () => [printerRow("live-printer")],
        fetchHostLoans: async () => [loanRow("live-loan")],
        loadHostSpools: async () => {
          throw new Error("host spools unavailable");
        },
        fetchHostPeriodReport: async () => periodReport(),
        fetchCachedPrinterOverview: async () => null,
        fetchCachedLoans: async () => null,
        fetchCachedSpools: async () => ({
          captured_at: "spool-cache",
          rows: [spoolRow("cached-spool")],
        }),
      },
    );

    assert.equal(result.source, "PARTIAL");
    assert.equal(result.updatedAt, "spool-cache");
    assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["cached-spool"]);
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["live-printer"]);
    assert.deepEqual(result.loanDetails.map((row) => row.loan.spool_id), ["live-loan"]);
    assert.equal(result.overview?.total_spools, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
