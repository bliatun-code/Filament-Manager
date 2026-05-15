import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildPrinterSlotsByPrinterId,
  derivePrinterMultiConfig,
  isBambuLabPrinter,
} from "./settings_printer_model";
import type { PrinterOverviewRow } from "../lib/tauri_client";

function overviewRow(
  slots: Array<{ ams_id: string; slot_id: string }>,
): PrinterOverviewRow {
  return {
    printer: {
      id: "printer-1",
      name: "Printer",
      model: "Bambu Lab X1 Carbon",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    slots: slots.map((slot, index) => ({
      id: `slot-${index}`,
      printer_id: "printer-1",
      ams_id: slot.ams_id,
      slot_id: slot.slot_id,
      label: `Slot ${index + 1}`,
      spool_id: null,
      loaded_at: null,
      updated_at: "2026-01-01T00:00:00Z",
      spool: null,
      master: null,
    })),
  };
}

test("derivePrinterMultiConfig counts only internal multi-material units", () => {
  const config = derivePrinterMultiConfig({
    printerId: "printer-1",
    model: "Bambu Lab X1 Carbon",
    printerOverview: [
      overviewRow([
        { ams_id: "ams-1", slot_id: "1" },
        { ams_id: "ams-1", slot_id: "2" },
        { ams_id: "ams-2", slot_id: "1" },
        { ams_id: "printer_ext", slot_id: "external" },
      ]),
    ],
  });

  assert.deepEqual(config, { units: 2, slotsPerUnit: 2 });
});

test("buildPrinterSlotsByPrinterId indexes overview slots by printer id", () => {
  const overview = overviewRow([
    { ams_id: "ams-1", slot_id: "1" },
    { ams_id: "ams-1", slot_id: "2" },
  ]);

  const slotsByPrinterId = buildPrinterSlotsByPrinterId([overview]);

  assert.equal(slotsByPrinterId.get("printer-1"), overview.slots);
  assert.equal(slotsByPrinterId.get("missing"), undefined);
});

test("derivePrinterMultiConfig falls back to model defaults without slots", () => {
  const config = derivePrinterMultiConfig({
    printerId: "missing",
    model: "Bambu Lab A1 mini",
    printerOverview: [],
  });

  assert.equal(config.units, 0);
  assert.equal(config.slotsPerUnit > 0, true);
});

test("isBambuLabPrinter handles casing and whitespace", () => {
  assert.equal(isBambuLabPrinter(" Bambu Lab P1S "), true);
  assert.equal(isBambuLabPrinter("Prusa MK4"), false);
});
