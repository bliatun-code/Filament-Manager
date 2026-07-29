import assert from "node:assert/strict";
import test from "node:test";

import { loadDashboardData } from "./dashboard_data_source";
import {
  beginDashboardPageSnapshotRequest,
  clearDashboardPageSnapshot,
  readDashboardPageSnapshot,
  readDashboardPageSnapshotGeneration,
  writeDashboardPageSnapshot,
  type DashboardPageSnapshot,
} from "./dashboard_page_snapshot_cache";
import { buildDashboardDerivedState } from "./dashboard_model";
import {
  buildInventoryCollectionWindow,
  INVENTORY_CARD_GROUP_PAGE_SIZE,
  INVENTORY_LIST_PAGE_SIZE,
} from "./inventory_collection_window";
import { mapSpoolRowToInventorySpool } from "./inventory_data_source";
import {
  buildMaterialOptions,
  buildVendorOptions,
  filterInventorySpools,
  groupInventorySpools,
} from "./inventory_list_model";
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import { deriveInventoryOverviewFromRows } from "./statistics_model";
import type {
  InventoryOverview,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  MaterialUsageRow,
  PrinterOverviewRow,
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
  TrustedLanCompanionStatus,
  WishlistItemRow,
} from "./tauri_client";

const t = (_key: string, fallback: string) => fallback;
const TEN_THOUSAND_SPOOLS = 10_000;

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

async function flushPromiseContinuations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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
    ...overrides,
  };
}

function syncSettings(
  overrides: Partial<LibrarySyncSettings> = {},
): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "Performance fixture",
    library_id: "performance-library",
    client_auth_paired: false,
    ...overrides,
  };
}

function hostSnapshot(): LibrarySyncRemoteSnapshot {
  return {
    captured_at: "2026-07-29 12:00:00",
    library_id: "performance-library",
    device_name: "Performance host",
    sync_mode: "HOST",
    inventory: overview({ total_spools: 1, total_owned_spools: 1 }),
    total_spools: 1,
    in_use: 0,
    low_stock: 0,
    active_loans: 0,
    printers: 0,
  };
}

function hostValidation(): LibrarySyncHostValidationResult {
  return {
    base_url: "http://performance-host",
    reachable: true,
    ok: true,
    matches_library_id: true,
    pairing_checked: true,
    pairing_valid: true,
    library_id: "performance-library",
    device_name: "Performance host",
    sync_mode: "HOST",
    message: "ok",
  };
}

function largeSpoolFixtureRow(index: number): SpoolWithMasterRow {
  const padded = index.toString().padStart(6, "0");
  const remaining = index % 10 === 0 ? 150 : 400 + (index % 550);
  return {
    spool: {
      id: `spool-${padded}`,
      master_id: `master-${index % 500}`,
      qr_code: `FM-${padded}`,
      status: "IN_STOCK",
      ownership_type: index % 9 === 0 ? "BORROWED_IN" : "OWNED",
      owner_name: index % 9 === 0 ? `Owner ${index % 25}` : null,
      owner_contact: null,
      ownership_note: null,
      initial_weight_g: 1000,
      current_weight_g: remaining,
      remaining_g: remaining,
      spool_tare_weight_g: 250,
      location_id: `Shelf ${index % 100}`,
      home_location_id: `Shelf ${index % 100}`,
      rfid_tag: index % 4 === 0 ? `RFID-${padded}` : null,
      rfid_observed_at: null,
    },
    master: {
      id: `master-${index % 500}`,
      material: ["PLA", "PETG", "ABS", "ASA", "TPU"][index % 5]!,
      filament_name: `Series ${index % 250}`,
      color_name: `Color ${index % 50}`,
      hex_color: `#${(index % 0xffffff).toString(16).padStart(6, "0")}`,
      product_url: null,
      default_weight: 1000,
      vendor: ["Bambu Lab", "eSUN", "Prusament", "Generic"][index % 4]!,
    },
  };
}

