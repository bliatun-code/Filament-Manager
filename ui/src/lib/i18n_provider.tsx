import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyLocaleToDocument,
  DEFAULT_LOCALE,
  isPseudoLocale,
} from "../../../src-tauri/companion_browser/supported_locales.js";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { pseudoLocalizeMessageForLocale } from "../../../src-tauri/companion_browser/pseudo_locale.js";
import {
  getCachedLocaleDictionary,
  I18nContext,
  loadLocaleDictionary,
  lookup,
  persistLocale,
  resolveInitialLocale,
  type DictionaryNode,
  type Locale,
  type I18nContextValue,
} from "./i18n";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());
  const [loadedDictionaries, setLoadedDictionaries] = useState<
    Partial<Record<Locale, DictionaryNode>>
  >(() => ({}));

  const activeDictionary = loadedDictionaries[locale] ?? getCachedLocaleDictionary(locale);
  const fallbackDictionary =
    locale === DEFAULT_LOCALE
      ? activeDictionary
      : getCachedLocaleDictionary(DEFAULT_LOCALE);

  useEffect(() => {
    if (typeof document !== "undefined") {
      applyLocaleToDocument(locale, document);
    }
  }, [locale]);

  useEffect(() => {
    if (activeDictionary) {
      return;
    }

    let cancelled = false;

    void loadLocaleDictionary(locale).then((dictionary) => {
      if (cancelled) {
        return;
      }
      setLoadedDictionaries((current) =>
        current[locale] === dictionary
          ? current
          : {
              ...current,
              [locale]: dictionary,
            },
      );
    }).catch((error: unknown) => {
      console.error(`Failed to load ${locale} dictionary`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [activeDictionary, locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    persistLocale(nextLocale);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string, params = {}) => {
      const message =
        (activeDictionary ? lookup(activeDictionary, key) : undefined) ??
        (fallbackDictionary ? lookup(fallbackDictionary, key) : undefined);
      const template = message ?? fallback ?? key;
      return isPseudoLocale(locale)
        ? pseudoLocalizeMessageForLocale(template, params, locale)
        : formatMessage(template, params, locale);
    },
    [activeDictionary, fallbackDictionary, locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
