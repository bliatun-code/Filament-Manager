import { useMemo } from "react";
import type { Locale, useI18n } from "../lib/i18n";
import type { TrustedLanPairedBrowser } from "../lib/tauri_client";
import { buildTrustedLanPairedBrowserListModel } from "./settings_companion_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

type UseTrustedLanBrowserListModelInput = {
  locale: Locale;
  t: SettingsTranslator;
  trustedLanPairedBrowsers: TrustedLanPairedBrowser[];
};

export function useTrustedLanBrowserListModel({
  locale,
  t,
  trustedLanPairedBrowsers,
}: UseTrustedLanBrowserListModelInput) {
  const trustedLanPairedBrowserListModel = useMemo(
    () =>
      buildTrustedLanPairedBrowserListModel({
        browsers: trustedLanPairedBrowsers,
        locale,
        t,
      }),
    [locale, t, trustedLanPairedBrowsers],
  );

  return {
    activeTrustedLanPairedBrowsers: trustedLanPairedBrowserListModel.activeRows,
    revokedTrustedLanPairedBrowsers: trustedLanPairedBrowserListModel.revokedRows,
  };
}
