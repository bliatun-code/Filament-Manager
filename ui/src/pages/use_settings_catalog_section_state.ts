import type { Dispatch, SetStateAction } from "react";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { useSettingsCatalogDerivedState } from "./use_settings_catalog_derived_state";
import { useSettingsCatalogRefreshMaterials } from "./use_settings_catalog_refresh_materials";
import { useSettingsCatalogRefreshProgress } from "./use_settings_catalog_refresh_progress";
import { useSettingsCatalogRefreshResult } from "./use_settings_catalog_refresh_result";
import { useSettingsCatalogRefreshState } from "./use_settings_catalog_refresh_state";
import { useSettingsSwatchDrafts } from "./use_settings_swatch_drafts";
import { useSettingsSwatchState } from "./use_settings_swatch_state";

type UseSettingsCatalogSectionStateInput = {
  catalogMasters: MasterCatalogRow[];
  catalogRefreshBusy: boolean;
  catalogSourceCacheScope: string | null;
  setCatalogRefreshBusy: Dispatch<SetStateAction<boolean>>;
  tauri: boolean;
};

export function useSettingsCatalogSectionState({
  catalogMasters,
  catalogRefreshBusy,
  catalogSourceCacheScope,
  setCatalogRefreshBusy,
  tauri,
}: UseSettingsCatalogSectionStateInput) {
  const swatchDrafts = useSettingsSwatchDrafts();
  const swatchState = useSettingsSwatchState();
  const refreshMaterials = useSettingsCatalogRefreshMaterials({
    cacheScope: catalogSourceCacheScope,
  });
  const refreshState = useSettingsCatalogRefreshState({
    catalogRefreshBusy,
    setCatalogRefreshBusy,
  });
  const refreshResult = useSettingsCatalogRefreshResult();
  const refreshProgress = useSettingsCatalogRefreshProgress({
    tauri,
  });
  const derivedState = useSettingsCatalogDerivedState({
    bambuDiscoveredMaterials: refreshMaterials.bambuDiscoveredMaterials,
    bambuRefreshMaterial: refreshMaterials.bambuRefreshMaterial,
    catalogMasters,
    catalogVendor: refreshMaterials.catalogVendor,
    esunDiscoveredMaterials: refreshMaterials.esunDiscoveredMaterials,
    esunRefreshMaterial: refreshMaterials.esunRefreshMaterial,
    swatchVendorFilter: swatchState.swatchVendorFilter,
    swatchSearch: swatchState.swatchSearch,
  });

  return {
    ...swatchDrafts,
    ...swatchState,
    ...refreshMaterials,
    ...refreshState,
    ...refreshResult,
    ...refreshProgress,
    ...derivedState,
  };
}
