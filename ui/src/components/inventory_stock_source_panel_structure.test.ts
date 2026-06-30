import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_stock_source_panel.tsx", import.meta.url),
  "utf8",
);

test("InventoryStockSourcePanel shares focus treatment for catalog and manual actions", () => {
  assert.match(source, /inventoryStockCatalogRowClassName/);
  assert.match(source, /inventoryStockManualFallbackButtonClassName/);
  assert.match(source, /semanticChipClass/);
  assert.match(source, /catalogMatchCountLabel/);
  assert.match(source, /hover:outline-slate-200\/80/);
  assert.match(source, /dark:hover:outline-slate-500\/30/);
  assert.match(source, /focus-visible:outline-sky-300\/70/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /disabled:cursor-not-allowed/);
  assert.doesNotMatch(
    source,
    /flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2\.5 text-left text-\[13px\] transition/,
  );
  assert.doesNotMatch(
    source,
    /w-full rounded-xl border border-slate-200 bg-white\/85 px-3 py-2\.5 text-sm font-semibold text-slate-700 transition/,
  );
});
