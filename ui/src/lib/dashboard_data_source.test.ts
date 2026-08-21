import assert from "node:assert/strict";
import test from "node:test";

import {
  hasInvalidClientPairingMessage,
  loadDashboardData,
} from "./dashboard_data_source";
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
const currentMonth = (() => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
})();

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

function syncSettings(overrides: Partial<LibrarySyncSettings> = {}): LibrarySyncSettings {
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

function wishlistItem(id: string, overrides: Partial<WishlistItemRow> = {}): WishlistItemRow {
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

function activeLoan(
  id: string,
  expectedReturnAt: string,
): ActiveSpoolLoanRow {
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
  assert.equal(hasInvalidClientPairingMessage("Desktop client pairing is no longer valid."), true);
  assert.equal(hasInvalidClientPairingMessage("host is reachable"), false);
});

test("loadDashboardData loads local dashboard data outside client mode", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: true, t },
    {
      loadSyncSettings: async () => syncSettings(),
      loadTrustedLanStatus: async () => null,
      loadInventoryOverview: async () =>
        overview({
          total_consumption_30d: 120,
          total_consumption_12m: 900,
          consumption_12m: [{ month: currentMonth, used_grams: 900 }],
        }),
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
      loadSpoolRows: async (options) => {
        assert.equal(options.clientReadOnly, false);
        return [];
      },
      listLocalLoans: async () => [],
      listLocalWishlist: async (limit) => {
        assert.equal(limit, 500);
        return [];
      },
    },
  );

  assert.equal(result.syncSource, "local");
  assert.equal(result.syncMode, "STANDALONE");
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
  assert.deepEqual(result.actionItems.map((item) => item.kind), ["BAMBU_TRUST"]);
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
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
      loadInventoryOverview: async () => overview(),
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      loadSpoolRows: async () => [
        spoolWithMasterRow("low-a", { current_weight_g: 120, remaining_g: 120 }),
        spoolWithMasterRow("low-b", { current_weight_g: 80, remaining_g: 80 }),
      ],
      loadSyncSettings: async () => syncSettings(),
      loadTrustedLanStatus: async () => null,
    },
  );

  assert.deepEqual(result.actionItems.map((item) => item.kind), [
    "OVERDUE_LOAN",
    "ON_ORDER",
  ]);
  assert.equal(
    result.actionItems.some((item) => item.kind === "LOW_STOCK"),
    false,
  );
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
      loadInventoryOverview: async () => overview(),
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      loadSpoolRows: async () => [
        spoolWithMasterRow("low-a", { current_weight_g: 90, remaining_g: 90 }),
      ],
      loadSyncSettings: async () => syncSettings(),
      loadTrustedLanStatus: async () => null,
    },
  );

  assert.deepEqual(result.actionItems.map((item) => item.kind), ["LOW_STOCK"]);
});

test("loadDashboardData prefers live host data for paired clients", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
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
      fetchHostPrinterOverview: async () => [printerOverviewRow("printer-host")],
      fetchHostLoans: async (_baseUrl, _libraryId, limit) => {
        assert.equal(limit, 2000);
        return [];
      },
      fetchHostWishlist: async (_baseUrl, _libraryId, limit) => {
        assert.equal(limit, 500);
        return [];
      },
    },
  );

  assert.equal(result.syncSource, "client-live");
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
  assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
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
      fetchHostSnapshot: async () => snapshot("Live Host", { captured_at: "snapshot-live" }),
      loadSpoolRows: async () => [],
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostLoans: async () => [],
      fetchHostWishlist: async () => [],
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.setupDataAvailable, true);
  assert.equal(result.capturedAt, "printer-cache");
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.revisionPollComplete, false);
  assert.deepEqual(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
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
        throw new Error("dashboard must not amplify refreshes with a separate validation");
      },
      fetchHostSnapshot: async () => snapshot("Live Host"),
      loadSpoolRows: async () => [],
      fetchHostPrinterOverview: async () => [],
      fetchHostLoans: async () => [],
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
          last_validation_message:
            "Desktop client pairing is no longer valid.",
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      fetchHostSnapshot: async () => snapshot("Live Host"),
      loadSpoolRows: async () => [],
      fetchHostPrinterOverview: async () => [],
      fetchHostLoans: async () => [],
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
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: async () => {
        throw new Error("should not validate without a complete target");
      },
      fetchHostSnapshot: async () => {
        throw new Error("should not fetch without a complete target");
      },
      loadInventoryOverview: async () => overview(),
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
            rows: [wishlistItem("wishlist-cache", { status: "ON_ORDER", quantity: 2 })],
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
      loadInventoryOverview: async () => {
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "total")?.value, "1");
  assert.equal(result.derived.stats.find((stat) => stat.id === "total")?.trend, "1 assigned");
  assert.equal(result.derived.ownershipOnHand.borrowedIn, 1);
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
  assert.equal(
    result.derived.health.metrics.find((metric) => metric.id === "onOrder")?.value,
    "2",
  );
});

test("loadDashboardData prefers cached client spool rows over stale snapshot totals", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
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
      loadInventoryOverview: async () => {
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "total")?.value, "1");
  assert.equal(result.derived.stats.find((stat) => stat.id === "lowStock")?.value, "0");
  assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
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
      t,
    },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
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
            rows: [spoolWithMasterRow("spool-cache")],
          },
        }),
      loadTrustedLanStatus: async () => null,
      loadPrinterSettings: async () => printerSettingsSnapshot(),
      validateHost: hostRead,
      fetchHostSnapshot: hostRead,
      loadSpoolRows: hostRead,
      fetchHostPrinterOverview: hostRead,
      fetchHostLoans: hostRead,
      fetchHostWishlist: hostRead,
      loadInventoryOverview: hostRead,
      listLocalPrinters: hostRead,
      listLocalLoans: hostRead,
      listLocalWishlist: hostRead,
    },
  );

  assert.equal(hostCalls, 0);
  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostConnectionObservation, "checking");
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
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
      loadInventoryOverview: async () => {
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
  assert.equal(result.clientHostPaired, false);
  assert.equal(result.setupDataAvailable, false);
  assert.equal(result.capturedAt, null);
  assert.equal(result.derived.stats.find((stat) => stat.id === "total")?.value, "0");
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "0");
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
      fetchHostPrinterOverview: async () => [],
      fetchHostLoans: async () => [],
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
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostLoans: async () => [],
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
  assert.equal(
    result.derived.health.metrics.find((metric) => metric.id === "onOrder")?.value,
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
    fetchHostLoans: failedRead,
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
  assert.equal(firstFailure.clientHostConnectionState.consecutiveCoreFailures, 1);
  assert.equal(firstFailure.clientHostCompanionTone, "live");

  const secondFailure = await loadDashboardData(
    {
      previousClientHostConnectionState:
        firstFailure.clientHostConnectionState,
      previousClientHostNeedsRepair: false,
      t,
    },
    failedDependencies,
  );
  assert.equal(secondFailure.clientHostConnectionState.consecutiveCoreFailures, 2);
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
      fetchHostPrinterOverview: async () => [],
      fetchHostLoans: async () => [],
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
      fetchHostPrinterOverview: async () => [],
      fetchHostLoans: async () => [],
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
      fetchHostPrinterOverview: failedRead,
      fetchHostLoans: failedRead,
      fetchHostWishlist: failedRead,
      onLoadError: () => {},
    },
  );

  assert.equal(result.clientHostConnectionObservation, "failed");
  assert.equal(result.clientHostNeedsRepair, false);
  assert.equal(result.clientHostCompanionTone, "live");
});
