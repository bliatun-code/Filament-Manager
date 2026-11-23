import { localDashboardFixture } from "../../test-fixtures/local_dashboard_snapshot";
import assert from "node:assert/strict";
import test from "node:test";

import {
  hasInvalidClientPairingMessage,
  loadDashboardData,
} from "./dashboard_data_source";
import type { LibrarySyncCacheDomain } from "./tauri_library_sync_client";
import type {
  ActiveSpoolLoanRow,
  FilamentConsumptionRow,
  InventoryOverview,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  PrinterOverviewRow,
  PrinterSettingsSnapshot,
  SpoolWithMasterRow,
  WishlistItemRow,
} from "./tauri_client";

const t = (_key: string, fallback: string) => fallback;
const dashboardTestNow = new Date("2026-08-15T12:00:00Z");
const currentMonth = "2026-08";

function overview(
  overrides: Partial<InventoryOverview> = {},
): InventoryOverview {
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
    consumption_12m_available: true,
    total_consumption_12m: 0,
    consumption_12m: [],
    ...overrides,
  };
}

function snapshot(
  deviceName: string,
  overrides: Partial<LibrarySyncRemoteSnapshot> = {},
): LibrarySyncRemoteSnapshot {
  return {
    captured_at: "2026-04-01 10:00:00",
    library_id: "library-1",
    device_name: deviceName,
    sync_mode: "HOST",
    inventory: overview(),
    total_spools: 0,
    in_use: 0,
    low_stock: 0,
    active_loans: 0,
    printers: 0,
    ...overrides,
  };
}

function syncSettings(
  overrides: Partial<LibrarySyncSettings> = {},
): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "desktop",
    library_id: "library-1",
    client_auth_paired: false,
    ...overrides,
  };
}

function printerOverviewRow(id: string): PrinterOverviewRow {
  return {
    printer: {
      id,
      model: "X1 Carbon",
      name: id,
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

function printerSettingsSnapshot(): PrinterSettingsSnapshot {
  return {
    active_printer_id: null,
    printers: [],
    printer_models: [],
    bambu_live_integrations: [],
  };
}

function spoolWithMasterRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: "master-1",
      status: "IN_STOCK",
      ownership_type: "OWNED",
      remaining_g: 850,
      current_weight_g: 850,
      initial_weight_g: 1000,
      location_id: "Shelf 1",
      ...overrides,
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Gray",
      hex_color: "#808080",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
    },
  };
}

function wishlistItem(
  id: string,
  overrides: Partial<WishlistItemRow> = {},
): WishlistItemRow {
  return {
    id,
    master_id: "master-1",
    vendor: "Bambu",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: "#808080",
    desired_spools: 1,
    quantity: 1,
    priority: "NORMAL",
    status: "WISHLIST",
    notes: null,
    source_url: null,
    created_at: "2026-04-01 10:00:00",
    updated_at: "2026-04-01 10:00:00",
    ...overrides,
  };
}

function activeLoan(id: string, expectedReturnAt: string): ActiveSpoolLoanRow {
  return {
    color_name: "Gray",
    filament_name: "Basic",
    loan: {
      borrower_name: "Ada",
      consumed_grams: null,
      counterparty_contact: "ada@example.test",
      counterparty_name: "Ada",
      counterparty_note: null,
      expected_return_at: expectedReturnAt,
      grams_out: 500,
      id,
      lent_at: "2026-08-01 10:00:00",
      lent_note: null,
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      return_note: null,
      returned_at: null,
      returned_grams: null,
      spool_id: `spool-${id}`,
    },
    material: "PLA",
    spool_remaining_g: 500,
    spool_status: "BORROWED",
    vendor: "Bambu",
  };
}

function consumptionRow(
  material: string,
  usedGrams: number,
): FilamentConsumptionRow {
  return {
    printer_id: "printer-1",
    printer_name: "Printer 1",
    material,
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: "#808080",
    vendor: "Bambu",
    ownership_type: "OWNED",
    owner_name: null,
    used_grams: usedGrams,
    jobs: 1,
  };
}

function validation(
  overrides: Partial<LibrarySyncHostValidationResult> = {},
): LibrarySyncHostValidationResult {
  return {
    base_url: "http://host",
    reachable: true,
    ok: true,
    matches_library_id: true,
    pairing_checked: true,
    pairing_valid: true,
    library_id: "library-1",
    device_name: "Host",
    sync_mode: "HOST",
    message: "ok",
    ...overrides,
  };
}

test("hasInvalidClientPairingMessage detects persisted repair messages", () => {
  assert.equal(
    hasInvalidClientPairingMessage(
      "Desktop client pairing is no longer valid.",
    ),
    true,
  );
  assert.equal(hasInvalidClientPairingMessage("host is reachable"), false);
});

test("loadDashboardData fails closed when the library role cannot be resolved", async () => {
  let targetScopedReads = 0;
  const unexpectedRead = async () => {
    targetScopedReads += 1;
    throw new Error(
      "target-scoped data must not load before the role is known",
    );
  };

  await assert.rejects(
    loadDashboardData(
      { previousClientHostNeedsRepair: false, t },
      {
        fetchHostActiveLoans: unexpectedRead,
        fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
        fetchHostPrinterOverview: unexpectedRead,
        fetchHostSnapshot: unexpectedRead,
        fetchHostWishlist: unexpectedRead,
        listLocalLoans: unexpectedRead,
        listLocalPrinters: unexpectedRead,
        listLocalWishlist: unexpectedRead,
        loadLocalDashboardSnapshot: unexpectedRead,
        loadPrinterSettings: unexpectedRead,
        loadSpoolRows: unexpectedRead,
        loadSyncSettings: async () => {
          throw new Error("library role unavailable");
        },
        loadTrustedLanStatus: async () => null,
      },
    ),
    /library role unavailable/,
  );
  assert.equal(targetScopedReads, 0);
});

