import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./swatch_selection_preview.tsx", import.meta.url), "utf8");

test("SwatchSelectionPreviewHeader keeps swatch identity while tokenizing neutral chrome", () => {
  assert.match(source, /border-slate-600\/70 shadow-black\/5 dark:border-white\/10/);
  assert.match(source, /app-modal-inset-soft border-dashed/);
  assert.match(source, /app-modal-inset-soft flex h-14 w-14/);
  assert.doesNotMatch(source, /border-white\/80/);
  assert.doesNotMatch(source, /bg-white\/65/);
  assert.doesNotMatch(source, /dark:bg-slate-(?:900|950)/);
});
