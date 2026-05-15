import test from "node:test";
import assert from "node:assert/strict";
import {
  formatInventoryOwnershipLabel,
  formatInventoryOwnershipSummary,
  formatInventoryStatusLabel,
  formatInventoryDisplayTitle,
  formatMasterDisplayTitle,
  formatRollReference,
  inventoryOwnershipTone,
  inventoryStatusTone,
  normalizeDisplayToken,
  remainingBarClass,
  spoolRemainingRatio,
} from "./inventory_list_model";

const t = (_key: string, fallback = "") => fallback;

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

test("inventory status labels and tones normalize legacy status values", () => {
  assert.equal(formatInventoryStatusLabel(t, "IN_USE"), "Assigned");
  assert.equal(formatInventoryStatusLabel(t, "BORROWED"), "Loaned out");
  assert.equal(formatInventoryStatusLabel(t, "EMPTY"), "Empty");
  assert.equal(formatInventoryStatusLabel(t, "unknown"), "In stock");
  assert.equal(inventoryStatusTone("IN_STOCK"), "success");
  assert.equal(inventoryStatusTone("ASSIGNED"), "info");
  assert.equal(inventoryStatusTone("BORROWED"), "warning");
  assert.equal(inventoryStatusTone("EMPTY"), "neutral");
  assert.equal(inventoryStatusTone("LOST"), "danger");
});

test("inventory ownership labels, summaries, and tones normalize borrowed-in metadata", () => {
  assert.equal(formatInventoryOwnershipLabel(t, "BORROWED-IN"), "Borrowed in");
  assert.equal(formatInventoryOwnershipLabel(t, null), "Owned");
  assert.equal(inventoryOwnershipTone("BORROWED_IN"), "warning");
  assert.equal(inventoryOwnershipTone("OWNED"), "neutral");
  assert.equal(
    formatInventoryOwnershipSummary(t, {
      id: "spool_a",
      masterId: "master_a",
      vendor: "Bambu",
      material: "PLA",
      filamentName: "PLA Basic",
      colorName: "Blue",
      initialWeightGrams: 1000,
      status: "IN_STOCK",
      ownershipType: "BORROWED_IN",
      ownerName: "Ada",
    }),
    "Borrowed from: Ada",
  );
});

test("spoolRemainingRatio clamps missing, negative, and overfilled weights", () => {
  assert.equal(spoolRemainingRatio({ initialWeightGrams: 0, remainingGrams: 500 }), 1);
  assert.equal(spoolRemainingRatio({ initialWeightGrams: 1000, remainingGrams: -50 }), 0);
  assert.equal(spoolRemainingRatio({ initialWeightGrams: 1000, remainingGrams: 1250 }), 1);
  assert.equal(spoolRemainingRatio({ initialWeightGrams: 1000, remainingGrams: 250 }), 0.25);
});

test("remainingBarClass keeps stock level color thresholds stable", () => {
  assert.equal(remainingBarClass(0.2), "bg-rose-500 dark:bg-rose-300");
  assert.equal(remainingBarClass(0.21), "bg-amber-500 dark:bg-amber-300");
  assert.equal(remainingBarClass(0.45), "bg-amber-500 dark:bg-amber-300");
  assert.equal(remainingBarClass(0.46), "bg-emerald-500 dark:bg-emerald-300");
});