test("loadDashboardData loads local dashboard data outside client mode", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: true, now: dashboardTestNow, t },
    {
      loadSyncSettings: async () => syncSettings(),
      loadTrustedLanStatus: async () => null,
      loadLocalDashboardSnapshot: async () =>
        localDashboardFixture(overview({
          total_consumption_30d: 120,
          total_consumption_12m: 900,
          consumption_12m: [{ month: currentMonth, used_grams: 900 }],
        })),
      loadPrinterSettings: async () => ({
        active_printer_id: "printer-local",
        printers: [printerOverviewRow("printer-local").printer],
        printer_models: ["X1 Carbon"],
        bambu_live_integrations: [
          {
            printer_id: "printer-local",
            config: { enabled: true, tls_trust_state: "UNPAIRED" },
          },
        ],
      }),
      listLocalPrinters: async () => [printerOverviewRow("printer-local")],
      loadSpoolRows: async () => assert.fail("local Dashboard requested spool rows"),
      listLocalLoans: async () => [],
      listLocalWishlist: async (limit) => {
        assert.equal(limit, 500);
        return [];
      },
    },
  );

  assert.equal(result.syncSource, "local");
  assert.equal(result.printerOverviewAvailable, true);
  assert.equal(result.lowStockPreviewAvailable, true);
  assert.deepEqual(result.printerOverview, [printerOverviewRow("printer-local")]);
  assert.deepEqual(result.bambuLiveIntegrations, [{ printer_id: "printer-local", config: { enabled: true, tls_trust_state: "UNPAIRED", observed_state: null } }]);
  assert.deepEqual(result.lowStockPreview, []);
  assert.equal(result.syncMode, "STANDALONE");
  assert.equal(result.libraryId, "library-1");
  assert.equal(result.clientHostNeedsRepair, false);
  assert.equal(result.clientHostPaired, false);
  assert.equal(result.setupDataAvailable, true);
  assert.deepEqual(result.revisionSource, { kind: "local" });
  assert.equal(result.revisionPollComplete, true);
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value,
    "120 g",
  );
  assert.equal(result.derived.usageTotal12m, 900);
  assert.equal(result.derived.usageMonths.at(-1)?.usedGrams, 900);
  assert.deepEqual(result.bambuLiveAttention, [
    {
      printerId: "printer-local",
      printerName: "printer-local",
      trustState: "UNPAIRED",
    },
  ]);
  assert.deepEqual(
    result.actionItems.map((item) => item.kind),
    ["BAMBU_TRUST"],
  );
  assert.equal(
    String(result.derived.goalMetrics.configuredPrinters),
    "1",
  );
});

test("loadDashboardData builds action items from the same local dashboard snapshot", async () => {
  const result = await loadDashboardData(
    {
      now: new Date("2026-08-21T12:00:00.000Z"),
      previousClientHostNeedsRepair: false,
      t,
      today: "2026-08-21",
    },
    {
      listLocalLoans: async () => [activeLoan("overdue", "2026-08-18")],
      listLocalPrinters: async () => [],
      listLocalWishlist: async () => [
        wishlistItem("order", {
          status: "ON_ORDER",
          updated_at: "2026-08-20 12:00:00",
        }),
      ],
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      loadLocalDashboardSnapshot: async () => localDashboardFixture(overview(), [
        spoolWithMasterRow("low-a", {
          current_weight_g: 120,
          remaining_g: 120,
        }),
        spoolWithMasterRow("low-b", { current_weight_g: 80, remaining_g: 80 }),
      ]),
      loadSyncSettings: async () => syncSettings(),
      loadTrustedLanStatus: async () => null,
    },
  );

  assert.deepEqual(
    result.actionItems.map((item) => item.kind),
    ["OVERDUE_LOAN", "ON_ORDER"],
  );
  assert.equal(
    result.actionItems.some((item) => item.kind === "LOW_STOCK"),
    false,
  );
  // Purchasing suggestions may disappear while the physical low rolls remain.
  assert.deepEqual(result.lowStockPreview.map((row) => [row.spoolId, row.remainingG]), [["low-b", 80], ["low-a", 120]]);
});

test("loadDashboardData keeps unresolved low stock actionable until a purchase is open", async () => {
  const result = await loadDashboardData(
    {
      now: new Date("2026-08-21T12:00:00.000Z"),
      previousClientHostNeedsRepair: false,
      t,
      today: "2026-08-21",
    },
    {
      listLocalLoans: async () => [],
      listLocalPrinters: async () => [],
      listLocalWishlist: async () => [],
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      loadLocalDashboardSnapshot: async () => localDashboardFixture(overview(), [
        spoolWithMasterRow("low-a", { current_weight_g: 90, remaining_g: 90 }),
      ]),
      loadSyncSettings: async () => syncSettings({ target_generation: 4 }),
      loadTrustedLanStatus: async () => null,
    },
  );

  const suggestion = result.actionItems.find(item => item.kind === "LOW_STOCK");
  assert.deepEqual(suggestion?.purchaseTarget, {
    mode: "STANDALONE", library_id: "library-1", host_base_url: null, target_generation: 4,
  });
  assert.deepEqual(
    result.actionItems.map((item) => item.kind),
    ["LOW_STOCK"],
  );
});

test("loadDashboardData prefers live host data for paired clients", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, now: dashboardTestNow, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: " http://host ",
          library_id: " library-1 ",
          host_device_name: "Configured Host",
          client_auth_paired: true,
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async (baseUrl, libraryId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        return validation({ device_name: "Validated Host" });
      },
      fetchHostSnapshot: async (baseUrl, libraryId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        return snapshot("Live Host", {
          inventory: overview({
            total_consumption_30d: 250,
            total_consumption_12m: 1_250,
            consumption_12m: [{ month: currentMonth, used_grams: 1_250 }],
          }),
        });
      },
      loadSpoolRows: async (options) => {
        assert.equal(options.clientReadOnly, true);
        assert.equal(options.clientHostBaseUrl, "http://host");
        assert.equal(options.clientLibraryId, "library-1");
        return [];
      },
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [
        printerOverviewRow("printer-host"),
      ],
      fetchHostActiveLoans: async (baseUrl, libraryId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        return [];
      },
      fetchHostWishlist: async (_baseUrl, _libraryId, limit) => {
        assert.equal(limit, 500);
        return [];
      },
    },
  );

  assert.equal(result.syncSource, "client-live");
  assert.equal(result.printerOverviewAvailable, true);
  assert.deepEqual(result.printerOverview, [printerOverviewRow("printer-host")]);
  assert.deepEqual(result.bambuLiveIntegrations, []);
  assert.equal(result.libraryId, "library-1");
  assert.deepEqual(result.actionItems, []);
  assert.deepEqual(result.bambuLiveAttention, []);
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.clientHostDisplayName, "Live Host");
  assert.equal(result.clientHostPaired, true);
  assert.equal(result.setupDataAvailable, true);
  assert.equal(result.capturedAt, "2026-04-01 10:00:00");
  assert.deepEqual(result.revisionSource, {
    kind: "host",
    baseUrl: "http://host",
    libraryId: "library-1",
  });
  assert.equal(result.revisionPollComplete, true);
  assert.equal(
    String(result.derived.goalMetrics.configuredPrinters),
    "1",
  );
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value,
    "250 g",
  );
  assert.equal(result.derived.usageTotal12m, 1_250);
  assert.equal(result.derived.usageMonths.at(-1)?.usedGrams, 1_250);
});

