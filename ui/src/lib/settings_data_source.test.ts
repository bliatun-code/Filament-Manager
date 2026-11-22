import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsPageData, refreshLibrarySyncSnapshot, settingsAfterHostCheck } from "./settings_data_source";
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

const pairedSettings = syncSettings({
  mode: "CLIENT", host_base_url: "http://host", library_id: "library-host", target_generation: 7,
});

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
  assert.equal(result.catalogRowsAvailable, true);
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
    fetchHostSnapshot: async (baseUrl, libraryId) => {
      assert.equal(baseUrl, "http://host");
      assert.equal(libraryId, "library-host");
      return freshHostSnapshot;
    },
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-host"]);
  assert.equal(result.catalogRows, hostCatalogRows);
  assert.deepEqual(result.spoolRows.map((row) => row.spool.id), ["spool-host"]);
  assert.equal(result.spoolRows[0]?.spool.status, "loaned out");
  assert.equal(result.spoolRows[0]?.spool.normalized_status, "BORROWED");
  assert.equal(result.spoolRows[0]?.spool.ownership_type, "OWNED");
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
  assert.equal(result.catalogRowsAvailable, true);
  assert.equal(result.librarySyncSnapshot?.inventory.low_stock_policy?.default_threshold_g, 350);
  assert.equal(result.revisionPollComplete, true);
});

