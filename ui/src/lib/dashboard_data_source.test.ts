import assert from "node:assert/strict";
import test from "node:test";

import {
  hasInvalidClientPairingMessage,
  loadDashboardData,
} from "./dashboard_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  PrinterOverviewRow,
  SpoolWithMasterRow,
  WishlistItemRow,
} from "./tauri_client";

const t = (_key: string, fallback: string) => fallback;

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
      loadInventoryOverview: async () => overview({ total_consumption_30d: 120 }),
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
      listLocalTopMaterials: async (limit) => {
        assert.equal(limit, 12);
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
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
      validateHost: async (baseUrl, libraryId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        return validation({ device_name: "Validated Host" });
      },
      fetchHostSnapshot: async (baseUrl, libraryId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        return snapshot("Live Host", { inventory: overview({ total_consumption_30d: 250 }) });
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
      fetchHostConsumption: async (baseUrl, libraryId, limit, printerId) => {
        assert.equal(baseUrl, "http://host");
        assert.equal(libraryId, "library-1");
        assert.equal(limit, 500);
        assert.equal(printerId, null);
        return [consumptionRow("PLA", 130), consumptionRow("PETG", 120)];
      },
      fetchHostWishlist: async (_baseUrl, _libraryId, limit) => {
        assert.equal(limit, 500);
        return [];
      },
    },
  );

  assert.equal(result.syncSource, "client-live");
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
  assert.deepEqual(result.derived.usagePoints, [120, 130]);
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
      validateHost: async () => validation(),
      fetchHostSnapshot: async () => snapshot("Live Host", { captured_at: "snapshot-live" }),
      loadSpoolRows: async () => [],
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostLoans: async () => [],
      fetchHostConsumption: async () => [],
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
      listLocalTopMaterials: async () => [],
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
      listLocalTopMaterials: async () => {
        throw new Error("local materials should not load in client mode");
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
            }),
          }),
          cached_spools: {
            captured_at: "2026-04-01 08:30:00",
            rows: [spoolWithMasterRow("spool-cache")],
          },
          cached_consumption: {
            captured_at: "2026-04-01 08:25:00",
            rows: [consumptionRow("PLA", 130), consumptionRow("PETG", 120)],
          },
        }),
      loadTrustedLanStatus: async () => null,
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
      listLocalTopMaterials: async () => {
        throw new Error("local materials should not load in client mode");
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.capturedAt, "2026-04-01 08:30:00");
  assert.equal(result.derived.stats.find((stat) => stat.id === "total")?.value, "1");
  assert.equal(result.derived.stats.find((stat) => stat.id === "lowStock")?.value, "0");
  assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
  assert.deepEqual(result.derived.usagePoints, [120, 130]);
});

test("loadDashboardData renders paired-client cache without waiting for host reads", async () => {
  let hostCalls = 0;
  const hostRead = async () => {
    hostCalls += 1;
    throw new Error("host reads must not start while seeding the client cache");
  };
  const result = await loadDashboardData(
    { clientCacheOnly: true, previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-1",
          client_auth_paired: true,
          cached_snapshot: snapshot("Cached Host", {
            captured_at: "2026-04-01 08:00:00",
            inventory: overview({ total_consumption_30d: 250 }),
          }),
          cached_spools: {
            captured_at: "2026-04-01 08:30:00",
            rows: [spoolWithMasterRow("spool-cache")],
          },
          cached_consumption: {
            captured_at: "2026-04-01 08:25:00",
            rows: [consumptionRow("PLA", 130), consumptionRow("PETG", 120)],
          },
        }),
      loadTrustedLanStatus: async () => null,
      validateHost: hostRead,
      fetchHostSnapshot: hostRead,
      loadSpoolRows: hostRead,
      fetchHostPrinterOverview: hostRead,
      fetchHostLoans: hostRead,
      fetchHostConsumption: hostRead,
      fetchHostWishlist: hostRead,
      loadInventoryOverview: hostRead,
      listLocalPrinters: hostRead,
      listLocalLoans: hostRead,
      listLocalWishlist: hostRead,
      listLocalTopMaterials: hostRead,
    },
  );

  assert.equal(hostCalls, 0);
  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostCompanionTone, "warn");
  assert.equal(result.derived.stats.find((stat) => stat.id === "monthlyUsage")?.value, "250 g");
  assert.deepEqual(result.derived.usagePoints, [120, 130]);
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
        }),
      loadTrustedLanStatus: async () => null,
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
      listLocalTopMaterials: async () => {
        throw new Error("local materials should not load in client mode");
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
      validateHost: async () => validation(),
      fetchHostSnapshot: async () => {
        throw new Error("snapshot unavailable");
      },
      loadSpoolRows: async () => [],
      fetchHostPrinterOverview: async () => {
        throw new Error("printers unavailable");
      },
      fetchHostLoans: async () => [],
      fetchHostConsumption: async () => [],
      fetchHostWishlist: async () => {
        throw new Error("wishlist unavailable");
      },
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.syncSource, "client-cached");
  assert.equal(result.clientHostCompanionTone, "warn");
  assert.equal(result.clientHostDisplayName, "Host");
  assert.equal(result.capturedAt, "2026-04-01 09:00:00");
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
  assert.equal(
    result.derived.health.metrics.find((metric) => metric.id === "onOrder")?.value,
    "1",
  );
  assert.equal(errors.length, 3);
});
