import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsCatalogMessages(t: SettingsTranslator) {
  const settingsCatalogRefreshMessageLabels = useCallback(() => ({
    refreshBambuFailed: t("wishlist.error.refreshBambu", "Catalog refresh failed."),
    refreshEsunFailed: t("wishlist.error.refreshEsun", "eSUN catalog refresh failed."),
    refreshPreparingBambu: t(
      "wishlist.refreshPreparingBambu",
      "Preparing Bambu catalog refresh...",
    ),
    refreshPreparingEsun: t(
      "wishlist.refreshPreparingEsun",
      "Preparing eSUN catalog refresh...",
    ),
    zeroBambu: t(
      "wishlist.error.zeroBambu",
      "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
    ),
    zeroEsun: t(
      "wishlist.error.zeroEsun",
      "eSUN refresh completed with 0 imported rows. Store format may have changed.",
    ),
  }), [t]);

  const settingsCatalogRefreshSummaryLabels = useCallback(() => ({
    discontinued: t("inventory.discontinued", "Discontinued"),
    imported: t("inventory.imported", "Imported"),
    reactivated: t("inventory.reactivated", "Reactivated"),
  }), [t]);

  return {
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
  };
}
