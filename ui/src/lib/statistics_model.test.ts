import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveInventoryOverviewFromRows,
  filterConsumptionRows,
  listConsumptionMaterialOptions,
  listConsumptionVendorOptions,
} from "./statistics_model";
import {
  normalizeSpoolWithMasterRow,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type { FilamentConsumptionRow, SpoolWithMasterRow } from "./tauri_client";

function spoolRow({
  status,
  ownershipType = "OWNED",
  remainingGrams,
}: {
  status: string;
  ownershipType?: string | null;
  remainingGrams?: number | null;
}): NormalizedSpoolWithMasterRow {
  return normalizeSpoolWithMasterRow({
    spool: {
      status,
      ownership_type: ownershipType,
      remaining_g: remainingGrams,
    },
  } as SpoolWithMasterRow);
}

function consumptionRow(
  overrides: Partial<FilamentConsumptionRow> = {},
): FilamentConsumptionRow {
  return {
    vendor: "Bambu",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Blue",
    hex_color: "#2563EB",
    used_grams: 100,
    jobs: 1,
    ownership_type: "OWNED",
    owner_name: null,
    ...overrides,
  };
}

test("deriveInventoryOverviewFromRows separates owned and borrowed stock health", () => {
  const overview = deriveInventoryOverviewFromRows(
    [
      spoolRow({ status: "IN_STOCK", remainingGrams: 150 }),
      spoolRow({ status: "ASSIGNED", ownershipType: "BORROWED_IN", remainingGrams: 180 }),
      spoolRow({ status: "IN_USE", remainingGrams: 500 }),
      spoolRow({ status: "EMPTY", remainingGrams: 0 }),
      spoolRow({ status: "LOST", ownershipType: "BORROWED_IN", remainingGrams: 90 }),
    ],
    [
      consumptionRow({ used_grams: 120, ownership_type: "OWNED" }),
      consumptionRow({ used_grams: 80, ownership_type: "BORROWED_IN" }),
      consumptionRow({ used_grams: -20, ownership_type: "BORROWED_IN" }),
    ],
  );

  assert.equal(overview.total_spools, 5);
  assert.equal(overview.total_owned_spools, 2);
  assert.equal(overview.total_borrowed_in_spools, 1);
  assert.equal(overview.in_use, 2);
  assert.equal(overview.borrowed_in_in_use, 1);
  assert.equal(overview.low_stock, 2);
  assert.equal(overview.owned_low_stock, 1);
  assert.equal(overview.borrowed_in_low_stock, 1);
  assert.equal(overview.total_consumption_30d, 200);
  assert.equal(overview.owned_consumption_30d, 120);
  assert.equal(overview.borrowed_in_consumption_30d, 80);
});

test("consumption filters build stable options and apply search, ownership and sort", () => {
  const rows = [
    consumptionRow({ vendor: "eSUN", material: "PETG", color_name: "Black", used_grams: 300, jobs: 2 }),
    consumptionRow({
      vendor: "Bambu",
      material: "PLA",
      color_name: "Blue",
      used_grams: 100,
      jobs: 4,
      ownership_type: "BORROWED_IN",
      owner_name: "Erik",
    }),
    consumptionRow({ vendor: "Bambu", material: "ABS", color_name: "Orange", used_grams: 200, jobs: 1 }),
  ];

  assert.deepEqual(listConsumptionVendorOptions(rows), ["ALL", "Bambu", "eSUN"]);
  assert.deepEqual(listConsumptionMaterialOptions(rows), ["ALL", "ABS", "PETG", "PLA"]);
  assert.deepEqual(
    filterConsumptionRows(rows, {
      search: "erik",
      vendorFilter: "ALL",
      materialFilter: "ALL",
      ownershipFilter: "BORROWED_IN",
      sort: "USED_DESC",
    }).map((row) => row.color_name),
    ["Blue"],
  );
  assert.deepEqual(
    filterConsumptionRows(rows, {
      search: "",
      vendorFilter: "Bambu",
      materialFilter: "ALL",
      ownershipFilter: "ALL",
      sort: "JOBS_DESC",
    }).map((row) => row.color_name),
    ["Blue", "Orange"],
  );
});
