import { type Dispatch, type SetStateAction } from "react";
import { clearDashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";
import { toErrorMessage } from "../lib/error_text";
import {
  resetAppData,
  resetCatalogData,
  type CatalogResetStats,
} from "../lib/tauri_client";
import {
  buildSettingsAppResetSuccessMessage,
  buildSettingsCatalogResetMessage,
  buildSettingsMaintenanceErrorMessage,
  shouldArmSettingsResetAction,
  type SettingsCatalogResetMessageLabels,
  type SettingsMaintenanceResetMessageLabels,
} from "./settings_maintenance_model";
import type { SettingsResetConfirmAction } from "./use_settings_reset_confirm";

type UseSettingsMaintenanceActionsInput = {
  busy: boolean;
  clearConfirmResetAction: () => void;
  confirmResetAction: SettingsResetConfirmAction | null;
  reloadSettings: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConfirmResetAction: Dispatch<SetStateAction<SettingsResetConfirmAction | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setLastCatalogReset: Dispatch<SetStateAction<CatalogResetStats | null>>;
  settingsCatalogResetMessageLabels: () => SettingsCatalogResetMessageLabels;
  settingsClientReadOnly: boolean;
  settingsMaintenanceResetMessageLabels: () => SettingsMaintenanceResetMessageLabels;
  tauri: boolean;
};

export function useSettingsMaintenanceActions({
  busy,
  clearConfirmResetAction,
  confirmResetAction,
  reloadSettings,
  setBusy,
  setConfirmResetAction,
  setError,
  setInfo,
  setLastCatalogReset,
  settingsCatalogResetMessageLabels,
  settingsClientReadOnly,
  settingsMaintenanceResetMessageLabels,
  tauri,
}: UseSettingsMaintenanceActionsInput) {
  async function handleResetAppData() {
    if (!tauri || busy || settingsClientReadOnly) {
      return;
    }
    if (shouldArmSettingsResetAction(confirmResetAction, "APP")) {
      setConfirmResetAction("APP");
      setError(null);
      setInfo(null);
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await resetAppData();
      clearDashboardPageSnapshot();
      setLastCatalogReset(null);
      await reloadSettings();
      setInfo(buildSettingsAppResetSuccessMessage(settingsMaintenanceResetMessageLabels()));
    } catch (resetError) {
      console.error(resetError);
      setError(
        toErrorMessage(
          resetError,
          buildSettingsMaintenanceErrorMessage("app", settingsMaintenanceResetMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetCatalogs() {
    if (!tauri || busy || settingsClientReadOnly) {
      return;
    }
    if (shouldArmSettingsResetAction(confirmResetAction, "CATALOG")) {
      setConfirmResetAction("CATALOG");
      setError(null);
      setInfo(null);
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await resetCatalogData();
      setLastCatalogReset(result);
      setInfo(buildSettingsCatalogResetMessage(result, settingsCatalogResetMessageLabels()));
    } catch (resetError) {
      console.error(resetError);
      setError(
        toErrorMessage(
          resetError,
          buildSettingsMaintenanceErrorMessage(
            "catalog",
            settingsMaintenanceResetMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    handleResetAppData,
    handleResetCatalogs,
  };
}
