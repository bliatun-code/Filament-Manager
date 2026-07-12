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
  assert.equal(normalizeSelectableLocale("es-ES"), null);
  assert.equal(normalizeSupportedLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeSupportedLocale("pt_br"), "pt-BR");
  assert.equal(normalizeSelectableLocale("pt-BR"), null);
});

test("locale registry owns format, guide, and native-label metadata", () => {
  assert.deepEqual(
    SUPPORTED_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr", "es", "pt-BR", "en-XA", "ar-XB", "zh-XB"],
  );
  assert.deepEqual(
    SELECTABLE_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr"],
  );
  assert.deepEqual(
    CATALOG_LOCALES.map(({ id }) => id),
    ["en", "nb", "de", "fr", "es", "pt-BR"],
  );
  assert.equal(sourceLocaleFor("de-DE"), "de");
  assert.equal(fallbackLocaleFor("de"), null);
  assert.equal(sourceLocaleFor("fr-FR"), "fr");
  assert.equal(fallbackLocaleFor("fr"), null);
  assert.equal(sourceLocaleFor("es-ES"), "es");
  assert.equal(fallbackLocaleFor("es"), "en");
  assert.equal(sourceLocaleFor("pt-BR"), "pt-BR");
  assert.equal(fallbackLocaleFor("pt-BR"), "en");
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
  assert.equal(intlLocaleFor("pl_pl"), "pl-PL");
  assert.equal(guidePathForLocale("nb"), "docs/BRUKERVEILEDNING.md");
  assert.equal(guidePathForLocale("de"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("fr"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("es"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("pt-BR"), "docs/USER_GUIDE.md");
  assert.equal(guidePathForLocale("unknown"), "docs/USER_GUIDE.md");
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
});
