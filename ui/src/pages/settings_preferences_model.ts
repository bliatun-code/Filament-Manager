import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";
import { localeDefinition } from "../../../src-tauri/companion_browser/supported_locales.js";

export type SettingsPreferenceMessageLabels = {
  themeSetTo: string;
};

type TranslateFn = (key: string, fallback?: string) => string;

export function buildSettingsThemeSelectionMessage(
  mode: ThemeMode,
  labels: Pick<SettingsPreferenceMessageLabels, "themeSetTo">,
): string {
  return `${labels.themeSetTo} ${mode}.`;
}

export function buildSettingsLocaleSelectionMessage(
  locale: Locale,
  t: TranslateFn,
): string {
  const definition = localeDefinition(locale);
  if (!definition) {
    return locale;
  }
  return t(definition.selectionMessageKey, definition.selectionMessageFallback);
}
