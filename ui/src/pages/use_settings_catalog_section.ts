import type { Dispatch, SetStateAction } from "react";
import type { MasterCatalogRow } from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
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
  catalogRefreshBusy: boolean;
  catalogRowsAvailable: boolean;
  catalogRowsUnavailable: boolean;
  locale: Locale;
  reloadSettings: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setCatalogRefreshBusy: Dispatch<SetStateAction<boolean>>;
  settingsCatalogRefreshMessageLabels: (
    params?: { count?: number },
  ) => SettingsCatalogRefreshMessageLabels;
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
  catalogRefreshBusy: appCatalogRefreshBusy,
  catalogRowsAvailable,
  catalogRowsUnavailable,
  locale,
  reloadSettings,
  setError,
  setInfo,
  setCatalogRefreshBusy: setAppCatalogRefreshBusy,
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
    catalogRefreshBusy: appCatalogRefreshBusy,
    catalogSourceCacheScope: settingsClientReadOnly
      ? settingsClientLibraryId
      : "local",
    setCatalogRefreshBusy: setAppCatalogRefreshBusy,
    tauri,
    t,
  });
  const {
    activeCatalogMasterCount,
    activeCatalogMaterialOptions,
    activeCatalogRefreshMaterial,
    beginCatalogRefreshResult,
    catalogRefreshBusy,
    catalogRefreshElapsedSeconds,
    catalogRefreshLog,
    catalogRefreshPhase,
    catalogRefreshProgressMessage,
    catalogRefreshSummary,
    catalogSourceAuditSummary,
    catalogRefreshVendor,
    catalogVendor,
    completeCatalogRefreshResult,
    completeCatalogSourceAuditResult,
    confirmBulkSwatch,
    failCatalogRefreshResult,
    getCatalogRefreshMaterial,
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
    saveDiscoveredCatalogMaterials,
    selectCatalogRefreshMaterial,
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

  const { handleAuditVendorCatalog, handleRefreshVendorCatalog } =
    useSettingsCatalogRefreshActions({
      beginCatalogRefreshResult,
      busy,
      catalogRefreshBusy,
      completeCatalogRefreshResult,
      completeCatalogSourceAuditResult,
      failCatalogRefreshResult,
      getCatalogRefreshMaterial,
      locale,
      reloadSettings,
      setCatalogRefreshBusy,
      setCatalogRefreshPhase,
      setCatalogRefreshProgressMessage,
      setCatalogRefreshStartedAt,
      setCatalogRefreshVendor,
      setError,
      setInfo,
      saveDiscoveredCatalogMaterials,
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
      catalogRowsAvailable,
      catalogRowsUnavailable,
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
      onCancelBulkAutoFill: clearConfirmBulkSwatch,
      onRefresh: reloadSettings,
      onSaveMissingSwatch: handleSaveMissingSwatch,
      onSwatchDraftChange: updateSwatchDraft,
      onVendorFilterChange: setSwatchVendorFilter,
    },
    refreshPanel: {
      activeCatalogMasterCount,
      activeCatalogMaterialOptions,
      activeCatalogRefreshMaterial,
      busy,
      catalogCount: catalogMasters.length,
      catalogRowsAvailable,
      catalogRowsUnavailable,
      catalogRefreshBusy,
      catalogRefreshElapsedSeconds,
      catalogRefreshLog,
      catalogRefreshPhase,
      catalogRefreshProgressMessage,
      catalogRefreshSummary,
      catalogSourceAuditSummary,
      catalogRefreshVendor,
      catalogVendor,
      showCatalogRefreshLog,
      settingsClientReadOnly,
      swatchBusy,
      tauri,
      t,
      onAuditVendorCatalog: handleAuditVendorCatalog,
      onRefreshVendorCatalog: handleRefreshVendorCatalog,
      onSetCatalogVendor: setCatalogVendor,
      onToggleCatalogRefreshLog: toggleCatalogRefreshLog,
      onSelectCatalogRefreshMaterial: selectCatalogRefreshMaterial,
    },
  });

  return {
    catalogRefreshBusy,
    missingSwatchCount: missingSwatchMasters.length,
    settingsCatalogRouteProps,
    setSwatchDraftById: catalogSectionState.setSwatchDraftById,
  };
}
