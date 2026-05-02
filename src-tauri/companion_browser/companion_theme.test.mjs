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
  swatchCssVars,
} from "./companion_theme.js";

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
  assert.match(styleObjectToString(printerBrandCssVars("Bambu X1 Carbon")), /--brand-rgb:0 177 64/);
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
