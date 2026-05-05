import assert from "node:assert/strict";
import test from "node:test";

import {
  hasInvalidClientPairingMessage,
  loadDashboardData,
} from "./dashboard_data_source";
import type {
  InventoryOverview,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  PrinterOverviewRow,
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
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
});

test("loadDashboardData prefers live host data for paired clients", async () => {
  const result = await loadDashboardData(
    { previousClientHostNeedsRepair: false, t },
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          host_device_name: "Configured Host",
        }),
      loadTrustedLanStatus: async () => null,
      validateHost: async () => validation({ device_name: "Validated Host" }),
      fetchHostSnapshot: async () => snapshot("Live Host", { inventory: overview({ total_consumption_30d: 250 }) }),
      loadSpoolRows: async (options) => {
        assert.equal(options.clientReadOnly, true);
        assert.equal(options.clientHostBaseUrl, "http://host");
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
  assert.equal(result.clientHostCompanionTone, "live");
  assert.equal(result.clientHostDisplayName, "Live Host");
  assert.equal(result.capturedAt, "2026-04-01 10:00:00");
  assert.equal(result.derived.stats.find((stat) => stat.id === "activePrinters")?.value, "1");
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
      fetchHostWishlist: async () => [],
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
  assert.equal(errors.length, 2);
});
