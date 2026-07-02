import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ui_class_names.ts", import.meta.url), "utf8");

test("UI class primitives own shared focus, disabled, and soft button chrome", () => {
  for (const exportName of [
    "joinClassNames",
    "appControlFocusClassName",
    "appSubtleControlFocusClassName",
    "appControlDisabledClassName",
    "appSoftControlChromeClassName",
    "appSoftButtonClassName",
  ]) {
    assert.match(source, new RegExp(`export (?:const|function) ${exportName}`));
  }

  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /disabled:cursor-not-allowed disabled:opacity-50/);
  assert.match(source, /border-slate-200\/80 bg-white\/85/);
});
