import type { DictionaryNode, Locale } from "../i18n_types";
import { enDictionary } from "./locales/en";

const dictionaryCache: Partial<Record<Locale, DictionaryNode>> = {
  en: enDictionary,
};

let nbDictionaryPromise: Promise<DictionaryNode> | null = null;

export function getEnglishDictionary(): DictionaryNode {
  return enDictionary;
}

export function getCachedLocaleDictionary(locale: Locale): DictionaryNode | null {
  return dictionaryCache[locale] ?? null;
}

export function loadLocaleDictionary(locale: Locale): Promise<DictionaryNode> {
  if (locale === "en") {
    return Promise.resolve(enDictionary);
  }

  nbDictionaryPromise ??= import("./locales/nb").then(({ nbDictionary }) => {
    dictionaryCache.nb = nbDictionary;
    return nbDictionary;
  });

  return nbDictionaryPromise;
}
