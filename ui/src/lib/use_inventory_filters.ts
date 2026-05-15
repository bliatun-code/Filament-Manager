import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  buildMaterialOptions,
  buildVendorOptions,
  filterInventorySpools,
  groupInventorySpools,
  type InventorySpool,
  type OwnershipFilter,
  type SpoolGroup,
  type StatusFilter,
} from "./inventory_list_model";

export type InventoryViewMode = "CARDS" | "LIST";

export function useInventoryFilters(spools: InventorySpool[]) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [materialFilter, setMaterialFilter] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [inventoryView, setInventoryView] = useState<InventoryViewMode>("CARDS");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  const vendorOptions = useMemo(() => buildVendorOptions(spools), [spools]);
  const materialOptions = useMemo(() => buildMaterialOptions(spools), [spools]);
  const filteredSpools = useMemo(
    () =>
      filterInventorySpools(spools, {
        search: deferredSearch,
        statusFilter,
        ownershipFilter,
        materialFilter,
        vendorFilter,
        lowStockOnly,
      }),
    [
      deferredSearch,
      lowStockOnly,
      materialFilter,
      ownershipFilter,
      spools,
      statusFilter,
      vendorFilter,
    ],
  );
  const groupedSpools = useMemo<SpoolGroup[]>(
    () => groupInventorySpools(filteredSpools),
    [filteredSpools],
  );
  const activeAdvancedFilterCount = [
    inventoryView !== "CARDS",
    ownershipFilter !== "ALL",
    vendorFilter !== "ALL",
    materialFilter !== "ALL",
  ].filter(Boolean).length;

  const resetFilters = useCallback(() => {
    setInventoryView("CARDS");
    setStatusFilter("ALL");
    setOwnershipFilter("ALL");
    setVendorFilter("ALL");
    setMaterialFilter("ALL");
    setSearch("");
    setLowStockOnly(false);
  }, []);

  const showLowStockList = useCallback(() => {
    setInventoryView("LIST");
    setStatusFilter("ALL");
    setOwnershipFilter("ALL");
    setVendorFilter("ALL");
    setMaterialFilter("ALL");
    setSearch("");
    setLowStockOnly(true);
  }, []);

  return {
    activeAdvancedFilterCount,
    advancedFiltersOpen,
    filteredSpools,
    groupedSpools,
    inventoryView,
    lowStockOnly,
    materialFilter,
    materialOptions,
    ownershipFilter,
    resetFilters,
    search,
    setAdvancedFiltersOpen,
    setInventoryView,
    setLowStockOnly,
    setMaterialFilter,
    setOwnershipFilter,
    setSearch,
    setStatusFilter,
    setVendorFilter,
    showLowStockList,
    statusFilter,
    vendorFilter,
    vendorOptions,
    visibleInventoryCount: filteredSpools.length,
  };
}
