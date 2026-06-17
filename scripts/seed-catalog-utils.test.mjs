import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalSwatch,
  isValidSwatch,
  normalizeHexColor,
  normalizeSwatchValue,
} from "./seed-catalog-utils.mjs";

test("normalizeHexColor canonicalizes hash and casing", () => {
  assert.equal(normalizeHexColor("abc"), "#ABC");
  assert.equal(normalizeHexColor(" #a1b2c3 "), "#A1B2C3");
  assert.equal(normalizeHexColor("not-a-color"), null);
});

test("normalizeSwatchValue canonicalizes single and composite swatches", () => {
  assert.equal(normalizeSwatchValue("#e0f7fa"), "#E0F7FA");
  assert.equal(normalizeSwatchValue("Multi(#abc123; #00ffcc)"), "multi(#ABC123,#00FFCC)");
  assert.equal(normalizeSwatchValue("#abc123; #00ffcc"), "gradient(#ABC123,#00FFCC)");
  assert.equal(normalizeSwatchValue(""), null);
});

test("isCanonicalSwatch accepts only normalized display values", () => {
  assert.equal(isValidSwatch("Gradient(#abc123;#00ffcc)"), true);
  assert.equal(isCanonicalSwatch("Gradient(#abc123;#00ffcc)"), false);
  assert.equal(isCanonicalSwatch("gradient(#ABC123,#00FFCC)"), true);
  assert.equal(isCanonicalSwatch(null), true);
});
