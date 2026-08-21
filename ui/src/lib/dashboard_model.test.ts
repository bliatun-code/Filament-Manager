import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
  buildDashboardDerivedState,
  dashboardCalendarMonthChanged,
  dashboardCalendarMonthKey,
  normalizeDashboardUsageMonths,
} from "./dashboard_model";
import { lookup } from "./i18n";
import { nbDictionary } from "./i18n_locales/locales/nb";
import { normalizeLoanDetailsRow, type NormalizedLoanDetailsRow } from "./loan_row_normalization";
import {
  normalizeSpoolWithMasterRow,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type {
  InventoryOverview,
  PrinterOverviewRow,
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
} from "./tauri_client";

const t = (_key: string, fallback: string) => fallback;
const nbT = (key: string, fallback: string) => lookup(nbDictionary, key) ?? fallback;

function overview(overrides: Partial<InventoryOverview> = {}): InventoryOverview {
  return {
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
    consumption_12m_available: true,
    total_consumption_12m: 0,
    consumption_12m: [],
    ...overrides,
  };
}

function spoolRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
  lowStockThresholdGrams?: number | null,
): NormalizedSpoolWithMasterRow {
  return normalizeSpoolWithMasterRow({
    spool: {
      id,
      master_id: "master-1",
      status: "IN_STOCK",
      initial_weight_g: 1000,
      current_weight_g: 1000,
      remaining_g: 1000,
      ...overrides,
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
    },
    low_stock_threshold_g: lowStockThresholdGrams,
  });
}

function printer(
  id: string,
  slots: PrinterOverviewRow["slots"],
): PrinterOverviewRow {
  return {
    printer: {
      id,
      model: "Bambu Lab P1S",
      name: id,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    },
    usage: {
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      total_used_g: 0,
      last_job_at: null,
    },
    slots,
  };
}

function loanRow(
  spoolId: string,
  overrides: Partial<SpoolLoanDetailsRow> = {},
  loanOverrides: Partial<SpoolLoanDetailsRow["loan"]> = {},
): NormalizedLoanDetailsRow {
  return normalizeLoanDetailsRow({
    loan: {
      id: `loan-${spoolId}`,
      spool_id: spoolId,
      borrower_name: "Ada",
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      counterparty_name: null,
      counterparty_contact: null,
      counterparty_note: null,
      grams_out: 320,
      lent_note: null,
      lent_at: "2026-07-01 10:00:00",
      expected_return_at: null,
      returned_at: null,
      returned_grams: null,
      consumed_grams: null,
      return_note: null,
      ...loanOverrides,
    },
    spool_status: "BORROWED",
    spool_remaining_g: 680,
    spool_tare_weight_g: null,
    material: "PLA",
    filament_name: "Matte",
    color_name: "Blue",
    vendor: "Bambu",
    hex_color: "#1f6feb",
    ...overrides,
  });
}

test("buildDashboardBadges clamps progress and formats status copy", () => {
  const badges = buildDashboardBadges({
    goalMetrics: {
      totalSpools: 4,
      configuredPrinters: 2,
      activeSpools: 4,
      placedActiveSpools: 3,
      totalJobs: 30,
      totalSlots: 8,
      loadedSlots: 2,
    },
    t,
  });

  assert.equal(badges[0]?.status, "3/4 active spools placed");
  assert.equal(badges[0]?.progress, 0.75);
  assert.equal(badges[1]?.status, "30 jobs logged");
  assert.equal(badges[1]?.progress, 1);
  assert.equal(badges[2]?.status, "2/8 slots loaded");
  assert.equal(badges[2]?.progress, 0.25);
});

test("buildDashboardBadges handles empty location and slot goals", () => {
  const badges = buildDashboardBadges({
    goalMetrics: {
      totalSpools: 0,
      configuredPrinters: 0,
      activeSpools: 0,
      placedActiveSpools: 0,
      totalJobs: 4,
      totalSlots: 0,
      loadedSlots: 0,
    },
    jobGoal: 10,
    t,
  });

  assert.equal(badges[0]?.status, "No active spools yet.");
  assert.equal(badges[0]?.progress, 0);
  assert.equal(badges[1]?.status, "4/10 jobs logged");
  assert.equal(badges[1]?.progress, 0.4);
  assert.equal(badges[2]?.status, "No printer slots configured yet.");
  assert.equal(badges[2]?.progress, 0);
});

test("buildDashboardDerivedState keeps borrowed rows out of inventory health score", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [
      spoolRow("assigned-low", {
        status: "ASSIGNED",
        current_weight_g: 50,
        remaining_g: 50,
      }),
      spoolRow("borrowed-healthy-a", {
        status: "BORROWED",
        current_weight_g: 900,
        remaining_g: 900,
      }),
      spoolRow("borrowed-healthy-b", {
        status: "BORROWED",
        current_weight_g: 800,
        remaining_g: 800,
      }),
    ],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.ownershipOnHand.total, 1);
  assert.equal(result.health.score, 0);
});

