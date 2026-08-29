import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./weight_input.tsx", import.meta.url), "utf8");

test("WeightInput reuses inventory detail controls and keeps range focus visible", () => {
  assert.match(source, /inventoryDetailFormControlClassName/);
  assert.match(source, /inventoryDetailSaveButtonClassName/);
  assert.match(source, /app-control-focus/);
  assert.match(source, /app-accent-control/);
  assert.doesNotMatch(source, /accent-slate/);
  assert.doesNotMatch(source, /w-24 rounded-lg border border-slate-200 bg-white px-3 py-2/);
  assert.doesNotMatch(source, /rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold/);
});

test("WeightInput keeps the localized numeric label on one line in the desktop grid", () => {
  assert.match(
    source,
    /grid-cols-1[^\n]*sm:grid-cols-\[minmax\(0,1fr\)_8\.5rem_auto\]/,
  );
  assert.match(
    source,
    /<span className=\{`\$\{inventoryDetailLabelClassName\} sm:whitespace-nowrap`\}>\s*\{t\("inventory\.weightValue"/,
  );
  assert.doesNotMatch(
    source,
    /sm:grid-cols-\[minmax\(0,1fr\)_6rem_auto\]/,
  );
  assert.doesNotMatch(
    source,
    /<span className=\{`\$\{inventoryDetailLabelClassName\} sm:whitespace-nowrap`\}>\s*\{t\("inventory\.adjustWeight"/,
  );
});
