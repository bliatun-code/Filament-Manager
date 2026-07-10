import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./swatch_selection_preview.tsx", import.meta.url), "utf8");

test("SwatchSelectionPreviewHeader keeps light swatches visible without changing dark chrome", () => {
  assert.match(source, /border-slate-600\/70 shadow-black\/5 dark:border-white\/10/);
  assert.match(source, /border-slate-600\/70 bg-white\/65/);
  assert.doesNotMatch(source, /border-white\/80/);
  assert.doesNotMatch(source, /border-white\/75 bg-white\/65/);
});
