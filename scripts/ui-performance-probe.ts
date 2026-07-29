import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  beginDashboardPageSnapshotRequest,
  clearDashboardPageSnapshot,
  readDashboardPageSnapshot,
  readDashboardPageSnapshotGeneration,
  writeDashboardPageSnapshot,
  type DashboardPageSnapshot,
} from "../ui/src/lib/dashboard_page_snapshot_cache";
import { buildDashboardDerivedState } from "../ui/src/lib/dashboard_model";
import {
  buildInventoryCollectionWindow,
  INVENTORY_CARD_GROUP_PAGE_SIZE,
  INVENTORY_LIST_PAGE_SIZE,
} from "../ui/src/lib/inventory_collection_window";
import { mapSpoolRowToInventorySpool } from "../ui/src/lib/inventory_data_source";
import {
  buildMaterialOptions,
  buildVendorOptions,
  filterInventorySpools,
  groupInventorySpools,
} from "../ui/src/lib/inventory_list_model";
import { normalizeSpoolWithMasterRows } from "../ui/src/lib/spool_row_normalization";
import { deriveInventoryOverviewFromRows } from "../ui/src/lib/statistics_model";
import type { SpoolWithMasterRow } from "../ui/src/lib/tauri_client";

const DEFAULT_SPOOL_COUNT = 10_000;
const DEFAULT_SAMPLES = 11;
const DEFAULT_WARMUP_RUNS = 2;
const DEFAULT_PIPELINE_BUDGET_MS = 1_000;
const DEFAULT_SNAPSHOT_CLONE_BUDGET_MS = 250;
const DEFAULT_MAX_GROWTH_RATIO = 3;

export type UiPerformanceProbeOptions = {
  json: boolean;
  maxGrowthRatio: number;
  pipelineBudgetMs: number;
  samples: number;
  snapshotCloneBudgetMs: number;
  spoolCount: number;
  warmupRuns: number;
};

type ProbeMeasurement = {
  maxMs: number;
  medianMs: number;
  minMs: number;
  samplesMs: number[];
};