test("dashboard startup has two bounded concurrent dependency waves", async () => {
  const bootstrapStarted: string[] = [];
  const localStarted: string[] = [];
  const sync = deferred<LibrarySyncSettings | null>();
  const trustedLan = deferred<TrustedLanCompanionStatus | null>();
  const inventory = deferred<InventoryOverview>();
  const printers = deferred<PrinterOverviewRow[]>();
  const spools = deferred<SpoolWithMasterRow[]>();
  const loans = deferred<SpoolLoanDetailsRow[]>();
  const wishlist = deferred<WishlistItemRow[]>();
  const materials = deferred<MaterialUsageRow[]>();

  const resultPromise = loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: () => {
        bootstrapStarted.push("settings");
        return sync.promise;
      },
      loadTrustedLanStatus: () => {
        bootstrapStarted.push("trusted-lan");
        return trustedLan.promise;
      },
      loadInventoryOverview: () => {
        localStarted.push("overview");
        return inventory.promise;
      },
      listLocalPrinters: () => {
        localStarted.push("printers");
        return printers.promise;
      },
      loadSpoolRows: () => {
        localStarted.push("spools");
        return spools.promise;
      },
      listLocalLoans: () => {
        localStarted.push("loans");
        return loans.promise;
      },
      listLocalWishlist: () => {
        localStarted.push("wishlist");
        return wishlist.promise;
      },
      listLocalTopMaterials: () => {
        localStarted.push("materials");
        return materials.promise;
      },
    },
  );

  assert.deepEqual(bootstrapStarted.sort(), ["settings", "trusted-lan"]);
  assert.deepEqual(localStarted, []);

  sync.resolve(syncSettings());
  trustedLan.resolve(null);
  await flushPromiseContinuations();

  assert.deepEqual(localStarted.sort(), [
    "loans",
    "materials",
    "overview",
    "printers",
    "spools",
    "wishlist",
  ]);

  inventory.resolve(overview());
  printers.resolve([]);
  spools.resolve([]);
  loans.resolve([]);
  wishlist.resolve([]);
  materials.resolve([]);

  const result = await resultPromise;
  assert.equal(result.syncSource, "local");
  assert.equal(result.revisionPollComplete, true);
});

for (const scenario of [
  { description: "a slow host", interrupted: false },
  { description: "an interrupted host", interrupted: true },
] as const) {
  test(`dashboard client keeps one concurrent host wave for ${scenario.description}`, async () => {
    const started: string[] = [];
    const requests = {
      validation: deferred<LibrarySyncHostValidationResult>(),
      snapshot: deferred<LibrarySyncRemoteSnapshot>(),
      spools: deferred<SpoolWithMasterRow[]>(),
      printers: deferred<PrinterOverviewRow[]>(),
      loans: deferred<SpoolLoanDetailsRow[]>(),
      wishlist: deferred<WishlistItemRow[]>(),
    };
    const errors: unknown[] = [];
    let settled = false;

    const resultPromise = loadDashboardData(
      { previousClientHostNeedsRepair: false, t },
      {
        loadSyncSettings: async () =>
          syncSettings({
            mode: "CLIENT",
            host_base_url: "http://performance-host",
            host_device_name: "Cached performance host",
            client_auth_paired: true,
            cached_snapshot: hostSnapshot(),
          }),
        loadTrustedLanStatus: async () => null,
        validateHost: () => {
          started.push("validation");
          return requests.validation.promise;
        },
        fetchHostSnapshot: () => {
          started.push("snapshot");
          return requests.snapshot.promise;
        },
        loadSpoolRows: () => {
          started.push("spools");
          return requests.spools.promise;
        },
        fetchHostPrinterOverview: () => {
          started.push("printers");
          return requests.printers.promise;
        },
        fetchHostLoans: () => {
          started.push("loans");
          return requests.loans.promise;
        },
        fetchHostWishlist: () => {
          started.push("wishlist");
          return requests.wishlist.promise;
        },
        onLoadError: (error) => errors.push(error),
      },
    );
    void resultPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushPromiseContinuations();

    assert.deepEqual(started.sort(), [
      "loans",
      "printers",
      "snapshot",
      "spools",
      "validation",
      "wishlist",
    ]);

    if (scenario.interrupted) {
      for (const request of Object.values(requests)) {
        request.reject(new Error("host connection interrupted"));
      }
      const result = await resultPromise;
      assert.equal(result.syncSource, "client-cached");
      assert.equal(result.revisionPollComplete, false);
      assert.equal(errors.length, 6);
      return;
    }

    requests.validation.resolve(hostValidation());
    requests.spools.resolve([]);
    requests.printers.resolve([]);
    requests.loans.resolve([]);
    requests.wishlist.resolve([]);
    await flushPromiseContinuations();
    assert.equal(settled, false, "the deliberately slow request must still be pending");

    requests.snapshot.resolve(hostSnapshot());
    const result = await resultPromise;
    assert.equal(result.syncSource, "client-live");
    assert.equal(result.revisionPollComplete, true);
  });
}

