import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsInventoryPrintMessages(t: SettingsTranslator) {
  const settingsInventoryOverviewPrintMessageLabels = useCallback(() => ({
    inventoryOverviewPrintFailed: t(
      "settings.error.inventoryOverviewPrint",
      "Failed to create inventory label PDF.",
    ),
    inventoryOverviewPrintDone: (path: string) =>
      t(
        "settings.inventoryOverviewPrintDone",
        "Inventory label PDF saved to Downloads: {path}",
        { path },
      ),
  }), [t]);

  const settingsInventoryPrintLabels = useCallback(() => ({
    borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
    unknown: t("common.unknown", "Unknown"),
  }), [t]);

  return {
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryPrintLabels,
  };
}
