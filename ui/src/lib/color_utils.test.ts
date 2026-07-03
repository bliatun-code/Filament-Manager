import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SWATCH_COLOR,
  blendSwatchColor,
  buildSwatchActionButtonStyle,
  buildSwatchSurfaceStyle,
  hexToRgb,
  isValidHexColor,
  isValidSwatchColor,
  normalizeBambuStudioSwatchValue,
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

test("normalizeBambuStudioSwatchValue maps colour types to app swatches", () => {
  assert.equal(
    normalizeBambuStudioSwatchValue({
      filamentColour: "#EC984CFF",
      filamentColourType: 0,
      filamentMultiColour: "#EC984CFF; #6CD4BCFF; #A66EB9FF; #D87694FF",
    }),
    "gradient(#EC984C,#6CD4BC,#A66EB9,#D87694)",
  );
  assert.equal(
    normalizeBambuStudioSwatchValue({
      filamentColour: "#720062FF",
      filamentColourType: "1",
      filamentMultiColour: ["#720062FF", "#3A913FFF"],
    }),
    "multi(#720062,#3A913F)",
  );
  assert.equal(
    normalizeBambuStudioSwatchValue({
      filamentColour: "#F7E6DEFF",
      filamentColourType: 2,
      filamentMultiColour: "#111111FF,#222222FF",
    }),
    "#F7E6DE",
  );
  assert.equal(
    normalizeBambuStudioSwatchValue({
      filamentColour: null,
      filamentColourType: 1,
      filamentMultiColour: "#111111FF;#222222FF",
    }),
    "multi(#111111,#222222)",
  );
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

test("buildSwatchActionButtonStyle keeps edge swatches readable", () => {
  const white = buildSwatchActionButtonStyle("#FFFFFF", "light");
  assert.equal(white.color, "#0F172A");
  assert.equal(white.borderColor, "rgb(212, 213, 217)");
  assert.match(white.background, /rgb\(255, 255, 255\) 0%, rgb\(235, 239, 244\) 100%/);

  const black = buildSwatchActionButtonStyle("#000000", "dark");
  assert.equal(black.color, "#FFFFFF");
  assert.equal(black.borderColor, "rgb(89, 90, 91)");
  assert.match(black.background, /rgb\(62, 72, 86\) 0%, rgb\(7, 11, 19\) 100%/);
});

test("buildSwatchSurfaceStyle centralizes tinted surface CSS", () => {
  const style = buildSwatchSurfaceStyle(
    "#2563EB",
    {
      top: 0.2,
      mid: 0.1,
      bottom: 0.04,
      base: "rgb(10, 17, 31)",
      shadow: 0.3,
      border: 0.5,
      ambientShadow: "rgba(2, 6, 23, 0.5)",
      inset: "rgba(255, 255, 255, 0.03)",
    },
    {
      midStop: "25%",
      bottomStop: "70%",
      shadowGeometry: "0 16px 34px -30px",
    },
  );

  assert.equal(style.backgroundColor, "rgb(10, 17, 31)");
  assert.match(style.backgroundImage, /rgba\(37, 99, 235, 0\.2\) 0%/);
  assert.match(style.backgroundImage, /rgba\(37, 99, 235, 0\.1\) 25%/);
  assert.equal(style.borderColor, "rgba(37, 99, 235, 0.5)");
  assert.match(style.boxShadow, /0 16px 34px -30px rgba\(37, 99, 235, 0\.3\)/);
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
