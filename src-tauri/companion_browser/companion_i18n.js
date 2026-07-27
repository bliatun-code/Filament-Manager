import {
  DEFAULT_LOCALE,
  isPseudoLocale,
  normalizeSelectableLocale,
  normalizeSupportedLocale,
  sourceLocaleFor,
} from "./supported_locales.js";
import { formatMessage } from "./message_format.js";
import { pseudoLocalizeMessageForLocale } from "./pseudo_locale.js";

export const COMPANION_LOCALE_STORAGE_KEY = "bfm-companion-locale";
const LEGACY_COMPANION_LOCALE_STORAGE_KEYS = ["bfm-locale"];
const dictionaryCache = new Map();
const dictionaryPromises = new Map();

function companionLocaleAssetName(locale) {
  return `companion_locale_${locale}.js`;
}

async function importCompanionLocaleModule(locale) {
  return import(`./${companionLocaleAssetName(locale)}`);
}

function dictionaryFromModule(locale, module) {
  const dictionary = module?.default;
  if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
    throw new Error(`Companion locale ${locale} did not provide a dictionary.`);
  }
  if (module?.locale && module.locale !== locale) {
    throw new Error(
      `Companion locale module ${module.locale} does not match ${locale}.`,
    );
  }
  return dictionary;
}

export function requiredCompanionDictionaryLocales(locale) {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const sourceLocale = sourceLocaleFor(normalizedLocale);
  return [sourceLocale];
}

function loadCompanionDictionary(locale, loadModule) {
  const cached = dictionaryCache.get(locale);
  if (cached) {
    return Promise.resolve(cached);
  }
  let pending = dictionaryPromises.get(locale);
  if (!pending) {
    pending = Promise.resolve(loadModule(locale))
      .then((module) => {
        const dictionary = dictionaryFromModule(locale, module);
        dictionaryCache.set(locale, dictionary);
        return dictionary;
      })
      .catch((error) => {
        dictionaryPromises.delete(locale);
        throw error;
      });
    dictionaryPromises.set(locale, pending);
  }
  return pending;
}

export async function loadCompanionLocale(
  locale,
  { loadModule = importCompanionLocaleModule } = {},
) {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const requiredLocales = requiredCompanionDictionaryLocales(normalizedLocale);
  await Promise.all(
    requiredLocales.map((requiredLocale) =>
      loadCompanionDictionary(requiredLocale, loadModule),
    ),
  );
  return normalizedLocale;
}

export function loadedCompanionDictionaryLocales() {
  return [...dictionaryCache.keys()].sort();
}

function lookup(dictionary, key) {
  return String(key || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, part) => {
      if (!current || typeof current === "string") {
        return undefined;
      }
      return current[part];
    }, dictionary);
}

export function normalizeCompanionLocale(locale) {
  return normalizeSupportedLocale(locale, DEFAULT_LOCALE);
}

export function readStoredCompanionLocale(storageKey, storageRef) {
  try {
    const storedValue = storageRef?.getItem?.(storageKey);
    const locale = normalizeCompanionLocale(storedValue);
    if (storedValue && storedValue !== locale) {
      storageRef?.setItem?.(storageKey, locale);
    }
    return locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function readCompanionGlobal(name) {
  try {
    return globalThis?.[name] ?? null;
  } catch {
    return null;
  }
}

export function resolveInitialCompanionLocale(storageRef, navigatorRef) {
  const effectiveStorage =
    storageRef === undefined ? readCompanionGlobal("localStorage") : storageRef;
  const effectiveNavigator =
    navigatorRef === undefined
      ? readCompanionGlobal("navigator")
      : navigatorRef;
  let storedValue = null;
  let storedFromLegacyKey = false;
  try {
    storedValue = effectiveStorage?.getItem?.(COMPANION_LOCALE_STORAGE_KEY);
    if (!storedValue) {
      for (const legacyKey of LEGACY_COMPANION_LOCALE_STORAGE_KEYS) {
        storedValue = effectiveStorage?.getItem?.(legacyKey);
        if (storedValue) {
          storedFromLegacyKey = true;
          break;
        }
      }
    }
  } catch {
    storedValue = null;
  }
  const storedLocale = normalizeSupportedLocale(storedValue);
  if (storedLocale) {
    if (storedFromLegacyKey || storedValue !== storedLocale) {
      try {
        effectiveStorage?.setItem?.(
          COMPANION_LOCALE_STORAGE_KEY,
          storedLocale,
        );
      } catch {
        // Canonical storage migration is best-effort.
      }
    }
    return storedLocale;
  }
  let languages = [];
  try {
    const preferred = Array.isArray(effectiveNavigator?.languages)
      ? effectiveNavigator.languages
      : [];
    languages = [...preferred, effectiveNavigator?.language].filter(Boolean);
  } catch {
    languages = [];
  }
  for (const language of languages) {
    const locale = normalizeSelectableLocale(language);
    if (locale) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
}

export function t(locale, key, fallback = "", params = {}) {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const localized = lookup(
    dictionaryCache.get(sourceLocaleFor(normalizedLocale)),
    key,
  );
  const format = isPseudoLocale(normalizedLocale)
    ? (template) =>
        pseudoLocalizeMessageForLocale(template, params, normalizedLocale)
    : (template) => formatMessage(template, params, normalizedLocale);
  if (typeof localized === "string") {
    return format(localized);
  }
  if (fallback) {
    return format(fallback);
  }
  return key;
}
