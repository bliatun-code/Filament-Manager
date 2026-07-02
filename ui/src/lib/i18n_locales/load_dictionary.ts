import type { DictionaryNode, Locale } from "../i18n_types";

const dictionaryCache: Partial<Record<Locale, DictionaryNode>> = {};
const dictionaryPromises: Partial<Record<Locale, Promise<DictionaryNode>>> = {};

const dictionaryLoaders: Record<Locale, () => Promise<DictionaryNode>> = {
  en: () => import("./locales/en").then(({ enDictionary }) => enDictionary),
  nb: () => import("./locales/nb").then(({ nbDictionary }) => nbDictionary),
};

export function getCachedLocaleDictionary(locale: Locale): DictionaryNode | null {
  return dictionaryCache[locale] ?? null;
}

export function loadLocaleDictionary(locale: Locale): Promise<DictionaryNode> {
  const cachedDictionary = dictionaryCache[locale];
  if (cachedDictionary) {
    return Promise.resolve(cachedDictionary);
  }

  dictionaryPromises[locale] ??= dictionaryLoaders[locale]().then(
    (dictionary) => {
      dictionaryCache[locale] = dictionary;
      return dictionary;
    },
    (error: unknown) => {
      delete dictionaryPromises[locale];
      throw error;
    },
  );

  return dictionaryPromises[locale];
}
