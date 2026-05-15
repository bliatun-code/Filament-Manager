import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsMaintenanceMessages(t: SettingsTranslator) {
  const settingsCatalogResetMessageLabels = useCallback(() => ({
    catalogResetDone: t("settings.catalogResetDone", "Catalog reset done"),
    reactivated: t("settings.reactivated", "reactivated"),
    remaining: t("settings.remaining", "remaining"),
    removed: t("settings.removed", "Removed"),
  }), [t]);

  const settingsMaintenanceResetMessageLabels = useCallback(() => ({
    appResetDone: t("settings.resetDone", "App data reset completed."),
    confirmResetAppTapAgain: t(
      "settings.confirmResetAppTapAgain",
      "Click Reset app data again to confirm.",
    ),
    confirmResetCatalogsTapAgain: t(
      "settings.confirmResetCatalogsTapAgain",
      "Click Reset catalogs again to confirm.",
    ),
    resetAppFailed: t("settings.error.resetApp", "Failed to reset app data."),
    resetCatalogsFailed: t("settings.error.resetCatalogs", "Failed to reset catalogs."),
  }), [t]);

  return {
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
  };
}