test("loadDashboardData marks partial client host reads as cached", async () => {
  const errors: unknown[] = [];
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          cached_printers: {
            captured_at: "printer-cache",
            rows: [printerOverviewRow("printer-cache")],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => validation(),
      fetchHostSnapshot: async () =>
        snapshot("Live Host", { captured_at: "snapshot-live" }),
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.setupDataAvailable, true);
  assert.equal(result.capturedAt, "printer-cache");
  assert.equal(result.printerOverviewAvailable, true);
  assert.deepEqual(result.printerOverview, [printerOverviewRow("printer-cache")]);
  assert.deepEqual(result.bambuLiveIntegrations, []);
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.revisionPollComplete, false);
  assert.deepEqual(
    String(result.derived.goalMetrics.configuredPrinters),
    "1",
  );
  assert.equal(errors.length, 1);
});

test("loadDashboardData relies on core reads instead of a separate pairing validation", async () => {
  let validationCalls = 0;
  const result = await loadDashboardData(
    {
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 0,
        tone: "live",
      },
      previousClientHostNeedsRepair: false,
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          client_auth_paired: true,
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => {
        validationCalls += 1;
        throw new Error(
          "dashboard must not amplify refreshes with a separate validation",
        );
      },
      fetchHostSnapshot: async () => snapshot("Live Host"),
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [],
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
    },
  );

  assert.equal(result.clientHostConnectionObservation, "succeeded");
  assert.equal(result.clientHostNeedsRepair, false);
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(validationCalls, 0);
});

test("a successful authenticated core read clears a stale persisted repair state", async () => {
  const result = await loadDashboardData(
    {
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 2,
        tone: "warn",
      },
      previousClientHostNeedsRepair: true,
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          client_auth_paired: true,
          last_validation_message: "Desktop client pairing is no longer valid.",
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostSnapshot: async () => snapshot("Live Host"),
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [],
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
    },
  );

  assert.equal(result.clientHostConnectionObservation, "succeeded");
  assert.equal(result.clientHostNeedsRepair, false);
  assert.equal(result.clientHostCompanionTone, "live");
});

test("loadDashboardData skips host calls for incomplete client targets and uses cache", async () => {
  const cached = snapshot("Cached Host", {
    captured_at: "2026-04-01 09:00:00",
  });
  let localPrinterSettingsReads = 0;
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: " ",
          cached_snapshot: cached,
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => {
        localPrinterSettingsReads += 1;
        throw new Error("Client mode must not read local printer settings");
      },
      validateHost: async () => {
        throw new Error("should not validate without a complete target");
      },
      fetchHostSnapshot: async () => {
        throw new Error("should not fetch without a complete target");
      },
      loadLocalDashboardSnapshot: async () => localDashboardFixture(overview()),
      listLocalPrinters: async () => [],
      loadSpoolRows: async (options) => {
        assert.equal(options.clientReadOnly, false);
        return [];
      },
      listLocalLoans: async () => [],
      listLocalWishlist: async () => [],
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostDisplayName, "Cached Host");
  assert.equal(result.capturedAt, "2026-04-01 09:00:00");
  assert.equal(result.revisionSource, null);
  assert.equal(result.revisionPollComplete, false);
  assert.equal(localPrinterSettingsReads, 0);
});

test("cached active loans are independent of historical rows on the Dashboard", async () => {
  const historicalLoan = activeLoan("historical-cache-only", "2026-08-18");
  const active = { ...activeLoan("older-active", "2026-08-18"), spool_tare_weight_g: 200 };
  for (const loanRows of [[active], []]) {
    const result = await loadDashboardData(
      { clientCacheOnly: true, previousClientHostNeedsRepair: false, t, today: "2026-08-21" },
      {
        loadSyncSettings: async () => syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          cached_snapshot: snapshot("Cached Host"),
          cached_loans: {
            captured_at: "2026-08-20 09:00:00",
            rows: [{ ...historicalLoan, spool_tare_weight_g: 200 }],
          },
          cached_active_loans: { captured_at: "2026-08-20 10:00:00", rows: loanRows },
        }),
        loadTrustedLanStatus: async () => null,
      },
    );
    assert.equal(result.syncSource, "client-cached");
    assert.deepEqual(result.actionItems.map((item) => item.id),
      loanRows.length === 0 ? [] : ["overdue-loan:older-active"]);
  }
});

test("dashboard recognizes an empty Host cache even without a summary", async () => {
  const captured_at = "2026-04-01 08:30:00";
  for (const key of ["cached_spools", "cached_printers", "cached_active_loans", "cached_wishlist"]) {
    const result = await loadDashboardData(
      { clientCacheOnly: true, previousClientHostNeedsRepair: false, t },
      {
        loadSyncSettings: async () => syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          [key]: { captured_at, rows: [] },
        }),
        loadTrustedLanStatus: async () => null,
      },
    );
    assert.equal(result.syncSource, "client-cached", key);
    assert.equal(result.setupDataAvailable, false, key);
    assert.equal(result.capturedAt, captured_at, key);
    assert.equal(result.lowStockPreviewAvailable, key === "cached_spools", key);
    assert.equal(result.printerOverviewAvailable, key === "cached_printers", key);
  }
});

test("empty spool lists replace older stock totals while keeping snapshot consumption", async () => {
  const older = "2026-04-01 09:00:00";
  const newer = "2026-04-01 11:00:00";
  for (const [cacheOnly, capturedAt, expectedStock] of [
    [false, older, 0],
    [true, newer, 0],
    [true, older, 3],
  ] as const) {
    const result = await loadDashboardData(
      { clientCacheOnly: cacheOnly, previousClientHostNeedsRepair: false, t },
      {
        loadSyncSettings: async () => syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          cached_snapshot: snapshot("Host", {
            captured_at: "2026-04-01 10:00:00",
            inventory: overview({ total_spools: 3, total_owned_spools: 3, total_consumption_30d: 250 }),
          }),
          cached_spools: { captured_at: capturedAt, rows: [] },
        }),
        loadTrustedLanStatus: async () => null,
        fetchHostSnapshot: async () => { throw new Error("snapshot unavailable"); },
        loadSpoolRows: async () => [],
        fetchHostPrinterOverview: async () => [],
        fetchHostActiveLoans: async () => [],
        fetchHostWishlist: async () => [],
        fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
        onLoadError: () => {},
      },
    );
    assert.equal(result.derived.ownershipOnHand.total, expectedStock);
    assert.equal(result.derived.goalMetrics.totalSpools, expectedStock);
    assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
  }
});

