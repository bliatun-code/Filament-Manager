import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_inventory_spool_detail_utility_actions.ts", import.meta.url),
  "utf8",
);

test("selected spool utility actions lazy-load label HTML generation", () => {
  assert.match(source, /import\("\.\/filament_label_print"\)/);
  assert.doesNotMatch(source, /from "\.\/filament_label_print"/);
});
