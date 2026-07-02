import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPlacementLabel,
  formatPrinterSlotLocation,
  formatPrinterSlotTokenLabel,
  parsePlacementLocation,
} from "./display_format";

const t = (_key: string, fallback = "") => fallback;

test("formatPlacementLabel keeps normal shelf locations unchanged", () => {
  assert.equal(formatPlacementLabel(t, " Shelf A "), "Shelf A");
  assert.equal(formatPlacementLabel(t, null), "Unassigned");
});

test("formatPrinterSlotLocation preserves the stored printer-slot contract", () => {
  assert.equal(
    formatPrinterSlotLocation("Brutus", "printer_1_ams_1_slot_2"),
    "Printer:Brutus:printer_1_ams_1_slot_2",
  );
});

test("parsePlacementLocation separates freeform and printer slot locations", () => {
  assert.deepEqual(parsePlacementLocation(null), { kind: "unassigned" });
  assert.deepEqual(parsePlacementLocation(" Shelf A "), {
    kind: "freeform",
    label: "Shelf A",
  });
  assert.deepEqual(parsePlacementLocation("Printer:Brutus:ams_1_slot_2"), {
    kind: "printer_slot",
    printerName: "Brutus",
    slotId: "ams_1_slot_2",
  });
  assert.deepEqual(parsePlacementLocation("Printer:MissingSlot"), {
    kind: "freeform",
    label: "MissingSlot",
  });
  assert.deepEqual(parsePlacementLocation("Printer:Brutus:"), {
    kind: "freeform",
    label: "Brutus:",
  });
});

test("formatPrinterSlotTokenLabel humanizes persisted printer slot ids", () => {
  assert.equal(formatPrinterSlotTokenLabel(t, "printer_177_ams_2_slot_4"), "AMS 2 · Slot 4");
  assert.equal(formatPrinterSlotTokenLabel(t, "printer_177_ext_slot_1"), "EXT Slot 1");
  assert.equal(formatPrinterSlotTokenLabel(t, "printer_177_external"), "EXT Slot");
  assert.equal(formatPrinterSlotTokenLabel(t, "printer_177_mmu3_channel_5"), "MMU3 · Channel 5");
  assert.equal(formatPrinterSlotTokenLabel(t, "printer_177_toolhead_2"), "Toolhead 2");
});

test("formatPlacementLabel humanizes known printer slot ids", () => {
  assert.equal(
    formatPlacementLabel(t, "Printer:X1C:ams_1_slot_3"),
    "X1C · AMS 1 · Slot 3",
  );
  assert.equal(
    formatPlacementLabel(t, "Printer:MK4:mmu3_channel_4"),
    "MK4 · MMU3 · Channel 4",
  );
  assert.equal(
    formatPlacementLabel(t, "Printer:XL:toolhead_5"),
    "XL · Toolhead 5",
  );
  assert.equal(formatPlacementLabel(t, "Printer:Mini:ext"), "Mini · EXT Slot");
  assert.equal(
    formatPlacementLabel(t, "Printer:Prusan:printer_1775235638366_ext_slot_1"),
    "Prusan · EXT Slot 1",
  );
});

test("formatPlacementLabel humanizes legacy raw printer slot ids inside freeform text", () => {
  assert.equal(
    formatPlacementLabel(t, "P1S · printer_1773326181381_ams_1_slot_1"),
    "P1S · AMS 1 · Slot 1",
  );
});

test("formatPlacementLabel prefers explicit slot labels from printer context", () => {
  const labels = new Map([["raw_slot", "Kitchen printer · Slot 2"]]);
  assert.equal(
    formatPlacementLabel(t, "Printer:Ignored:raw_slot", labels),
    "Kitchen printer · Slot 2",
  );
});
