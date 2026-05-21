import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
  buildDashboardDerivedState,
} from "./dashboard_model";
import type { InventoryOverview, SpoolWithMasterRow } from "./tauri_client";

const t = (_key: string, fallback: string) => fallback;

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
): SpoolWithMasterRow {
  return {
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
  };
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
