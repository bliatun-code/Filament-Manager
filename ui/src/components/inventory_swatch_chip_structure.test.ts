import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./inventory_swatch_chip.tsx", import.meta.url), "utf8");

test("InventorySwatchChip owns shared swatch background and tone chrome", () => {
  assert.match(source, /swatchCssBackground/);
  assert.match(source, /InventorySwatchChipTone/);
  assert.match(source, /preview:/);
  assert.match(source, /soft:/);
  assert.match(source, /tiny:/);
  assert.match(source, /current:/);
  assert.match(source, /preview: "border-slate-600\/70/);
  assert.match(source, /tiny: "border-slate-600\/70/);
  assert.match(source, /dark:border-white\/10/);
});
