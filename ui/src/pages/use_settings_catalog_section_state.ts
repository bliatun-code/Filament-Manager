import type { MasterCatalogRow } from "../lib/tauri_client";
import { useSettingsCatalogDerivedState } from "./use_settings_catalog_derived_state";
import { useSettingsCatalogRefreshMaterials } from "./use_settings_catalog_refresh_materials";
import { useSettingsCatalogRefreshProgress } from "./use_settings_catalog_refresh_progress";
import { useSettingsCatalogRefreshResult } from "./use_settings_catalog_refresh_result";
import { useSettingsCatalogRefreshState } from "./use_settings_catalog_refresh_state";
import { useSettingsSwatchDrafts } from "./use_settings_swatch_drafts";
import { useSettingsSwatchState } from "./use_settings_swatch_state";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsCatalogSectionStateInput = {
  catalogMasters: MasterCatalogRow[];
  catalogSourceCacheScope: string | null;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsCatalogSectionState({
  catalogMasters,
  catalogSourceCacheScope,
  tauri,
  t,
}: UseSettingsCatalogSectionStateInput) {
  const swatchDrafts = useSettingsSwatchDrafts();
  const swatchState = useSettingsSwatchState();
  const refreshMaterials = useSettingsCatalogRefreshMaterials({
    cacheScope: catalogSourceCacheScope,
  });
  const refreshState = useSettingsCatalogRefreshState();
  const refreshResult = useSettingsCatalogRefreshResult();
  const refreshProgress = useSettingsCatalogRefreshProgress({
    initialMessage: t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
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
