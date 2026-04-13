import test from "node:test";
import assert from "node:assert/strict";

import {
  formatPlacementLabel,
  sortCatalogMastersAlphabetically,
  sortSpoolRowsAlphabetically,
} from "./formatters.js";

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
