import { useMemo } from "react";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  buildSettingsCatalogState,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type UseSettingsCatalogDerivedStateOptions = {
  bambuRefreshMaterials: string[];
  catalogMasters: MasterCatalogRow[];
  catalogVendor: SettingsCatalogVendor;
  esunRefreshMaterials: string[];
  swatchVendorFilter: string;
};

export function useSettingsCatalogDerivedState({
  bambuRefreshMaterials,
  catalogMasters,
  catalogVendor,
  esunRefreshMaterials,
  swatchVendorFilter,
}: UseSettingsCatalogDerivedStateOptions) {
  const catalogState = useMemo(
    () =>
      buildSettingsCatalogState({
        bambuRefreshMaterials,
        catalogMasters,
        catalogVendor,
        esunRefreshMaterials,
        swatchVendorFilter,
      }),
    [
      bambuRefreshMaterials,
      catalogMasters,
      catalogVendor,
      esunRefreshMaterials,
      swatchVendorFilter,
    ],
  );

  return {
    activeCatalogMasterCount: catalogState.activeCatalogMasterCount,
    activeCatalogMaterialOptions: catalogState.activeCatalogMaterialOptions,
    activeCatalogRefreshMaterials: catalogState.activeCatalogRefreshMaterials,
    missingSwatchMasters: catalogState.missingSwatchMasters,
    swatchVendorOptions: catalogState.swatchVendorOptions,
    visibleMissingSwatchMasters: catalogState.visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount: catalogState.visibleMissingSwatchVendorCount,
  };
}
