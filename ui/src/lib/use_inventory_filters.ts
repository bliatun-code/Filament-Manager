import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
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
import {
  readInventoryPagePreferences,
  writeInventoryPagePreferences,
  type InventoryViewMode,
} from "./inventory_page_preferences";

export type { InventoryViewMode } from "./inventory_page_preferences";

type UseInventoryFiltersOptions = {
  deterministicPagePreferences?: boolean;
};

export function useInventoryFilters(
  spools: InventorySpool[],
  { deterministicPagePreferences = false }: UseInventoryFiltersOptions = {},
) {
  const [initialPagePreferences] = useState(() =>
    readInventoryPagePreferences({ deterministic: deterministicPagePreferences }),
  );
  const persistedPagePreferencesRef = useRef(initialPagePreferences);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [materialFilter, setMaterialFilter] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [inventoryView, setInventoryViewState] = useState<InventoryViewMode>(
    initialPagePreferences.inventoryView,
  );
  const [advancedFiltersOpen, setAdvancedFiltersOpenState] = useState(
    initialPagePreferences.advancedFiltersOpen,
  );

  const setInventoryView = useCallback(
    (nextView: InventoryViewMode) => {
      setInventoryViewState(nextView);
      const nextPreferences = {
        ...persistedPagePreferencesRef.current,
        inventoryView: nextView,
      };
      persistedPagePreferencesRef.current = nextPreferences;
      writeInventoryPagePreferences(nextPreferences, {
        deterministic: deterministicPagePreferences,
      });
    },
    [deterministicPagePreferences],
  );

  const setAdvancedFiltersOpen = useCallback(
    (nextOpen: boolean) => {
      setAdvancedFiltersOpenState(nextOpen);
      const nextPreferences = {
        ...persistedPagePreferencesRef.current,
        advancedFiltersOpen: nextOpen,
      };
      persistedPagePreferencesRef.current = nextPreferences;
      writeInventoryPagePreferences(nextPreferences, {
        deterministic: deterministicPagePreferences,
      });
    },
    [deterministicPagePreferences],
  );

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
  const activeFilterCount = [
    deferredSearch.trim().length > 0,
    statusFilter !== "ALL",
    lowStockOnly,
    ownershipFilter !== "ALL",
    vendorFilter !== "ALL",
    materialFilter !== "ALL",
  ].filter(Boolean).length;

  const resetFilters = useCallback(() => {
    setStatusFilter("ALL");
    setOwnershipFilter("ALL");
    setVendorFilter("ALL");
    setMaterialFilter("ALL");
    setSearch("");
    setLowStockOnly(false);
  }, []);

  const showLowStockList = useCallback(() => {
    setInventoryViewState("LIST");
    setStatusFilter("ALL");
    setOwnershipFilter("ALL");
    setVendorFilter("ALL");
    setMaterialFilter("ALL");
    setSearch("");
    setLowStockOnly(true);
  }, []);

  return {
    activeFilterCount,
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
