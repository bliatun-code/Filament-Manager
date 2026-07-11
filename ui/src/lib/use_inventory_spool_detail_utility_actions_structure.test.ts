import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_inventory_spool_detail_utility_actions.ts", import.meta.url),
  "utf8",
);

test("selected spool utility actions export the rendered label PNG", () => {
  assert.match(source, /exportLabelPng/);
  assert.match(source, /filament-label-/);
  assert.doesNotMatch(source, /printLabelHtml/);
  assert.doesNotMatch(source, /buildFilamentLabelHtml/);
});
