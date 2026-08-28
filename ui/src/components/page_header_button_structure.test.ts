import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const buttonSource = readFileSync(new URL("./page_header_button.tsx", import.meta.url), "utf8");
const classSource = readFileSync(new URL("./page_header_button_class.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");

test("PageHeaderButton owns page header action chrome", () => {
  assert.match(buttonSource, /export function PageHeaderButton/);
  assert.match(buttonSource, /pageHeaderButtonClassName\(variant\)/);
  assert.match(buttonSource, /responsive \? "w-full min-\[920px\]:w-auto" : ""/);
  assert.match(classSource, /PageHeaderButtonVariant = "primary" \| "secondary" \| "soft"/);
  assert.match(classSource, /appControlFocusClassName/);
  assert.match(classSource, /variant === "primary"/);
  assert.match(classSource, /app-primary-action/);
  assert.match(classSource, /variant === "soft"/);
  assert.match(classSource, /app-soft-control/);
  assert.doesNotMatch(cssSource, /header-button-primary/);
  assert.doesNotMatch(cssSource, /header-button-secondary/);
});
