import assert from "node:assert/strict";
import test from "node:test";

import {
  loadLoanBreakdownRows,
  loadStatisticsData,
  loadStatisticsPageData,
  loadStatisticsValueTrace,
} from "./statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LibrarySyncPageStatus,
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

test("loadStatisticsPageData uses compact target status before publishing period data", async () => {
  let forwardedPeriod: StatisticsPeriod | null = null;
  const result = await loadStatisticsPageData(reportingPeriod, {
    loadSyncStatus: async () =>
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
    loadSyncStatus: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: " ",
        library_id: "library-1",
      }),
    loadData: async () => ({
      overview: null,
      printers: [],
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
      loadLocalOverview: async () => {
        throw new Error("local overview should not load in client mode");
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
      loadLocalOverview: async () => {
        throw new Error("local overview should not load in client mode");
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
});

test("loadStatisticsData marks local statistics loads as live", async () => {
  const result = await loadStatisticsData(
    syncSettings(),
    reportingPeriod,
    {
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
    assert.equal(result.overview?.owned_on_hand_grams, 900);
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
      loadHostSpools: async () => [
        spoolRow("own", { status: "IN_USE", remaining_g: null, current_weight_g: 320 }),
        spoolRow("borrowed", { ownership_type: "BORROWED_IN" }),
        spoolRow("lent", { status: "LOANED_OUT" }),
      ],
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
  assert.equal(result.overview?.owned_on_hand_grams, 320);
  assert.equal(result.overview?.total_owned_spools, 1);
  assert.equal(result.overview?.total_borrowed_in_spools, 1);
  assert.equal(result.overview?.total_spools, 3);
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
    assert.equal(result.overview?.owned_on_hand_grams, 900);
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
    assert.equal(result.overview?.owned_on_hand_grams, 900);
    assert.deepEqual(result.printers.map((row) => row.printer.id), ["live-printer"]);
    assert.deepEqual(result.loanDetails.map((row) => row.loan.spool_id), ["live-loan"]);
    assert.equal(result.overview?.total_spools, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("a healthy Statistics refresh skips all cache reads and a loan failure reads only history", async (t) => {
  t.mock.method(console, "error", () => {});
  const host = syncSettings({ mode: "CLIENT", host_base_url: "http://a", target_generation: 4 });
  const cachedLoan = loanRow("returned-to-library");
  cachedLoan.loan.returned_at = "2026-08-03";
  const cacheReads: string[] = [];
  let loansFail = false;
  const deps = {
    fetchHostSnapshot: async () => ({
      library_id: host.library_id, sync_mode: "HOST", device_name: "A", captured_at: "live",
      inventory: overview({ owned_on_hand_grams: 0 }), total_spools: 1, in_use: 0, low_stock: 0, active_loans: 0, printers: 0,
    }),
    fetchHostPrinterOverview: async () => [],
    fetchHostLoans: async () => {
      if (loansFail) throw new Error("loans unavailable");
      return [];
    },
    loadHostSpools: async () => { cacheReads.push("host-spools"); return []; },
    loadCacheSettings: async () => { cacheReads.push("snapshot"); return host; },
    fetchHostPeriodReport: async () => periodReport(),
    fetchCachedSpools: async () => { cacheReads.push("spools"); return null; },
    fetchCachedPrinterOverview: async () => { cacheReads.push("printers"); return null; },
    fetchCachedLoans: async (url: string, library: string, generation: number) => {
      assert.deepEqual([url, library, generation], ["http://a", "library-1", 4]);
      cacheReads.push("history");
      return { captured_at: "loan-history", rows: [cachedLoan] };
    },
  };
  const live = await loadStatisticsData(host, reportingPeriod, deps);
  assert.equal(live.source, "LIVE");
  assert.deepEqual(cacheReads, []);
  loansFail = true;
  const partial = await loadStatisticsData(host, reportingPeriod, deps);
  assert.deepEqual(cacheReads, ["history"]);
  assert.equal(partial.source, "PARTIAL");
  assert.equal(partial.updatedAt, "loan-history");
  assert.equal(partial.loanUsage[0]?.completed_loans, 1);
  assert.equal(partial.overview?.owned_on_hand_grams, 0);
  assert.equal(partial.periodStatus, "AVAILABLE");
});

for (const [caseName, replacementUrl, replacementLibrary, switchInFallback] of [
  ["Host switch during live reads", "http://b", "library-2", false],
  ["library replacement during fallback", "http://a", "library-2", true],
  ["switch away and back during fallback", "http://a", "library-1", true],
] as const) {
  test(caseName + " drops every old Statistics result", async (t) => {
    t.mock.method(console, "error", () => {});
    const original = syncSettings({ mode: "CLIENT", host_base_url: "http://a", target_generation: 4 });
    const replacement = { ...original, host_base_url: replacementUrl, library_id: replacementLibrary, target_generation: 6 };
    let current = original;
    const loads: number[] = [];
    const result = await loadStatisticsPageData(reportingPeriod, {
      loadSyncStatus: async () => current,
      loadData: (status, period) => {
        loads.push(status.target_generation!);
        const old = status === original;
        return loadStatisticsData(status, period, {
          fetchHostSnapshot: async () => {
            if (old && !switchInFallback) current = replacement;
            return {
              library_id: status.library_id, sync_mode: "HOST", device_name: old ? "A" : "B",
              captured_at: old ? "old" : "new", inventory: overview(), total_spools: 1,
              in_use: 0, low_stock: 0, active_loans: 0, printers: 1,
            };
          },
          fetchHostLoans: async () => {
            if (old && switchInFallback) throw new Error("old loans unavailable");
            return [loanRow(old ? "old-loan" : "new-loan")];
          },
          fetchCachedLoans: async () => {
            current = replacement;
            return { captured_at: "old-cache", rows: [loanRow("old-fallback")] };
          },
          loadHostSpools: async () => [spoolRow("spool", { remaining_g: old ? 321 : 789 })],
          fetchHostPrinterOverview: async () => [printerRow(old ? "old-printer" : "new-printer")],
          fetchHostPeriodReport: async () => periodReport({ total_used_g: old ? 1 : 17 }),
        });
      },
    });
    assert.deepEqual(loads, [4, 6]);
    assert.equal(result.syncState.clientHostBaseUrl, replacementUrl);
    assert.equal(result.syncState.clientLibraryId, replacementLibrary);
    assert.equal(result.syncState.clientTargetGeneration, 6);
    assert.equal(result.updatedAt, "new");
    assert.equal(result.overview?.owned_on_hand_grams, 789);
    assert.equal(result.loanDetails[0]?.loan.spool_id, "new-loan");
    assert.equal(result.printers[0]?.printer.id, "new-printer");
    assert.equal(result.periodReport?.total_used_g, 17);
  });
}

test("an unreachable paired Host with no saved lists is OFFLINE for the selected period", async (t) => {
  t.mock.method(console, "error", () => {});
  const unavailable = async () => { throw new Error("offline"); };
  const reads: string[] = [];
  const host = syncSettings({ mode: "CLIENT", host_base_url: "http://host", target_generation: 9 });
  const result = await loadStatisticsData(host, reportingPeriod, {
    fetchHostSnapshot: unavailable,
    fetchHostPrinterOverview: unavailable,
    fetchHostLoans: unavailable,
    loadHostSpools: unavailable,
    fetchHostPeriodReport: unavailable,
    fetchCachedPrinterOverview: async () => { reads.push("printers"); return null; },
    fetchCachedLoans: async () => { reads.push("history"); return null; },
    fetchCachedSpools: async () => { reads.push("spools"); return null; },
  });
  assert.deepEqual(reads.sort(), ["history", "printers", "spools"]);
  assert.equal(result.source, "OFFLINE");
  assert.equal(result.periodStatus, "UNAVAILABLE");
  assert.equal(result.updatedAt, null);
  assert.equal(result.periodReport, null);
});

const newPeriod = { ...reportingPeriod, start_at_utc: "2026-06-01T00:00:00Z" };
const initialRevisions = { inventory: 1, catalog: 2, printers: 3, jobs: 4, loans: 5, wishlist: 6 };

for (const mode of ["STANDALONE", "HOST", "CLIENT"]) {
  test(mode + " period switch reuses only a complete and unchanged library", async () => {
    const status = syncSettings({ mode, host_base_url: mode === "CLIENT" ? "http://a" : null,
      client_auth_paired: mode === "CLIENT", target_generation: 1 });
    let versions = { ...initialRevisions };
    let full = 0, reports = 0;
    const newReport = (period: StatisticsPeriod) => { reports++; return periodReport({ period, total_used_g: 900 }); };
    const options = {
      loadSyncStatus: async () => status,
      readRevisions: async () => ({ ...versions }),
      loadData: async (_status: LibrarySyncPageStatus, period: StatisticsPeriod) => {
        full++;
        return { overview: overview(), loanDetails: [], loanUsage: [], inboundLoanUsage: [],
          printers: [printerRow("current")], updatedAt: "capture", source: "LIVE" as const, periodStatus: "AVAILABLE" as const,
          periodReport: periodReport({ period }), consumptionRows: [] };
      },
      fetchHostPeriodReport: async (url: string, id: string | null | undefined, period: StatisticsPeriod) => {
        assert.equal(mode, "CLIENT"); assert.equal(url, "http://a"); assert.equal(id, status.library_id);
        return newReport(period);
      },
      loadLocalPeriodReport: async (period: StatisticsPeriod) => { assert.notEqual(mode, "CLIENT"); return newReport(period); },
    };
    const first = await loadStatisticsPageData(reportingPeriod, options);
    versions.wishlist++;
    const next = await loadStatisticsPageData(newPeriod, { ...options, previous: first });
    assert.equal(full, 1);
    assert.equal(reports, 1);
    assert.strictEqual(next.overview, first.overview);
    assert.strictEqual(next.printers, first.printers);
    assert.deepEqual(next.periodReport?.period, newPeriod);
    assert.equal(next.periodReport?.total_used_g, 900);
    assert.deepEqual(next.consumptionRows, next.periodReport?.filament_consumption);

    for (const key of ["inventory", "printers", "jobs", "catalog", "loans"] as const) {
      versions = { ...initialRevisions, [key]: 50 };
      const refreshed = await loadStatisticsPageData(newPeriod, { ...options, previous: first });
      assert.notStrictEqual(refreshed.printers, first.printers);
    }
    assert.equal(full, 6);
    assert.equal(reports, 1);
    versions = { ...initialRevisions };
    const changedDuringReport = () => { versions.inventory++; return periodReport({ period: newPeriod }); };
    await loadStatisticsPageData(newPeriod, { ...options, previous: first,
      fetchHostPeriodReport: async () => changedDuringReport(), loadLocalPeriodReport: async () => changedDuringReport() });
    assert.equal(full, 7);

    for (const revisions of [null, { ...initialRevisions, inventory: NaN }]) {
      const uncertain = await loadStatisticsPageData(newPeriod, { ...options, previous: first, readRevisions: async () => revisions });
      assert.equal(uncertain.baseline, null);
    }
    assert.equal(full, 9);

    const interleaved = await loadStatisticsPageData(reportingPeriod, {
      ...options,
      loadData: async (status, period) => {
        const result = await options.loadData(status, period);
        versions.inventory++;
        return result;
      },
    });
    await loadStatisticsPageData(newPeriod, { ...options, previous: interleaved });
    assert.equal(full, 11, "a write during the initial full read also invalidates reuse");
    assert.equal(reports, 1);
  });
}

test("period-only read discards A–B–A replies and recovers the paired offline copy on disconnect", async t => {
  t.mock.method(console, "error", () => {});
  let target = syncSettings({ mode: "CLIENT", host_base_url: "http://a", target_generation: 1, client_auth_paired: true });
  let disconnected = false;
  const full: number[] = [];
  const host = async <T,>(value: T) => { if (disconnected) throw Error("disconnected"); return value; };
  const options = {
    loadSyncStatus: async () => target,
    readRevisions: () => host(initialRevisions),
    loadData: (status: LibrarySyncPageStatus, period: StatisticsPeriod) => {
      const generation = status.target_generation!;
      full.push(generation);
      return loadStatisticsData(status, period, {
        fetchHostSnapshot: () => host({ captured_at: "capture", library_id: status.library_id, sync_mode: "HOST",
          device_name: "A", inventory: overview(), total_spools: 1, in_use: 0, low_stock: 0, active_loans: 0, printers: 0 }),
        loadHostSpools: () => host([spoolRow("live", { remaining_g: generation * 100 })]),
        fetchHostLoans: () => host([]), fetchHostPrinterOverview: () => host([]),
        fetchHostPeriodReport: () => host(periodReport({ period, total_used_g: generation })),
        fetchCachedSpools: async (_url, _id, gen) => {
          assert.equal(gen, generation); return { captured_at: "offline-copy", rows: [spoolRow("offline", { remaining_g: gen * 50 })] };
        },
        fetchCachedPrinterOverview: async () => null, fetchCachedLoans: async () => null,
      });
    },
  };
  const first = await loadStatisticsPageData(reportingPeriod, options);
  const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  const pending = loadStatisticsPageData(newPeriod, { ...options, previous: first,
    fetchHostPeriodReport: async () => { started.resolve(); await finish.promise; return periodReport({ total_used_g: 999 }); },
  });
  await started.promise;
  const original = target;
  target = { ...original, library_id: "library-b", host_base_url: "http://b", target_generation: 2 };
  target = { ...original, target_generation: 3 };
  finish.resolve();
  const replacement = await pending;
  assert.equal(replacement.periodReport?.total_used_g, 3);
  assert.equal(replacement.overview?.owned_on_hand_grams, 300);
  assert.deepEqual(full, [1, 3]);

  const offline = await loadStatisticsPageData(reportingPeriod, { ...options, previous: replacement,
    fetchHostPeriodReport: async () => { disconnected = true; throw Error("lost connection during report"); },
  });
  assert.equal(offline.source, "CACHED");
  assert.equal(offline.periodStatus, "UNAVAILABLE");
  assert.equal(offline.periodReport, null);
  assert.equal(offline.overview?.owned_on_hand_grams, 150);
  assert.equal(offline.baseline, null);
  disconnected = false;
  const recovered = await loadStatisticsPageData(reportingPeriod, { ...options, previous: offline });
  assert.equal(recovered.source, "LIVE");
  assert.deepEqual(full, [1, 3, 3, 3]);
});

test("Statistics opens offline from the paired summary and rejects other libraries and generations", async t => {
  t.mock.method(console, "error", () => {});
  const target = syncSettings({ mode: "CLIENT", host_base_url: "http://host", target_generation: 7 });
  const snapshot = {
    library_id: target.library_id, sync_mode: "HOST", device_name: "Host", captured_at: "last-live",
    inventory: overview({ total_spools: 3, total_owned_spools: 1, total_borrowed_in_spools: 1,
      owned_on_hand_grams: 320, owned_consumption_30d: 75 }),
    total_spools: 3, in_use: 0, low_stock: 0, active_loans: 1, printers: 0,
  };
  let cached = { ...target, cached_snapshot: snapshot };
  const reads: string[] = [];
  const offline = async () => { throw new Error("Host disconnected"); };
  const deps = {
    fetchHostSnapshot: offline, fetchHostPeriodReport: offline, fetchHostLoans: offline, fetchHostPrinterOverview: offline,
    loadCacheSettings: async (domains?: readonly string[], generation?: number) => {
      assert.deepEqual(domains, ["snapshot"]);
      assert.equal(generation, 7);
      return cached;
    },
    loadHostSpools: async () => { reads.push("host-spools"); return offline(); },
    fetchCachedSpools: async () => { reads.push("cached-spools"); return null; },
    fetchCachedPrinterOverview: async () => null, fetchCachedLoans: async () => null,
  };
  const result = await loadStatisticsData(target, reportingPeriod, deps);
  assert.deepEqual(reads, []);
  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "last-live");
  assert.equal(result.periodStatus, "UNAVAILABLE");
  assert.deepEqual(result.overview, snapshot.inventory);
  for (const mismatch of [
    { target_generation: 9 }, { host_base_url: "http://other" }, { library_id: "other" },
    { cached_snapshot: { ...snapshot, library_id: "other" } },
  ]) {
    cached = { ...target, cached_snapshot: snapshot, ...mismatch };
    const unavailable = await loadStatisticsData(target, reportingPeriod, deps);
    assert.equal(unavailable.source, "OFFLINE");
    assert.equal(unavailable.overview, null);
  }
});

test("Statistics detail reads stay on the displayed Host, library, generation and period", async () => {
  const original = syncSettings({ mode: "CLIENT", host_base_url: "http://a", target_generation: 1, client_auth_paired: true });
  const other = { ...original, host_base_url: "http://b", library_id: "library-2", target_generation: 2 };
  let current = original;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const summary = { totals: [], coverage: { total_rows: 0, valued_rows: 0, unvalued_rows: 0, covered_grams: 0,
    uncovered_grams: 0, missing_reasons: [], trace_total_rows: 0, trace_returned_rows: 0, trace_truncated: false } };
  const value = { trace: "material" as const, inventory_value: summary, material_cost: summary, inventory_trace: [], material_cost_trace: [] };
  const response = periodReport({ value_cost: value });
  const deps = {
    loadSyncStatus: async () => current,
    fetchHostPeriodReport: async (...args: unknown[]) => {
      assert.deepEqual(args, ["http://a", "library-1", reportingPeriod, "material", 1]);
      started.resolve();
      await release.promise;
      return response;
    },
  };
  const pending = loadStatisticsValueTrace(original, reportingPeriod, "material", deps);
  await started.promise;
  current = other;
  assert.equal(await loadStatisticsValueTrace(original, reportingPeriod, "material", {
    ...deps, fetchHostPeriodReport: async () => assert.fail("the target changed before clicking"),
  }), null);
  current = { ...original, target_generation: 3 };
  release.resolve();
  assert.equal(await pending, null);

  current = original;
  assert.deepEqual(await loadStatisticsValueTrace(original, reportingPeriod, "material", deps), value);
  const differentPeriod = periodReport({ ...response, period: { ...reportingPeriod, end_at_utc: "2026-11-01T00:00:00Z" } });
  assert.equal(await loadStatisticsValueTrace(original, reportingPeriod, "material", {
    ...deps, fetchHostPeriodReport: async () => differentPeriod,
  }), null);
  assert.equal(await loadStatisticsValueTrace(original, reportingPeriod, "inventory", {
    ...deps, fetchHostPeriodReport: async () => response,
  }), null);
});
