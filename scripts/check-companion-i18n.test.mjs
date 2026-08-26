import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAppErrorTranslationKeys,
  collectBackendAppErrorCodes,
  collectLiteralCompanionTranslationKeys,
  validateBackendAppErrorDescriptors,
} from "./check-companion-i18n.mjs";
import { validateRuntimeTranslationKeys } from "./check-i18n-locales.mjs";

test("companion runtime key collector reads the second argument to t", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    `const value = t(locale, "common.save", "Save"); const dynamic = t(locale, key, "Fallback");`,
  );

  assert.deepEqual(keys.map(({ key }) => key), ["common.save"]);
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
