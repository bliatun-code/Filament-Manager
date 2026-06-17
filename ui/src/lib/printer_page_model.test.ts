import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAllowedSpoolOptionMapsBySlotSpoolId,
  buildAllowedSpoolOptionsBySlotSpoolId,
  buildPrinterPageSummary,
  buildSpoolsById,
  resolveSpoolTareWeightById,
} from "./printer_page_model";
import type { PrinterAmsSlotRow, PrinterOverviewRow, SpoolWithMasterRow } from "./tauri_client";

function spool(id: string, status = "IN_STOCK", vendor = "Generic"): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `master-${id}`,
      status,
      ownership_type: "OWNED",
      remaining_g: 500,
      spool_tare_weight_g: vendor === "Bambu" ? null : 200,
    },
    master: {
      id: `master-${id}`,
      material: "PLA",
      filament_name: "Basic",
      color_name: id,
      hex_color: "#FFFFFF",
      default_weight: 1000,
      vendor,
    },
  };
}

function slot(
  slotId: string,
  spoolId?: string | null,
  amsId = "ams_0",
): PrinterAmsSlotRow {
  return {
    slot_id: slotId,
    ams_id: amsId,
    slot_index: 0,
    spool_id: spoolId,
  };
}

function printer(id: string, slots: PrinterAmsSlotRow[]): PrinterOverviewRow {
  return {
    printer: {
      id,
      model: "Bambu Lab X1 Carbon",
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

test("buildPrinterPageSummary counts configured and loaded slots", () => {
  const summary = buildPrinterPageSummary([
    printer("p1", [slot("a", "spool-a"), slot("b", null)]),
    printer("p2", [slot("c", "spool-c")]),
  ]);

  assert.deepEqual(summary, {
    printerCount: 2,
    loadedSlots: 2,
    totalSlots: 3,
  });
});

test("buildPrinterPageSummary ignores EXT readiness when multi-material slots exist", () => {
  const summary = buildPrinterPageSummary([
    printer("p1", [
      slot("ext", "spool-ext", "p1_ext"),
      slot("ams-1", "spool-1", "p1_ams_1"),
      slot("ams-2", null, "p1_ams_1"),
      slot("ams-3", "", "p1_ams_1"),
    ]),
    printer("p2", [slot("ext-only", "spool-ext-only", "p2_ext")]),
  ]);

  assert.deepEqual(summary, {
    printerCount: 2,
    loadedSlots: 2,
    totalSlots: 4,
  });
});

test("spool lookup resolves known tare weights and empty ids safely", () => {
  const spoolsById = buildSpoolsById([spool("generic"), spool("bambu", "IN_STOCK", "Bambu")]);

  assert.equal(resolveSpoolTareWeightById(spoolsById, ""), 0);
  assert.equal(resolveSpoolTareWeightById(spoolsById, "missing"), 0);
  assert.equal(resolveSpoolTareWeightById(spoolsById, "generic"), 200);
  assert.equal(resolveSpoolTareWeightById(spoolsById, "bambu"), 250);
});

test("allowed spool options keep the active slot spool selectable", () => {
  const sortedSpools = [
    spool("available"),
    spool("active", "IN_USE"),
    spool("lost", "LOST"),
  ];
  const optionsBySlot = buildAllowedSpoolOptionsBySlotSpoolId(
    [printer("p1", [slot("a", "active")])],
    sortedSpools,
  );
  const globalOptions = optionsBySlot.get("")?.map((row) => row.spool.id);
  const activeSlotOptions = optionsBySlot.get("active")?.map((row) => row.spool.id);

  assert.deepEqual(globalOptions, ["available"]);
  assert.deepEqual(activeSlotOptions, ["available", "active"]);
  assert.equal(
    buildAllowedSpoolOptionMapsBySlotSpoolId(optionsBySlot).get("active")?.get("active")?.spool.id,
    "active",
  );
});