test("loadDashboardData uses cached client rows without a cached snapshot", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: " ",
          cached_spools: {
            captured_at: "2026-04-01 08:30:00",
            rows: [
              spoolWithMasterRow("spool-cache", {
                ownership_type: "borrowed-in",
                status: "IN_USE",
              }),
            ],
          },
          cached_printers: {
            captured_at: "2026-04-01 08:35:00",
            rows: [printerOverviewRow("printer-cache")],
          },
          cached_wishlist: {
            captured_at: "2026-04-01 08:40:00",
            rows: [
              wishlistItem("wishlist-cache", {
                status: "ON_ORDER",
                quantity: 2,
              }),
            ],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => {
        throw new Error("should not validate without a complete target");
      },
      fetchHostSnapshot: async () => {
        throw new Error("should not fetch without a complete target");
      },
      loadLocalDashboardSnapshot: async () => {
        throw new Error("local overview should not load in client mode");
      },
      listLocalPrinters: async () => {
        throw new Error("local printers should not load in client mode");
      },
      loadSpoolRows: async () => {
        throw new Error("local spools should not load in client mode");
      },
      listLocalLoans: async () => {
        throw new Error("local loans should not load in client mode");
      },
      listLocalWishlist: async () => {
        throw new Error("local wishlist should not load in client mode");
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.capturedAt, "2026-04-01 08:30:00");
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "total")?.value,
    "1",
  );
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "total")?.trend,
    "1 assigned",
  );
  assert.equal(result.derived.ownershipOnHand.borrowedIn, 1);
  assert.equal(
    String(result.derived.goalMetrics.configuredPrinters),
    "1",
  );
  assert.equal(
    result.derived.health.metrics.find((metric) => metric.id === "onOrder")
      ?.value,
    "2",
  );
});

test("loadDashboardData prefers cached client spool rows over stale snapshot totals", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, now: dashboardTestNow, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: " ",
          cached_snapshot: snapshot("Cached Host", {
            captured_at: "2026-04-01 08:00:00",
            inventory: overview({
              total_spools: 99,
              total_owned_spools: 99,
              low_stock: 99,
              owned_low_stock: 99,
              total_consumption_30d: 250,
              total_consumption_12m: 1_250,
              consumption_12m: [{ month: currentMonth, used_grams: 1_250 }],
            }),
          }),
          cached_spools: {
            captured_at: "2026-04-01 08:30:00",
            rows: [spoolWithMasterRow("spool-cache")],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => {
        throw new Error("should not validate without a complete target");
      },
      fetchHostSnapshot: async () => {
        throw new Error("should not fetch without a complete target");
      },
      loadLocalDashboardSnapshot: async () => {
        throw new Error("local overview should not load in client mode");
      },
      listLocalPrinters: async () => {
        throw new Error("local printers should not load in client mode");
      },
      loadSpoolRows: async () => {
        throw new Error("local spools should not load in client mode");
      },
      listLocalLoans: async () => {
        throw new Error("local loans should not load in client mode");
      },
      listLocalWishlist: async () => {
        throw new Error("local wishlist should not load in client mode");
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.capturedAt, "2026-04-01 08:30:00");
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "total")?.value,
    "1",
  );
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "lowStock")?.value,
    "0",
  );
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value,
    "250 g",
  );
  assert.equal(result.derived.usageTotal12m, 1_250);
  assert.equal(result.derived.usageMonths.at(-1)?.usedGrams, 1_250);
});

test("loadDashboardData renders paired-client cache without waiting for host reads", async () => {
  let hostCalls = 0;
  const hostRead = async () => {
    hostCalls += 1;
    throw new Error("host reads must not start while seeding the client cache");
  };
  const result = await loadDashboardData(
    {
      clientCacheOnly: true,
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 0,
        tone: "live",
      },
      previousClientHostNeedsRepair: false,
      now: dashboardTestNow,
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          target_generation: 7,
          client_auth_paired: true,
          cached_snapshot: snapshot("Cached Host", {
            captured_at: "2026-04-01 08:00:00",
            inventory: overview({
              total_consumption_30d: 250,
              total_consumption_12m: 1_250,
              consumption_12m: [{ month: currentMonth, used_grams: 1_250 }],
            }),
          }),
          cached_spools: {
            captured_at: "2026-04-01 08:30:00",
            rows: [spoolWithMasterRow("spool-cache", { current_weight_g: 20, remaining_g: 20 })],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: hostRead,
      fetchHostSnapshot: hostRead,
      loadSpoolRows: hostRead,
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: hostRead,
      fetchHostActiveLoans: hostRead,
      fetchHostWishlist: hostRead,
      loadLocalDashboardSnapshot: hostRead,
      listLocalPrinters: hostRead,
      listLocalLoans: hostRead,
      listLocalWishlist: hostRead,
    },
  );

  const suggestion = result.actionItems.find(item => item.kind === "LOW_STOCK");
  assert.deepEqual(suggestion?.purchaseTarget, {
    mode: "CLIENT", host_base_url: "http://host", library_id: "library-1", target_generation: 7,
  });
  assert.equal(hostCalls, 0);
  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostConnectionObservation, "checking");
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value,
    "250 g",
  );
  assert.equal(result.derived.usageTotal12m, 1_250);
  assert.equal(result.derived.usageMonths.at(-1)?.usedGrams, 1_250);
});

