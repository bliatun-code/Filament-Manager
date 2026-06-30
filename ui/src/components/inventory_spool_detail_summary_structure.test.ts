import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_spool_detail_summary.tsx", import.meta.url),
  "utf8",
);

test("InventorySpoolDetailHeader matches the shared modal header scale", () => {
  assert.match(source, /tracking-\[0\.14em\]/);
  assert.match(source, /CloseButton/);
  assert.match(source, /px-5 py-4/);
  assert.doesNotMatch(source, /tracking-\[0\.2em\]/);
  assert.doesNotMatch(source, /h-9 w-9/);
  assert.doesNotMatch(source, /&times;/);
});
