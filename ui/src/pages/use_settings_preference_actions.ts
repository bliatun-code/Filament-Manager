import type { ThemeMode } from "../lib/theme_mode";
import type { Locale, useI18n } from "../lib/i18n";

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
  updateThemeMode,
}: UseSettingsPreferenceActionsInput) {
  function handleThemeSelection(mode: ThemeMode) {
    updateThemeMode(mode);
    // The applied theme and aria-pressed state provide immediate feedback.
    // Avoid inserting a banner above the control that was just activated.
    setInfo(null);
  }

  function handleLocaleSelection(nextLocale: Locale) {
    setLocale(nextLocale);
    setInfo(null);
  }

  return {
    handleLocaleSelection,
    handleThemeSelection,
  };
}
