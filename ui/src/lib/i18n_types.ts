import { SUPPORTED_LOCALE_IDS } from "../../../src-tauri/companion_browser/supported_locales.js";

export type Locale = (typeof SUPPORTED_LOCALE_IDS)[number];

export type DictionaryNode = string | { [key: string]: DictionaryNode };

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
};
