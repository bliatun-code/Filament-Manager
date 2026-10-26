import { useMemo } from "react";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  buildSettingsCatalogState,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type UseSettingsCatalogDerivedStateOptions = {
  bambuDiscoveredMaterials: string[];
  bambuRefreshMaterial: string | null;
  catalogMasters: MasterCatalogRow[];
  catalogVendor: SettingsCatalogVendor;
  esunDiscoveredMaterials: string[];
  esunRefreshMaterial: string | null;
  swatchVendorFilter: string;
  swatchSearch?: string;
};

export function useSettingsCatalogDerivedState({
  bambuDiscoveredMaterials,
  bambuRefreshMaterial,
  catalogMasters,
  catalogVendor,
  esunDiscoveredMaterials,
  esunRefreshMaterial,
  swatchVendorFilter,
  swatchSearch,
}: UseSettingsCatalogDerivedStateOptions) {
  const catalogState = useMemo(
    () =>
      buildSettingsCatalogState({
        bambuDiscoveredMaterials,
        bambuRefreshMaterial,
        catalogMasters,
        catalogVendor,
        esunDiscoveredMaterials,
        esunRefreshMaterial,
        swatchVendorFilter,
        swatchSearch,
      }),
    [
      bambuDiscoveredMaterials,
      bambuRefreshMaterial,
      catalogMasters,
      catalogVendor,
      esunDiscoveredMaterials,
      esunRefreshMaterial,
      swatchVendorFilter,
      swatchSearch,
    ],
  );

  return {
    activeCatalogMasterCount: catalogState.activeCatalogMasterCount,
    activeCatalogMaterialOptions: catalogState.activeCatalogMaterialOptions,
    activeCatalogRefreshMaterial: catalogState.activeCatalogRefreshMaterial,
    missingSwatchMasters: catalogState.missingSwatchMasters,
    swatchVendorOptions: catalogState.swatchVendorOptions,
    visibleMissingSwatchMasters: catalogState.visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount: catalogState.visibleMissingSwatchVendorCount,
  };
}
