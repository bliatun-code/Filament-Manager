import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocaleToDocument,
  guidePathForLocale,
  intlLocaleFor,
  normalizeSupportedLocale,
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
  assert.equal(normalizeSupportedLocale("de-DE"), null);
});

test("locale registry owns format, guide, and native-label metadata", () => {
  assert.deepEqual(SUPPORTED_LOCALES.map(({ id }) => id), ["en", "nb", "en-XA"]);
  assert.deepEqual(SELECTABLE_LOCALES.map(({ id }) => id), ["en", "nb"]);
  assert.equal(sourceLocaleFor("en-XA"), "en");
  assert.equal(intlLocaleFor("no"), "nb-NO");
  assert.equal(intlLocaleFor("en-XA"), "en-US");
  assert.equal(intlLocaleFor("pl_pl"), "pl-PL");
  assert.equal(guidePathForLocale("nb"), "docs/BRUKERVEILEDNING.md");
  assert.equal(guidePathForLocale("unknown"), "docs/USER_GUIDE.md");
});

test("locale registry applies html language and direction", () => {
  const documentRef = { documentElement: { lang: "", dir: "" } };

  assert.equal(applyLocaleToDocument("nb-NO", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "nb", dir: "ltr" });

  assert.equal(applyLocaleToDocument("en-XA", documentRef), true);
  assert.deepEqual(documentRef.documentElement, { lang: "en-XA", dir: "ltr" });
});
