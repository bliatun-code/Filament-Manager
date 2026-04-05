import test from "node:test";
import assert from "node:assert/strict";

import { formatPlacementLabel } from "./formatters.js";

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
