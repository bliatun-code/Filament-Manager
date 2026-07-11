import type { ThemeMode } from "../lib/theme_mode";
import type { Locale, useI18n } from "../lib/i18n";
import {
  buildSettingsLocaleSelectionMessage,
  buildSettingsThemeSelectionMessage,
} from "./settings_preferences_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

type UseSettingsPreferenceActionsInput = {
  setInfo: (message: string | null) => void;
  setLocale: (locale: Locale) => void;
  t: SettingsTranslator;
  updateThemeMode: (mode: ThemeMode) => void;
};

export function useSettingsPreferenceActions({
  setInfo,
  setLocale,
  t,
  updateThemeMode,
}: UseSettingsPreferenceActionsInput) {
  function settingsPreferenceMessageLabels() {
    return {
      themeSetTo: t("settings.themeSetTo", "Theme mode set to"),
    };
  }

  function handleThemeSelection(mode: ThemeMode) {
    updateThemeMode(mode);
    setInfo(buildSettingsThemeSelectionMessage(mode, settingsPreferenceMessageLabels()));
  }

  function handleLocaleSelection(nextLocale: Locale) {
    setLocale(nextLocale);
    setInfo(buildSettingsLocaleSelectionMessage(nextLocale, t));
  }

  return {
    handleLocaleSelection,
    handleThemeSelection,
  };
}
