import assert from "node:assert/strict";
import test from "node:test";

import {
  beginDashboardPageSnapshotRequest,
  clearDashboardPageSnapshot,
  readDashboardPageSnapshot,
  readDashboardPageSnapshotGeneration,
  type DashboardPageSnapshot,
  updateDashboardPageSnapshot,
  writeDashboardPageSnapshot,
} from "./dashboard_page_snapshot_cache";

function populatedSnapshot(): DashboardPageSnapshot {
  return {
    printerOverview: [],
    printerOverviewAvailable: true,
    bambuLiveIntegrations: [],
    lowStockPreview: [],
    lowStockPreviewAvailable: true,
    syncSource: "local",
    activity: [
      {
        id: "loan-return",
        title: "Returned",
        detail: "Matte Black",
        tone: "emerald",
      },
    ],
    actionItems: [
      {
        age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
        id: "bambu-trust:printer-1",
        kind: "BAMBU_TRUST",
        printerId: "printer-1",
        printerName: "Workshop X1C",
        trustState: "UNPAIRED",
      },
    ],
    bambuLiveAttention: [
      {
        printerId: "printer-1",
        printerName: "Workshop X1C",
        trustState: "UNPAIRED",
      },
    ],
    clientHostCompanionTone: "live",
    clientHostDisplayName: "Workshop",
    clientHostNeedsRepair: false,
    clientHostPaired: true,
    companionStatus: {
      api_version: "1",
      auth_mode: "trusted-lan",
      enabled: true,
      listen_port: 4278,
      running: true,
      shell_reachable: true,
      local_name_running: true,
    },
    dashboardSyncMode: "STANDALONE",
    goalMetrics: {
      activeSpools: 8,
      configuredPrinters: 2,
      loadedSlots: 4,
      placedActiveSpools: 7,
      totalJobs: 50,
      totalSlots: 9,
      totalSpools: 6,
    },
    health: {
      score: 92,
      headline: "Healthy",
      detail: "Most active rolls are placed.",
      metrics: [
        {
          id: "loaded",
          label: "slots loaded",
          tone: "emerald",
          value: "4",
        },
      ],
    },
    lastSyncLabel: "Synced 12:34",
    libraryId: "library-local",
    locale: "en",
    ownershipLowStock: {
      borrowedIn: 1,
      owned: 2,
    },
    ownershipOnHand: {
      borrowedIn: 2,
      inUse: 4,
      owned: 4,
      total: 6,
    },
    revisionSource: {
      kind: "local",
    },
    setupDataAvailable: true,
    stats: [
      {
        accent: "sky",
        id: "total",
        subtitle: "Across all locations",
        title: "Total Spools",
        trend: "+2",
        value: "6",
      },
    ],
    usageMonths: [
      { month: "2026-06", usedGrams: 120 },
      { month: "2026-07", usedGrams: 160 },
      { month: "2026-08", usedGrams: 140 },
    ],
    usageAvailable: true,
    usageTotal12m: 420,
  };
}

test("dashboard snapshot restores the complete last-good view for the same locale", () => {
  clearDashboardPageSnapshot();
  const snapshot = populatedSnapshot();
  writeDashboardPageSnapshot(snapshot);

  const restored = readDashboardPageSnapshot("en");

  assert.deepEqual(restored, snapshot);
  assert.equal(restored?.setupDataAvailable, true);
  assert.equal(restored?.stats[0]?.value, "6");
  assert.equal(restored?.activity[0]?.title, "Returned");
  assert.deepEqual(restored?.usageMonths, [
    { month: "2026-06", usedGrams: 120 },
    { month: "2026-07", usedGrams: 160 },
    { month: "2026-08", usedGrams: 140 },
  ]);
  assert.equal(restored?.usageAvailable, true);
  assert.equal(restored?.usageTotal12m, 420);
  assert.equal(restored?.ownershipOnHand.total, 6);
  assert.equal(restored?.health.score, 92);
  assert.equal(restored?.clientHostDisplayName, "Workshop");
  assert.equal(restored?.libraryId, "library-local");
  assert.equal(restored?.actionItems?.[0]?.id, "bambu-trust:printer-1");
  assert.equal(restored?.bambuLiveAttention?.[0]?.printerId, "printer-1");
});

