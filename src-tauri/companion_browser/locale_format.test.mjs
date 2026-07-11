import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocaleCollator,
  formatLocaleNumber,
  formatLocaleRelativeTime,
  localePluralCategory,
} from "./locale_format.js";

test("locale format helpers use the requested BCP 47 locale", () => {
  assert.equal(formatLocaleNumber(1234.5, "nb"), "1 234,5");
  assert.match(formatLocaleRelativeTime(-2, "day", "de"), /2/);
  assert.equal(localePluralCategory(2, "pl"), "few");
  assert.ok(createLocaleCollator("de", { sensitivity: "base" }).compare("a", "b") < 0);
});
