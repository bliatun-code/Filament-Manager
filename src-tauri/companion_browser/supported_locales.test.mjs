import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocaleToDocument,
  CATALOG_LOCALES,
  fallbackLocaleFor,
  guidePathForLocale,
  intlLocaleFor,
  normalizeSupportedLocale,
  normalizeSelectableLocale,
  SELECTABLE_LOCALES,
  sourceLocaleFor,
  SUPPORTED_LOCALES,
} from "./supported_locales.js";

test("locale registry normalizes canonical, regional, underscore, and legacy aliases", () => {
  assert.equal(normalizeSupportedLocale("en-GB"), "en");
  assert.equal(normalizeSupportedLocale("NB_no"), "nb");
  assert.equal(normalizeSupportedLocale("no-NO"), "nb");
  assert.equal(normalizeSupportedLocale("en-XA"), "en-XA");
  assert.equal(normalizeSupportedLocale("en_xa"), "en-XA");
  assert.equal(normalizeSupportedLocale("ar-XB"), "ar-XB");
  assert.equal(normalizeSupportedLocale("ar_xb"), "ar-XB");
  assert.equal(normalizeSupportedLocale("zh-XB"), "zh-XB");
  assert.equal(normalizeSupportedLocale("zh_xb"), "zh-XB");
  assert.equal(normalizeSupportedLocale("de-DE"), "de");
  assert.equal(normalizeSelectableLocale("de-DE"), "de");
  assert.equal(normalizeSupportedLocale("fr-FR"), "fr");
  assert.equal(normalizeSelectableLocale("fr-FR"), "fr");
  assert.equal(normalizeSupportedLocale("es-ES"), "es");
  assert.equal(normalizeSelectableLocale("es-ES"), "es");
  assert.equal(normalizeSupportedLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeSupportedLocale("pt_br"), "pt-BR");
  assert.equal(normalizeSelectableLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeSupportedLocale("it"), "it-IT");
  assert.equal(normalizeSupportedLocale("it_IT"), "it-IT");
  assert.equal(normalizeSelectableLocale("it-IT"), "it-IT");
  assert.equal(normalizeSupportedLocale("pl"), "pl-PL");
  assert.equal(normalizeSupportedLocale("pl_PL"), "pl-PL");
  assert.equal(normalizeSelectableLocale("pl-PL"), "pl-PL");
  assert.equal(normalizeSupportedLocale("nl"), "nl-NL");
  assert.equal(normalizeSupportedLocale("nl_NL"), "nl-NL");
  assert.equal(normalizeSelectableLocale("nl-NL"), "nl-NL");
  assert.equal(normalizeSupportedLocale("cs"), "cs-CZ");
  assert.equal(normalizeSupportedLocale("cs_CZ"), "cs-CZ");
  assert.equal(normalizeSelectableLocale("cs-CZ"), "cs-CZ");
  assert.equal(normalizeSupportedLocale("zh"), "zh-CN");
  assert.equal(normalizeSupportedLocale("zh_CN"), "zh-CN");
  assert.equal(normalizeSupportedLocale("zh-Hans"), "zh-CN");
  assert.equal(normalizeSelectableLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeSupportedLocale("ja"), "ja-JP");
  assert.equal(normalizeSupportedLocale("ja_JP"), "ja-JP");
  assert.equal(normalizeSelectableLocale("ja-JP"), "ja-JP");
  assert.equal(normalizeSupportedLocale("ko"), "ko-KR");
  assert.equal(normalizeSupportedLocale("ko_KR"), "ko-KR");
  assert.equal(normalizeSelectableLocale("ko-KR"), "ko-KR");
  assert.equal(normalizeSupportedLocale("zh-TW"), "zh-TW");
  assert.equal(normalizeSupportedLocale("zh_TW"), "zh-TW");
  assert.equal(normalizeSupportedLocale("zh-Hant"), "zh-TW");
  assert.equal(normalizeSelectableLocale("zh-TW"), "zh-TW");
  assert.equal(normalizeSupportedLocale("tr"), "tr-TR");
  assert.equal(normalizeSupportedLocale("tr_TR"), "tr-TR");
  assert.equal(normalizeSelectableLocale("tr-TR"), "tr-TR");
  assert.equal(normalizeSupportedLocale("uk"), "uk-UA");
  assert.equal(normalizeSupportedLocale("uk_UA"), "uk-UA");
  assert.equal(normalizeSelectableLocale("uk-UA"), "uk-UA");
  assert.equal(normalizeSupportedLocale("ru"), "ru-RU");
  assert.equal(normalizeSupportedLocale("ru_RU"), "ru-RU");
  assert.equal(normalizeSelectableLocale("ru-RU"), "ru-RU");
  assert.equal(normalizeSupportedLocale("hu"), "hu-HU");
  assert.equal(normalizeSupportedLocale("hu_HU"), "hu-HU");
  assert.equal(normalizeSelectableLocale("hu-HU"), "hu-HU");
  assert.equal(normalizeSupportedLocale("sv"), "sv-SE");
  assert.equal(normalizeSupportedLocale("sv_SE"), "sv-SE");
  assert.equal(normalizeSelectableLocale("sv-SE"), "sv-SE");
  assert.equal(normalizeSupportedLocale("da"), "da-DK");
  assert.equal(normalizeSupportedLocale("da_DK"), "da-DK");
  assert.equal(normalizeSelectableLocale("da-DK"), "da-DK");
  assert.equal(normalizeSupportedLocale("fi"), "fi-FI");
  assert.equal(normalizeSupportedLocale("fi_FI"), "fi-FI");
  assert.equal(normalizeSelectableLocale("fi-FI"), "fi-FI");
});

