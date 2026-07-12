import assert from "node:assert/strict";
import test from "node:test";

import {
  collectLiteralTranslationKeysFromSource,
  localeDictionaryExportName,
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateLocaleOverlay,
  validateRuntimeTranslationKeys,
} from "./check-i18n-locales.mjs";

test("locale dictionary export names support regional locale identifiers", () => {
  assert.equal(localeDictionaryExportName("en"), "enDictionary");
  assert.equal(localeDictionaryExportName("pt-BR"), "ptBRDictionary");
});

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

  assert.ok(
    errors.some((error) =>
      error.includes("missing translation key common.save"),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.includes("extra translation key common.close"),
    ),
  );
  assert.ok(
    errors.some((error) => error.includes("missing placeholder {owner}")),
  );
  assert.ok(
    errors.some((error) => error.includes("extra placeholder {person}")),
  );
});

test("locale dictionary contract validates ICU selector parameters", () => {
  const errors = validateLocaleDictionaries(
    {
      common: {
        count: "{count, plural, one {# spool} other {# spools}} for {owner}",
      },
    },
    {
      common: {
        count: "{total, plural, one {# spole} other {# spoler}} for {owner}",
      },
    },
    "nb",
  );

  assert.ok(
    errors.some((error) => error.includes("missing placeholder {count}")),
  );
  assert.ok(
    errors.some((error) => error.includes("extra placeholder {total}")),
  );
});

test("draft locale overlay accepts partial keys but rejects drift", () => {
  assert.deepEqual(
    validateLocaleOverlay(
      { common: { save: "Save", count: "{count} spools" } },
      { common: { save: "Speichern" } },
      "de",
    ),
    [],
  );
  const errors = validateLocaleOverlay(
    { common: { count: "{count} spools" } },
    { common: { count: "{total} Rollen", extra: "Extra" } },
    "de",
  );
  assert.ok(
    errors.some((error) => error.includes("missing placeholder {count}")),
  );
  assert.ok(
    errors.some((error) => error.includes("extra placeholder {total}")),
  );
  assert.ok(
    errors.some((error) =>
      error.includes("unknown translation key common.extra"),
    ),
  );
});

test("runtime key collector reads literal translation calls", () => {
  const keys = collectLiteralTranslationKeysFromSource(
    `const value = t("common.save", "Save"); const dynamic = t(key, "Fallback");`,
  );

  assert.deepEqual(
    keys.map(({ key }) => key),
    ["common.save"],
  );
});

test("runtime key contract reports literals missing from the base dictionary", () => {
  const errors = validateRuntimeTranslationKeys({ common: { save: "Save" } }, [
    { key: "common.save", location: "ui/src/example.tsx:1:1" },
    { key: "common.missing", location: "ui/src/example.tsx:2:1" },
  ]);

  assert.deepEqual(errors, [
    "ui/src/example.tsx:2:1: unknown translation key common.missing.",
  ]);
});
