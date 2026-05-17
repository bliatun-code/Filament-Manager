import assert from "node:assert/strict";
import test from "node:test";

import { loadPrinterOverviewData, loadPrinterPageData } from "./printer_data_source";
import type { PrinterOverviewRow, PrinterSettingsSnapshot, SpoolWithMasterRow } from "./tauri_client";

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

function spoolRow(id: string): SpoolWithMasterRow {
  return {
    id,
    master_id: "master-1",
    vendor: "Bambu",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: "#808080",
    product_url: null,
    default_weight: 1000,
    remaining_weight: 1000,
    spool_weight: 1000,
    empty_spool_weight: 250,
    initial_weight: 1000,
    status: "AVAILABLE",
    location: null,
    owner_type: "OWNED",
    owner_name: null,
    external_owner: null,
    loaned_to: null,
    loaned_at: null,
    assigned_printer_id: null,
    assigned_slot_id: null,
    rfid_tag: null,
    created_at: "2026-04-01 10:00:00",
    updated_at: "2026-04-01 10:00:00",
  } as SpoolWithMasterRow;
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

test("loadPrinterPageData keeps fulfilled client spools when host overview fails", async () => {
  const errors: unknown[] = [];
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("overview unavailable");
      },
      loadHostSpools: async (options, limit, offset) => {
        assert.equal(options.clientHostBaseUrl, "http://host");
        assert.equal(options.clientLibraryId, "library-1");
        assert.equal(limit, 1200);
        assert.equal(offset, 0);
        return [spoolRow("host-spool")];
      },
      fetchHostSettings: async () => printerSettingsSnapshot("printer-host"),
      fetchCachedOverview: async () => ({
        captured_at: "2026-04-01 11:00:00",
        rows: [printerOverviewRow("printer-cache")],
      }),
      fetchCachedSpools: async () => null,
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "2026-04-01 11:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-cache"]);
  assert.deepEqual(result.spools.map((entry) => entry.id), ["host-spool"]);
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
  assert.equal(errors.length, 1);
});

test("loadPrinterPageData reports offline when host and cache are unavailable", async () => {
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("overview unavailable");
      },
      loadHostSpools: async () => {
        throw new Error("spools unavailable");
      },
      fetchHostSettings: async () => {
        throw new Error("settings unavailable");
      },
      fetchCachedOverview: async () => null,
      fetchCachedSpools: async () => null,
      onLoadError: () => {},
    },
  );

  assert.deepEqual(result, {
    printers: [],
    spools: [],
    bambuLiveIntegrations: {},
    printerModels: ["Generic"],
    source: "OFFLINE",
    updatedAt: null,
  });
});
