import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsPageData, refreshLibrarySyncSnapshot } from "./settings_data_source";
import type {
  LibrarySyncSettings,
  LibrarySyncRemoteSnapshot,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterSettingsSnapshot,
  SpoolWithMasterRow,
} from "./tauri_client";

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

function printerSettingsSnapshot(printerId: string): PrinterSettingsSnapshot {
  return {
    active_printer_id: printerId,
    printers: [],
    printer_models: ["X1 Carbon"],
    bambu_live_integrations: [
      {
        printer_id: printerId,
        config: {
          enabled: true,
          host: "192.168.1.10",
          access_code_configured: true,
          printer_serial: null,
          tls_trust_state: "TRUSTED",
          tls_certificate_fingerprint: "SHA256:AA",
          last_error: null,
          observed_state: null,
        },
      },
    ],
  };
}

function spoolWithMasterRow(
  id: string,
  overrides: {
    spool?: Partial<SpoolWithMasterRow["spool"]>;
    master?: Partial<SpoolWithMasterRow["master"]>;
  } = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: "master-1",
      status: "available",
      initial_weight_g: 1000,
      current_weight_g: 900,
      ownership_type: "OWNED",
      ...overrides.spool,
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
      ...overrides.master,
    },
  };
}

function syncSettings(
  overrides: Partial<LibrarySyncSettings> = {},
): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "device",
    library_id: "library-local",
    client_auth_paired: false,
    ...overrides,
  };
}

const catalogRows: MasterCatalogRow[] = [];
const hostCatalogRows: MasterCatalogRow[] = [
  {
    id: "master-host",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Blue",
    hex_color: "#0000ff",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
  },
];
const localSpoolRows: SpoolWithMasterRow[] = [
  spoolWithMasterRow("spool-local", {
    spool: {
      ownership_type: "borrowed-in",
      status: "IN_USE",
    },
  }),
];
const hostSpoolRows: SpoolWithMasterRow[] = [
  spoolWithMasterRow("spool-host", {
    spool: {
      ownership_type: "OWNED",
      status: "loaned out",
    },
  }),
];
const cachedSpoolRows: SpoolWithMasterRow[] = [
  spoolWithMasterRow("spool-cache", {
    spool: {
      ownership_type: "borrowed in",
      status: "IN_USE",
    },
  }),
];

function remoteSnapshot(
  overrides: Partial<LibrarySyncRemoteSnapshot> = {},
): LibrarySyncRemoteSnapshot {
  return {
    captured_at: "2026-04-01 12:00:00",
    library_id: "library-host",
    device_name: "Host",
    sync_mode: "HOST",
    inventory: {
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
    },
    total_spools: 0,
    in_use: 0,
    low_stock: 0,
    active_loans: 0,
    wishlist_open: 0,
    printers: [],
    loans: [],
    wishlist: [],
    spools: [],
    ...overrides,
  };
}

test("loadSettingsPageData loads local settings overview and local spools", async () => {
  let roleResolved = false;
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => {
      assert.equal(roleResolved, true);
      return printerSettingsSnapshot("printer-local");
    },
    loadCatalogRows: async (options) => {
      assert.equal(options.limit, 5000);
      assert.equal(options.clientReadOnly, false);
      return catalogRows;
    },
    loadSyncSettings: async () => {
      roleResolved = true;
      return syncSettings();
    },
    loadSpoolRows: async (options, limit) => {
      assert.equal(options.clientReadOnly, false);
      assert.equal(limit, 1000);
      return localSpoolRows;
    },
    listLocalPrinterOverview: async () => [printerOverviewRow("printer-local")],
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-local"]);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-local"]);
  assert.equal(result.spoolRows[0]?.spool.status, "IN_USE");
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(result.spoolRows[0]?.spool.ownership_type, "BORROWED_IN");
  assert.equal(result.bambuLiveIntegrations["printer-local"]?.enabled, true);
  assert.equal(result.revisionPollComplete, true);
});

test("settings remain loadable for explicit recovery when the local low-stock policy is corrupt", async () => {
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => printerSettingsSnapshot("printer-local"),
    loadCatalogRows: async () => hostCatalogRows,
    loadSyncSettings: async () =>
      syncSettings({
        low_stock_policy: {
          default_threshold_g: 200,
          material_overrides: [],
        },
        low_stock_policy_valid: false,
      }),
    loadSpoolRows: async () => {
      throw new Error("corrupt low-stock policy");
    },
    listLocalPrinterOverview: async () => [printerOverviewRow("printer-local")],
  });

  assert.equal(result.syncSettings.low_stock_policy_valid, false);
  assert.deepEqual(result.catalogRows, hostCatalogRows);
  assert.deepEqual(result.spoolRows, []);
});

