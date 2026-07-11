import { createContext, useContext } from "react";
import type { DictionaryNode, I18nContextValue, Locale } from "./i18n_types";
import {
  DEFAULT_LOCALE,
  normalizeSupportedLocale,
} from "../../../src-tauri/companion_browser/supported_locales.js";

export type { DictionaryNode, I18nContextValue, Locale } from "./i18n_types";
export {
  getCachedLocaleDictionary,
  loadLocaleDictionary,
} from "./i18n_locales/load_dictionary";

export const I18N_STORAGE_KEY = "bfm-locale";

function normalizeLocale(value: unknown): Locale | null {
  return normalizeSupportedLocale(value) as Locale | null;
}

function readQueryLocale(): Locale | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    return normalizeLocale(params.get("bfm_locale"));
  } catch {
    return null;
  }
}

function readStoredLocale(): Locale | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    const storedValue = localStorage.getItem(I18N_STORAGE_KEY);
    const locale = normalizeLocale(storedValue);
    if (locale && storedValue !== locale) {
      localStorage.setItem(I18N_STORAGE_KEY, locale);
    }
    return locale;
  } catch {
    return null;
  }
}

function resolveNavigatorLanguages(): string[] {
  try {
    if (typeof navigator === "undefined") {
      return [];
    }
    const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
    return [...languages, navigator.language].filter(
      (language): language is string => typeof language === "string" && language.length > 0,
    );
  } catch {
    return [];
  }
}

export function persistLocale(locale: Locale): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(I18N_STORAGE_KEY, locale);
    }
  } catch {
    // Locale persistence is best-effort; the in-memory React state is still updated.
  }
}

export function resolveInitialLocale(): Locale {
  const queryLocale = readQueryLocale();
  if (queryLocale) {
    return queryLocale;
  }
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }
  for (const language of resolveNavigatorLanguages()) {
    const locale = normalizeLocale(language);
    if (locale) {
      return locale;
    }
  }
  return DEFAULT_LOCALE as Locale;
}

export function lookup(dictionary: DictionaryNode, key: string): string | undefined {
  const parts = key.split(".").filter(Boolean);
  let current: DictionaryNode | undefined = dictionary;

  for (const part of parts) {
    if (!current || typeof current === "string" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
