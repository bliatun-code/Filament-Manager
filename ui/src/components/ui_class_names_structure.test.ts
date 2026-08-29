import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ui_class_names.ts", import.meta.url), "utf8");
test("UI class primitives own shared semantic control markers", () => {
  for (const exportName of [
    "joinClassNames",
    "appFormControlClassName",
    "appControlGroupClassName",
    "appControlFocusClassName",
    "appSubtleControlFocusClassName",
    "appControlDisabledClassName",
    "appSoftControlChromeClassName",
    "appSoftButtonClassName",
  ]) {
    assert.match(source, new RegExp(`export (?:const|function) ${exportName}`));
  }

  assert.match(source, /appFormControlClassName = "app-form-control"/);
  assert.match(source, /appControlGroupClassName = "app-control-group"/);
  assert.match(source, /appControlFocusClassName =\s*"app-control-focus/);
  assert.match(source, /appSubtleControlFocusClassName =\s*"app-control-focus-subtle/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /disabled:cursor-not-allowed disabled:opacity-50/);
  assert.match(source, /appSoftControlChromeClassName =\s*"app-soft-control/);
  assert.match(source, /appSoftButtonClassName = joinClassNames/);
});
