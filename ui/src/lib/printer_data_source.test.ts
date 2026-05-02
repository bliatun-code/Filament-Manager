import assert from "node:assert/strict";
import test from "node:test";

import { loadPrinterOverviewData } from "./printer_data_source";
import type { PrinterOverviewRow, PrinterSettingsSnapshot } from "./tauri_client";

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

function printerSettingsSnapshot(
  printerId: string,
  enabled = true,
): PrinterSettingsSnapshot {
  return {
    active_printer_id: printerId,
    printers: [],
    printer_models: ["X1 Carbon"],
    bambu_live_integrations: [
      {
        printer_id: printerId,
        config: {
          enabled,
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

test("loadPrinterOverviewData loads local overview and live integration settings", async () => {
  const result = await loadPrinterOverviewData(
    { clientReadOnly: false },
    {
      listLocalOverview: async () => [printerOverviewRow("printer-local")],
      loadLocalSettings: async () => printerSettingsSnapshot("printer-local"),
    },
  );

  assert.equal(result.source, "LIVE");
  assert.equal(result.updatedAt, null);
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-local"]);
  assert.equal(result.bambuLiveIntegrations["printer-local"]?.enabled, true);
});

test("loadPrinterOverviewData loads host overview without local live integrations", async () => {
  const result = await loadPrinterOverviewData(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      fetchCachedOverview: async () => ({
        captured_at: "2026-04-01 10:00:00",
        rows: [printerOverviewRow("printer-cache")],
      }),
    },
  );

  assert.equal(result.source, "LIVE");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-host"]);
  assert.deepEqual(result.bambuLiveIntegrations, {});
});

test("loadPrinterOverviewData falls back to cached host overview", async () => {
  const result = await loadPrinterOverviewData(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostOverview: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedOverview: async () => ({
        captured_at: "2026-04-01 11:00:00",
        rows: [printerOverviewRow("printer-cache")],
      }),
      onLoadError: () => {},
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "2026-04-01 11:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-cache"]);
  assert.deepEqual(result.bambuLiveIntegrations, {});
});

test("loadPrinterOverviewData reports offline when host and cache are unavailable", async () => {
  const result = await loadPrinterOverviewData(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostOverview: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedOverview: async () => null,
      onLoadError: () => {},
    },
  );

  assert.deepEqual(result, {
    printers: [],
    bambuLiveIntegrations: {},
    source: "OFFLINE",
    updatedAt: null,
  });
});