test("loadDashboardData stays client-offline without cache instead of loading local data", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: " ",
          library_id: "library-1",
          cached_consumption: {
            captured_at: "2026-04-01 08:25:00",
            rows: [consumptionRow("PLA", 250)],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => {
        throw new Error("should not validate without a complete target");
      },
      fetchHostSnapshot: async () => {
        throw new Error("should not fetch without a complete target");
      },
      loadLocalDashboardSnapshot: async () => {
        throw new Error("local overview should not load in client mode");
      },
      listLocalPrinters: async () => {
        throw new Error("local printers should not load in client mode");
      },
      loadSpoolRows: async () => {
        throw new Error("local spools should not load in client mode");
      },
      listLocalLoans: async () => {
        throw new Error("local loans should not load in client mode");
      },
      listLocalWishlist: async () => {
        throw new Error("local wishlist should not load in client mode");
      },
    },
  );

  assert.equal(result.syncSource, "client-offline");
  assert.equal(result.printerOverviewAvailable, false);
  assert.equal(result.lowStockPreviewAvailable, false);
  assert.deepEqual(result.bambuLiveIntegrations, []);
  assert.equal(result.clientHostPaired, false);
  assert.equal(result.setupDataAvailable, false);
  assert.equal(result.capturedAt, null);
  assert.equal(
    result.derived.stats.find((stat) => stat.id === "total")?.value,
    "0",
  );
  assert.equal(
    String(result.derived.goalMetrics.configuredPrinters),
    "0",
  );
});

test("loadDashboardData marks annual usage unavailable for an older host snapshot", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => validation(),
      fetchHostSnapshot: async () =>
        snapshot("Older Host", {
          inventory: overview({
            consumption_12m_available: false,
            total_consumption_12m: 0,
            consumption_12m: [],
          }),
        }),
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [],
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
    },
  );

  assert.equal(result.syncSource, "client-live");
  assert.equal(result.derived.usageAvailable, false);
  assert.equal(result.derived.usageTotal12m, 0);
  assert.equal(result.derived.usageMonths.length, 12);
});

test("loadDashboardData falls back to cached client snapshot when host snapshot fails", async () => {
  const errors: unknown[] = [];
  const cached = snapshot("Cached Host", {
    captured_at: "2026-04-01 09:00:00",
  });
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          cached_snapshot: cached,
          cached_printers: {
            captured_at: cached.captured_at,
            rows: [printerOverviewRow("printer-cache")],
          },
          cached_wishlist: {
            captured_at: cached.captured_at,
            rows: [wishlistItem("wishlist-cache", { status: "ON_ORDER" })],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => validation(),
      fetchHostSnapshot: async () => {
        throw new Error("snapshot unavailable");
      },
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => {
        throw new Error("wishlist unavailable");
      },
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostConnectionObservation, "succeeded");
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.clientHostDisplayName, "Cached Host");
  assert.equal(result.capturedAt, "2026-04-01 09:00:00");
  assert.equal(
    String(result.derived.goalMetrics.configuredPrinters),
    "1",
  );
  assert.equal(
    result.derived.health.metrics.find((metric) => metric.id === "onOrder")
      ?.value,
    "1",
  );
  assert.equal(errors.length, 3);
});

test("loadDashboardData warns only after consecutive core host failures and resets on success", async () => {
  const clientSettings = syncSettings({
    mode: "CLIENT",
    host_base_url: "http://host",
    library_id: "library-1",
    client_auth_paired: true,
    cached_snapshot: snapshot("Cached Host"),
  });
  const failedRead = async () => {
    throw new Error("host unavailable");
  };
  const failedDependencies = {
    loadSyncSettings: async () => clientSettings,
    loadTrustedLanStatus: async () => null,
    loadPrinterSettings: async () => printerSettingsSnapshot(),
    validateHost: failedRead,
    fetchHostSnapshot: failedRead,
    loadSpoolRows: failedRead,
    fetchHostPrinterOverview: failedRead,
    fetchHostActiveLoans: failedRead,
    fetchHostWishlist: failedRead,
    onLoadError: () => {},
  };

  const firstFailure = await loadDashboardData(
    {
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 0,
        tone: "live",
      },
      previousClientHostNeedsRepair: false,
      t,
    },
    failedDependencies,
  );
  assert.equal(firstFailure.clientHostConnectionObservation, "failed");
  assert.equal(
    firstFailure.clientHostConnectionState.consecutiveCoreFailures,
    1,
  );
  assert.equal(firstFailure.clientHostCompanionTone, "live");

  const secondFailure = await loadDashboardData(
    {
      previousClientHostConnectionState: firstFailure.clientHostConnectionState,
      previousClientHostNeedsRepair: false,
      t,
    },
    failedDependencies,
  );
  assert.equal(
    secondFailure.clientHostConnectionState.consecutiveCoreFailures,
    2,
  );
  assert.equal(secondFailure.clientHostCompanionTone, "warn");

  const recovered = await loadDashboardData(
    {
      previousClientHostConnectionState:
        secondFailure.clientHostConnectionState,
      previousClientHostNeedsRepair: false,
      t,
    },
    {
      ...failedDependencies,
      validateHost: async () => validation(),
      fetchHostSnapshot: async () => snapshot("Live Host"),
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [],
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
    },
  );
  assert.equal(recovered.clientHostConnectionObservation, "succeeded");
  assert.deepEqual(recovered.clientHostConnectionState, {
    consecutiveCoreFailures: 0,
    tone: "live",
  });
});

test("loadDashboardData treats a 401 as an immediate pairing repair", async () => {
  const result = await loadDashboardData(
    {
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 0,
        tone: "live",
      },
      previousClientHostNeedsRepair: false,
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          client_auth_paired: true,
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => validation(),
      fetchHostSnapshot: async () => {
        throw new Error("HTTP 401 Unauthorized");
      },
      loadSpoolRows: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: async () => [],
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
      onLoadError: () => {},
    },
  );

  assert.equal(result.clientHostConnectionObservation, "repair");
  assert.equal(result.clientHostNeedsRepair, true);
  assert.equal(result.clientHostCompanionTone, "warn");
});

test("loadDashboardData does not treat 401 digits in a transport URL as pairing repair", async () => {
  const failedRead = async () => {
    throw new Error(
      "request failed for http://host401.local:4010/api/v1/library/snapshot",
    );
  };
  const result = await loadDashboardData(
    {
      previousClientHostConnectionState: {
        consecutiveCoreFailures: 0,
        tone: "live",
      },
      previousClientHostNeedsRepair: false,
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host401.local:4010",
          library_id: "library-1",
          client_auth_paired: true,
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => validation(),
      fetchHostSnapshot: failedRead,
      loadSpoolRows: failedRead,
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostPrinterOverview: failedRead,
      fetchHostActiveLoans: failedRead,
      fetchHostWishlist: failedRead,
      onLoadError: () => {},
    },
  );

  assert.equal(result.clientHostConnectionObservation, "failed");
  assert.equal(result.clientHostNeedsRepair, false);
  assert.equal(result.clientHostCompanionTone, "live");
});