test("dashboard counts every low-stock spool and keeps the 200g boundary unhealthy", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [
      ...[1, 40, 80, 120, 160, 200].map((remaining, index) =>
        spoolRow(`low-${index}`, {
          current_weight_g: remaining,
          remaining_g: remaining,
        }),
      ),
      spoolRow("healthy", { current_weight_g: 201, remaining_g: 201 }),
      spoolRow("zero", { current_weight_g: 0, remaining_g: 0 }),
    ],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.stats.find((stat) => stat.id === "lowStock")?.value, "6");
  assert.equal(
    result.health.metrics.find((metric) => metric.id === "lowStock")?.value,
    "6",
  );
  assert.equal(result.ownershipLowStock.owned, 6);
  assert.equal(result.health.score, 13);
});

test("dashboard uses mixed material thresholds for counts, health and subtitle", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [
      spoolRow("pla-below", { remaining_g: 299 }, 300),
      spoolRow("pla-boundary", { remaining_g: 300 }, 300),
      spoolRow("pla-above", { remaining_g: 301 }, 300),
      spoolRow(
        "petg-below",
        { remaining_g: 149, ownership_type: "BORROWED_IN" },
        150,
      ),
      spoolRow(
        "petg-boundary",
        { remaining_g: 150, ownership_type: "BORROWED_IN" },
        150,
      ),
      spoolRow(
        "petg-above",
        { remaining_g: 151, ownership_type: "BORROWED_IN" },
        150,
      ),
    ],
    loans: [],
    wishlist: [],
    t,
  });

  const lowStock = result.stats.find((stat) => stat.id === "lowStock");
  assert.equal(lowStock?.value, "4");
  assert.equal(lowStock?.subtitle, "Thresholds by material");
  assert.deepEqual(result.ownershipLowStock, { owned: 2, borrowedIn: 2 });
  assert.equal(result.health.score, 33);
});

test("dashboard labels and applies the explicit older-Host 200 g fallback", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [
      spoolRow("legacy-boundary", { remaining_g: 200 }),
      spoolRow("legacy-above", { remaining_g: 201 }),
    ],
    loans: [],
    wishlist: [],
    t,
  });

  const lowStock = result.stats.find((stat) => stat.id === "lowStock");
  assert.equal(lowStock?.value, "1");
  assert.equal(lowStock?.subtitle, "200 g fallback for older Host");
});

test("buildDashboardDerivedState reports insufficient data for an empty library", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.ownershipOnHand.total, 0);
  assert.equal(result.health.score, null);
  assert.equal(result.health.headline, "Not enough data");
  assert.equal(result.health.detail, "Add rolls to start health tracking.");
  assert.equal(result.goalMetrics.totalSpools, 0);
  assert.equal(result.goalMetrics.configuredPrinters, 0);
});

test("dashboard setup metrics count historical spools and configured printers", () => {
  const result = buildDashboardDerivedState({
    overview: overview({ total_spools: 1 }),
    printers: [printer("printer-1", [])],
    spoolRows: [spoolRow("empty-history", { status: "EMPTY", remaining_g: 0 })],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.goalMetrics.totalSpools, 1);
  assert.equal(result.goalMetrics.configuredPrinters, 1);
});

test("buildDashboardDerivedState localizes daily grams for Norwegian", () => {
  const result = buildDashboardDerivedState({
    overview: overview({ total_consumption_30d: 2352 }),
    printers: [],
    spoolRows: [],
    loans: [],
    wishlist: [],
    t: nbT,
  });

  assert.equal(
    result.stats.find((stat) => stat.id === "monthlyUsage")?.trend,
    "78 g/dag",
  );
});

test("dashboard keeps the 30-day card separate from the chronological 12-month chart", () => {
  const result = buildDashboardDerivedState({
    overview: overview({
      total_consumption_30d: 0,
      total_consumption_12m: 4_176,
      consumption_12m: [
        { month: "2025-10", used_grams: 80 },
        { month: "2026-01", used_grams: 484 },
        { month: "2026-06", used_grams: 590 },
        { month: "2026-07", used_grams: 3_022 },
      ],
    }),
    printers: [],
    spoolRows: [],
    loans: [],
    wishlist: [],
    now: new Date("2026-08-11T12:00:00Z"),
    t,
  });

  assert.equal(
    result.stats.find((stat) => stat.id === "monthlyUsage")?.value,
    "0 g",
  );
  assert.equal(result.usageTotal12m, 4_176);
  assert.equal(result.usageMonths.length, 12);
  assert.deepEqual(result.usageMonths.slice(0, 3), [
    { month: "2025-09", usedGrams: 0 },
    { month: "2025-10", usedGrams: 80 },
    { month: "2025-11", usedGrams: 0 },
  ]);
  assert.deepEqual(result.usageMonths.at(-1), {
    month: "2026-08",
    usedGrams: 0,
  });
});

test("normalizeDashboardUsageMonths fills gaps and ignores malformed legacy buckets", () => {
  const months = normalizeDashboardUsageMonths(
    [
      { month: "2026-08", used_grams: 120 },
      { month: "2026-08", used_grams: 30 },
      { month: "2026-07", used_grams: -50 },
      { month: "2024-01", used_grams: 999 },
      { month: "not-a-month", used_grams: 999 },
      { month: "2026-06", used_grams: Number.NaN },
    ],
    new Date("2026-08-11T12:00:00Z"),
  );

  assert.equal(months.length, 12);
  assert.deepEqual(months.slice(-3), [
    { month: "2026-06", usedGrams: 0 },
    { month: "2026-07", usedGrams: 0 },
    { month: "2026-08", usedGrams: 150 },
  ]);
});

test("dashboard derives the annual headline from the same normalized bars", () => {
  const result = buildDashboardDerivedState({
    overview: overview({
      total_consumption_12m: 9_999,
      consumption_12m: [{ month: "2026-08", used_grams: 150 }],
    }),
    printers: [],
    spoolRows: [],
    loans: [],
    wishlist: [],
    now: new Date("2026-08-11T12:00:00Z"),
    t,
  });

  assert.equal(result.usageTotal12m, 150);
});

test("dashboard calendar month detection rolls over at local midnight", () => {
  const endOfJuly = new Date(2026, 6, 31, 23, 59, 59);
  const startOfAugust = new Date(2026, 7, 1, 0, 0, 0);

  assert.equal(dashboardCalendarMonthKey(endOfJuly), "2026-07");
  assert.equal(dashboardCalendarMonthKey(startOfAugust), "2026-08");
  assert.equal(dashboardCalendarMonthChanged("2026-07", startOfAugust), true);
  assert.equal(dashboardCalendarMonthChanged("2026-08", startOfAugust), false);
});

test("buildDashboardDerivedState preserves unknown statuses outside on-hand counts", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [
      spoolRow("legacy-unknown", {
        status: "LEGACY_ACTIVE",
        current_weight_g: 120,
        remaining_g: 120,
      }),
      spoolRow("legacy-borrowed-in", {
        ownership_type: "borrowed-in",
        status: "IN_USE",
      }),
    ],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.ownershipOnHand.total, 1);
  assert.equal(result.ownershipOnHand.borrowedIn, 1);
  assert.equal(result.ownershipLowStock.owned, 0);
});

