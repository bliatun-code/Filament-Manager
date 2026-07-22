import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInventoryCollectionWindow,
  INVENTORY_CARD_GROUP_PAGE_SIZE,
  INVENTORY_LIST_PAGE_SIZE,
  nextInventoryCollectionLimit,
} from "./inventory_collection_window";
import type { InventorySpool, SpoolGroup } from "./inventory_list_model";

function spool(index: number): InventorySpool {
  return {
    id: `spool-${index}`,
    masterId: `master-${index}`,
    vendor: "Vendor",
    material: "PLA",
    filamentName: `Filament ${index}`,
    colorName: `Color ${index}`,
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
  };
}

function group(index: number, rolls: InventorySpool[]): SpoolGroup {
  return {
    key: `group-${index}`,
    vendor: "Vendor",
    material: "PLA",
    filamentName: `Filament ${index}`,
    colorName: `Color ${index}`,
    ownershipType: "OWNED",
    totalRemaining: rolls.length * 1000,
    rolls,
  };
}

test("list rendering stays bounded while reporting all 1,201 spools", () => {
  const spools = Array.from({ length: 1_201 }, (_, index) => spool(index));
  const window = buildInventoryCollectionWindow({
    filteredSpools: spools,
    groupedSpools: [],
    inventoryView: "LIST",
    limit: INVENTORY_LIST_PAGE_SIZE,
  });

  assert.equal(window.filteredSpools.length, 200);
  assert.equal(window.representedSpoolCount, 200);
  assert.equal(window.totalSpoolCount, 1_201);
  assert.equal(window.hasMore, true);
});

test("card rendering stays bounded at 5,000 distinct spool groups", () => {
  const spools = Array.from({ length: 5_000 }, (_, index) => spool(index));
  const groups = spools.map((roll, index) => group(index, [roll]));
  const window = buildInventoryCollectionWindow({
    filteredSpools: spools,
    groupedSpools: groups,
    inventoryView: "CARDS",
    limit: INVENTORY_CARD_GROUP_PAGE_SIZE,
  });

  assert.equal(window.groupedSpools.length, 96);
  assert.equal(window.representedSpoolCount, 96);
  assert.equal(window.totalSpoolCount, 5_000);
  assert.equal(window.hasMore, true);
});

test("card groups represent all 10,000 spools without rendering 10,000 cards", () => {
  const spools = Array.from({ length: 10_000 }, (_, index) => spool(index));
  const groups = Array.from({ length: 100 }, (_, groupIndex) =>
    group(groupIndex, spools.slice(groupIndex * 100, groupIndex * 100 + 100)),
  );
  const window = buildInventoryCollectionWindow({
    filteredSpools: spools,
    groupedSpools: groups,
    inventoryView: "CARDS",
    limit: INVENTORY_CARD_GROUP_PAGE_SIZE,
  });

  assert.equal(window.groupedSpools.length, 96);
  assert.equal(window.representedSpoolCount, 9_600);
  assert.equal(window.totalSpoolCount, 10_000);
  assert.equal(window.hasMore, true);

  const finalWindow = buildInventoryCollectionWindow({
    filteredSpools: spools,
    groupedSpools: groups,
    inventoryView: "CARDS",
    limit: nextInventoryCollectionLimit("CARDS", INVENTORY_CARD_GROUP_PAGE_SIZE),
  });
  assert.equal(finalWindow.groupedSpools.length, 100);
  assert.equal(finalWindow.representedSpoolCount, 10_000);
  assert.equal(finalWindow.hasMore, false);
});
