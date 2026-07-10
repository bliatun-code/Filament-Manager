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

type TestRgb = [number, number, number];

function parseCssRgb(value: string): TestRgb {
  const channels = value.match(/\d+/g)?.map(Number) ?? [];
  assert.equal(channels.length, 3, `expected an RGB color, received ${value}`);
  return channels as TestRgb;
}

function parseHexRgb(value: string): TestRgb {
  const normalized = value.replace("#", "");
  assert.match(normalized, /^[0-9a-f]{6}$/i);
  return [0, 2, 4].map((index) =>
    Number.parseInt(normalized.slice(index, index + 2), 16),
  ) as TestRgb;
}

function parseGradientEndpoints(background: string): [TestRgb, TestRgb] {
  const matches = [...background.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)];
  assert.equal(matches.length, 2, `expected two gradient endpoints, received ${background}`);
  return matches.map((match) => parseCssRgb(match[0])) as [TestRgb, TestRgb];
}

function relativeLuminance(rgb: TestRgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: TestRgb, second: TestRgb): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function assertSwatchActionContrast(
  hex: string,
  resolvedTheme: "light" | "dark",
): void {
  const style = buildSwatchActionButtonStyle(hex, resolvedTheme);
  const text = parseHexRgb(style.color);
  const endpoints = parseGradientEndpoints(style.background);
  assert.notDeepEqual(
    endpoints[0],
    endpoints[1],
    `${hex} ${resolvedTheme} should preserve two distinct gradient endpoints`,
  );
  for (const [index, endpoint] of endpoints.entries()) {
    assert.ok(
      contrastRatio(text, endpoint) >= 4.5,
      `${hex} ${resolvedTheme} endpoint ${index + 1} should have at least 4.5:1 text contrast`,
    );
  }
}

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

test("buildSwatchActionButtonStyle keeps WCAG contrast for real midtone swatches", () => {
  const realColors = [
    "#9B9EA0",
    "#8A8A8A",
    "#3F8E43",
    "#BABAB8",
    "#FFC72C",
    "#FFFFFF",
    "#16A34A",
    "#EF4444",
  ];
  for (const resolvedTheme of ["light", "dark"] as const) {
    for (const color of realColors) {
      assertSwatchActionContrast(color, resolvedTheme);
    }
  }

  const gray = buildSwatchActionButtonStyle("#9B9EA0", "light");
  assert.equal(gray.color, "#0F172A");
  const [grayStart, grayEnd] = parseGradientEndpoints(gray.background);
  assert.notDeepEqual(grayStart, grayEnd);
});

test("buildSwatchActionButtonStyle keeps WCAG contrast across an RGB grid", () => {
  const samples = [0, 51, 102, 153, 204, 255];
  for (const resolvedTheme of ["light", "dark"] as const) {
    for (const red of samples) {
      for (const green of samples) {
        for (const blue of samples) {
          const color = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`;
          assertSwatchActionContrast(color, resolvedTheme);
        }
      }
    }
  }
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