test("10,000-spool fixture keeps transformation and render work bounded", () => {
  const sourceRows = Array.from(
    { length: TEN_THOUSAND_SPOOLS },
    (_, index) => largeSpoolFixtureRow(index),
  );
  const normalizedRows = normalizeSpoolWithMasterRows(sourceRows);
  const inventorySpools = normalizedRows.map(mapSpoolRowToInventorySpool);
  const filteredSpools = filterInventorySpools(inventorySpools, {
    search: "",
    statusFilter: "ALL",
    ownershipFilter: "ALL",
    materialFilter: "ALL",
    vendorFilter: "ALL",
    lowStockOnly: false,
  });
  const groupedSpools = groupInventorySpools(filteredSpools);
  const listWindow = buildInventoryCollectionWindow({
    filteredSpools,
    groupedSpools,
    inventoryView: "LIST",
    limit: INVENTORY_LIST_PAGE_SIZE,
  });
  const cardWindow = buildInventoryCollectionWindow({
    filteredSpools,
    groupedSpools,
    inventoryView: "CARDS",
    limit: INVENTORY_CARD_GROUP_PAGE_SIZE,
  });
  const derivedOverview = deriveInventoryOverviewFromRows(normalizedRows, []);
  const dashboard = buildDashboardDerivedState({
    overview: derivedOverview,
    printers: [],
    spoolRows: normalizedRows,
    loans: [],
    wishlist: [],
    materialRows: [],
    t,
  });

  assert.equal(normalizedRows.length, TEN_THOUSAND_SPOOLS);
  assert.equal(inventorySpools.length, TEN_THOUSAND_SPOOLS);
  assert.equal(filteredSpools.length, TEN_THOUSAND_SPOOLS);
  assert.ok(groupedSpools.length > INVENTORY_CARD_GROUP_PAGE_SIZE);
  assert.equal(buildVendorOptions(inventorySpools).length, 5);
  assert.equal(buildMaterialOptions(inventorySpools).length, 6);
  assert.equal(listWindow.filteredSpools.length, INVENTORY_LIST_PAGE_SIZE);
  assert.equal(listWindow.totalSpoolCount, TEN_THOUSAND_SPOOLS);
  assert.equal(listWindow.hasMore, true);
  assert.equal(cardWindow.groupedSpools.length, INVENTORY_CARD_GROUP_PAGE_SIZE);
  assert.equal(cardWindow.totalSpoolCount, TEN_THOUSAND_SPOOLS);
  assert.equal(cardWindow.hasMore, true);
  assert.equal(dashboard.goalMetrics.totalSpools, TEN_THOUSAND_SPOOLS);
  assert.equal(
    dashboard.stats.find((stat) => stat.id === "total")?.value,
    TEN_THOUSAND_SPOOLS.toString(),
  );

  const exactSearch = filterInventorySpools(inventorySpools, {
    search: "spool-009999",
    statusFilter: "ALL",
    ownershipFilter: "ALL",
    materialFilter: "ALL",
    vendorFilter: "ALL",
    lowStockOnly: false,
  });
  assert.deepEqual(exactSearch.map((spool) => spool.id), ["spool-009999"]);
});

test("dashboard navigation snapshot work stays independent of the spool count", () => {
  clearDashboardPageSnapshot();
  const snapshot: DashboardPageSnapshot = {
    activity: [],
    clientHostCompanionTone: "off",
    clientHostDisplayName: null,
    clientHostNeedsRepair: false,
    clientHostPaired: false,
    companionStatus: null,
    dashboardSyncMode: "STANDALONE",
    goalMetrics: {
      activeSpools: TEN_THOUSAND_SPOOLS,
      configuredPrinters: 2,
      loadedSlots: 4,
      placedActiveSpools: TEN_THOUSAND_SPOOLS,
      totalJobs: 500,
      totalSlots: 8,
      totalSpools: TEN_THOUSAND_SPOOLS,
    },
    health: {
      score: 90,
      headline: "Stable supply",
      detail: "Performance fixture",
      metrics: [],
    },
    lastSyncLabel: "Synced",
    locale: "en",
    ownershipLowStock: { owned: 100, borrowedIn: 10 },
    ownershipOnHand: {
      total: TEN_THOUSAND_SPOOLS,
      owned: 9_000,
      borrowedIn: 1_000,
      inUse: 250,
    },
    revisionSource: { kind: "local" },
    setupDataAvailable: true,
    stats: [
      {
        id: "total",
        title: "Total Spools",
        value: TEN_THOUSAND_SPOOLS.toString(),
        subtitle: "Across all locations",
        trend: "250 assigned",
        accent: "sky",
      },
    ],
    usagePoints: [10, 20, 30],
  };
  const generation = readDashboardPageSnapshotGeneration();
  assert.equal(
    writeDashboardPageSnapshot(
      snapshot,
      beginDashboardPageSnapshotRequest(generation),
    ),
    true,
  );

  for (let navigation = 0; navigation < 250; navigation += 1) {
    const restored = readDashboardPageSnapshot("en");
    assert.equal(restored?.goalMetrics.totalSpools, TEN_THOUSAND_SPOOLS);
    assert.equal(restored?.stats[0]?.value, "10000");
  }
  assert.equal(readDashboardPageSnapshot("nb"), null);
});
