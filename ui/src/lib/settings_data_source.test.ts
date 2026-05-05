import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsPageData } from "./settings_data_source";
import type {
  LibrarySyncSettings,
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
          access_code: null,
          printer_serial: null,
          last_error: null,
          observed_state: null,
        },
      },
    ],
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
const localSpoolRows: SpoolWithMasterRow[] = [];
const hostSpoolRows: SpoolWithMasterRow[] = [];

test("loadSettingsPageData loads local settings overview and local spools", async () => {
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => printerSettingsSnapshot("printer-local"),
    loadCatalogRows: async (limit) => {
      assert.equal(limit, 5000);
      return catalogRows;
    },
    loadSyncSettings: async () => syncSettings(),
    loadSpoolRows: async (options, limit) => {
      assert.equal(options.clientReadOnly, false);
      assert.equal(limit, 5000);
      return localSpoolRows;
    },
    listLocalPrinterOverview: async () => [printerOverviewRow("printer-local")],
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-local"]);
  assert.equal(result.spoolRows, localSpoolRows);
  assert.equal(result.bambuLiveIntegrations["printer-local"]?.enabled, true);
});

test("loadSettingsPageData prefers host overview, settings, and spools for clients", async () => {
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => printerSettingsSnapshot("printer-local"),
    loadCatalogRows: async () => catalogRows,
    loadSyncSettings: async () =>
      syncSettings({
        mode: "CLIENT",
        host_base_url: "http://host",
        library_id: "library-host",
      }),
    loadSpoolRows: async (options) =>
      options.clientReadOnly ? hostSpoolRows : localSpoolRows,
    fetchHostPrinterOverview: async () => [printerOverviewRow("printer-host")],
    fetchHostPrinterSettings: async () => printerSettingsSnapshot("printer-host"),
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-host"]);
  assert.equal(result.spoolRows, hostSpoolRows);
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
});

test("loadSettingsPageData falls back to cached client printers and local spools", async () => {
  const result = await loadSettingsPageData({
    loadPrinterSettings: async () => printerSettingsSnapshot("printer-local"),
    loadCatalogRows: async () => catalogRows,
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
    loadSpoolRows: async () => localSpoolRows,
    fetchHostPrinterOverview: async () => {
      throw new Error("host unavailable");
    },
    fetchHostPrinterSettings: async () => printerSettingsSnapshot("printer-host"),
    onHostLoadError: () => {},
  });

  assert.deepEqual(result.overviewRows.map((row) => row.printer.id), ["printer-cache"]);
  assert.equal(result.spoolRows, localSpoolRows);
  assert.equal(result.bambuLiveIntegrations["printer-local"]?.enabled, true);
});
