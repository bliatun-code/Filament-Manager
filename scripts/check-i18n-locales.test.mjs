import assert from "node:assert/strict";
import test from "node:test";

import {
  collectLiteralTranslationKeysFromSource,
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateRuntimeTranslationKeys,
} from "./check-i18n-locales.mjs";

test("locale dictionary parser reads nested string leaves", () => {
  const dictionary = readLocaleDictionaryFromSource(
    `export const enDictionary = { app: { title: "Filament Manager" } };`,
    "enDictionary",
  );

  assert.deepEqual(dictionary, {
    app: {
      title: "Filament Manager",
    },
  });
});

test("locale dictionary contract accepts matching keys and placeholders", () => {
  const errors = validateLocaleDictionaries(
    {
      common: {
        count: "{count} spools",
      },
    },
    {
      common: {
        count: "{count} filamenter",
      },
    },
    "nb",
  );

  assert.deepEqual(errors, []);
});

test("locale dictionary contract reports key and placeholder drift", () => {
  const errors = validateLocaleDictionaries(
    {
      common: {
        count: "{count} spools for {owner}",
        save: "Save",
      },
    },
    {
      common: {
        count: "{count} filamenter for {person}",
        close: "Lukk",
      },
    },
    "nb",
  );

  assert.ok(errors.some((error) => error.includes("missing translation key common.save")));
  assert.ok(errors.some((error) => error.includes("extra translation key common.close")));
  assert.ok(errors.some((error) => error.includes("missing placeholder {owner}")));
  assert.ok(errors.some((error) => error.includes("extra placeholder {person}")));
});

test("runtime key collector reads literal translation calls", () => {
  const keys = collectLiteralTranslationKeysFromSource(
    `const value = t("common.save", "Save"); const dynamic = t(key, "Fallback");`,
  );

  assert.deepEqual(keys.map(({ key }) => key), ["common.save"]);
});

test("runtime key contract reports literals missing from the base dictionary", () => {
  const errors = validateRuntimeTranslationKeys(
    { common: { save: "Save" } },
    [
      { key: "common.save", location: "ui/src/example.tsx:1:1" },
      { key: "common.missing", location: "ui/src/example.tsx:2:1" },
    ],
  );

  assert.deepEqual(errors, [
    "ui/src/example.tsx:2:1: unknown translation key common.missing.",
  ]);
});
