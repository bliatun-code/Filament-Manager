import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsSwatchMessages(t: SettingsTranslator) {
  const settingsSwatchErrorMessageLabels = useCallback(() => ({
    invalidSwatchHex: t(
      "settings.error.invalidSwatchHex",
      "Invalid swatch value. Use #RGB, #RRGGBB, gradient(...), or multi(...).",
    ),
    saveSwatchFailed: t(
      "settings.error.saveSwatch",
      "Failed to save swatch for selected filament.",
    ),
  }), [t]);

  const settingsSwatchBulkMessageLabels = useCallback(() => ({
    confirmBulkSwatchTapAgain: t(
      "settings.confirmBulkSwatchTapAgain",
      "Click Auto-fill visible missing swatches again to confirm.",
    ),
    failed: t("settings.failed", "failed"),
    noMissingSwatches: t("settings.noMissingSwatches", "No missing swatches to fill."),
    noVisibleMissingSwatchesCouldBeAutoFilled: t(
      "settings.swatchBulkNoneUpdated",
      "No visible missing swatches could be auto-filled.",
    ),
    skipped: t("settings.skipped", "skipped"),
    swatchBulkUpdateCompleted: t(
      "settings.swatchBulkDone",
      "Swatch bulk update completed",
    ),
    updated: t("settings.updated", "updated"),
  }), [t]);

  const settingsSwatchSavedMessageLabels = useCallback(() => ({
    swatchSaved: t("settings.swatchSaved", "Saved swatch"),
  }), [t]);

  return {
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
  };
}