test("loadSettingsPageData prefers host overview, settings, and spools for clients", async () => {
  const freshHostSnapshot = remoteSnapshot({
    inventory: {
      ...remoteSnapshot().inventory,
      low_stock_policy: {
        default_threshold_g: 350,
        material_overrides: [],
      },
    },
  });
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => {
      throw new Error("local printer settings must not be read in client mode");
    },
    loadCatalogRows: async (options) => {
      assert.equal(options.clientReadOnly, true);
      assert.equal(options.clientHostBaseUrl, "http://host");
      assert.equal(options.clientLibraryId, "library-host");
      assert.equal(options.limit, 5000);
      return hostCatalogRows;
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: " http://host ",
        library_id: " library-host ",
        target_generation: 7,
      }),
    loadSpoolRows: async (options) => {
      assert.equal(options.clientTargetGeneration, 7);
      return options.clientReadOnly ? hostSpoolRows : localSpoolRows;
    },
    fetchHostPrinterOverview: async (baseUrl, libraryId) => {
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-host");
      return [printerOverviewRow("printer-host")];
    },
    fetchHostPrinterSettings: async (baseUrl, libraryId) => {
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-host");
      return printerSettingsSnapshot("printer-host");
    },
    refreshHostSnapshot: async (baseUrl, libraryId, targetGeneration) => {
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-host");
      assert.equal(targetGeneration, 7);
      return {
        snapshot: freshHostSnapshot,
        syncSettings: syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          library_id: "library-host",
          target_generation: 7,
          cached_snapshot: freshHostSnapshot,
        }),
      };
    },
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-host"]);
  assert.equal(result.catalogRows, hostCatalogRows);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-host"]);
  assert.equal(result.spoolRows[0]?.spool.status, "loaned out");
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "BORROWED");
  assert.equal(result.spoolRows[0]?.spool.ownership_type, "OWNED");
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
  assert.equal(result.librarySyncSnapshot?.inventory.low_stock_policy?.default_threshold_g, 350);
  assert.equal(result.revisionPollComplete, true);
});

test("loadSettingsPageData falls back to cached client printers and spools", async () => {
  const cachedSnapshot = remoteSnapshot({
    inventory: {
      ...remoteSnapshot().inventory,
      low_stock_policy: {
        default_threshold_g: 275,
        material_overrides: [],
      },
    },
  });
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => {
      throw new Error("local printer settings must not be read in client mode");
    },
    loadCatalogRows: async (options) => {
      assert.equal(options.clientReadOnly, true);
      return hostCatalogRows;
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        cached_snapshot: cachedSnapshot,
        cached_printers: {
          captured_at: "2026-04-01 11:00:00",
          rows: [printerOverviewRow("printer-cache")],
        },
        cached_spools: {
          captured_at: "2026-04-01 11:00:00",
          rows: cachedSpoolRows,
        },
      }),
    loadSpoolRows: async (options) => {
      assert.equal(options.clientReadOnly, true);
      throw new Error("host spools unavailable");
    },
    fetchHostPrinterOverview: async () => {
      throw new Error("host unavailable");
    },
    fetchHostPrinterSettings: async () => printerSettingsSnapshot("printer-host"),
    refreshHostSnapshot: async () => {
      throw new Error("host snapshot unavailable");
    },
    onHostLoadError: () => {},
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-cache"]);
  assert.equal(result.catalogRows, hostCatalogRows);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-cache"]);
  assert.equal(result.spoolRows[0]?.spool.status, "IN_USE");
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(result.spoolRows[0]?.spool.ownership_type, "BORROWED_IN");
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
  assert.equal(result.librarySyncSnapshot, cachedSnapshot);
  assert.equal(result.revisionPollComplete, false);
});

test("loadSettingsPageData avoids local spools and Bambu settings when client host details are incomplete", async () => {
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => {
      throw new Error("local printer settings must not be read in client mode");
    },
    loadCatalogRows: async () => {
      throw new Error("local catalog should not be loaded for incomplete client settings");
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: " ",
        library_id: "library-host",
        cached_printers: {
          captured_at: "2026-04-01 11:00:00",
          rows: [printerOverviewRow("printer-cache")],
        },
        cached_spools: {
          captured_at: "2026-04-01 11:00:00",
          rows: cachedSpoolRows,
        },
      }),
    loadSpoolRows: async () => {
      throw new Error("local spools should not be loaded for client settings");
    },
    fetchHostPrinterOverview: async () => {
      throw new Error("host should not be loaded without a complete target");
    },
    fetchHostPrinterSettings: async () => {
      throw new Error("host should not be loaded without a complete target");
    },
    refreshHostSnapshot: async () => {
      throw new Error("host snapshot should not be loaded without a complete target");
    },
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-cache"]);
  assert.deepEqual(result.catalogRows, []);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-cache"]);
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(result.spoolRows[0]?.spool.ownership_type, "BORROWED_IN");
  assert.deepEqual(result.bambuLiveIntegrations, {});
  assert.equal(result.revisionPollComplete, false);
});

