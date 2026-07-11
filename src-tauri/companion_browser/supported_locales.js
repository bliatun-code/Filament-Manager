export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = Object.freeze([
  Object.freeze({
    id: "en",
    aliases: Object.freeze(["en"]),
    htmlLang: "en",
    direction: "ltr",
    intlLocale: "en-US",
    nativeLabel: "English",
    guidePath: "docs/USER_GUIDE.md",
    selectionMessageKey: "settings.langSetEn",
    companionSelectionMessageKey: "status.languageSetEn",
    selectionMessageFallback: "Language set to English.",
  }),
  Object.freeze({
    id: "nb",
    aliases: Object.freeze(["nb", "no"]),
    htmlLang: "nb",
    direction: "ltr",
    intlLocale: "nb-NO",
    nativeLabel: "Norsk (bokmål)",
    guidePath: "docs/BRUKERVEILEDNING.md",
    selectionMessageKey: "settings.langSetNb",
    companionSelectionMessageKey: "status.languageSetNb",
    selectionMessageFallback: "Language set to Norwegian.",
  }),
]);

export const SUPPORTED_LOCALE_IDS = Object.freeze(
  SUPPORTED_LOCALES.map(({ id }) => id),
);

function normalizedLanguageTag(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

export function localeDefinition(value) {
  const normalized = normalizedLanguageTag(value);
  if (!normalized) {
    return null;
  }
  const baseLanguage = normalized.split("-")[0];
  return (
    SUPPORTED_LOCALES.find(
      ({ id, aliases }) =>
        normalized === id ||
        aliases.includes(normalized) ||
        baseLanguage === id ||
        aliases.includes(baseLanguage),
    ) ?? null
  );
}

export function normalizeSupportedLocale(value, fallback = null) {
  return localeDefinition(value)?.id ?? fallback;
}

export function intlLocaleFor(value) {
  return localeDefinition(value)?.intlLocale ?? localeDefinition(DEFAULT_LOCALE).intlLocale;
}

export function guidePathForLocale(value) {
  return localeDefinition(value)?.guidePath ?? localeDefinition(DEFAULT_LOCALE).guidePath;
}

export function applyLocaleToDocument(value, documentRef) {
  const definition = localeDefinition(value) ?? localeDefinition(DEFAULT_LOCALE);
  const root = documentRef?.documentElement;
  if (!root || !definition) {
    return false;
  }
  root.lang = definition.htmlLang;
  root.dir = definition.direction;
  return true;
}
