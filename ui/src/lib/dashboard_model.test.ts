import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
  buildDashboardDerivedState,
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
    ...overrides,
  };
}

function spoolRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
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
  assert.equal(result.ownershipLowStock.owned, 1);
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
