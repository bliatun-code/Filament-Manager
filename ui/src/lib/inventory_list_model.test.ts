import test from "node:test";
import assert from "node:assert/strict";
import {
  formatInventoryDisplayTitle,
  formatMasterDisplayTitle,
  formatRollReference,
  normalizeDisplayToken,
} from "./inventory_list_model";

test("formatRollReference keeps the short user-facing spool suffix", () => {
  assert.equal(formatRollReference({ id: "spool_1234567890" }), "#567890");
  assert.equal(formatRollReference({ id: "ROLL-42" }), "#OLL-42");
});

test("normalizeDisplayToken trims empty placement text", () => {
  assert.equal(normalizeDisplayToken(" Shelf A "), "Shelf A");
  assert.equal(normalizeDisplayToken(" "), null);
  assert.equal(normalizeDisplayToken(null), null);
});

test("formatInventoryDisplayTitle removes immediate duplicate display tokens", () => {
  assert.equal(
    formatInventoryDisplayTitle("PLA", "PLA", "Blue"),
    "PLA · Blue",
  );
});

test("formatInventoryDisplayTitle collapses material prefixes from filament names", () => {
  assert.equal(
    formatInventoryDisplayTitle("PETG", "PETG-CF", "Black"),
    "PETG-CF · Black",
  );
  assert.equal(
    formatInventoryDisplayTitle("PLA", "PLA Basic", "Ocean Blue"),
    "PLA Basic · Ocean Blue",
  );
});

test("formatInventoryDisplayTitle splits existing middle-dot labels and falls back empty", () => {
  assert.equal(
    formatInventoryDisplayTitle("PLA · Matte", "Matte", "Blue"),
    "PLA · Matte · Blue",
  );
  assert.equal(formatInventoryDisplayTitle("", null, undefined), "—");
});

test("formatMasterDisplayTitle uses the shared inventory display title formatter", () => {
  assert.equal(
    formatMasterDisplayTitle({
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Blue",
    }),
    "PLA Basic · Blue",
  );
});