test("dashboard snapshot safely upgrades an older cached view without annual usage fields", () => {
  clearDashboardPageSnapshot();
  const legacySnapshot = populatedSnapshot() as DashboardPageSnapshot &
    Record<string, unknown>;
  delete legacySnapshot.usageMonths;
  delete legacySnapshot.usageTotal12m;
  delete legacySnapshot.usageAvailable;
  delete legacySnapshot.actionItems;
  delete legacySnapshot.libraryId;
  delete legacySnapshot.printerOverview;
  delete legacySnapshot.printerOverviewAvailable;
  delete legacySnapshot.bambuLiveIntegrations;
  delete legacySnapshot.lowStockPreview;
  delete legacySnapshot.lowStockPreviewAvailable;
  delete legacySnapshot.syncSource;

  writeDashboardPageSnapshot(legacySnapshot);

  const restored = readDashboardPageSnapshot("en");
  assert.deepEqual(restored?.usageMonths, []);
  assert.equal(restored?.usageAvailable, false);
  assert.equal(restored?.usageTotal12m, 0);
  assert.deepEqual(restored?.actionItems, []);
  assert.equal(restored?.libraryId, null);
  assert.deepEqual(restored?.printerOverview, []);
  assert.equal(restored?.printerOverviewAvailable, false);
  assert.deepEqual(restored?.bambuLiveIntegrations, []);
  assert.deepEqual(restored?.lowStockPreview, []);
  assert.equal(restored?.lowStockPreviewAvailable, false);
  assert.equal(restored?.syncSource, "local");
});

test("dashboard overview cache isolates nested printer rows, live observations and preview data", () => {
  clearDashboardPageSnapshot();
  const snapshot = populatedSnapshot();
  snapshot.printerOverview = [{ printer: { id: "bambu", name: "Atlas", model: "Bambu Lab P1S", created_at: "", updated_at: "" }, usage: { total_jobs: 1, successful_jobs: 1, failed_jobs: 0, total_used_g: 30 }, slots: [{ slot_id: "slot", ams_id: "ams", slot_index: 1, spool_id: "spool", spool_hex_color: "#2563EB" }] }];
  snapshot.bambuLiveIntegrations = [{ printer_id: "bambu", config: { enabled: true, host: "private-host", printer_serial: "private-serial", tls_certificate_fingerprint: "private-fingerprint", access_code_configured: true, tls_trust_state: "TRUSTED", observed_state: { online: true, mqtt_connected: true, gcode_state: "PAUSE", last_seen_at: "2026-10-17T12:00:00Z", raw_payload_json: { private: true }, trays: [{ loaded: true, tray_index: 1, color_hex: "#2563EB" }] } } }];
  snapshot.lowStockPreview = [{ spoolId: "spool", vendor: "Bambu", material: "PLA", filamentName: "Basic", colorName: "Blue", hexColor: "#2563EB", remainingG: 100, locationLabel: "Shelf A" }];
  writeDashboardPageSnapshot(snapshot);
  snapshot.printerOverview[0].slots[0].spool_hex_color = "#000000";
  snapshot.bambuLiveIntegrations[0].config.observed_state!.gcode_state = "RUNNING";
  snapshot.lowStockPreview[0].remainingG = 999;
  const restored = readDashboardPageSnapshot("en")!;
  assert.equal(restored.printerOverview![0].slots[0].spool_hex_color, "#2563EB");
  assert.equal(restored.bambuLiveIntegrations![0].config.observed_state!.gcode_state, "PAUSE");
  assert.equal(restored.lowStockPreview![0].remainingG, 100);
  const serialized = JSON.stringify(restored.bambuLiveIntegrations);
  assert.doesNotMatch(serialized, /private-host|private-serial|private-fingerprint|raw_payload_json|access_code_configured/);
  assert.deepEqual(restored.bambuLiveIntegrations![0].config.observed_state!.trays, []);
  restored.printerOverview![0].usage.total_jobs = 999;
  restored.bambuLiveIntegrations![0].config.observed_state!.gcode_state = "IDLE";
  restored.lowStockPreview![0].hexColor = "#000000";
  const reread = readDashboardPageSnapshot("en")!;
  assert.equal(reread.printerOverview![0].usage.total_jobs, 1);
  assert.equal(reread.bambuLiveIntegrations![0].config.observed_state!.gcode_state, "PAUSE");
  assert.equal(reread.lowStockPreview![0].hexColor, "#2563EB");
});

