import { type Dispatch, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import {
  refreshBambuCatalog,
  refreshEsunCatalog,
  type CatalogRefreshResult,
} from "../lib/tauri_client";
import {
  buildSettingsCatalogRefreshFallbackErrorMessage,
  buildSettingsCatalogRefreshPreparingMessage,
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogRefreshZeroImportMessage,
  type SettingsCatalogRefreshMessageLabels,
  type SettingsCatalogRefreshSummaryLabels,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type UseSettingsCatalogRefreshActionsInput = {
  beginCatalogRefreshResult: () => void;
  busy: boolean;
  catalogRefreshBusy: boolean;
  completeCatalogRefreshResult: (summary: CatalogRefreshResult) => void;
  failCatalogRefreshResult: (message: string) => void;
  getCatalogRefreshMaterials: (vendor: SettingsCatalogVendor) => string[];
  reloadSettings: () => Promise<void>;
  setCatalogRefreshBusy: Dispatch<SetStateAction<boolean>>;
  setCatalogRefreshPhase: Dispatch<SetStateAction<string>>;
  setCatalogRefreshProgressMessage: Dispatch<SetStateAction<string>>;
  setCatalogRefreshStartedAt: Dispatch<SetStateAction<number | null>>;
  setCatalogRefreshVendor: Dispatch<SetStateAction<SettingsCatalogVendor>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsCatalogRefreshMessageLabels: () => SettingsCatalogRefreshMessageLabels;
  settingsCatalogRefreshSummaryLabels: () => SettingsCatalogRefreshSummaryLabels;
  swatchBusy: boolean;
  tauri: boolean;
};

export function useSettingsCatalogRefreshActions({
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
  swatchBusy,
  tauri,
}: UseSettingsCatalogRefreshActionsInput) {
  async function handleRefreshVendorCatalog(vendor: SettingsCatalogVendor) {
    if (!tauri || busy || swatchBusy || catalogRefreshBusy) {
      return;
    }
    const materialTypes = getCatalogRefreshMaterials(vendor);
    setCatalogRefreshVendor(vendor);
    setCatalogRefreshPhase("PREPARE");
    setCatalogRefreshProgressMessage(
      buildSettingsCatalogRefreshPreparingMessage(vendor, settingsCatalogRefreshMessageLabels()),
    );
    setCatalogRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    beginCatalogRefreshResult();
    setError(null);
    setInfo(null);
    try {
      const summary =
        vendor === "Bambu"
          ? await refreshBambuCatalog(materialTypes)
          : await refreshEsunCatalog(materialTypes);
      completeCatalogRefreshResult(summary);
      await reloadSettings();
      if (summary.imported === 0) {
        setError(
          buildSettingsCatalogRefreshZeroImportMessage(
            vendor,
            settingsCatalogRefreshMessageLabels(),
          ),
        );
      } else {
        setInfo(
          buildSettingsCatalogRefreshSuccessMessage(summary, settingsCatalogRefreshSummaryLabels()),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const fallbackMessage = buildSettingsCatalogRefreshFallbackErrorMessage(
        vendor,
        settingsCatalogRefreshMessageLabels(),
      );
      const message = toErrorMessage(refreshError, fallbackMessage);
      failCatalogRefreshResult(message);
      setError(message);
    } finally {
      setCatalogRefreshBusy(false);
      setCatalogRefreshStartedAt(null);
    }
  }

  return { handleRefreshVendorCatalog };
}
