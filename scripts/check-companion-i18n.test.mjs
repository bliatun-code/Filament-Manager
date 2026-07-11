import assert from "node:assert/strict";
import test from "node:test";

import { collectLiteralCompanionTranslationKeys } from "./check-companion-i18n.mjs";

test("companion runtime key collector reads the second argument to t", () => {
  const keys = collectLiteralCompanionTranslationKeys(
    `const value = t(locale, "common.save", "Save"); const dynamic = t(locale, key, "Fallback");`,
  );

  assert.deepEqual(keys.map(({ key }) => key), ["common.save"]);
});
