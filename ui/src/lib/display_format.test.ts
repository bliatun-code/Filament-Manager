import test from "node:test";
import assert from "node:assert/strict";
import { formatPlacementLabel, parsePlacementLocation } from "./display_format";

const t = (_key: string, fallback = "") => fallback;

test("formatPlacementLabel keeps normal shelf locations unchanged", () => {
  assert.equal(formatPlacementLabel(t, " Shelf A "), "Shelf A");
  assert.equal(formatPlacementLabel(t, null), "Unassigned");
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
});

test("formatPlacementLabel prefers explicit slot labels from printer context", () => {
  const labels = new Map([["raw_slot", "Kitchen printer · Slot 2"]]);
  assert.equal(
    formatPlacementLabel(t, "Printer:Ignored:raw_slot", labels),
    "Kitchen printer · Slot 2",
  );
});
