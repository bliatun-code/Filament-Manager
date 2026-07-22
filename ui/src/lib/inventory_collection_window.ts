import type { InventorySpool, SpoolGroup } from "./inventory_list_model";
import type { InventoryViewMode } from "./use_inventory_filters";

export const INVENTORY_CARD_GROUP_PAGE_SIZE = 96;
export const INVENTORY_LIST_PAGE_SIZE = 200;

export type InventoryCollectionWindow = {
  groupedSpools: SpoolGroup[];
  filteredSpools: InventorySpool[];
  hasMore: boolean;
  representedSpoolCount: number;
  totalSpoolCount: number;
};

export function initialInventoryCollectionLimit(inventoryView: InventoryViewMode): number {
  return inventoryView === "CARDS"
    ? INVENTORY_CARD_GROUP_PAGE_SIZE
    : INVENTORY_LIST_PAGE_SIZE;
}

export function nextInventoryCollectionLimit(
  inventoryView: InventoryViewMode,
  currentLimit: number,
): number {
  return currentLimit + initialInventoryCollectionLimit(inventoryView);
}

export function buildInventoryCollectionWindow({
  filteredSpools,
  groupedSpools,
  inventoryView,
  limit,
}: {
  filteredSpools: InventorySpool[];
  groupedSpools: SpoolGroup[];
  inventoryView: InventoryViewMode;
  limit: number;
}): InventoryCollectionWindow {
  const safeLimit = Math.max(initialInventoryCollectionLimit(inventoryView), Math.floor(limit));
  if (inventoryView === "LIST") {
    const visibleSpools = filteredSpools.slice(0, safeLimit);
    return {
      filteredSpools: visibleSpools,
      groupedSpools: [],
      hasMore: visibleSpools.length < filteredSpools.length,
      representedSpoolCount: visibleSpools.length,
      totalSpoolCount: filteredSpools.length,
    };
  }

  const visibleGroups = groupedSpools.slice(0, safeLimit);
  return {
    filteredSpools: [],
    groupedSpools: visibleGroups,
    hasMore: visibleGroups.length < groupedSpools.length,
    representedSpoolCount: visibleGroups.reduce(
      (count, group) => count + group.rolls.length,
      0,
    ),
    totalSpoolCount: filteredSpools.length,
  };
}