test("client settings distinguish an authoritative empty catalog from an unavailable catalog read", async () => {
  const freshHostSnapshot = remoteSnapshot();
  const dependencies = {
    loadPrinterSettings: async () => {
      throw new Error("local printer settings must not be read in client mode");
    },
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
        target_generation: 7,
      }),
    loadSpoolRows: async () => hostSpoolRows,
    fetchHostPrinterOverview: async () => [printerOverviewRow("printer-host")],
    fetchHostPrinterSettings: async () => printerSettingsSnapshot("printer-host"),
    fetchHostSnapshot: async () => freshHostSnapshot,
    onHostLoadError: () => {},
  };

  const authoritativeEmpty = await loadSettingsPageData({
    ...dependencies,
    loadCatalogRows: async () => [],
  });
  assert.deepEqual(authoritativeEmpty.catalogRows, []);
  assert.equal(authoritativeEmpty.catalogRowsAvailable, true);
  assert.equal(authoritativeEmpty.revisionPollComplete, true);

  const unavailable = await loadSettingsPageData({
    ...dependencies,
    loadCatalogRows: async () => {
      throw new Error("catalog read timed out");
    },
  });
  assert.deepEqual(unavailable.catalogRows, []);
  assert.equal(unavailable.catalogRowsAvailable, false);
  assert.equal(unavailable.revisionPollComplete, false);
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
    fetchHostSnapshot: async () => {
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
  assert.equal(result.catalogRowsAvailable, true);
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
    fetchHostSnapshot: async () => {
      throw new Error("host snapshot should not be loaded without a complete target");
    },
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-cache"]);
  assert.deepEqual(result.catalogRows, []);
  assert.equal(result.catalogRowsAvailable, false);
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
    fetchHostSnapshot: async () => freshHostSnapshot,
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

test("manual refresh returns the committed Host snapshot and reloads metadata only", async () => {
  const snapshot = remoteSnapshot();
  const current = syncSettings({ mode: "CLIENT", host_base_url: "http://host", library_id: snapshot.library_id, target_generation: 11 });
  const result = await refreshLibrarySyncSnapshot(" http://host ", " library-host ", 11, {
    fetchHostSnapshot: async (url, library) => {
      assert.equal(url, "http://host");
      assert.equal(library, snapshot.library_id);
      return snapshot;
    },
    loadSyncSettings: async domains => {
      assert.deepEqual(domains, []);
      return current;
    },
  });
  assert.ok(result.ok);
  assert.equal(result.snapshot, snapshot);
  assert.equal(result.syncSettings.cached_snapshot, snapshot);
});

test("manual refresh retains the same Host summary and reports a failed snapshot request", async () => {
  const cached = remoteSnapshot();
  const failure = new Error("summary endpoint unavailable");
  for (const saved of [cached, null]) {
    const result = await refreshLibrarySyncSnapshot("http://host", cached.library_id, 7, {
      fetchHostSnapshot: async () => { throw failure; },
      loadSyncSettings: async (domains, generation) => {
        assert.deepEqual(domains, ["snapshot"]);
        assert.equal(generation, 7);
        return { ...pairedSettings, cached_snapshot: saved };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.snapshot, saved);
    assert.equal(result.syncSettings.cached_snapshot, saved);
    assert.equal(result.error, failure);
  }
});

test("snapshot refresh accepts a newer saved summary only from the same library", async () => {
  const fetched = remoteSnapshot();
  for (const [saved, expected] of [
    [remoteSnapshot({ captured_at: "2026-04-01 12:01:00", device_name: "Newer" }), "Newer"],
    [remoteSnapshot({ captured_at: "2026-04-01 11:59:00", device_name: "Older" }), fetched.device_name],
    [remoteSnapshot({ captured_at: "2026-04-01 12:01:00", library_id: "other" }), fetched.device_name],
  ] as const) {
    const result = await refreshLibrarySyncSnapshot("http://host", fetched.library_id, 7, {
      fetchHostSnapshot: async () => fetched,
      loadSyncSettings: async (domains, generation, capturedAt) => {
        assert.deepEqual(domains, []);
        assert.equal(generation, 7);
        assert.equal(capturedAt, fetched.captured_at);
        return { ...pairedSettings, cached_snapshot: saved };
      },
    });
    assert.ok(result.ok);
    assert.equal(result.snapshot.device_name, expected);
    assert.equal(result.syncSettings.cached_snapshot, result.snapshot);
  }
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

test("Settings requests only failed cache domains, including a disconnected Host", async () => {
  const cachedSummary = remoteSnapshot({ device_name: "cached" });
  const liveSummary = remoteSnapshot({ device_name: "live" });
  for (const failed of [[], ["printers"], ["spools"], ["snapshot"], ["catalog", "printerSettings"],
    ["catalog", "printerSettings", "printers", "spools", "snapshot"]]) {
    const calls: string[][] = [];
    const read = async <T,>(domain: string, live: T) => {
      if (failed.includes(domain)) throw new Error(domain);
      return live;
    };
    const result = await loadSettingsPageData({
      loadSyncSettings: async (domains, generation, fetchedAt) => {
        assert.ok(domains);
        calls.push([...domains]);
        if (calls.length === 2) {
          assert.equal(generation, 7);
          assert.equal(fetchedAt, failed.includes("snapshot") ? undefined : liveSummary.captured_at);
        }
        return {
          ...pairedSettings,
          cached_printers: domains.includes("printers")
            ? { captured_at: "saved", rows: [printerOverviewRow("cached")] } : null,
          cached_spools: domains.includes("spools") ? { captured_at: "saved", rows: cachedSpoolRows } : null,
          cached_snapshot: domains.includes("snapshot") ? cachedSummary : null,
        };
      },
      loadCatalogRows: () => read("catalog", hostCatalogRows),
      fetchHostPrinterSettings: () => read("printerSettings", printerSettingsSnapshot("live")),
      fetchHostPrinterOverview: () => read("printers", [printerOverviewRow("live")]),
      loadSpoolRows: () => read("spools", hostSpoolRows),
      fetchHostSnapshot: () => read("snapshot", liveSummary),
      onHostLoadError: () => {},
    });
    assert.deepEqual(calls, [[], ["printers", "spools", "snapshot"].filter(d => failed.includes(d))]);
    assert.equal(result.overviewRows[0].printer.id, failed.includes("printers") ? "cached" : "live");
    assert.equal(result.spoolRows[0].spool.id, failed.includes("spools") ? "spool-cache" : "spool-host");
    assert.equal(result.librarySyncSnapshot, failed.includes("snapshot") ? cachedSummary : liveSummary);
    assert.equal(result.syncSettings.cached_snapshot, result.librarySyncSnapshot);
    assert.equal(result.catalogRowsAvailable, !failed.includes("catalog"));
    assert.equal(Boolean(result.bambuLiveIntegrations.live), !failed.includes("printerSettings"));
    assert.equal(result.revisionPollComplete, failed.length === 0);
  }
});

test("Settings discards all old results on a Host, library or generation switch during refresh", async () => {
  for (const replacement of [
    { ...pairedSettings, host_base_url: "http://new-host", target_generation: 8 },
    { ...pairedSettings, library_id: "new-library", target_generation: 8 },
    { ...pairedSettings, target_generation: 9 }, // switch away and back
  ]) {
    let current = pairedSettings;
    const requests: string[][] = [];
    const result = await loadSettingsPageData({
      loadSyncSettings: async (domains, generation) => {
        assert.ok(domains);
        requests.push([...domains]);
        if (generation === 7) current = replacement; // while waiting for the failed spool read's fallback
        return current;
      },
      loadCatalogRows: async () => [{ ...hostCatalogRows[0], id: "catalog-" + current.target_generation }],
      fetchHostPrinterOverview: async () => [printerOverviewRow("printer-" + current.target_generation)],
      fetchHostPrinterSettings: async () => printerSettingsSnapshot("config-" + current.target_generation),
      loadSpoolRows: async options => {
        if (options.clientTargetGeneration === 7) throw new Error("old Host disconnected");
        return [spoolWithMasterRow("replacement")];
      },
      fetchHostSnapshot: async () => remoteSnapshot({ library_id: current.library_id, device_name: "summary-" + current.target_generation }),
      onHostLoadError: () => {},
    });
    assert.deepEqual(requests, [[], ["spools"], []]);
    assert.equal(result.catalogRows[0].id, "catalog-" + replacement.target_generation);
    assert.equal(result.overviewRows[0].printer.id, "printer-" + replacement.target_generation);
    assert.deepEqual(Object.keys(result.bambuLiveIntegrations), ["config-" + replacement.target_generation]);
    assert.equal(result.librarySyncSnapshot?.device_name, "summary-" + replacement.target_generation);
    assert.equal(result.spoolRows[0].spool.id, "replacement");
    assert.equal(result.syncSettings.target_generation, replacement.target_generation);
    assert.ok(result.revisionPollComplete);
  }
});

test("Host checks reuse the visible summary on success and read only the saved summary on failure", async () => {
  const snapshot = remoteSnapshot();
  const previous = { ...pairedSettings, cached_snapshot: snapshot };
  for (const succeeded of [true, false]) {
    const current = await settingsAfterHostCheck(previous, succeeded, async (domains, generation) => {
      assert.deepEqual(domains, succeeded ? [] : ["snapshot"]);
      assert.equal(generation, 7);
      return succeeded ? pairedSettings : previous;
    });
    assert.equal(current.cached_snapshot, snapshot);
  }
  await assert.rejects(() => settingsAfterHostCheck(previous, false,
    async () => ({ ...pairedSettings, target_generation: 9 })), /connection changed/);
});

test("overlapping successful Host switches publish only the latest identity", async () => {
  let generation = 7;
  const result = await loadSettingsPageData({
    loadSyncSettings: async domains => {
      assert.deepEqual(domains, []);
      return { ...pairedSettings, target_generation: generation++ };
    },
    loadCatalogRows: async () => hostCatalogRows,
    loadSpoolRows: async () => hostSpoolRows,
    fetchHostPrinterSettings: async () => printerSettingsSnapshot("old"),
    fetchHostPrinterOverview: async () => [printerOverviewRow("old")],
    fetchHostSnapshot: async () => remoteSnapshot(),
  });
  assert.equal(result.syncSettings.target_generation, 9);
  assert.equal(result.syncSettings.cached_snapshot, null);
  assert.equal(result.librarySyncSnapshot, null);
  assert.deepEqual(result.catalogRows, []);
  assert.deepEqual(result.spoolRows, []);
  assert.deepEqual(result.overviewRows, []);
  assert.deepEqual(result.bambuLiveIntegrations, {});
  assert.equal(result.revisionPollComplete, false);
});
