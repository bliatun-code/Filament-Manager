export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = Object.freeze([
  Object.freeze({
    id: "en",
    aliases: Object.freeze(["en"]),
    htmlLang: "en",
    direction: "ltr",
    intlLocale: "en-US",
    nativeLabel: "English",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "nb",
    aliases: Object.freeze(["nb", "no"]),
    htmlLang: "nb",
    direction: "ltr",
    intlLocale: "nb-NO",
    nativeLabel: "Norsk (bokmål)",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/BRUKERVEILEDNING.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "de",
    aliases: Object.freeze(["de"]),
    htmlLang: "de",
    direction: "ltr",
    intlLocale: "de-DE",
    nativeLabel: "Deutsch",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "fr",
    aliases: Object.freeze(["fr"]),
    htmlLang: "fr",
    direction: "ltr",
    intlLocale: "fr-FR",
    nativeLabel: "Français",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "es",
    aliases: Object.freeze(["es"]),
    htmlLang: "es",
    direction: "ltr",
    intlLocale: "es-ES",
    nativeLabel: "Español",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "pt-BR",
    aliases: Object.freeze(["pt-br"]),
    htmlLang: "pt-BR",
    direction: "ltr",
    intlLocale: "pt-BR",
    nativeLabel: "Português (Brasil)",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "it-IT",
    aliases: Object.freeze(["it", "it-it"]),
    htmlLang: "it-IT",
    direction: "ltr",
    intlLocale: "it-IT",
    nativeLabel: "Italiano",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "pl-PL",
    aliases: Object.freeze(["pl", "pl-pl"]),
    htmlLang: "pl-PL",
    direction: "ltr",
    intlLocale: "pl-PL",
    nativeLabel: "Polski",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "nl-NL",
    aliases: Object.freeze(["nl", "nl-nl"]),
    htmlLang: "nl-NL",
    direction: "ltr",
    intlLocale: "nl-NL",
    nativeLabel: "Nederlands",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "cs-CZ",
    aliases: Object.freeze(["cs", "cs-cz"]),
    htmlLang: "cs-CZ",
    direction: "ltr",
    intlLocale: "cs-CZ",
    nativeLabel: "Čeština",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "zh-CN",
    aliases: Object.freeze(["zh", "zh-cn", "zh-hans"]),
    htmlLang: "zh-CN",
    direction: "ltr",
    intlLocale: "zh-CN",
    nativeLabel: "简体中文",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "ja-JP",
    aliases: Object.freeze(["ja", "ja-jp"]),
    htmlLang: "ja-JP",
    direction: "ltr",
    intlLocale: "ja-JP",
    nativeLabel: "日本語",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "ko-KR",
    aliases: Object.freeze(["ko", "ko-kr"]),
    htmlLang: "ko-KR",
    direction: "ltr",
    intlLocale: "ko-KR",
    nativeLabel: "한국어",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "zh-TW",
    aliases: Object.freeze(["zh-tw", "zh-hant"]),
    htmlLang: "zh-TW",
    direction: "ltr",
    intlLocale: "zh-TW",
    nativeLabel: "繁體中文",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "tr-TR",
    aliases: Object.freeze(["tr", "tr-tr"]),
    htmlLang: "tr-TR",
    direction: "ltr",
    intlLocale: "tr-TR",
    nativeLabel: "Türkçe",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "uk-UA",
    aliases: Object.freeze(["uk", "uk-ua"]),
    htmlLang: "uk-UA",
    direction: "ltr",
    intlLocale: "uk-UA",
    nativeLabel: "Українська",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "ru-RU",
    aliases: Object.freeze(["ru", "ru-ru"]),
    htmlLang: "ru-RU",
    direction: "ltr",
    intlLocale: "ru-RU",
    nativeLabel: "Русский",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "hu-HU",
    aliases: Object.freeze(["hu", "hu-hu"]),
    htmlLang: "hu-HU",
    direction: "ltr",
    intlLocale: "hu-HU",
    nativeLabel: "Magyar",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "sv-SE",
    aliases: Object.freeze(["sv", "sv-se"]),
    htmlLang: "sv-SE",
    direction: "ltr",
    intlLocale: "sv-SE",
    nativeLabel: "Svenska",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "da-DK",
    aliases: Object.freeze(["da", "da-dk"]),
    htmlLang: "da-DK",
    direction: "ltr",
    intlLocale: "da-DK",
    nativeLabel: "Dansk",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "fi-FI",
    aliases: Object.freeze(["fi", "fi-fi"]),
    htmlLang: "fi-FI",
    direction: "ltr",
    intlLocale: "fi-FI",
    nativeLabel: "Suomi",
    selectable: true,
    catalogKind: "source",
    generatedFrom: null,
    fallbackLocale: null,
    pseudoMode: null,
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "en-XA",
    aliases: Object.freeze(["en-xa"]),
    htmlLang: "en-XA",
    direction: "ltr",
    intlLocale: "en-US",
    nativeLabel: "Pseudo (QA)",
    selectable: false,
    catalogKind: "generated",
    generatedFrom: "en",
    fallbackLocale: null,
    pseudoMode: "accented",
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "ar-XB",
    aliases: Object.freeze(["ar-xb"]),
    htmlLang: "ar-XB",
    direction: "rtl",
    intlLocale: "ar-EG",
    nativeLabel: "Pseudo RTL (QA)",
    selectable: false,
    catalogKind: "generated",
    generatedFrom: "en",
    fallbackLocale: null,
    pseudoMode: "rtl",
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
  Object.freeze({
    id: "zh-XB",
    aliases: Object.freeze(["zh-xb"]),
    htmlLang: "zh-Hans-XB",
    direction: "ltr",
    intlLocale: "zh-CN",
    nativeLabel: "Pseudo CJK (QA)",
    selectable: false,
    catalogKind: "generated",
    generatedFrom: "en",
    fallbackLocale: null,
    pseudoMode: "cjk",
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.languageSelected",
    companionSelectionMessageKey: "status.languageSelected",
    selectionMessageFallback: "Language selected: {language}.",
  }),
]);

export const SELECTABLE_LOCALES = Object.freeze(
  SUPPORTED_LOCALES.filter(({ selectable }) => selectable),
);

export const SOURCE_LOCALES = Object.freeze(
  SUPPORTED_LOCALES.filter(({ catalogKind }) => catalogKind === "source"),
);

export const CATALOG_LOCALES = Object.freeze(
  SUPPORTED_LOCALES.filter(
    ({ catalogKind }) => catalogKind === "source" || catalogKind === "draft",
  ),
);

export const SUPPORTED_LOCALE_IDS = Object.freeze(
  SUPPORTED_LOCALES.map(({ id }) => id),
);

function normalizedLanguageTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
}

export function localeDefinition(value) {
  const normalized = normalizedLanguageTag(value);
  if (!normalized) {
    return null;
  }
  const exactMatch = SUPPORTED_LOCALES.find(
    ({ id, aliases }) =>
      normalized === id.toLowerCase() || aliases.includes(normalized),
  );
  if (exactMatch) {
    return exactMatch;
  }
  const baseLanguage = normalized.split("-")[0];
  return (
    SUPPORTED_LOCALES.find(
      ({ id, aliases }) =>
        baseLanguage === id.toLowerCase() || aliases.includes(baseLanguage),
    ) ?? null
  );
}

export function sourceLocaleFor(value) {
  const definition =
    localeDefinition(value) ?? localeDefinition(DEFAULT_LOCALE);
  return definition?.generatedFrom ?? definition?.id ?? DEFAULT_LOCALE;
}

export function fallbackLocaleFor(value) {
  return localeDefinition(value)?.fallbackLocale ?? null;
}

export function normalizeSelectableLocale(value, fallback = null) {
  const definition = localeDefinition(value);
  return definition?.selectable ? definition.id : fallback;
}

export function isPseudoLocale(value) {
  return localeDefinition(value)?.catalogKind === "generated";
}

export function pseudoModeFor(value) {
  return localeDefinition(value)?.pseudoMode ?? null;
}

export function normalizeSupportedLocale(value, fallback = null) {
  return localeDefinition(value)?.id ?? fallback;
}

export function intlLocaleFor(value) {
  const definition = localeDefinition(value);
  if (definition) {
    return definition.intlLocale;
  }
  try {
    return Intl.getCanonicalLocales(normalizedLanguageTag(value))[0];
  } catch {
    return localeDefinition(DEFAULT_LOCALE).intlLocale;
  }
}

export function guidePathForLocale(value) {
  return (
    localeDefinition(value)?.guidePath ??
    localeDefinition(DEFAULT_LOCALE).guidePath
  );
}

export function applyLocaleToDocument(value, documentRef) {
  const definition =
    localeDefinition(value) ?? localeDefinition(DEFAULT_LOCALE);
  const root = documentRef?.documentElement;
  if (!root || !definition) {
    return false;
  }
  root.lang = definition.htmlLang;
  root.dir = definition.direction;
  return true;
}
