import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStatisticsPeriodReportToOverview,
  applyStatisticsPeriodReportToPrinters,
  deriveInventoryOverviewFromRows,
  filterConsumptionRows,
  listConsumptionMaterialOptions,
  listConsumptionVendorOptions,
} from "./statistics_model";
import {
  normalizeSpoolWithMasterRow,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  PrinterOverviewRow,
  SpoolWithMasterRow,
  StatisticsPeriodReport,
} from "./tauri_client";

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

function report(overrides: Partial<StatisticsPeriodReport> = {}): StatisticsPeriodReport {
  return {
    period: {
      start_at_utc: "2026-08-01T00:00:00Z",
      end_at_utc: "2026-09-01T00:00:00Z",
    },
    total_used_g: 700,
    owned_used_g: 500,
    borrowed_in_used_g: 200,
    total_jobs: 7,
    successful_jobs: 6,
    failed_jobs: 1,
    printer_usage: [],
    filament_consumption: [],
    ...overrides,
  };
}

function printer(id: string, totalUsed: number): PrinterOverviewRow {
  return {
    printer: {
      id,
      name: id,
      model: "P1S",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    usage: {
      total_jobs: 99,
      successful_jobs: 90,
      failed_jobs: 9,
      total_used_g: totalUsed,
      last_job_at: "2026-07-01T00:00:00Z",
    },
    slots: [],
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

test("selected-period printer usage replaces all-time usage without changing printer state", () => {
  const printers = [printer("printer-1", 9_000), printer("printer-2", 8_000)];
  const selected = applyStatisticsPeriodReportToPrinters(
    printers,
    report({
      printer_usage: [
        {
          printer_id: "printer-1",
          total_jobs: 7,
          successful_jobs: 6,
          failed_jobs: 1,
          total_used_g: 700,
          last_job_at: "2026-08-20T12:00:00Z",
        },
      ],
    }),
  );

  assert.deepEqual(selected[0]?.usage, {
    total_jobs: 7,
    successful_jobs: 6,
    failed_jobs: 1,
    total_used_g: 700,
    last_job_at: "2026-08-20T12:00:00Z",
  });
  assert.deepEqual(selected[1]?.usage, {
    total_jobs: 0,
    successful_jobs: 0,
    failed_jobs: 0,
    total_used_g: 0,
    last_job_at: null,
  });
  assert.equal(selected[0]?.printer, printers[0]?.printer);
  assert.equal(selected[0]?.slots, printers[0]?.slots);
  assert.equal(printers[0]?.usage.total_used_g, 9_000);
});

test("selected-period ownership usage overlays current inventory without changing forecast history", () => {
  const current: InventoryOverview = {
    total_spools: 8,
    total_owned_spools: 6,
    total_borrowed_in_spools: 2,
    in_use: 3,
    owned_in_use: 2,
    borrowed_in_in_use: 1,
    low_stock: 2,
    owned_low_stock: 1,
    borrowed_in_low_stock: 1,
    total_consumption_30d: 321,
    owned_consumption_30d: 300,
    borrowed_in_consumption_30d: 21,
    consumption_12m_available: true,
    total_consumption_12m: 4_000,
    consumption_12m: [{ month: "2026-08", used_grams: 321 }],
  };

  const selected = applyStatisticsPeriodReportToOverview(current, report());

  assert.equal(selected.total_spools, 8);
  assert.equal(selected.in_use, 3);
  assert.equal(selected.total_consumption_30d, 700);
  assert.equal(selected.owned_consumption_30d, 500);
  assert.equal(selected.borrowed_in_consumption_30d, 200);
  assert.equal(selected.total_consumption_12m, 4_000);
  assert.equal(selected.consumption_12m, current.consumption_12m);
  assert.equal(current.owned_consumption_30d, 300);
});