test("loadSettingsPageData keeps fulfilled host client data without mixing local Bambu settings when the Host settings endpoint fails", async () => {
  const errors: unknown[] = [];
  const freshHostSnapshot = remoteSnapshot();

  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => {
      throw new Error("local printer settings must not be read in client mode");
    },
    loadCatalogRows: async (options) => {
      assert.equal(options.clientReadOnly, true);
      return hostCatalogRows;
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        cached_printers: {
          captured_at: "2026-04-01 11:00:00",
          rows: [printerOverviewRow("printer-cache")],
        },
      }),
    loadSpoolRows: async (options) =>
      options.clientReadOnly ? hostSpoolRows : localSpoolRows,
    fetchHostPrinterOverview: async () => [printerOverviewRow("printer-host")],
    fetchHostPrinterSettings: async () => {
      throw new Error("settings endpoint unavailable");
    },
    refreshHostSnapshot: async () => ({
      snapshot: freshHostSnapshot,
      syncSettings: syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        cached_snapshot: freshHostSnapshot,
      }),
    }),
    onHostLoadError: (error) => {
      errors.push(error);
    },
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-host"]);
  assert.equal(result.catalogRows, hostCatalogRows);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-host"]);
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "BORROWED");
  assert.deepEqual(result.bambuLiveIntegrations, {});
  assert.equal(errors.length, 1);
  assert.equal(result.revisionPollComplete, false);
});

test("refreshLibrarySyncSnapshot returns the freshly cached sync snapshot", async () => {
  const fetchedSnapshot = remoteSnapshot({ device_name: "Fetched" });
  const cachedSnapshot = remoteSnapshot({ device_name: "Cached" });

  const result = await refreshLibrarySyncSnapshot(" http://host ", " library-host ", 11, {
    fetchHostSnapshot: async (baseUrl, libraryId) => {
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-host");
      return fetchedSnapshot;
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        target_generation: 11,
        cached_snapshot: cachedSnapshot,
      }),
  });

  assert.equal(result.snapshot.device_name, "Cached");
  assert.equal(result.syncSettings.cached_snapshot, cachedSnapshot);
});

test("refreshLibrarySyncSnapshot falls back to the fetched snapshot before cache is updated", async () => {
  const fetchedSnapshot = remoteSnapshot({ device_name: "Fetched" });

  const result = await refreshLibrarySyncSnapshot("http://host", "library-host", undefined, {
    fetchHostSnapshot: async () => fetchedSnapshot,
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        cached_snapshot: null,
      }),
  });

  assert.equal(result.snapshot, fetchedSnapshot);
});

test("refreshLibrarySyncSnapshot ignores stale cached snapshots", async () => {
  const fetchedSnapshot = remoteSnapshot({
    captured_at: "2026-04-01 12:00:00",
    device_name: "Fetched",
  });
  const staleCachedSnapshot = remoteSnapshot({
    captured_at: "2026-04-01 11:00:00",
    device_name: "Stale Cached",
  });

  const result = await refreshLibrarySyncSnapshot("http://host", "library-host", undefined, {
    fetchHostSnapshot: async () => fetchedSnapshot,
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        cached_snapshot: staleCachedSnapshot,
      }),
  });

  assert.equal(result.snapshot, fetchedSnapshot);
  assert.equal(result.syncSettings.cached_snapshot, staleCachedSnapshot);
});

test("refreshLibrarySyncSnapshot rejects incomplete host targets before fetching", async () => {
  await assert.rejects(
    () =>
      refreshLibrarySyncSnapshot("http://host", " ", undefined, {
        fetchHostSnapshot: async () => remoteSnapshot(),
      }),
    /configured host and library id/,
  );
});

test("refreshLibrarySyncSnapshot rejects a response after the client target generation changes", async () => {
  const fetchedSnapshot = remoteSnapshot();

  await assert.rejects(
    () =>
      refreshLibrarySyncSnapshot("http://host", "library-host", 4, {
        fetchHostSnapshot: async () => fetchedSnapshot,
        loadSyncSettings: async () =>
          syncSettings({
            mode: "CLIENT",
            host_base_url: "http://host",
            library_id: "library-host",
            target_generation: 6,
            cached_snapshot: null,
          }),
      }),
    /connection changed/,
  );
});