test("buildDashboardDerivedState normalizes legacy loan tokens before active counts", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [],
    spoolRows: [],
    loans: [
      loanRow("legacy-active", {}, { loan_direction: "out-bound", loan_status: "active" }),
      loanRow("legacy-returned", {}, { loan_status: "active", returned_at: "2026-07-02 10:00:00" }),
      loanRow("legacy-inbound", {}, { loan_direction: "in-bound", loan_status: "active" }),
    ],
    wishlist: [],
    t,
  });

  assert.equal(
    result.health.metrics.find((metric) => metric.id === "loaned")?.value,
    "1",
  );
  assert.deepEqual(
    result.activity.map((item) => item.id),
    ["loan-loan-legacy-active"],
  );
});

test("buildDashboardDerivedState ignores EXT readiness for AMS/MMU printers", () => {
  const result = buildDashboardDerivedState({
    overview: overview(),
    printers: [
      printer("with-ams", [
        { slot_id: "ext", ams_id: "printer_ext", slot_index: 0, spool_id: "spool-ext" },
        { slot_id: "ams-1", ams_id: "printer_ams_1", slot_index: 1, spool_id: "spool-1" },
        { slot_id: "ams-2", ams_id: "printer_ams_1", slot_index: 2, spool_id: null },
        { slot_id: "ams-3", ams_id: "printer_ams_1", slot_index: 3, spool_id: "" },
        { slot_id: "ams-4", ams_id: "printer_ams_1", slot_index: 4, spool_id: "spool-4" },
      ]),
      printer("single-material", [
        { slot_id: "ext-only", ams_id: "single_ext", slot_index: 0, spool_id: "spool-ext-only" },
      ]),
    ],
    spoolRows: [],
    loans: [],
    wishlist: [],
    t,
  });

  assert.equal(result.goalMetrics.loadedSlots, 3);
  assert.equal(result.goalMetrics.totalSlots, 5);
  assert.deepEqual(
    result.health.metrics.find((metric) => metric.id === "loaded"),
    {
      id: "loaded",
      label: "slots loaded",
      value: "3",
      tone: "emerald",
    },
  );
});

test("buildDashboardCompanionPresentation labels standalone companion health", () => {
  assert.deepEqual(
    buildDashboardCompanionPresentation({
      clientHostCompanionTone: "off",
      clientHostDisplayName: null,
      clientHostNeedsRepair: false,
      companionStatus: {
        enabled: true,
        running: true,
        shell_reachable: true,
      },
      dashboardSyncMode: "STANDALONE",
      t,
    }),
    {
      label: "Web app running",
      tone: "live",
    },
  );
});

test("buildDashboardCompanionPresentation labels client host repair state", () => {
  assert.deepEqual(
    buildDashboardCompanionPresentation({
      clientHostCompanionTone: "warn",
      clientHostDisplayName: "Verksted-Mac",
      clientHostNeedsRepair: true,
      companionStatus: null,
      dashboardSyncMode: "CLIENT",
      t,
    }),
    {
      label: "Re-pair required",
      tone: "warn",
    },
  );
});
