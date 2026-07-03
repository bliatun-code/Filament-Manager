import { createContext, useContext } from "react";
import type { DictionaryNode, I18nContextValue, Locale } from "./i18n_types";

export type { DictionaryNode, I18nContextValue, Locale } from "./i18n_types";
export {
  getCachedLocaleDictionary,
  loadLocaleDictionary,
} from "./i18n_locales/load_dictionary";

export const I18N_STORAGE_KEY = "bfm-locale";

function normalizeLocale(value: unknown): Locale | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "en" || normalized === "nb" ? normalized : null;
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
    return normalizeLocale(localStorage.getItem(I18N_STORAGE_KEY));
  } catch {
    return null;
  }
}

function resolveNavigatorLanguage(): string {
  try {
    if (typeof navigator === "undefined") {
      return "";
    }
    return navigator.language || "";
  } catch {
    return "";
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
  const language = resolveNavigatorLanguage().toLowerCase();
  if (language.startsWith("nb") || language.startsWith("no")) {
    return "nb";
  }
  return "en";
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
