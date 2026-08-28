import assert from "node:assert/strict";
import test from "node:test";

import { formatMessage } from "../src-tauri/companion_browser/message_format.js";

import {
  collectLiteralTranslationKeysFromSource,
  localeDictionaryExportName,
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateLocaleOverlay,
  validateDictionaryMessageFormats,
  validateMessageFormatSyntax,
  validateRuntimeTranslationFallbacks,
  validateRuntimeTranslationKeys,
  validateRuntimeTranslationParams,
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

test("locale dictionary contract rejects blank translations for visible source copy", () => {
  const errors = validateLocaleDictionaries(
    { common: { save: "Save", spacer: "" } },
    { common: { save: "   ", spacer: "" } },
    "nb",
  );

  assert.deepEqual(errors, ["nb.common.save has an empty translation."]);
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

test("placeholder comparison ignores plural branch text", () => {
  assert.deepEqual(
    validateLocaleDictionaries(
      { common: { count: "{count, plural, one {Day} other {Days}}" } },
      { common: { count: "{count, plural, one {Dag} other {Dager}}" } },
      "nb",
    ),
    [],
  );
});

test("message-format validator rejects unbalanced expressions", () => {
  assert.match(
    validateMessageFormatSyntax("Hello {name")[0],
    /unbalanced opening brace/,
  );
  assert.match(
    validateMessageFormatSyntax("Hello name}")[0],
    /unexpected closing brace/,
  );
});

test("message-format validator requires an other branch", () => {
  assert.match(
    validateMessageFormatSyntax("{count, plural, one {# roll}}")[0],
    /plural is missing the required "other" branch/,
  );
  assert.match(
    validateMessageFormatSyntax("{owner, select, me {Mine}}")[0],
    /select is missing the required "other" branch/,
  );
});

test("message-format validator rejects invalid select and plural branches", () => {
  assert.match(
    validateMessageFormatSyntax(
      "{count, plural, banana {# rolls} other {# rolls}}",
    )[0],
    /invalid plural selector "banana"/,
  );
  assert.match(
    validateMessageFormatSyntax("{owner, select, me Mine other {Shared}}")[0],
    /invalid select branch/,
  );
  assert.match(
    validateMessageFormatSyntax(
      "{count, plural, one {# roll} one {Again} other {# rolls}}",
    )[0],
    /duplicate plural selector "one"/,
  );
  assert.match(
    validateMessageFormatSyntax(
      "{count, translatedPlural, one {# roll} other {# rolls}}",
    )[0],
    /unsupported message argument type "translatedPlural"/,
  );
  for (const selector of ["=1.0", "=.5", "=01", "=-0"]) {
    assert.match(
      validateMessageFormatSyntax(
        `{count, plural, ${selector} {Exact} other {Other}}`,
      )[0],
      /invalid plural selector/,
    );
  }
});

test("message-format validator rejects formatter styles ignored by runtime", () => {
  for (const template of [
    "{price, number, currency}",
    "{date, date, short}",
    "{time, time, long}",
  ]) {
    assert.match(
      validateMessageFormatSyntax(template)[0],
      /styles are not supported by the runtime/,
    );
  }
});

test("message-format validator accepts runtime-compatible nested forms", () => {
  const nestedTemplate =
    "{audience, select, owner {{count, plural, =0 {No rolls} one {# roll for {name}} other {# rolls for {name}}}} other {{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}}}";
  assert.deepEqual(
    validateMessageFormatSyntax(nestedTemplate),
    [],
  );
  assert.equal(
    formatMessage(
      nestedTemplate,
      { audience: "owner", count: 1, name: "Ada" },
      "en",
    ),
    "1 roll for Ada",
  );
  assert.equal(
    formatMessage(nestedTemplate, { audience: "guest", rank: 2 }, "en"),
    "2nd",
  );
  assert.deepEqual(
    validateMessageFormatSyntax(
      "Updated {count, number} rolls on {date, date} at {time, time}",
    ),
    [],
  );
});

test("dictionary message-format validation reports the locale and key", () => {
  assert.deepEqual(
    validateDictionaryMessageFormats(
      { common: { count: "{count, plural, one {# roll}}" } },
      "nb",
    ),
    [
      'nb.common.count has invalid message format: at index 16: plural is missing the required "other" branch.',
    ],
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
  assert.equal(keys[0].fallbackText, "Save");
});

test("runtime fallback contract rejects malformed syntax and placeholder drift", () => {
  const runtimeKeys = collectLiteralTranslationKeysFromSource(
    [
      `t("common.count", "{count, plural, one {One item}", { count: 1 });`,
      `t("common.owner", "{count} items for {person}", { count: 1, owner: "Ada" });`,
    ].join("\n"),
  ).map((entry) => ({
    ...entry,
    location: `source.tsx:${entry.line}:${entry.column}`,
  }));

  const errors = validateRuntimeTranslationFallbacks(
    {
      common: {
        count: "{count, plural, one {One item} other {# items}}",
        owner: "{count} items for {owner}",
      },
    },
    runtimeKeys,
  );

  assert.ok(errors.some((error) => error.includes("unbalanced opening brace")));
  assert.ok(errors.some((error) => error.includes("missing placeholder {owner}")));
  assert.ok(errors.some((error) => error.includes("extra placeholder {person}")));
});

test("runtime fallback contract fails closed on template expressions", () => {
  const runtimeKeys = collectLiteralTranslationKeysFromSource(
    't("common.count", `${count} spools`, { count });',
  ).map((entry) => ({
    ...entry,
    location: `source.tsx:${entry.line}:${entry.column}`,
  }));

  assert.equal(runtimeKeys[0].fallbackArgumentPresent, true);
  assert.equal(runtimeKeys[0].fallbackText, null);
  assert.deepEqual(
    validateRuntimeTranslationFallbacks(
      { common: { count: "{count} spools" } },
      runtimeKeys,
    ),
    [
      "source.tsx:1:3: inline fallback for common.count must be a string literal or a template literal without substitutions.",
    ],
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

test("runtime parameter contract rejects definitely missing message parameters", () => {
  const source = [
    `t("common.count", "{count} spools");`,
    `t("common.owner", "{count} spools for {owner}", { count: 2 });`,
    `t("common.owner", "{count} spools for {owner}", { count, owner });`,
    `t("common.owner", "{count} spools for {owner}", dynamicParams);`,
  ].join("\n");
  const runtimeKeys = collectLiteralTranslationKeysFromSource(source).map(
    (entry) => ({ ...entry, location: `source.tsx:${entry.line}:${entry.column}` }),
  );
  const errors = validateRuntimeTranslationParams(
    {
      common: {
        count: "{count, plural, one {# spool} other {# spools}}",
        owner: "{count, plural, one {# spool} other {# spools}} for {owner}",
      },
    },
    runtimeKeys,
  );

  assert.equal(errors.length, 2);
  assert.match(errors[0], /provides no message parameters/);
  assert.match(errors[0], /\{count\}/);
  assert.match(errors[1], /missing message parameter \{owner\}/);
});
