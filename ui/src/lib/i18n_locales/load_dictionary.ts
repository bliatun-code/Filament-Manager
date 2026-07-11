import type { DictionaryNode, Locale } from "../i18n_types";
import { sourceLocaleFor } from "../../../../src-tauri/companion_browser/supported_locales.js";

const dictionaryCache: Partial<Record<Locale, DictionaryNode>> = {};
const dictionaryPromises: Partial<Record<Locale, Promise<DictionaryNode>>> = {};

type LocaleDictionaryModule = { default: DictionaryNode };

function dictionaryLoader(locale: Locale): Promise<LocaleDictionaryModule> {
  return import(`./locales/${sourceLocaleFor(locale)}.ts`);
}

export function getCachedLocaleDictionary(locale: Locale): DictionaryNode | null {
  return dictionaryCache[locale] ?? null;
}

export function loadLocaleDictionary(locale: Locale): Promise<DictionaryNode> {
  const cachedDictionary = dictionaryCache[locale];
  if (cachedDictionary) {
    return Promise.resolve(cachedDictionary);
  }

  dictionaryPromises[locale] ??= dictionaryLoader(locale).then(
    ({ default: dictionary }) => {
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
