import { SUPPORTED_LOCALE_IDS } from "../../../src-tauri/companion_browser/supported_locales.js";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";

export type Locale = (typeof SUPPORTED_LOCALE_IDS)[number];

export type DictionaryNode = string | { [key: string]: DictionaryNode };

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string, params?: MessageParams) => string;
};
