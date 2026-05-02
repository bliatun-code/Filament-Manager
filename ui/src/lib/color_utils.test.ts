import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SWATCH_COLOR,
  hexToRgb,
  isValidHexColor,
  normalizeHexColor,
  suggestHexFromColor,
  toSwatchColor,
} from "./color_utils";

test("normalizeHexColor accepts 3 and 6 digit hex values with or without hash", () => {
  assert.equal(normalizeHexColor("#abc"), "#abc");
  assert.equal(normalizeHexColor("abc"), "#abc");
  assert.equal(normalizeHexColor("#aabbcc"), "#aabbcc");
  assert.equal(normalizeHexColor("aabbcc"), "#aabbcc");
});

test("normalizeHexColor can canonicalize to uppercase", () => {
  assert.equal(normalizeHexColor("aabbcc", { uppercase: true }), "#AABBCC");
});

test("swatch helpers reject invalid hex values and use the shared fallback", () => {
  assert.equal(isValidHexColor("not-a-color"), false);
  assert.equal(normalizeHexColor("not-a-color"), null);
  assert.equal(toSwatchColor("not-a-color"), DEFAULT_SWATCH_COLOR);
});

test("hexToRgb expands shorthand hex and parses full hex values", () => {
  assert.deepEqual(hexToRgb("#0f8"), [0, 255, 136]);
  assert.deepEqual(hexToRgb("123456"), [18, 52, 86]);
});

test("suggestHexFromColor resolves common color names before hashing", () => {
  assert.equal(
    suggestHexFromColor({
      vendor: "Bambu",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Ocean Blue",
    }),
    "#2563EB",
  );
});

test("suggestHexFromColor returns stable hash colors for unknown names", () => {
  const source = {
    vendor: "Example",
    material: "PLA",
    filament_name: "Mystery Blend",
    color_name: "Nimbus",
  };
  assert.equal(suggestHexFromColor(source), suggestHexFromColor(source));
  assert.match(suggestHexFromColor(source), /^#[0-9A-F]{6}$/);
});
