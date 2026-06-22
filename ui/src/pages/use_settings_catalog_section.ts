import type { Dispatch, SetStateAction } from "react";
import type { MasterCatalogRow } from "../lib/tauri_client";
import type {
  SettingsCatalogRefreshMessageLabels,
  SettingsCatalogRefreshSummaryLabels,
  SettingsSwatchBulkMessageLabels,
  SettingsSwatchErrorMessageLabels,
  SettingsSwatchSavedMessageLabels,
} from "./settings_catalog_model";
import { buildSettingsCatalogRouteProps } from "./settings_catalog_route_props";
import { useSettingsCatalogRefreshActions } from "./use_settings_catalog_refresh_actions";
import { useSettingsCatalogSectionState } from "./use_settings_catalog_section_state";
import { useSettingsSwatchActions } from "./use_settings_swatch_actions";
import { useSettingsSwatchConfirm } from "./use_settings_swatch_confirm";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsCatalogSectionInput = {
  busy: boolean;
  catalogMasters: MasterCatalogRow[];
  reloadSettings: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsCatalogRefreshMessageLabels: () => SettingsCatalogRefreshMessageLabels;
  settingsCatalogRefreshSummaryLabels: () => SettingsCatalogRefreshSummaryLabels;
  settingsSwatchBulkMessageLabels: () => SettingsSwatchBulkMessageLabels;
  settingsSwatchErrorMessageLabels: () => SettingsSwatchErrorMessageLabels;
  settingsSwatchSavedMessageLabels: () => SettingsSwatchSavedMessageLabels;
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsCatalogSection({
  busy,
  catalogMasters,
  reloadSettings,
  setError,
  setInfo,
  settingsCatalogRefreshMessageLabels,
  settingsCatalogRefreshSummaryLabels,
  settingsSwatchBulkMessageLabels,
  settingsSwatchErrorMessageLabels,
  settingsSwatchSavedMessageLabels,
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientReadOnly,
  tauri,
  t,
}: UseSettingsCatalogSectionInput) {
  const catalogSectionState = useSettingsCatalogSectionState({
    catalogMasters,
    tauri,
    t,
  });
  const {
    activeCatalogMasterCount,
    activeCatalogMaterialOptions,
    activeCatalogRefreshMaterials,
    beginCatalogRefreshResult,
    catalogRefreshBusy,
    catalogRefreshElapsedSeconds,
    catalogRefreshLog,
    catalogRefreshPhase,
    catalogRefreshProgressMessage,
    catalogRefreshSummary,
    catalogRefreshVendor,
    catalogVendor,
    clearCatalogRefreshMaterials,
    completeCatalogRefreshResult,
    confirmBulkSwatch,
    failCatalogRefreshResult,
    getCatalogRefreshMaterials,
    missingSwatchMasters,
    setCatalogRefreshBusy,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
    setCatalogVendor,
    setConfirmBulkSwatch,
    setSwatchBusy,
    setSwatchVendorFilter,
    showCatalogRefreshLog,
    swatchBusy,
    swatchDraftById,
    swatchVendorFilter,
    swatchVendorOptions,
    toggleCatalogRefreshLog,
    toggleCatalogRefreshMaterial,
    updateSwatchDraft,
    visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount,
  } = catalogSectionState;

  const { clearConfirmBulkSwatch } = useSettingsSwatchConfirm({
    confirmBulkSwatch,
    setConfirmBulkSwatch,
    swatchVendorFilter,
    visibleMissingSwatchCount: visibleMissingSwatchMasters.length,
  });

  const { handleRefreshVendorCatalog } = useSettingsCatalogRefreshActions({
    beginCatalogRefreshResult,
    busy,
    catalogRefreshBusy,
    completeCatalogRefreshResult,
    failCatalogRefreshResult,
    getCatalogRefreshMaterials,
    reloadSettings,
    setCatalogRefreshBusy,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
    setError,
    setInfo,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    swatchBusy,
    tauri,
  });

  const { handleBulkAutoFillMissingSwatches, handleSaveMissingSwatch } =
    useSettingsSwatchActions({
      busy,
      clearConfirmBulkSwatch,
      confirmBulkSwatch,
      reloadSettings,
      setConfirmBulkSwatch,
      setError,
      setInfo,
      setSwatchBusy,
      settingsSwatchBulkMessageLabels,
      settingsSwatchErrorMessageLabels,
      settingsSwatchSavedMessageLabels,
      settingsClientHostBaseUrl,
      settingsClientLibraryId,
      settingsClientReadOnly,
      swatchBusy,
      swatchDraftById,
      tauri,
      visibleMissingSwatchMasters,
    });

  const settingsCatalogRouteProps = buildSettingsCatalogRouteProps({
    helpText: settingsClientReadOnly
      ? t(
          "settings.catalogTabClientHelp",
          "This client shows the host catalog. Swatch fixes and vendor catalog refreshes are saved on the host.",
        )
      : t(
          "settings.catalogTabHelp",
          "Catalog updates are performed here. Inventory add-flow uses the local catalog managed on this page.",
        ),
    missingSwatchesPanel: {
      busy,
      catalogRefreshBusy,
      confirmBulkSwatch,
      missingSwatchCount: missingSwatchMasters.length,
      swatchBusy,
      swatchDraftById,
      swatchVendorFilter,
      swatchVendorOptions,
      tauri,
      t,
      visibleMissingSwatchMasters,
      visibleMissingSwatchVendorCount,
      onBulkAutoFill: handleBulkAutoFillMissingSwatches,
      onRefresh: reloadSettings,
      onSaveMissingSwatch: handleSaveMissingSwatch,
      onSwatchDraftChange: updateSwatchDraft,
      onVendorFilterChange: setSwatchVendorFilter,
    },
    refreshPanel: {
      activeCatalogMasterCount,
      activeCatalogMaterialOptions,
      activeCatalogRefreshMaterials,
      busy,
      catalogCount: catalogMasters.length,
      catalogRefreshBusy,
      catalogRefreshElapsedSeconds,
      catalogRefreshLog,
      catalogRefreshPhase,
      catalogRefreshProgressMessage,
      catalogRefreshSummary,
      catalogRefreshVendor,
      catalogVendor,
      showCatalogRefreshLog,
      settingsClientReadOnly,
      swatchBusy,
      tauri,
      t,
      onClearCatalogRefreshMaterials: clearCatalogRefreshMaterials,
      onRefreshVendorCatalog: handleRefreshVendorCatalog,
      onSetCatalogVendor: setCatalogVendor,
      onToggleCatalogRefreshLog: toggleCatalogRefreshLog,
      onToggleCatalogRefreshMaterial: toggleCatalogRefreshMaterial,
    },
  });

  return {
    missingSwatchCount: missingSwatchMasters.length,
    settingsCatalogRouteProps,
    setSwatchDraftById: catalogSectionState.setSwatchDraftById,
  };
}
