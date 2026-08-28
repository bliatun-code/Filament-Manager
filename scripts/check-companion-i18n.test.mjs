import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAppErrorTranslationKeys,
  collectBackendAppErrorCodes,
  collectLiteralCompanionTranslationKeys,
  validateBackendAppErrorDescriptors,
  validateCompanionTranslationFallbacks,
} from "./check-companion-i18n.mjs";
import {
  validateLocaleDictionaries,
  validateRuntimeTranslationFallbacks,
  validateRuntimeTranslationKeys,
  validateRuntimeTranslationParams,
} from "./check-i18n-locales.mjs";

test("companion runtime key collector reads the second argument to t", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    `const value = t(locale, "common.save", "Save"); const dynamic = t(locale, key, "Fallback");`,
  );

  assert.deepEqual(keys.map(({ key }) => key), ["common.save"]);
});

test("companion runtime key collector validates fourth-argument message parameters", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    [
      `t(locale, "common.count", "{count} rolls");`,
      `t(locale, "common.owner", "{count} rolls for {owner}", { count: 2 });`,
      `t(locale, "common.owner", "{count} rolls for {owner}", { count, owner });`,
    ].join("\n"),
  ).map((entry) => ({ ...entry, location: `source.js:${entry.line}:${entry.column}` }));

  const errors = validateRuntimeTranslationParams(
    {
      common: {
        count: "{count, plural, one {# roll} other {# rolls}}",
        owner: "{count, plural, one {# roll} other {# rolls}} for {owner}",
      },
    },
    keys,
  );

  assert.equal(errors.length, 2);
  assert.match(errors[0], /provides no message parameters/);
  assert.match(errors[1], /missing message parameter \{owner\}/);
});

test("companion translation calls require an inline emergency fallback", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    `t(locale, "common.save"); t(locale, "common.close", "Close");`,
  ).map((entry) => ({ ...entry, location: `source.js:${entry.line}:${entry.column}` }));

  assert.deepEqual(validateCompanionTranslationFallbacks(keys), [
    "source.js:1:11: Companion translation key common.save has no inline fallback.",
  ]);
  assert.equal(keys[1].fallbackText, "Close");
});

test("companion inline fallback must use valid message syntax", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    `t(locale, "common.count", "{count, plural, one {One item}", { count: 1 });`,
  ).map((entry) => ({
    ...entry,
    location: `source.js:${entry.line}:${entry.column}`,
  }));

  assert.match(
    validateRuntimeTranslationFallbacks(
      {
        common: {
          count: "{count, plural, one {One item} other {# items}}",
        },
      },
      keys,
    )[0],
    /inline fallback.*unbalanced opening brace/,
  );
});

test("companion inline fallback fails closed on template expressions", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    't(locale, "common.count", `${count} rolls`, { count });',
  ).map((entry) => ({
    ...entry,
    location: `source.js:${entry.line}:${entry.column}`,
  }));

  assert.equal(keys[0].fallbackArgumentPresent, true);
  assert.equal(keys[0].fallbackText, null);
  assert.deepEqual(
    validateRuntimeTranslationFallbacks(
      { common: { count: "{count} rolls" } },
      keys,
    ),
    [
      "source.js:1:11: inline fallback for common.count must be a string literal or a template literal without substitutions.",
    ],
  );
});

test("companion dictionary contract fails closed on invalid message syntax", () => {
  const errors = validateLocaleDictionaries(
    { common: { count: "{count, plural, one {# roll} other {# rolls}}" } },
    { common: { count: "{count, plural, one {# rull}}" } },
    "nb",
  );

  assert.ok(
    errors.some((error) =>
      error.includes('nb.common.count has invalid message format'),
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('missing the required "other" branch')),
  );
});

test("companion contract includes indirect app-error translation descriptors", () => {
  const runtimeKeys = collectAppErrorTranslationKeys({
    "inventory.location.has_references": [
      "errors.locationHasReferences",
      "Fallback",
    ],
  });

  assert.deepEqual(runtimeKeys.map(({ key }) => key), [
    "errors.locationHasReferences",
  ]);
  assert.match(
    validateRuntimeTranslationKeys({ errors: {} }, runtimeKeys)[0],
    /unknown translation key errors\.locationHasReferences/,
  );
});

test("backend app-error inventory reports stable codes without descriptors", () => {
  const backendCodes = collectBackendAppErrorCodes(
    `
      invalid_bulk_operation("inventory.bulk.empty_selection", "Select a roll");
      invalid_batch("filament_price_batch.group_required", "Choose a group");
      invalid_receipt("wishlist.receive.already_received", "Already received");
      invalid_import("purchase_price_protection.lock_invalid", "Boolean required");
      const unrelated = "database.table_name";
    `,
    "backend.rs",
  );

  assert.deepEqual(
    backendCodes.map(({ code }) => code),
    [
      "inventory.bulk.empty_selection",
      "filament_price_batch.group_required",
      "wishlist.receive.already_received",
      "purchase_price_protection.lock_invalid",
    ],
  );
  assert.deepEqual(
    validateBackendAppErrorDescriptors(backendCodes, {
      "inventory.bulk.empty_selection": ["errors.bulkEmpty", "Fallback"],
      "wishlist.receive.already_received": ["errors.wishlistReceived", "Fallback"],
      "purchase_price_protection.lock_invalid": ["errors.priceLockInvalid", "Fallback"],
    }),
    [
      "backend.rs:3:21: backend app-error code filament_price_batch.group_required has no app_error.js descriptor.",
    ],
  );
});
