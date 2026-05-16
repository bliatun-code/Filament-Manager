import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";
import {
  buildSettingsPageChromeLabels,
  buildSettingsPageDesktopOnlyMessage,
} from "./settings_page_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsPageChrome(t: SettingsTranslator) {
  const settingsPageMessageLabels = useCallback(() => ({
    desktopOnly: t("settings.desktopOnly", "Settings are only available in the desktop app build."),
    loadFailed: t("settings.error.load", "Failed to load settings."),
  }), [t]);

  const settingsPageChromeLabels = useCallback(() => buildSettingsPageChromeLabels({
    desktopOnly: buildSettingsPageDesktopOnlyMessage(settingsPageMessageLabels()),
    subtitle: t(
      "settings.subtitle",
      "Configure trusted-LAN browser access, printers, catalogue updates and maintenance actions.",
    ),
    title: t("nav.settings", "Settings"),
  }), [settingsPageMessageLabels, t]);

  return {
    pageChromeLabels: settingsPageChromeLabels(),
    settingsPageMessageLabels,
  };
}
