import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsInventoryPrintMessages(t: SettingsTranslator) {
  const settingsInventoryOverviewPrintMessageLabels = useCallback(() => ({
    inventoryOverviewPrintFailed: t(
      "settings.error.inventoryOverviewPrint",
      "Failed to print inventory overview.",
    ),
    inventoryOverviewPrintDone: t(
      "settings.inventoryOverviewPrintDone",
      "A4 inventory overview PDF opened for printing.",
    ),
  }), [t]);

  const settingsInventoryPrintLabels = useCallback(() => ({
    borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
    unknown: t("common.unknown", "Unknown"),
  }), [t]);

  const settingsInventoryOverviewPrintPdfLabels = useCallback(() => ({
    title: t("settings.inventoryOverviewPrintTitle", "In-stock filament overview"),
    generatedAt: t("settings.inventoryOverviewPrintGeneratedAt", "Generated"),
    groupMaterial: t("settings.inventoryOverviewPrintGroupMaterial", "Material group"),
    empty: t("settings.inventoryOverviewPrintEmpty", "No filament in stock."),
    vendor: t("settings.inventoryOverviewPrintVendor", "Vendor"),
    material: t("settings.inventoryOverviewPrintMaterial", "Material"),
    filament: t("settings.inventoryOverviewPrintFilament", "Filament"),
    homeLocation: t("inventory.homeLocationLabel", "Home location"),
    reference: t("settings.inventoryOverviewPrintReference", "Reference"),
  }), [t]);

  return {
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
  };
}
