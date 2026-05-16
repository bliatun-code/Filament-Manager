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
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsCatalogSectionState({
  catalogMasters,
  tauri,
  t,
}: UseSettingsCatalogSectionStateInput) {
  const swatchDrafts = useSettingsSwatchDrafts();
  const swatchState = useSettingsSwatchState();
  const refreshMaterials = useSettingsCatalogRefreshMaterials();
  const refreshState = useSettingsCatalogRefreshState();
  const refreshResult = useSettingsCatalogRefreshResult();
  const refreshProgress = useSettingsCatalogRefreshProgress({
    initialMessage: t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
    tauri,
  });
  const derivedState = useSettingsCatalogDerivedState({
    bambuRefreshMaterials: refreshMaterials.bambuRefreshMaterials,
    catalogMasters,
    catalogVendor: refreshMaterials.catalogVendor,
    esunRefreshMaterials: refreshMaterials.esunRefreshMaterials,
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
