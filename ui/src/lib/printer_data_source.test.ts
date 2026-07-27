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

function spoolRow(id: string, status = "IN_USE"): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: "master-1",
      status,
      ownership_type: "OWNED",
      initial_weight_g: 1000,
      remaining_g: 1000,
      spool_tare_weight_g: 250,
      location_id: null,
      rfid_tag: null,
    },
    master: {
      id: "master-1",
      vendor: "Bambu",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Gray",
      hex_color: "#808080",
      product_url: null,
      default_weight: 1000,
    },
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

test("loadPrinterOverviewData uses cached rows when client host target is incomplete", async () => {
  const result = await loadPrinterOverviewData(
    { clientReadOnly: true, clientHostBaseUrl: " ", clientLibraryId: "library-1" },
    {
      fetchHostOverview: async () => {
        throw new Error("host overview should not load without a complete target");
      },
      listLocalOverview: async () => {
        throw new Error("local overview should not load in client mode");
      },
      loadLocalSettings: async () => {
        throw new Error("local settings should not load in client mode");
      },
      fetchCachedOverview: async () => ({
        captured_at: "2026-04-01 12:00:00",
        rows: [printerOverviewRow("printer-cache")],
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "2026-04-01 12:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-cache"]);
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

test("loadPrinterPageData uses cached client data when host target is incomplete", async () => {
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "",
      clientLibraryId: "library-1",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("host overview should not load without a complete target");
      },
      fetchHostSettings: async () => {
        throw new Error("host settings should not load without a complete target");
      },
      loadHostSpools: async () => {
        throw new Error("host spools should not load without a complete target");
      },
      listLocalOverview: async () => {
        throw new Error("local overview should not load in client mode");
      },
      loadLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
      loadLocalSettings: async () => {
        throw new Error("local settings should not load in client mode");
      },
      fetchCachedOverview: async () => ({
        captured_at: "2026-04-01 12:00:00",
        rows: [printerOverviewRow("printer-cache")],
      }),
      fetchCachedSpools: async () => ({
        captured_at: "2026-04-01 12:05:00",
        rows: [spoolRow("cached-spool", "loaned out")],
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.revisionPollComplete, false);
  assert.equal(result.updatedAt, "2026-04-01 12:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-cache"]);
  assert.deepEqual(result.spools.map((entry) => entry.spool.id), ["cached-spool"]);
  assert.equal(result.spools[0]?.spool.normalized_status, "BORROWED");
  assert.deepEqual(result.bambuLiveIntegrations, {});
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
        assert.equal(limit, 1000);
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
  assert.equal(result.revisionPollComplete, false);
  assert.equal(result.updatedAt, "2026-04-01 11:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-cache"]);
  assert.deepEqual(result.spools.map((entry) => entry.spool.id), ["host-spool"]);
  assert.equal(result.spools[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(result.bambuLiveIntegrations["printer-host"]?.enabled, true);
  assert.equal(errors.length, 1);
});

test("loadPrinterPageData uses cached spool timestamp when spool data falls back", async () => {
  const errors: unknown[] = [];
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      loadHostSpools: async () => {
        throw new Error("spools unavailable");
      },
      fetchHostSettings: async () => printerSettingsSnapshot("printer-host"),
      fetchCachedOverview: async () => null,
      fetchCachedSpools: async () => ({
        captured_at: "2026-04-01 12:00:00",
        rows: [spoolRow("cached-spool")],
      }),
      onLoadError: (error) => {
        errors.push(error);
      },
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.revisionPollComplete, false);
  assert.equal(result.updatedAt, "2026-04-01 12:00:00");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-host"]);
  assert.deepEqual(result.spools.map((entry) => entry.spool.id), ["cached-spool"]);
  assert.equal(errors.length, 1);
});

test("loadPrinterPageData timestamps the cache piece actually used during partial fallback", async () => {
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      loadHostSpools: async () => {
        throw new Error("spools unavailable");
      },
      fetchHostSettings: async () => printerSettingsSnapshot("printer-host"),
      fetchCachedOverview: async () => ({
        captured_at: "printer-cache",
        rows: [printerOverviewRow("unused-printer-cache")],
      }),
      fetchCachedSpools: async () => ({
        captured_at: "spool-cache",
        rows: [spoolRow("cached-spool")],
      }),
      onLoadError: () => {},
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "spool-cache");
  assert.deepEqual(result.printers.map((entry) => entry.printer.id), ["printer-host"]);
  assert.deepEqual(result.spools.map((entry) => entry.spool.id), ["cached-spool"]);
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
    revisionPollComplete: false,
  });
});

test("loadPrinterPageData marks complete local and fully live host reads", async () => {
  const local = await loadPrinterPageData(
    {
      clientReadOnly: false,
      supportedPrinterModels: ["Generic"],
    },
    {
      listLocalOverview: async () => [printerOverviewRow("printer-local")],
      loadLocalSpools: async () => [spoolRow("spool-local")],
      loadLocalSettings: async () => printerSettingsSnapshot("printer-local"),
    },
  );
  assert.equal(local.revisionPollComplete, true);

  const host = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      loadHostSpools: async () => [spoolRow("spool-host")],
      fetchHostSettings: async () => printerSettingsSnapshot("printer-host"),
      fetchCachedOverview: async () => null,
      fetchCachedSpools: async () => null,
    },
  );
  assert.equal(host.revisionPollComplete, true);
});
