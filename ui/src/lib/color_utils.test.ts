import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SWATCH_COLOR,
  blendSwatchColor,
  hexToRgb,
  isValidHexColor,
  isValidSwatchColor,
  normalizeHexColor,
  normalizeSwatchValue,
  parseSwatchSpec,
  suggestHexFromColor,
  swatchCssBackground,
  swatchRgba,
  swatchTextColor,
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

test("normalizeSwatchValue accepts multi and gradient swatches", () => {
  assert.equal(
    normalizeSwatchValue("multi(#720062, #3A913F)", { uppercase: true }),
    "multi(#720062,#3A913F)",
  );
  assert.equal(
    normalizeSwatchValue("gradient(#ec984c; #6cd4bc; #a66eb9)", { uppercase: true }),
    "gradient(#EC984C,#6CD4BC,#A66EB9)",
  );
  assert.equal(isValidSwatchColor("gradient(#EC984C,#6CD4BC)"), true);
  assert.equal(isValidSwatchColor("multi(#EC984C,not-a-color)"), false);
});

test("swatch specs expose primary color and css backgrounds for composite swatches", () => {
  assert.deepEqual(parseSwatchSpec("multi(#111111,#222222,#333333)"), {
    kind: "multi",
    colors: ["#111111", "#222222", "#333333"],
  });
  assert.equal(toSwatchColor("multi(#111111,#222222)"), "#111111");
  assert.equal(
    swatchCssBackground("multi(#111111,#222222)", 90),
    "linear-gradient(90deg, #111111 0%, #111111 50%, #222222 50%, #222222 100%)",
  );
  assert.equal(
    swatchCssBackground("gradient(#111111,#222222,#333333)", 90),
    "linear-gradient(90deg, #111111 0%, #222222 50%, #333333 100%)",
  );
});

test("hexToRgb expands shorthand hex and parses full hex values", () => {
  assert.deepEqual(hexToRgb("#0f8"), [0, 255, 136]);
  assert.deepEqual(hexToRgb("123456"), [18, 52, 86]);
  assert.deepEqual(hexToRgb("gradient(#123456,#ABCDEF)"), [18, 52, 86]);
});

test("swatch primitive helpers build css colors and readable text colors", () => {
  assert.equal(swatchRgba("#0f8", 0.5), "rgba(0, 255, 136, 0.5)");
  assert.equal(swatchTextColor("#FFFFFF"), "#0F172A");
  assert.equal(swatchTextColor("#111111"), "#FFFFFF");
  assert.equal(blendSwatchColor("#000000", [255, 255, 255], 0.5), "rgb(128, 128, 128)");
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