test("legacy client snapshots default to saved host setup without borrowing local live status", () => {
  clearDashboardPageSnapshot();
  const snapshot = populatedSnapshot();
  snapshot.dashboardSyncMode = "CLIENT";
  delete snapshot.syncSource;
  writeDashboardPageSnapshot(snapshot);
  assert.equal(readDashboardPageSnapshot("en")?.syncSource, "client-cached");
});

test("dashboard snapshot is locale-keyed and isolated from caller mutation", () => {
  clearDashboardPageSnapshot();
  const snapshot = populatedSnapshot();
  writeDashboardPageSnapshot(snapshot);

  snapshot.stats[0]!.value = "999";
  const restored = readDashboardPageSnapshot("en");
  restored!.activity[0]!.title = "Changed";

  assert.equal(readDashboardPageSnapshot("nb"), null);
  assert.equal(restored?.stats[0]?.value, "6");
  assert.equal(
    readDashboardPageSnapshot("en")?.activity[0]?.title,
    "Returned",
  );
});

test("dashboard snapshot rejects an in-flight write after its library is invalidated", () => {
  clearDashboardPageSnapshot();
  const request = beginDashboardPageSnapshotRequest(
    readDashboardPageSnapshotGeneration(),
  );

  clearDashboardPageSnapshot();

  assert.equal(
    writeDashboardPageSnapshot(populatedSnapshot(), request),
    false,
  );
  assert.equal(readDashboardPageSnapshot("en"), null);
});

test("dashboard snapshot rejects an older request that completes after a newer request", () => {
  clearDashboardPageSnapshot();
  const generation = readDashboardPageSnapshotGeneration();
  const olderRequest = beginDashboardPageSnapshotRequest(generation);
  const newerRequest = beginDashboardPageSnapshotRequest(generation);
  const newerSnapshot = populatedSnapshot();
  newerSnapshot.lastSyncLabel = "Synced newer";
  const olderSnapshot = populatedSnapshot();
  olderSnapshot.lastSyncLabel = "Synced older";

  assert.equal(
    writeDashboardPageSnapshot(newerSnapshot, newerRequest),
    true,
  );
  assert.equal(
    writeDashboardPageSnapshot(olderSnapshot, olderRequest),
    false,
  );
  assert.equal(
    readDashboardPageSnapshot("en")?.lastSyncLabel,
    "Synced newer",
  );
});

test("dashboard snapshot keeps polled companion status current", () => {
  clearDashboardPageSnapshot();
  const generation = readDashboardPageSnapshotGeneration();
  writeDashboardPageSnapshot(
    populatedSnapshot(),
    beginDashboardPageSnapshotRequest(generation),
  );

  assert.equal(
    updateDashboardPageSnapshot(
      "en",
      {
        companionStatus: {
          api_version: "1",
          auth_mode: "trusted-lan",
          enabled: true,
          listen_port: 4278,
          running: false,
          shell_reachable: false,
          local_name_running: false,
        },
      },
      generation,
    ),
    true,
  );
  assert.equal(readDashboardPageSnapshot("en")?.companionStatus?.running, false);
});
