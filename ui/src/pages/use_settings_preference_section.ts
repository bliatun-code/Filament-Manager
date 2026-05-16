import type { Locale, useI18n } from "../lib/i18n";
import { useSettingsPreferenceActions } from "./use_settings_preference_actions";
import { useSettingsThemeMode } from "./use_settings_theme_mode";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

type UseSettingsPreferenceSectionInput = {
  setInfo: (message: string | null) => void;
  setLocale: (locale: Locale) => void;
  t: SettingsTranslator;
};

export function useSettingsPreferenceSection({
  setInfo,
  setLocale,
  t,
}: UseSettingsPreferenceSectionInput) {
  const { themeMode, updateThemeMode } = useSettingsThemeMode();
  const preferenceActions = useSettingsPreferenceActions({
    setInfo,
    setLocale,
    t,
    updateThemeMode,
  });

  return {
    themeMode,
    ...preferenceActions,
  };
}
