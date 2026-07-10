import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCompanionThemeMode,
  normalizeHex,
  printerBrandCssVars,
  readCompanionMediaQuery,
  readStoredCompanionThemeMode,
  resolveCompanionTheme,
  styleObjectToString,
  subscribeToMediaQueryChange,
  suggestSwatchHex,
  swatchCssStyle,
  swatchCssVars,
} from "./companion_theme.js";

function parseCssRgb(value) {
  const channels = String(value).match(/\d+/g)?.map(Number) ?? [];
  assert.equal(channels.length, 3, `expected an RGB color, received ${value}`);
  return channels;
}

function parseHexRgb(value) {
  const normalized = String(value).replace("#", "");
  assert.match(normalized, /^[0-9a-f]{6}$/i);
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
}

function mixRgb(source, target, amount) {
  return source.map((channel, index) => channel * (1 - amount) + target[index] * amount);
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function assertSwatchActionContrast(hex) {
  const vars = swatchCssVars(hex);
  const text = parseHexRgb(vars["--swatch-action-contrast"]);
  const white = [255, 255, 255];
  const endpoints = [
    ["start", parseCssRgb(vars["--swatch-action-start"]), 0.06],
    ["end", parseCssRgb(vars["--swatch-action-end"]), 0.08],
  ];

  for (const [name, endpoint, hoverMix] of endpoints) {
    assert.ok(
      contrastRatio(text, endpoint) >= 4.5,
      `${hex} ${name} endpoint should have at least 4.5:1 text contrast`,
    );
    assert.ok(
      contrastRatio(text, mixRgb(endpoint, white, hoverMix)) >= 4.5,
      `${hex} ${name} hover endpoint should have at least 4.5:1 text contrast`,
    );
  }
}

test("normalizeHex accepts short and long values", () => {
  assert.equal(normalizeHex("#abc"), "#ABC");
  assert.equal(normalizeHex("123456"), "#123456");
  assert.equal(normalizeHex("bad-value"), null);
});

test("suggestSwatchHex resolves common color names before hashing", () => {
  assert.equal(suggestSwatchHex("White", "Basic"), "#F8FAFC");
  assert.equal(suggestSwatchHex("Orange", "Basic"), "#F97316");
});

test("swatch and printer css vars serialize into inline style strings", () => {
  assert.match(styleObjectToString(swatchCssVars("#123456")), /--swatch-rgb:18 52 86/);
  assert.match(swatchCssStyle("#123456"), /--swatch-rgb:18 52 86/);
  assert.match(swatchCssStyle("#123456"), /--swatch-solid:#123456/);
  assert.match(swatchCssStyle("#123456"), /--swatch-action-start:rgb\(/);
  assert.match(swatchCssStyle("#123456"), /--swatch-action-contrast:#FFFFFF/);
  assert.match(swatchCssStyle("#FFFFFF"), /--swatch-action-contrast:#0F172A/);
  assert.match(styleObjectToString(printerBrandCssVars("Bambu X1 Carbon")), /--brand-rgb:0 177 64/);
});

test("swatch action gradients keep WCAG text contrast across real and sampled colors", () => {
  const realColors = [
    "#9B9EA0",
    "#3F8E43",
    "#FFC72C",
    "#FFFFFF",
    "#16A34A",
    "#EF4444",
  ];
  for (const color of realColors) {
    assertSwatchActionContrast(color);
  }
  assert.equal(swatchCssVars("#9B9EA0")["--swatch-action-contrast"], "#0F172A");

  const samples = [0, 51, 102, 153, 204, 255];
  for (const red of samples) {
    for (const green of samples) {
      for (const blue of samples) {
        const color = `#${[red, green, blue]
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`;
        assertSwatchActionContrast(color);
      }
    }
  }
});

test("applyCompanionThemeMode updates root attributes and resolves dark mode", () => {
  const root = {
    dataset: {},
    style: {},
    classList: {
      toggled: [],
      toggle(name, value) {
        this.toggled.push([name, value]);
      },
    },
  };
  const resolved = applyCompanionThemeMode(
    "dark",
    { documentElement: root },
    {
      matchMedia() {
        return { matches: false };
      },
    },
  );

  assert.equal(resolved, "dark");
  assert.equal(root.dataset.themeMode, "dark");
  assert.equal(root.style.colorScheme, "dark");
  assert.deepEqual(root.classList.toggled, [["dark", true]]);
});

test("readStoredCompanionThemeMode falls back to auto", () => {
  assert.equal(
    readStoredCompanionThemeMode("theme-key", {
      getItem() {
        return "light";
      },
    }),
    "light",
  );
  assert.equal(
    readStoredCompanionThemeMode("theme-key", {
      getItem() {
        return "unknown";
      },
    }),
    "auto",
  );
});

test("readStoredCompanionThemeMode falls back when storage throws", () => {
  assert.equal(
    readStoredCompanionThemeMode("theme-key", {
      getItem() {
        throw new Error("storage denied");
      },
    }),
    "auto",
  );
});

test("theme media query helpers tolerate missing or blocked matchMedia", () => {
  assert.equal(readCompanionMediaQuery({}, "(prefers-color-scheme: dark)"), null);
  assert.equal(
    readCompanionMediaQuery(
      {
        matchMedia() {
          throw new Error("matchMedia denied");
        },
      },
      "(prefers-color-scheme: dark)",
    ),
    null,
  );
  assert.equal(
    resolveCompanionTheme("auto", {
      matchMedia() {
        throw new Error("matchMedia denied");
      },
    }),
    "light",
  );
});

test("subscribeToMediaQueryChange supports both modern and legacy media query listeners", () => {
  const modernCalls = [];
  const legacyCalls = [];

  assert.equal(
    subscribeToMediaQueryChange(
      {
        addEventListener(type, handler) {
          modernCalls.push([type, handler]);
        },
      },
      () => {},
    ),
    true,
  );
  assert.equal(modernCalls[0][0], "change");

  assert.equal(
    subscribeToMediaQueryChange(
      {
        addListener(handler) {
          legacyCalls.push(handler);
        },
      },
      () => {},
    ),
    true,
  );
  assert.equal(legacyCalls.length, 1);

  assert.equal(subscribeToMediaQueryChange({}, () => {}), false);
});