function parseNumericOption(
  argv: string[],
  name: string,
  fallback: number,
): number {
  const equalsPrefix = `${name}=`;
  const equalsArg = argv.find((arg) => arg.startsWith(equalsPrefix));
  let raw: string | undefined;
  if (equalsArg) {
    raw = equalsArg.slice(equalsPrefix.length);
  } else {
    const index = argv.indexOf(name);
    if (index >= 0) {
      raw = argv[index + 1];
    }
  }
  if (raw == null) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function parseIntegerOption(
  argv: string[],
  name: string,
  fallback: number,
): number {
  const parsed = parseNumericOption(argv, name, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

export function parseUiPerformanceProbeOptions(
  argv: string[],
): UiPerformanceProbeOptions {
  return {
    json: argv.includes("--json"),
    maxGrowthRatio: parseNumericOption(
      argv,
      "--max-growth-ratio",
      DEFAULT_MAX_GROWTH_RATIO,
    ),
    snapshotCloneBudgetMs: parseNumericOption(
      argv,
      "--snapshot-clone-budget-ms",
      DEFAULT_SNAPSHOT_CLONE_BUDGET_MS,
    ),
    pipelineBudgetMs: parseNumericOption(
      argv,
      "--pipeline-budget-ms",
      DEFAULT_PIPELINE_BUDGET_MS,
    ),
    samples: parseIntegerOption(argv, "--samples", DEFAULT_SAMPLES),
    spoolCount: parseIntegerOption(
      argv,
      "--spools",
      DEFAULT_SPOOL_COUNT,
    ),
    warmupRuns: parseIntegerOption(
      argv,
      "--warmup-runs",
      DEFAULT_WARMUP_RUNS,
    ),
  };
}

function fixtureRow(index: number): SpoolWithMasterRow {
  const padded = index.toString().padStart(6, "0");
  const remaining = index % 10 === 0 ? 150 : 400 + (index % 550);
  return {
    spool: {
      id: `spool-${padded}`,
      master_id: `master-${index % 500}`,
      qr_code: `FM-${padded}`,
      status: "IN_STOCK",
      ownership_type: index % 9 === 0 ? "BORROWED_IN" : "OWNED",
      owner_name: index % 9 === 0 ? `Owner ${index % 25}` : null,
      owner_contact: null,
      ownership_note: null,
      initial_weight_g: 1000,
      current_weight_g: remaining,
      remaining_g: remaining,
      spool_tare_weight_g: 250,
      location_id: `Shelf ${index % 100}`,
      home_location_id: `Shelf ${index % 100}`,
      rfid_tag: index % 4 === 0 ? `RFID-${padded}` : null,
      rfid_observed_at: null,
    },
    master: {
      id: `master-${index % 500}`,
      material: ["PLA", "PETG", "ABS", "ASA", "TPU"][index % 5]!,
      filament_name: `Series ${index % 250}`,
      color_name: `Color ${index % 50}`,
      hex_color: `#${(index % 0xffffff).toString(16).padStart(6, "0")}`,
      product_url: null,
      default_weight: 1000,
      vendor: ["Bambu Lab", "eSUN", "Prusament", "Generic"][index % 4]!,
    },
  };
}

function runLargeInventoryPipeline(
  rows: SpoolWithMasterRow[],
): {
  cardCount: number;
  dashboardSpoolCount: number;
  groupCount: number;
  listCount: number;
  spoolCount: number;
} {
  const normalizedRows = normalizeSpoolWithMasterRows(rows);
  const inventorySpools = normalizedRows.map(mapSpoolRowToInventorySpool);
  const filteredSpools = filterInventorySpools(inventorySpools, {
    search: "",
    statusFilter: "ALL",
    ownershipFilter: "ALL",
    materialFilter: "ALL",
    vendorFilter: "ALL",
    lowStockOnly: false,
  });
  const groupedSpools = groupInventorySpools(filteredSpools);
  buildVendorOptions(inventorySpools);
  buildMaterialOptions(inventorySpools);
  const listWindow = buildInventoryCollectionWindow({
    filteredSpools,
    groupedSpools,
    inventoryView: "LIST",
    limit: INVENTORY_LIST_PAGE_SIZE,
  });
  const cardWindow = buildInventoryCollectionWindow({
    filteredSpools,
    groupedSpools,
    inventoryView: "CARDS",
    limit: INVENTORY_CARD_GROUP_PAGE_SIZE,
  });
  const overview = deriveInventoryOverviewFromRows(normalizedRows, []);
  const dashboard = buildDashboardDerivedState({
    overview,
    printers: [],
    spoolRows: normalizedRows,
    loans: [],
    wishlist: [],
    materialRows: [],
    t: (_key, fallback) => fallback,
  });
  return {
    cardCount: cardWindow.groupedSpools.length,
    dashboardSpoolCount: dashboard.goalMetrics.totalSpools,
    groupCount: groupedSpools.length,
    listCount: listWindow.filteredSpools.length,
    spoolCount: inventorySpools.length,
  };
}

function cachedSnapshotFixture(spoolCount: number): DashboardPageSnapshot {
  return {
    activity: [],
    clientHostCompanionTone: "off",
    clientHostDisplayName: null,
    clientHostNeedsRepair: false,
    clientHostPaired: false,
    companionStatus: null,
    dashboardSyncMode: "STANDALONE",
    goalMetrics: {
      activeSpools: spoolCount,
      configuredPrinters: 2,
      loadedSlots: 4,
      placedActiveSpools: spoolCount,
      totalJobs: 500,
      totalSlots: 8,
      totalSpools: spoolCount,
    },
    health: {
      score: 90,
      headline: "Stable supply",
      detail: "Performance fixture",
      metrics: [],
    },
    lastSyncLabel: "Synced",
    locale: "en",
    ownershipLowStock: { owned: 100, borrowedIn: 10 },
    ownershipOnHand: {
      total: spoolCount,
      owned: Math.floor(spoolCount * 0.9),
      borrowedIn: Math.ceil(spoolCount * 0.1),
      inUse: 250,
    },
    revisionSource: { kind: "local" },
    setupDataAvailable: true,
    stats: [
      {
        id: "total",
        title: "Total Spools",
        value: spoolCount.toString(),
        subtitle: "Across all locations",
        trend: "250 assigned",
        accent: "sky",
      },
    ],
    usagePoints: [10, 20, 30],
  };
}

function measure(
  callback: () => void,
  options: Pick<UiPerformanceProbeOptions, "samples" | "warmupRuns">,
): ProbeMeasurement {
  for (let index = 0; index < options.warmupRuns; index += 1) {
    callback();
  }
  const samplesMs: number[] = [];
  for (let index = 0; index < options.samples; index += 1) {
    const startedAt = performance.now();
    callback();
    samplesMs.push(performance.now() - startedAt);
  }
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    maxMs: Math.max(...samplesMs),
    medianMs: sorted[Math.floor(sorted.length / 2)]!,
    minMs: Math.min(...samplesMs),
    samplesMs,
  };
}

export function runUiPerformanceProbe(options: UiPerformanceProbeOptions) {
  const fullRows = Array.from(
    { length: options.spoolCount },
    (_, index) => fixtureRow(index),
  );
  const halfRows = fullRows.slice(0, Math.max(1, Math.floor(fullRows.length / 2)));
  const fullDigest = runLargeInventoryPipeline(fullRows);
  assert.equal(fullDigest.spoolCount, options.spoolCount);
  assert.equal(fullDigest.dashboardSpoolCount, options.spoolCount);
  assert.equal(
    fullDigest.listCount,
    Math.min(options.spoolCount, INVENTORY_LIST_PAGE_SIZE),
  );
  assert.equal(
    fullDigest.cardCount,
    Math.min(fullDigest.groupCount, INVENTORY_CARD_GROUP_PAGE_SIZE),
  );

  const halfPipeline = measure(
    () => {
      runLargeInventoryPipeline(halfRows);
    },
    options,
  );
  const fullPipeline = measure(
    () => {
      runLargeInventoryPipeline(fullRows);
    },
    options,
  );

  clearDashboardPageSnapshot();
  const generation = readDashboardPageSnapshotGeneration();
  assert.equal(
    writeDashboardPageSnapshot(
      cachedSnapshotFixture(options.spoolCount),
      beginDashboardPageSnapshotRequest(generation),
    ),
    true,
  );
  const cachedSnapshotClones = measure(
    () => {
      for (let index = 0; index < 500; index += 1) {
        assert.equal(
          readDashboardPageSnapshot("en")?.goalMetrics.totalSpools,
          options.spoolCount,
        );
      }
    },
    options,
  );
  const growthRatio =
    fullPipeline.medianMs / Math.max(halfPipeline.medianMs, 0.01);

  if (fullPipeline.medianMs > options.pipelineBudgetMs) {
    throw new Error(
      `${options.spoolCount.toLocaleString("en-US")}-spool pipeline median ${fullPipeline.medianMs.toFixed(2)} ms exceeds ${options.pipelineBudgetMs} ms.`,
    );
  }
  if (cachedSnapshotClones.medianMs > options.snapshotCloneBudgetMs) {
    throw new Error(
      `500 dashboard snapshot clones median ${cachedSnapshotClones.medianMs.toFixed(2)} ms exceeds ${options.snapshotCloneBudgetMs} ms.`,
    );
  }
  if (growthRatio > options.maxGrowthRatio) {
    throw new Error(
      `Large-inventory growth ratio ${growthRatio.toFixed(2)} exceeds ${options.maxGrowthRatio}.`,
    );
  }

  return {
    budgets: {
      maxGrowthRatio: options.maxGrowthRatio,
      pipelineBudgetMs: options.pipelineBudgetMs,
      snapshotCloneBudgetMs: options.snapshotCloneBudgetMs,
    },
    fixture: {
      groupCount: fullDigest.groupCount,
      spoolCount: options.spoolCount,
    },
    measurements: {
      fullPipeline,
      growthRatio,
      halfPipeline,
      cachedSnapshotClones,
    },
    samples: options.samples,
    warmupRuns: options.warmupRuns,
  };
}

function formatMeasurement(measurement: ProbeMeasurement): string {
  return `median ${measurement.medianMs.toFixed(2)} ms (min ${measurement.minMs.toFixed(2)}, max ${measurement.maxMs.toFixed(2)})`;
}

function main(): void {
  const options = parseUiPerformanceProbeOptions(process.argv.slice(2));
  const result = runUiPerformanceProbe(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `UI performance probe (${result.fixture.spoolCount.toLocaleString("en-US")} spools):`,
      `  Half pipeline: ${formatMeasurement(result.measurements.halfPipeline)}`,
      `  Full pipeline: ${formatMeasurement(result.measurements.fullPipeline)}`,
      `  Growth ratio: ${result.measurements.growthRatio.toFixed(2)}x`,
      `  500 cached dashboard snapshot clones: ${formatMeasurement(result.measurements.cachedSnapshotClones)}`,
      "  Result: within advisory local budgets.",
      "",
    ].join("\n"),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
