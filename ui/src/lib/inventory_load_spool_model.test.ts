import assert from "node:assert/strict";
import test from "node:test";

import {
  availableInventoryLoadSlots,
  prepareInventoryLoadSpoolAssignment,
} from "./inventory_load_spool_model";
import type { InventorySpool } from "./inventory_list_model";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

function spool(status: InventorySpool["status"] = "IN_STOCK"): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Bambu Lab",
    material: "PLA",
    filamentName: "Basic",
    colorName: "White",
    initialWeightGrams: 1000,
    status,
    ownershipType: "OWNED",
  };
}

function slot(overrides: Partial<InventoryPrinterSlotOption> = {}): InventoryPrinterSlotOption {
  return {
    printerId: "printer-1",
    printerName: "Workshop",
    printerModel: "P1S",
    amsId: "ams-1",
    slotId: "slot-1",
    slotIndex: 0,
    spoolId: null,
    ...overrides,
  };
}

test("contextual load keeps the selected spool in the prepared printer assignment", () => {
  const prepared = prepareInventoryLoadSpoolAssignment({
    assignedSlot: null,
    availableSlots: [slot()],
    selectedSlotId: "slot-1",
    spool: spool(),
  });
  assert.deepEqual(prepared, {
    ok: true,
    input: {
      printer_id: "printer-1",
      slot_id: "slot-1",
      spool_id: "spool-1",
    },
  });
});

test("contextual load fails closed for occupied, stale, and unavailable choices", () => {
  assert.deepEqual(availableInventoryLoadSlots([slot(), slot({ slotId: "slot-2", spoolId: "x" })]), [slot()]);
  assert.deepEqual(
    prepareInventoryLoadSpoolAssignment({
      assignedSlot: null,
      availableSlots: [slot()],
      selectedSlotId: "missing-slot",
      spool: spool(),
    }),
    { ok: false, reason: "stale-slot" },
  );
  assert.deepEqual(
    prepareInventoryLoadSpoolAssignment({
      assignedSlot: null,
      availableSlots: [slot()],
      selectedSlotId: "slot-1",
      spool: spool("BORROWED"),
    }),
    { ok: false, reason: "unavailable-spool" },
  );
});