test("client overview availability distinguishes unknown rows from confirmed empty host results", async () => {
  for (const available of [false, true]) {
    const loadRows = async () => {
      if (!available) throw new Error("host detail rows unavailable");
      return [];
    };
    let localSettingsReads = 0;
    const result = await loadDashboardData(
      { previousClientHostNeedsRepair: false, t },
      {
        loadSyncSettings: async () => syncSettings({ mode: "CLIENT", host_base_url: "http://host", library_id: "library-1" }),
        loadTrustedLanStatus: async () => null,
        fetchHostSnapshot: async () => snapshot("Host", { inventory: overview({ low_stock: 3 }) }),
        fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
        fetchHostPrinterOverview: loadRows,
        loadSpoolRows: loadRows,
        fetchHostActiveLoans: async () => [],
        fetchHostWishlist: async () => [],
        loadPrinterSettings: async () => {
          localSettingsReads += 1;
          return printerSettingsSnapshot();
        },
        onLoadError: () => {},
      },
    );
    assert.equal(result.printerOverviewAvailable, available);
    assert.equal(result.lowStockPreviewAvailable, available);
    assert.deepEqual(result.printerOverview, []);
    assert.deepEqual(result.lowStockPreview, []);
    assert.deepEqual(result.bambuLiveIntegrations, []);
    assert.equal(localSettingsReads, 0);
  }
});

test("client dashboard reads sanitized live settings from its Host and clears them on fallback", async () => {
  let settingsCalls = 0;
  let failSettings = false;
  let failPrinters = false;
  let localReads = 0;
  const hostConfig = {
    enabled: true,
    tls_trust_state: "TRUSTED",
    host: "private-printer-address",
    printer_serial: "private-serial",
    observed_state: {
      online: true, mqtt_connected: true, last_seen_at: new Date().toISOString(),
      gcode_state: "PAUSE", progress_percent: 64, subtask_name: "Host job.3mf",
      nozzle_temp_c: 218, trays: [], raw_payload_json: "private-payload",
    },
  };
  const errors: unknown[] = [];
  const dependencies = {
    loadSyncSettings: async () => syncSettings({
      mode: "CLIENT", host_base_url: " http://host ", library_id: " library-1 ",
      client_auth_paired: true,
      cached_printers: { captured_at: "2026-10-25T00:00:00Z", rows: [printerOverviewRow("host-printer")] },
    }),
    loadTrustedLanStatus: async () => null,
    loadPrinterSettings: async () => { localReads++; return printerSettingsSnapshot(); },
    fetchHostSnapshot: async () => snapshot("Host"),
    loadSpoolRows: async () => [],
    fetchHostPrinterOverview: async () => {
      if (failPrinters) throw new Error("printer list unavailable");
      return [printerOverviewRow("host-printer")];
    },
    fetchHostActiveLoans: async () => [],
    fetchHostWishlist: async () => [],
    fetchHostPrinterSettings: async (baseUrl: string, libraryId?: string | null) => {
      settingsCalls++;
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-1");
      if (failSettings) throw new Error("live settings unavailable");
      return { ...printerSettingsSnapshot(), bambu_live_integrations: [{ printer_id: "host-printer", config: hostConfig }] };
    },
    onLoadError: (error: unknown) => { errors.push(error); },
  };
  const params = { previousClientHostNeedsRepair: false, t };
  const live = await loadDashboardData(params, dependencies);
  assert.equal(live.syncSource, "client-live");
  assert.equal(live.revisionPollComplete, true);
  assert.equal(live.bambuLiveIntegrations[0].config.observed_state?.gcode_state, "PAUSE");
  assert.equal(live.bambuLiveIntegrations[0].config.observed_state?.progress_percent, 64);
  assert.doesNotMatch(JSON.stringify(live.bambuLiveIntegrations), /private-/);

  failSettings = true;
  const missingStatus = await loadDashboardData(params, dependencies);
  assert.equal(missingStatus.syncSource, "client-live");
  assert.deepEqual(missingStatus.bambuLiveIntegrations, []);
  assert.equal(missingStatus.revisionPollComplete, false, "failed status read must be retried even without a revision change");
  assert.equal(errors.length, 1);

  failSettings = false;
  failPrinters = true;
  const partial = await loadDashboardData(params, dependencies);
  assert.equal(partial.syncSource, "client-cached");
  assert.deepEqual(partial.bambuLiveIntegrations, []);
  const callsBeforeCache = settingsCalls;
  const cached = await loadDashboardData({ ...params, clientCacheOnly: true }, dependencies);
  assert.deepEqual(cached.bambuLiveIntegrations, []);
  assert.equal(settingsCalls, callsBeforeCache);
  assert.equal(localReads, 0, "client must never read this device's shadow printer settings");
});

test("dashboard paints offline rows first, then reuses just the failed loan slice", async () => {
  const target = syncSettings({
    mode: "CLIENT", host_base_url: "http://host", target_generation: 3, client_auth_paired: true,
  });
  const domainReads: string[][] = [];
  let hostCalls = 0;
  let loansOffline = true;
  const dependencies = {
    loadSyncSettings: async (domains?: readonly LibrarySyncCacheDomain[]) => {
      if (domains?.length) domainReads.push([...domains]);
      return {
        ...target,
        cached_spools: domains?.includes("dashboard_stock")
          ? { captured_at: "spools-time", rows: [spoolWithMasterRow("cached-spool")] } : null,
        cached_active_loans: domains?.includes("active_loans")
          ? { captured_at: "loans-time", rows: [activeLoan("cached-loan", "2026-08-01")] } : null,
      };
    },
    loadTrustedLanStatus: async () => null,
    fetchHostSnapshot: async () => { hostCalls++; return snapshot("Live host"); },
    loadSpoolRows: async () => [spoolWithMasterRow("fresh-spool"), spoolWithMasterRow("another-spool")],
    fetchHostActiveLoans: async () => {
      if (loansOffline) throw new Error("loan endpoint unavailable");
      return [];
    },
    fetchHostPrinterOverview: async () => [],
    fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
    fetchHostWishlist: async () => [],
    onLoadError: () => {},
  };
  const params = { bootstrapCache: { current: null }, previousClientHostNeedsRepair: false, t };
  const first = await loadDashboardData({ ...params, clientCacheOnly: true }, dependencies);
  assert.equal(first.derived.ownershipOnHand.total, 1);
  assert.equal(first.syncSource, "client-cached");
  assert.equal(hostCalls, 0);
  assert.deepEqual(domainReads, [["dashboard_stock", "printers", "active_loans", "wishlist"]]);
  domainReads.length = 0;

  const partial = await loadDashboardData(params, dependencies);
  assert.equal(partial.derived.ownershipOnHand.total, 2);
  assert.equal(partial.derived.stats.find(stat => stat.id === "outboundLoans")?.value, "1");
  assert.equal(partial.syncSource, "client-cached");
  assert.equal(partial.capturedAt, "loans-time");
  assert.deepEqual(domainReads, []);
  assert.equal(params.bootstrapCache.current, null);

  await loadDashboardData(params, dependencies);
  assert.deepEqual(domainReads, [["active_loans"]]);
  domainReads.length = 0;
  loansOffline = false;
  const recovered = await loadDashboardData(params, dependencies);
  assert.equal(recovered.syncSource, "client-live");
  assert.equal(recovered.derived.stats.find(stat => stat.id === "outboundLoans")?.value, "0");
  assert.deepEqual(domainReads, []);
});

