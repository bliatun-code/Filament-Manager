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
    activity: [
      {
        id: "loan-return",
        title: "Returned",
        detail: "Matte Black",
        tone: "emerald",
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
  assert.equal(restored?.bambuLiveAttention?.[0]?.printerId, "printer-1");
});

test("dashboard snapshot safely upgrades an older cached view without annual usage fields", () => {
  clearDashboardPageSnapshot();
  const legacySnapshot = populatedSnapshot() as DashboardPageSnapshot &
    Record<string, unknown>;
  delete legacySnapshot.usageMonths;
  delete legacySnapshot.usageTotal12m;
  delete legacySnapshot.usageAvailable;

  writeDashboardPageSnapshot(legacySnapshot);

  const restored = readDashboardPageSnapshot("en");
  assert.deepEqual(restored?.usageMonths, []);
  assert.equal(restored?.usageAvailable, false);
  assert.equal(restored?.usageTotal12m, 0);
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
