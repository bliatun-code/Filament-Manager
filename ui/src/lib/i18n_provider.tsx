import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  dictionaries,
  I18N_STORAGE_KEY,
  I18nContext,
  lookup,
  resolveInitialLocale,
  type Locale,
  type I18nContextValue,
} from "./i18n";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(I18N_STORAGE_KEY, nextLocale);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const message =
        lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key);
      return message ?? fallback ?? key;
    },
    [locale],
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