for (const [change, newUrl, newLibrary] of [
  ["different Host", "http://other", "library-1"],
  ["different library on the same Host", "http://host", "library-2"],
  ["same Host and library after switching away and back", "http://host", "library-1"],
]) {
  for (const modern of [false, true]) test(`dashboard discards an in-flight ${modern ? "compact" : "legacy"} reply for a ${change}`, async () => {
    const emptyStock = {
      metrics: { totalSpools: 0, activeSpools: 0, placedActiveSpools: 0, onHandOwned: 0,
        onHandBorrowedIn: 0, onHandInUse: 0, ownedLowStock: 0, borrowedInLowStock: 0,
        healthySpools: 0, thresholds: [] }, groups: [], preview: [],
    };
    let fullReads = 0;
    const original = syncSettings({ mode: "CLIENT", host_base_url: "http://host", target_generation: 3 });
    let target = original;
    const params = { bootstrapCache: { current: null }, previousClientHostNeedsRepair: false, t };
    const dependencies = {
      loadSyncSettings: async (domains?: readonly LibrarySyncCacheDomain[]) => ({
        ...target,
        cached_snapshot: modern && domains?.includes("dashboard_stock") ? snapshot("Current host", {
          library_id: target.library_id, dashboard_stock: emptyStock,
        }) : null,
        cached_printers: domains?.includes("printers") ? {
          captured_at: "printer-cache",
          rows: [printerOverviewRow(target === original ? "original-printer" : "new-printer")],
        } : null,
      }),
      loadTrustedLanStatus: async () => null,
      fetchHostSnapshot: async () => snapshot("Old host", modern ? {
        dashboard_stock: { ...emptyStock, metrics: { ...emptyStock.metrics, onHandOwned: 87 } },
      } : {}),
      fetchHostPrinterOverview: async () => {
        target = { ...original, host_base_url: newUrl, library_id: newLibrary, target_generation: 5 };
        return [printerOverviewRow("late-old-printer")];
      },
      loadSpoolRows: async () => { fullReads++; return [spoolWithMasterRow("late-old-spool")]; },
      fetchHostActiveLoans: async () => [],
      fetchHostWishlist: async () => [],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
    };
    await loadDashboardData({ ...params, clientCacheOnly: true }, dependencies);
    const switched = await loadDashboardData(params, dependencies);
    assert.deepEqual(switched.printerOverview, [printerOverviewRow("new-printer")]);
    assert.equal(switched.derived.ownershipOnHand.total, 0);
    assert.equal(fullReads, modern ? 0 : 1);
    assert.equal(switched.libraryId, newLibrary);
    assert.equal(switched.syncSource, "client-cached");
  });
}

test("a switch during disk fallback discards the old Host's successful domains", async () => {
  let target = syncSettings({ mode: "CLIENT", host_base_url: "http://old", target_generation: 1 });
  const result = await loadDashboardData({ previousClientHostNeedsRepair: false, t }, {
    loadSyncSettings: async (domains) => {
      if (domains?.length === 1 && domains[0] === "active_loans") {
        target = syncSettings({ mode: "CLIENT", host_base_url: "http://new", library_id: "new-library", target_generation: 2 });
      }
      return { ...target, cached_spools: domains?.includes("dashboard_stock") ? { captured_at: "new-cache", rows: [] } : null };
    },
    loadTrustedLanStatus: async () => null,
    fetchHostSnapshot: async () => snapshot("Old host"),
    loadSpoolRows: async () => [spoolWithMasterRow("old-spool")],
    fetchHostActiveLoans: async () => { throw new Error("old loan endpoint unavailable"); },
    fetchHostPrinterOverview: async () => [printerOverviewRow("old-printer")],
    fetchHostPrinterSettings: async () => printerSettingsSnapshot(),
    fetchHostWishlist: async () => [],
    onLoadError: () => {},
  });
  assert.equal(result.libraryId, "new-library");
  assert.equal(result.derived.ownershipOnHand.total, 0);
  assert.deepEqual(result.printerOverview, []);
  assert.equal(result.syncSource, "client-cached");
});


