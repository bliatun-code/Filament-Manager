import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import { localeDefinition } from "../../../src-tauri/companion_browser/supported_locales.js";

export type SettingsPreferenceMessageLabels = {
  themeSetTo: string;
};

type TranslateFn = (
  key: string,
  fallback?: string,
  params?: MessageParams,
) => string;

export function buildSettingsThemeSelectionMessage(
  modeLabel: string,
  labels: Pick<SettingsPreferenceMessageLabels, "themeSetTo">,
): string {
  return `${labels.themeSetTo} ${modeLabel}.`;
}

export function settingsThemeModeLabel(mode: ThemeMode, t: TranslateFn): string {
  const labels: Record<ThemeMode, [string, string]> = {
    auto: ["settings.auto", "Auto (system)"],
    light: ["settings.light", "Light"],
    dark: ["settings.dark", "Dark"],
    bambu: ["settings.bambuTheme", "Bambu"],
    prusa: ["settings.prusaTheme", "Prusa"],
  };
  const [key, fallback] = labels[mode];
  return t(key, fallback);
}

export function buildSettingsLocaleSelectionMessage(
  locale: Locale,
  t: TranslateFn,
): string {
  const definition = localeDefinition(locale);
  if (!definition) {
    return locale;
  }
  return t(
    definition.selectionMessageKey,
    definition.selectionMessageFallback,
    { language: definition.nativeLabel },
  );
}
