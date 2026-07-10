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
  isInventorySpoolLoanTrackingCandidate,
  isInventorySpoolLowStockCandidate,
  isInventorySpoolVisibleForStatusFilter,
  normalizeDisplayToken,
  remainingBarClass,
  spoolRemainingRatio,
  type InventorySpool,
} from "./inventory_list_model";

const t = (_key: string, fallback = "") => fallback;

function spool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool_1",
    masterId: "master_1",
    vendor: "Generic",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Blue",
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    remainingGrams: 500,
    ...overrides,
  };
}

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
  ] as const;

  for (const [material, filament, color, expected] of cases) {
    assert.equal(formatInventoryDisplayTitle(material, filament, color), expected);
  }
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
  assert.equal(formatInventoryStatusLabel(t, "MISSING"), "Missing");
  assert.equal(formatInventoryStatusLabel(t, "DELETED"), "Deleted");
  assert.equal(formatInventoryStatusLabel(t, "unknown"), "In stock");
  assert.equal(inventoryStatusTone("IN_STOCK"), "success");
  assert.equal(inventoryStatusTone("ASSIGNED"), "info");
  assert.equal(inventoryStatusTone("BORROWED"), "warning");
  assert.equal(inventoryStatusTone("EMPTY"), "neutral");
  assert.equal(inventoryStatusTone("LOST"), "danger");
  assert.equal(inventoryStatusTone("MISSING"), "danger");
  assert.equal(inventoryStatusTone("DELETED"), "danger");
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

test("inventory spool status predicates centralize list visibility and low-stock rules", () => {
  assert.equal(isInventorySpoolVisibleForStatusFilter(spool({ status: "IN_STOCK" }), "ALL"), true);
  assert.equal(isInventorySpoolVisibleForStatusFilter(spool({ status: "ASSIGNED" }), "ALL"), true);
  assert.equal(isInventorySpoolVisibleForStatusFilter(spool({ status: "LOST" }), "ALL"), true);
  assert.equal(isInventorySpoolVisibleForStatusFilter(spool({ status: "EMPTY" }), "ALL"), false);
  assert.equal(
    isInventorySpoolVisibleForStatusFilter(spool({ status: "ASSIGNED" }), "ASSIGNED"),
    true,
  );
  assert.equal(
    isInventorySpoolVisibleForStatusFilter(spool({ status: "IN_STOCK" }), "ASSIGNED"),
    false,
  );

  assert.equal(isInventorySpoolLowStockCandidate(spool({ remainingGrams: 90 })), true);
  assert.equal(isInventorySpoolLowStockCandidate(spool({ status: "ASSIGNED", remainingGrams: 90 })), true);
  assert.equal(isInventorySpoolLowStockCandidate(spool({ status: "BORROWED", remainingGrams: 90 })), true);
  assert.equal(isInventorySpoolLowStockCandidate(spool({ status: "EMPTY", remainingGrams: 90 })), false);
  assert.equal(isInventorySpoolLowStockCandidate(spool({ status: "LOST", remainingGrams: 90 })), false);
  assert.equal(isInventorySpoolLowStockCandidate(spool({ remainingGrams: 0 })), false);
});

test("inventory loan tracking candidates normalize ownership and excluded states", () => {
  const activeLoanIds = new Set(["loaned"]);
  assert.equal(isInventorySpoolLoanTrackingCandidate(spool(), activeLoanIds), true);
  assert.equal(
    isInventorySpoolLoanTrackingCandidate(
      spool({ id: "borrowed-in", ownershipType: "BORROWED_IN" }),
      activeLoanIds,
    ),
    false,
  );
  assert.equal(
    isInventorySpoolLoanTrackingCandidate(spool({ id: "empty", status: "EMPTY" }), activeLoanIds),
    false,
  );
  assert.equal(
    isInventorySpoolLoanTrackingCandidate(spool({ id: "lost", status: "LOST" }), activeLoanIds),
    false,
  );
  assert.equal(
    isInventorySpoolLoanTrackingCandidate(spool({ id: "loaned" }), activeLoanIds),
    false,
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
