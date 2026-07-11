import type { DictionaryNode, Locale } from "../i18n_types";
import {
  fallbackLocaleFor,
  sourceLocaleFor,
} from "../../../../src-tauri/companion_browser/supported_locales.js";

const dictionaryCache: Partial<Record<Locale, DictionaryNode>> = {};
const dictionaryPromises: Partial<Record<Locale, Promise<DictionaryNode>>> = {};

type LocaleDictionaryModule = { default: DictionaryNode };

function dictionaryLoader(locale: Locale): Promise<LocaleDictionaryModule> {
  const dictionaryLocale = sourceLocaleFor(locale);
  const fallbackLocale = fallbackLocaleFor(locale);
  if (!fallbackLocale) {
    return import(`./locales/${dictionaryLocale}.ts`);
  }
  return Promise.all([
    import(`./locales/${fallbackLocale}.ts`),
    import(`./locales/${dictionaryLocale}.ts`),
  ]).then(([fallback, overlay]) => ({
    default: mergeLocaleDictionary(fallback.default, overlay.default),
  }));
}

export function mergeLocaleDictionary(
  fallback: DictionaryNode,
  overlay: DictionaryNode,
): DictionaryNode {
  if (typeof overlay === "string") {
    return overlay;
  }
  if (typeof fallback === "string") {
    return overlay;
  }
  const merged: { [key: string]: DictionaryNode } = { ...fallback };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in fallback
      ? mergeLocaleDictionary(fallback[key], value)
      : value;
  }
  return merged;
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