test("compact Host stock matches legacy rows and keeps its own offline and partial results", async () => {
  const target = syncSettings({ mode: "CLIENT", host_base_url: "http://host", target_generation: 7 });
  const options = { previousClientHostNeedsRepair: false, t, now: dashboardTestNow };
  const product = { masterId: "master-1", material: "PLA", filamentName: "Basic", colorName: "Gray", vendor: "Bambu" };
  const stock = {
    metrics: { totalSpools: 5, activeSpools: 4, placedActiveSpools: 4, onHandOwned: 2,
      onHandBorrowedIn: 1, onHandInUse: 1, ownedLowStock: 1, borrowedInLowStock: 1,
      healthySpools: 1, thresholds: [300] },
    preview: ["a", "b"].map((spoolId, i) => ({ spoolId, vendor: product.vendor, filamentName: product.filamentName,
      material: product.material, colorName: product.colorName, hexColor: "#808080", remainingG: i ? 300 : 25, locationLabel: null })),
    groups: [{ ...product, lowestRemainingG: 25, thresholdG: 300, spoolCount: 2 }],
  };
  const rows = [
    spoolWithMasterRow("a", { remaining_g: 25 }), spoolWithMasterRow("b", { status: "IN_USE", ownership_type: "BORROWED_IN", remaining_g: 300 }),
    spoolWithMasterRow("c"), spoolWithMasterRow("d", { status: "EMPTY" }), spoolWithMasterRow("e", { status: "BORROWED" }),
  ].map(row => ({ ...row, low_stock_threshold_g: 300 }));
  const summary = snapshot("Host", { inventory: overview({ total_spools: 5, total_consumption_30d: 123 }) });
  const compact = { ...summary, dashboard_stock: stock };
  let legacy = true, offline = false, printerFailure = false, ordered = false, fullReads = 0;
  const cacheReads: string[][] = [];
  const host = <T,>(result: T) => { if (offline) throw Error("disconnected"); return result; };
  const deps = {
    loadSyncSettings: async (domains?: readonly LibrarySyncCacheDomain[]) => {
      if (domains?.length) cacheReads.push([...domains]);
      return { ...target, cached_snapshot: domains?.includes("dashboard_stock") ? compact : null };
    },
    loadTrustedLanStatus: async () => null,
    fetchHostSnapshot: async (_url: string, _id?: string | null, request?: { dashboard: boolean; expectedGeneration?: number | null }) => {
      assert.deepEqual(request, { dashboard: true, expectedGeneration: 7 });
      return host(legacy ? summary : compact);
    },
    loadSpoolRows: async () => { fullReads++; return host(rows); },
    fetchHostActiveLoans: async () => host([]),
    fetchHostPrinterOverview: async () => { if (printerFailure) throw Error("printer endpoint"); return host([]); },
    fetchHostPrinterSettings: async () => host(printerSettingsSnapshot()),
    fetchHostWishlist: async () => host(ordered ? [wishlistItem("order", {status: "ON_ORDER"})] : []),
    onLoadError: () => {},
  };
  const before = await loadDashboardData(options, deps);
  legacy = false;
  const after = await loadDashboardData(options, deps);
  for (const mode of ["HOST", "STANDALONE"] as const) {
    const local = await loadDashboardData(options, {
      loadSyncSettings: async () => syncSettings({ mode, target_generation: 7 }),
      loadTrustedLanStatus: async () => null,
      loadLocalDashboardSnapshot: async () => ({ overview: summary.inventory, stock }),
      loadSpoolRows: async () => assert.fail("local spool pagination"),
      listLocalPrinters: async () => [], listLocalLoans: async () => [], listLocalWishlist: async () => [],
      loadPrinterSettings: async () => printerSettingsSnapshot(),
    });
    assert.deepEqual(local.derived, before.derived);
    assert.deepEqual(local.lowStockPreview, before.lowStockPreview);
    assert.deepEqual(local.actionItems, before.actionItems.map(item => item.kind === "LOW_STOCK"
      ? { ...item, purchaseTarget: { ...item.purchaseTarget, mode, host_base_url: null } } : item));
  }
  assert.deepEqual(after.derived, before.derived);
  assert.deepEqual(after.actionItems, before.actionItems);
  assert.deepEqual(after.lowStockPreview, before.lowStockPreview);
  ordered = true;
  assert.ok(!(await loadDashboardData(options, deps)).actionItems.some(item => item.kind === "LOW_STOCK"));
  printerFailure = true;
  const partial = await loadDashboardData(options, deps);
  assert.equal(partial.syncSource, "client-cached");
  assert.deepEqual(partial.lowStockPreview, stock.preview);
  assert.deepEqual(cacheReads, [["printers"]]);
  offline = true;
  const cached = await loadDashboardData(options, deps);
  assert.equal(cached.syncSource, "client-cached");
  assert.deepEqual(cached.derived.ownershipOnHand, before.derived.ownershipOnHand);
  assert.deepEqual(cached.actionItems, before.actionItems);
  assert.deepEqual(cached.lowStockPreview, stock.preview);
  assert.equal(fullReads, 1, "only the older Host needed a spool list");
});

for (const failed of [false, true]) {
  test(`Host to Client switch discards a ${failed ? "failed" : "successful"} local read`, async () => {
    const host = syncSettings({ mode: "HOST", target_generation: 4 });
    const client = syncSettings({
      mode: "CLIENT", host_base_url: "http://new-host", library_id: "replacement", target_generation: 5,
      cached_spools: { captured_at: "new-cache", rows: [] },
    });
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let target = host;
    const load = loadDashboardData({ previousClientHostNeedsRepair: false, t }, {
      loadSyncSettings: async () => target,
      loadTrustedLanStatus: async () => null,
      loadLocalDashboardSnapshot: async () => {
        started.resolve();
        await finish.promise;
        if (failed) throw new Error("local read lost authority");
        return localDashboardFixture(overview(), [spoolWithMasterRow("old-low", { remaining_g: 20 })]);
      },
      listLocalPrinters: async () => [printerOverviewRow("old-printer")],
      listLocalLoans: async () => [], listLocalWishlist: async () => [],
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      loadSpoolRows: async () => assert.fail("unexpected full read"),
    });
    await started.promise;
    target = client;
    finish.resolve();
    const result = await load;
    assert.equal(result.syncMode, "CLIENT");
    assert.equal(result.libraryId, "replacement");
    assert.equal(result.syncSource, "client-cached");
    assert.deepEqual(result.printerOverview, []);
    assert.deepEqual(result.lowStockPreview, []);
    assert.deepEqual(result.actionItems, []);
    assert.equal(result.derived.ownershipOnHand.total, 0);
  });
}

test("returning to the same local library reloads its new generation", async () => {
  let generation = 1;
  let reads = 0;
  const result = await loadDashboardData({ previousClientHostNeedsRepair: false, t }, {
    loadSyncSettings: async () => syncSettings({ mode: "HOST", target_generation: generation }),
    loadTrustedLanStatus: async () => null,
    loadLocalDashboardSnapshot: async () => {
      const spoolId = reads++ === 0 ? "old-roll" : "new-roll";
      generation = 3;
      return localDashboardFixture(overview(), [spoolWithMasterRow(spoolId, { remaining_g: 20 })]);
    },
    listLocalPrinters: async () => [], listLocalLoans: async () => [], listLocalWishlist: async () => [],
    loadPrinterSettings: async () => printerSettingsSnapshot(),
  });
  assert.deepEqual(result.lowStockPreview.map(row => row.spoolId), ["new-roll"]);
  assert.equal(result.libraryTarget?.target_generation, 3);
  assert.equal(reads, 2);
});
