import assert from "node:assert/strict";
import test from "node:test";

import { assignedPrinterSpool, loadPrinterOverviewData, loadPrinterPageData } from "./printer_data_source";
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
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
    },
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
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
    },
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

test("loadPrinterOverviewData ignores unscoped cache when client host target is incomplete", async () => {
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

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.updatedAt, null);
  assert.deepEqual(result.printers, []);
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

test("loadPrinterPageData ignores unscoped cache when host target is incomplete", async () => {
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("host overview should not load without a complete target");
      },
      fetchHostSettings: async () => {
        throw new Error("host settings should not load without a complete target");
      },
      fetchHostSpoolSnapshot: async () => {
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

  assert.equal(result.source, "OFFLINE");
  assert.equal(result.revisionPollComplete, false);
  assert.equal(result.updatedAt, null);
  assert.deepEqual(result.printers, []);
  assert.deepEqual(result.spools, []);
  assert.deepEqual(result.bambuLiveIntegrations, {});
});

test("loadPrinterPageData keeps fulfilled client spools when host overview fails", async () => {
  const errors: unknown[] = [];
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      clientTargetGeneration: 7,
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("overview unavailable");
      },
      fetchHostSpoolSnapshot: async (url, library, generation) => {
        assert.deepEqual([url, library, generation], ["http://host", "library-1", 7]);
        return { rows: [spoolRow("host-spool")], captured_at: "live-spools" };
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
      clientTargetGeneration: 7,
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      fetchHostSpoolSnapshot: async () => {
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

test("loadPrinterPageData reports offline when host and cache are unavailable", async () => {
  const result = await loadPrinterPageData(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientTargetGeneration: 7,
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => {
        throw new Error("overview unavailable");
      },
      fetchHostSpoolSnapshot: async () => {
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
    spoolReadState: "unavailable",
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
      clientTargetGeneration: 7,
      supportedPrinterModels: ["Generic"],
    },
    {
      fetchHostOverview: async () => [printerOverviewRow("printer-host")],
      fetchHostSpoolSnapshot: async () => ({ rows: [spoolRow("spool-host")], captured_at: "saved" }),
      fetchHostSettings: async () => printerSettingsSnapshot("printer-host"),
      fetchCachedOverview: async () => null,
      fetchCachedSpools: async () => null,
    },
  );
  assert.equal(host.revisionPollComplete, true);
});

test("Client Printers reads only the failed domains from the original library's cache", async () => {
  const target = ["http://host", "library-1", 7] as const;
  for (const failed of [[], ["printers"], ["spools"], ["settings"], ["printers", "spools", "settings"]]) {
    const reads: Array<[string, ...unknown[]]> = [];
    const live = <T>(domain: string, value: T) =>
      failed.includes(domain) ? Promise.reject(new Error(domain)) : Promise.resolve(value);
    const result = await loadPrinterPageData({
      clientReadOnly: true, clientHostBaseUrl: target[0], clientLibraryId: target[1],
      clientTargetGeneration: target[2], supportedPrinterModels: ["Generic"],
    }, {
      fetchHostOverview: () => live("printers", [printerOverviewRow("live-printer")]),
      fetchHostSpoolSnapshot: (...args) => {
        reads.push(["snapshot", ...args]);
        return live("spools", { rows: [spoolRow("live-spool")], captured_at: "live-time" });
      },
      fetchHostSettings: () => live("settings", printerSettingsSnapshot("live-printer")),
      fetchCachedOverview: async (...args) => {
        reads.push(["printers", ...args]);
        return { rows: [printerOverviewRow("saved-printer")], captured_at: "printer-time" };
      },
      fetchCachedSpools: async (...args) => {
        reads.push(["spools", ...args]);
        return { rows: [spoolRow("saved-spool")], captured_at: "spool-time" };
      },
      onLoadError: () => {},
    });
    const cachedDomains = ["printers", "spools"].filter(domain => failed.includes(domain));
    assert.deepEqual(reads, ["snapshot", ...cachedDomains].map(domain => [domain, ...target]));
    assert.equal(result.source, cachedDomains.length ? "CACHED" : "LIVE");
    assert.equal(result.revisionPollComplete, failed.length === 0);
    assert.equal(result.printers[0].printer.id, failed.includes("printers") ? "saved-printer" : "live-printer");
    assert.equal(result.spools[0].spool.id, failed.includes("spools") ? "saved-spool" : "live-spool");
    assert.deepEqual(Object.keys(result.bambuLiveIntegrations), failed.includes("settings") ? [] : ["live-printer"]);
    assert.equal(result.updatedAt, failed.includes("printers") ? "printer-time" : failed.includes("spools") ? "spool-time" : "live-time");
  }
});

test("empty live and saved lists retain their source, including when a live cache write failed", async () => {
  const options = { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1",
    clientTargetGeneration: 7, supportedPrinterModels: ["Generic"] };
  for (const online of [true, false]) {
    const reads: string[] = [];
    const unavailable = () => Promise.reject(new Error("Host unavailable"));
    const result = await loadPrinterPageData(options, {
      fetchHostOverview: () => online ? Promise.resolve([]) : unavailable(),
      fetchHostSpoolSnapshot: () => online ? Promise.resolve({ rows: [], captured_at: null }) : unavailable(),
      fetchHostSettings: () => online ? Promise.resolve(printerSettingsSnapshot("host")) : unavailable(),
      fetchCachedOverview: async () => { reads.push("printers"); return { rows: [], captured_at: "saved" }; },
      fetchCachedSpools: async () => { reads.push("spools"); return { rows: [], captured_at: "saved" }; },
      onLoadError: () => {},
    });
    assert.deepEqual(reads, online ? [] : ["printers", "spools"]);
    assert.deepEqual(result.spools, []);
    assert.deepEqual(result.printers, []);
    assert.equal(result.source, online ? "LIVE" : "CACHED");
    assert.equal(result.updatedAt, online ? null : "saved");
  }
});

test("the overview defers inventory until a slot, a live observation or the picker needs it", async () => {
  for (const clientReadOnly of [false, true]) {
    for (const scenario of ["empty", "legacy assignment", "manual assignment", "mixed capability", "assigned live", "live", "overview RFID", "picker"]) {
      const printer = printerOverviewRow("printer-a");
      printer.slots.push({
        slot_id: "slot-1", ams_id: "printer-a_ams_1", slot_index: 1,
        spool_id: ["legacy assignment", "manual assignment", "mixed capability", "assigned live"].includes(scenario) ? "roll" : null,
        spool_status: "IN_USE", spool_ownership_type: "BORROWED_IN", spool_owner_name: "Ada",
        spool_material: "PLA", spool_filament_name: "Basic", spool_color_name: "Red", spool_remaining_g: 312,
        assigned_spool_details: scenario === "legacy assignment" ? undefined : {
          master_id: "master", vendor: "eSUN", default_weight: 1000, initial_weight_g: 800,
          spool_tare_weight_g: 147, low_stock_threshold_g: 340,
        },
        live_observed_rfid_tag: scenario === "overview RFID" ? "RFID" : null,
      });
      if (scenario === "mixed capability") printer.slots.push({
        slot_id: "other", ams_id: "printer-a_ams_1", slot_index: 2, spool_id: "legacy",
      });
      const settings = printerSettingsSnapshot("printer-a");
      if (scenario === "live" || scenario === "assigned live") settings.bambu_live_integrations[0].config.observed_state = {
        online: true, mqtt_connected: true, trays: [{ tray_index: 0, loaded: true, tray_uuid: "RFID" }],
      };
      let reads = 0;
      const rows = () => { reads++; return [spoolRow("roll")]; };
      const result = await loadPrinterPageData({
        clientReadOnly, clientHostBaseUrl: "http://host", clientLibraryId: "library-a",
        clientTargetGeneration: 7, supportedPrinterModels: [], deferUnusedSpools: scenario !== "picker",
      }, {
        listLocalOverview: async () => [printer], loadLocalSettings: async () => settings,
        loadLocalSpools: async () => rows(), fetchHostOverview: async () => [printer],
        fetchHostSettings: async () => settings,
        fetchHostSpoolSnapshot: async (...target) => {
          assert.deepEqual(target, ["http://host", "library-a", 7]);
          return { rows: rows(), captured_at: "fresh" };
        },
      });
      const needsRows = !["empty", "manual assignment"].includes(scenario) && (scenario !== "overview RFID" || clientReadOnly);
      assert.equal(reads, Number(needsRows), scenario);
      assert.equal(result.spoolReadState, needsRows ? "available" : "deferred");
      if (scenario === "manual assignment") {
        assert.deepEqual(result.spools, []); // The picker and inventory matcher need a complete inventory.
        const assigned = assignedPrinterSpool(result.printers[0].slots[0]);
        assert.ok(assigned);
        assert.equal(assigned.spool.normalized_status, "ASSIGNED");
        assert.equal(assigned.spool.owner_name, "Ada");
        assert.equal(assigned.spool.ownership_type, "BORROWED_IN");
        assert.equal(assigned.low_stock_threshold_g, 340);
      }
      assert.equal(result.source, "LIVE");
      assert.equal(result.revisionPollComplete, true);
    }
  }
});

test("deferred overview reads keep partial Host data and distinguish an empty offline copy from a missing one", async () => {
  const target = ["http://host", "library-a", 9] as const;
  for (const failedDomain of ["overview", "settings", "both"]) {
    for (const saved of [true, false]) {
      const reads: Array<[string, ...unknown[]]> = [];
      const printer = printerOverviewRow("printer-a");
      const unavailable = () => Promise.reject(new Error("Host unavailable"));
      const data = await loadPrinterPageData({
        clientReadOnly: true, clientHostBaseUrl: target[0], clientLibraryId: target[1],
        clientTargetGeneration: target[2], supportedPrinterModels: [], deferUnusedSpools: true,
      }, {
        fetchHostOverview: () => failedDomain === "settings" ? Promise.resolve([printer]) : unavailable(),
        fetchHostSettings: () => failedDomain === "overview" ? Promise.resolve(printerSettingsSnapshot("printer-a")) : unavailable(),
        fetchHostSpoolSnapshot: (...args) => { reads.push(["live spools", ...args]); return unavailable(); },
        fetchCachedSpools: async (...args) => {
          reads.push(["saved spools", ...args]);
          return saved ? { rows: [], captured_at: "saved" } : null;
        },
        fetchCachedOverview: async (...args) => {
          reads.push(["saved printers", ...args]);
          return { rows: [printer], captured_at: "saved" };
        },
        onLoadError: () => {},
      });
      assert.deepEqual(reads, [
        ["live spools", ...target],
        ...(failedDomain === "settings" ? [] : [["saved printers", ...target]]),
        ["saved spools", ...target],
      ]);
      assert.deepEqual(data.printers, [printer]);
      assert.equal(data.spoolReadState, saved ? "available" : "unavailable");
      assert.equal(data.source, "CACHED");
      assert.equal(data.revisionPollComplete, false);
    }
  }
});
