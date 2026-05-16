import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";

export type SettingsPreferenceMessageLabels = {
  languageSetEnglish: string;
  languageSetNorwegian: string;
  themeSetTo: string;
};

export function buildSettingsThemeSelectionMessage(
  mode: ThemeMode,
  labels: Pick<SettingsPreferenceMessageLabels, "themeSetTo">,
): string {
  return `${labels.themeSetTo} ${mode}.`;
}

export function buildSettingsLocaleSelectionMessage(
  locale: Locale,
  labels: Pick<
    SettingsPreferenceMessageLabels,
    "languageSetEnglish" | "languageSetNorwegian"
  >,
): string {
  return locale === "nb" ? labels.languageSetNorwegian : labels.languageSetEnglish;
}
