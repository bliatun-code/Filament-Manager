import { useCallback, useMemo } from "react";
import type { SettingsTabKey } from "../App";
import type { useI18n } from "../lib/i18n";
import {
  buildSettingsPageTabButtons,
  buildSettingsPageTabLabels,
  buildSettingsPageTabs,
} from "./settings_page_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsPageTabs(activeTab: SettingsTabKey, t: SettingsTranslator) {
  const settingsPageTabMessageLabels = useCallback(() => ({
    CATALOG: t("settings.tabCatalog", "Filament catalogue"),
    GENERAL: t("settings.tabGeneral", "General"),
    LIBRARY: t("settings.tabLibrary", "Library & web app"),
    MAINTENANCE: t("settings.tabMaintenance", "Program maintenance"),
    PRINTERS: t("settings.tabPrinters", "3D printers"),
  }), [t]);

  const settingsTabs = useMemo(
    () => {
      const labels = buildSettingsPageTabLabels(settingsPageTabMessageLabels());
      return buildSettingsPageTabs(labels);
    },
    [settingsPageTabMessageLabels],
  );

  const settingsTabButtons = useMemo(
    () => buildSettingsPageTabButtons(settingsTabs, activeTab),
    [activeTab, settingsTabs],
  );

  return {
    settingsTabButtons,
    settingsTabs,
  };
}
