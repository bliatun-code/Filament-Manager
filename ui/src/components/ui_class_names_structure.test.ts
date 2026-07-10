import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ui_class_names.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(left: [number, number, number], right: [number, number, number]): number {
  const luminances = [relativeLuminance(left), relativeLuminance(right)].sort(
    (a, b) => b - a,
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

test("UI class primitives own shared focus, disabled, and soft button chrome", () => {
  for (const exportName of [
    "joinClassNames",
    "appFormControlClassName",
    "appControlFocusClassName",
    "appSubtleControlFocusClassName",
    "appControlDisabledClassName",
    "appSoftControlChromeClassName",
    "appSoftButtonClassName",
  ]) {
    assert.match(source, new RegExp(`export (?:const|function) ${exportName}`));
  }

  assert.match(source, /appFormControlClassName = "app-form-control"/);
  assert.match(source, /app-control-focus focus-visible:border-sky-300/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /disabled:cursor-not-allowed disabled:opacity-50/);
  assert.match(source, /border-slate-200\/80 bg-white\/85/);
});

test("light form-control tokens keep borders and keyboard focus visible", () => {
  const borderMatch = cssSource.match(
    /--app-control-border-light:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/,
  );
  const focusMatch = cssSource.match(
    /--app-control-focus-light:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/,
  );
  assert.ok(borderMatch);
  assert.ok(focusMatch);

  const white: [number, number, number] = [255, 255, 255];
  const borderRgb = borderMatch.slice(1, 4).map(Number) as [number, number, number];
  const borderAlpha = Number(borderMatch[4]);
  const compositedBorder = borderRgb.map((channel) =>
    Math.round(channel * borderAlpha + 255 * (1 - borderAlpha)),
  ) as [number, number, number];
  const focusRgb = focusMatch.slice(1, 4).map(Number) as [number, number, number];

  assert.ok(contrastRatio(compositedBorder, white) >= 3);
  assert.ok(contrastRatio(focusRgb, white) >= 3);
  assert.match(
    cssSource,
    /html:not\(\.dark\) \.app-form-control,[\s\S]*border-color: var\(--app-control-border-light\) !important/,
  );
  assert.match(
    cssSource,
    /html:not\(\.dark\) \.app-control-focus:focus-visible,[\s\S]*outline: 2px solid var\(--app-control-focus-light\) !important/,
  );
});