test("locale registry owns format, guide, and native-label metadata", () => {
  assert.deepEqual(
    SUPPORTED_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr", "es", "pt-BR", "it-IT", "pl-PL", "nl-NL", "cs-CZ", "zh-CN", "ja-JP", "ko-KR", "zh-TW", "tr-TR", "uk-UA", "ru-RU", "hu-HU", "sv-SE", "da-DK", "fi-FI", "en-XA", "ar-XB", "zh-XB"],
  );
  assert.deepEqual(
    SELECTABLE_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr", "es", "pt-BR", "it-IT", "pl-PL", "nl-NL", "cs-CZ", "zh-CN", "ja-JP", "ko-KR", "zh-TW", "tr-TR", "uk-UA", "ru-RU", "hu-HU", "sv-SE", "da-DK", "fi-FI"],
  );
  assert.deepEqual(
    CATALOG_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr", "es", "pt-BR", "it-IT", "pl-PL", "nl-NL", "cs-CZ", "zh-CN", "ja-JP", "ko-KR", "zh-TW", "tr-TR", "uk-UA", "ru-RU", "hu-HU", "sv-SE", "da-DK", "fi-FI"],
  );
  assert.equal(sourceLocaleFor("de-DE"), "de");
  assert.equal(fallbackLocaleFor("de"), null);
  assert.equal(sourceLocaleFor("fr-FR"), "fr");
  assert.equal(fallbackLocaleFor("fr"), null);
  assert.equal(sourceLocaleFor("es-ES"), "es");
  assert.equal(fallbackLocaleFor("es"), "en");
  assert.equal(sourceLocaleFor("pt-BR"), "pt-BR");
  assert.equal(fallbackLocaleFor("pt-BR"), "en");
  assert.equal(sourceLocaleFor("it"), "it-IT");
  assert.equal(fallbackLocaleFor("it-IT"), "en");
  assert.equal(sourceLocaleFor("pl"), "pl-PL");
  assert.equal(fallbackLocaleFor("pl-PL"), "en");
  assert.equal(sourceLocaleFor("nl"), "nl-NL");
  assert.equal(fallbackLocaleFor("nl-NL"), "en");
  assert.equal(sourceLocaleFor("cs"), "cs-CZ");
  assert.equal(fallbackLocaleFor("cs-CZ"), "en");
  assert.equal(sourceLocaleFor("zh"), "zh-CN");
  assert.equal(fallbackLocaleFor("zh-CN"), "en");
  assert.equal(sourceLocaleFor("ja"), "ja-JP");
  assert.equal(fallbackLocaleFor("ja-JP"), "en");
  assert.equal(sourceLocaleFor("ko"), "ko-KR");
  assert.equal(fallbackLocaleFor("ko-KR"), "en");
  assert.equal(sourceLocaleFor("zh-Hant"), "zh-TW");
  assert.equal(fallbackLocaleFor("zh-TW"), "en");
  assert.equal(sourceLocaleFor("tr"), "tr-TR");
  assert.equal(fallbackLocaleFor("tr-TR"), "en");
  assert.equal(sourceLocaleFor("uk"), "uk-UA");
  assert.equal(fallbackLocaleFor("uk-UA"), "en");
  assert.equal(sourceLocaleFor("ru"), "ru-RU");
  assert.equal(fallbackLocaleFor("ru-RU"), "en");
  assert.equal(sourceLocaleFor("hu"), "hu-HU");
  assert.equal(fallbackLocaleFor("hu-HU"), "en");
  assert.equal(sourceLocaleFor("sv"), "sv-SE");
  assert.equal(fallbackLocaleFor("sv-SE"), "en");
  assert.equal(sourceLocaleFor("da"), "da-DK");
  assert.equal(fallbackLocaleFor("da-DK"), "en");
  assert.equal(sourceLocaleFor("fi"), "fi-FI");
  assert.equal(fallbackLocaleFor("fi-FI"), "en");
  assert.equal(sourceLocaleFor("en-XA"), "en");
  assert.equal(sourceLocaleFor("ar-XB"), "en");
  assert.equal(sourceLocaleFor("zh-XB"), "en");
  assert.equal(intlLocaleFor("no"), "nb-NO");
  assert.equal(intlLocaleFor("en-XA"), "en-US");
  assert.equal(intlLocaleFor("ar-XB"), "ar-EG");
  assert.equal(intlLocaleFor("zh-XB"), "zh-CN");
  assert.equal(intlLocaleFor("de-DE"), "de-DE");
  assert.equal(intlLocaleFor("fr-FR"), "fr-FR");
  assert.equal(intlLocaleFor("es-MX"), "es-ES");
  assert.equal(intlLocaleFor("pt_br"), "pt-BR");
  assert.equal(intlLocaleFor("it"), "it-IT");
  assert.equal(intlLocaleFor("pl_pl"), "pl-PL");
  assert.equal(guidePathForLocale("nb"), "docs/BRUKERVEILEDNING.md");
  assert.equal(guidePathForLocale("de"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("fr"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("es"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("pt-BR"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("it-IT"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("pl-PL"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("nl-NL"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("cs-CZ"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("zh-CN"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("ja-JP"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("ko-KR"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("zh-TW"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("tr-TR"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("uk-UA"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("ru-RU"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("hu-HU"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("sv-SE"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("da-DK"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("fi-FI"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("unknown"), "docs/USER_GUIDE.md");
});

test("all 21 selectable locales use the parameterized language-selection contract", () => {
  assert.equal(SELECTABLE_LOCALES.length, 21);
  for (const definition of SELECTABLE_LOCALES) {
    assert.equal(
      definition.selectionMessageKey,
      "settings.languageSelected",
      definition.id,
    );
    assert.equal(
      definition.companionSelectionMessageKey,
      "status.languageSelected",
      definition.id,
    );
    assert.equal(
      definition.selectionMessageFallback,
      "Language selected: {language}.",
      definition.id,
    );
    assert.ok(definition.nativeLabel, definition.id);
  }
});

test("locale registry applies html language and direction", () => {
  const documentRef = { documentElement: { lang: "", dir: "" } };

  assert.equal(applyLocaleToDocument("nb-NO", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "nb", dir: "ltr" });

  assert.equal(applyLocaleToDocument("en-XA", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "en-XA", dir: "ltr" });

  assert.equal(applyLocaleToDocument("ar-XB", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "ar-XB", dir: "rtl" });

  assert.equal(applyLocaleToDocument("zh-XB", documentRef), true);
  assert.deepEqual(documentRef.documentElement, {
    lang: "zh-Hans-XB",
    dir: "ltr",
  });

  assert.equal(applyLocaleToDocument("de-DE", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "de", dir: "ltr" });

  assert.equal(applyLocaleToDocument("fr-FR", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "fr", dir: "ltr" });

  assert.equal(applyLocaleToDocument("es-ES", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "es", dir: "ltr" });

  assert.equal(applyLocaleToDocument("pt-BR", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "pt-BR", dir: "ltr" });

  assert.equal(applyLocaleToDocument("it", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "it-IT", dir: "ltr" });

  assert.equal(applyLocaleToDocument("pl", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "pl-PL", dir: "ltr" });

  assert.equal(applyLocaleToDocument("nl", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "nl-NL", dir: "ltr" });

  assert.equal(applyLocaleToDocument("cs", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "cs-CZ", dir: "ltr" });

  assert.equal(applyLocaleToDocument("zh", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "zh-CN", dir: "ltr" });

  assert.equal(applyLocaleToDocument("ja", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "ja-JP", dir: "ltr" });

  assert.equal(applyLocaleToDocument("ko", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "ko-KR", dir: "ltr" });

  assert.equal(applyLocaleToDocument("zh-Hant", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "zh-TW", dir: "ltr" });

  assert.equal(applyLocaleToDocument("tr", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "tr-TR", dir: "ltr" });

  assert.equal(applyLocaleToDocument("uk", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "uk-UA", dir: "ltr" });

  assert.equal(applyLocaleToDocument("ru", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "ru-RU", dir: "ltr" });

  assert.equal(applyLocaleToDocument("hu", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "hu-HU", dir: "ltr" });

  assert.equal(applyLocaleToDocument("sv", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "sv-SE", dir: "ltr" });

  assert.equal(applyLocaleToDocument("da", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "da-DK", dir: "ltr" });

  assert.equal(applyLocaleToDocument("fi", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "fi-FI", dir: "ltr" });
});
