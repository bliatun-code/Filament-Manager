export type Locale = "en" | "nb";

export type DictionaryNode = string | { [key: string]: DictionaryNode };

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
};
