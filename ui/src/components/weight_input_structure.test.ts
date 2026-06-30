import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./weight_input.tsx", import.meta.url), "utf8");

test("WeightInput reuses inventory detail controls and keeps range focus visible", () => {
  assert.match(source, /inventoryDetailFormControlClassName/);
  assert.match(source, /inventoryDetailSaveButtonClassName/);
  assert.match(source, /focus-visible:ring-sky-100/);
  assert.match(source, /dark:accent-slate-100/);
  assert.doesNotMatch(source, /w-24 rounded-lg border border-slate-200 bg-white px-3 py-2/);
  assert.doesNotMatch(source, /rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold/);
});
