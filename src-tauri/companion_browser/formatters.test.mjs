import test from "node:test";
import assert from "node:assert/strict";

import {
  formatGrams,
  formatInventoryDisplayTitle,
  formatPlacementLabel,
  formatPrinterSlotLocation,
  formatPrinterSlotTokenLabel,
  parsePlacementLocation,
  sortCatalogMastersAlphabetically,
  sortSpoolRowsAlphabetically,
} from "./formatters.js";

test("formatGrams follows the selected Companion locale", () => {
  assert.equal(formatGrams(1234.5678, "en"), "1,234.568 g");
  assert.equal(formatGrams(1234.5678, "nb"), "1\u00a0234,568 g");
  assert.equal(formatGrams(null, "nb"), "Unknown");
});

test("formatInventoryDisplayTitle narrowly normalizes catalog color presentation", () => {
  const cases = [
    ["PETG", "PETG Basic", "Gray(30107)", "PETG Basic · Gray (30107)"],
    ["PETG", "PETG-CF", "Titan Gray  (31101)", "PETG-CF · Titan Gray (31101)"],
    ["PLA", "PLA+", "Dark blue", "PLA+ · Dark Blue"],
    [
      "PLA",
      "PLA Matte",
      "Matte Lilac purple (11700)",
      "PLA Matte · Matte Lilac Purple (11700)",
    ],
    ["PLA", "PLA Basic", "Mistletoe Green (10502)", "PLA Basic · Mistletoe Green (10502)"],
    [
      "PLA",
      "PLA Basic Gradient",
      "Ocean to Meadow (10902)",
      "PLA Basic Gradient · Ocean to Meadow (10902)",
    ],
    ["PLA", "PLA+ Refilament", "eSpool+", "PLA+ Refilament · eSpool+"],
    ["PLA", "PLA Basic", "Color (1234)", "PLA Basic · Color (1234)"],
    [
      "PLA",
      "PLA-Silk Magic",
      "Black Purple+black Gold+black Green+black Red",
      "PLA-Silk Magic · Black Purple+black Gold+black Green+black Red",
    ],
  ];

  for (const [material, filament, color, expected] of cases) {
    assert.equal(formatInventoryDisplayTitle(material, filament, color), expected);
  }
});

test("formatPrinterSlotLocation preserves the stored printer-slot contract", () => {
  assert.equal(
    formatPrinterSlotLocation("Brutus", "printer_1_ams_1_slot_2"),
    "Printer:Brutus:printer_1_ams_1_slot_2",
  );
});

test("parsePlacementLocation separates freeform and printer slot locations", () => {
  assert.deepEqual(parsePlacementLocation(null), { kind: "unassigned" });
  assert.deepEqual(parsePlacementLocation(" Shelf A "), { kind: "freeform", label: "Shelf A" });
  assert.deepEqual(parsePlacementLocation("Printer:Brutus:ams_1_slot_2"), {
    kind: "printer_slot",
    printerName: "Brutus",
    slotId: "ams_1_slot_2",
  });
  assert.deepEqual(parsePlacementLocation("Printer:Lab:North:ams_1_slot_2"), {
    kind: "printer_slot",
    printerName: "Lab:North",
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
  assert.equal(formatPrinterSlotTokenLabel("printer_177_ams_2_slot_4"), "AMS 2 · Slot 4");
  assert.equal(formatPrinterSlotTokenLabel("printer_177_ext_slot_1"), "EXT Slot 1");
  assert.equal(formatPrinterSlotTokenLabel("printer_177_external"), "EXT Slot");
  assert.equal(formatPrinterSlotTokenLabel("printer_177_mmu3_channel_5"), "MMU3 · Channel 5");
  assert.equal(formatPrinterSlotTokenLabel("printer_177_toolhead_2"), "Toolhead 2");
});

test("formatPlacementLabel humanizes raw printer slot ids inside placement strings", () => {
  assert.equal(
    formatPlacementLabel("P1S · printer_1773326181381_ams_1_slot_1"),
    "P1S · AMS 1 · Slot 1",
  );
});

test("formatPlacementLabel humanizes Printer-prefixed storage placements", () => {
  assert.equal(
    formatPlacementLabel("Printer:P1S:printer_1773326181381_ams_1_slot_4"),
    "P1S · AMS 1 · Slot 4",
  );
  assert.equal(
    formatPlacementLabel("Printer:Lab:North:printer_1773326181381_ams_1_slot_4"),
    "Lab:North · AMS 1 · Slot 4",
  );
});

test("formatPlacementLabel humanizes external slot ids with explicit slot index", () => {
  assert.equal(
    formatPlacementLabel("Prusan · printer_1775235638366_ext_slot_1"),
    "Prusan · EXT Slot 1",
  );
});

test("formatPlacementLabel humanizes Printer-prefixed external slot ids in norwegian", () => {
  assert.equal(
    formatPlacementLabel("Printer:Prusan:printer_1775235638366_ext_slot_1", "nb"),
    "Prusan · EXT-spor 1",
  );
});

test("formatPlacementLabel humanizes less common printer slot families", () => {
  assert.equal(formatPlacementLabel("Printer:MK4:printer_177_mmu3_channel_5"), "MK4 · MMU3 · Channel 5");
  assert.equal(formatPlacementLabel("Printer:XL:printer_177_toolhead_2"), "XL · Toolhead 2");
});

test("sortCatalogMastersAlphabetically follows the same deduplicated display title ordering", () => {
  const sorted = sortCatalogMastersAlphabetically([
    { id: "m-2", material: "PETG", filament_name: "Basic", color_name: "Black", vendor: "Bambu" },
    { id: "m-3", material: "PLA", filament_name: "PLA Basic", color_name: "Silver", vendor: "Bambu" },
    { id: "m-1", material: "ABS", filament_name: "ABS Azure", color_name: "40601", vendor: "Bambu" },
  ]);

  assert.deepEqual(
    sorted.map((row) => row.id),
    ["m-1", "m-2", "m-3"],
  );
});

test("sortSpoolRowsAlphabetically orders companion spool rows like the desktop pickers", () => {
  const sorted = sortSpoolRowsAlphabetically([
    {
      spool: { id: "spool-b", location_id: "Shelf 3" },
      master: { material: "PETG", filament_name: "Basic", color_name: "Black", vendor: "Bambu" },
    },
    {
      spool: { id: "spool-c", location_id: "Shelf 1" },
      master: { material: "PLA", filament_name: "PLA Basic", color_name: "Silver", vendor: "Bambu" },
    },
    {
      spool: { id: "spool-a", location_id: "Shelf 2" },
      master: { material: "ABS", filament_name: "ABS Azure", color_name: "40601", vendor: "Bambu" },
    },
  ]);

  assert.deepEqual(
    sorted.map((row) => row.spool.id),
    ["spool-a", "spool-b", "spool-c"],
  );
});
