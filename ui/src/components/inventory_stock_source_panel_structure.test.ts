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
  assert.match(source, /hoveredCatalogMasterId/);
  assert.match(source, /setHoveredCatalogMasterId\(master\.id\)/);
  assert.match(source, /setHoveredCatalogMasterId\(null\)/);
  assert.match(source, /hoveredCatalogMasterId === master\.id/);
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

test("InventoryStockSourcePanel starts catalog entry in the named search field", () => {
  assert.match(source, /autoFocusCatalogSearch = true/);
  assert.match(source, /type="search"\s+autoFocus=\{autoFocusCatalogSearch\}\s+aria-label=/);
  assert.match(source, /wishlist\.searchBambu/);
  assert.match(source, /wishlist\.searchEsun/);
  assert.match(source, /max-h-\[22rem\][^"]*overflow-y-auto[^"]*lg:max-h-\[26rem\]/);
});

test("InventoryStockSourcePanel does not confuse lazy loading failures with no matches", () => {
  assert.match(source, /catalogLoadState === "IDLE" \|\| catalogLoadState === "LOADING"/);
  assert.match(source, /catalogLoadState === "ERROR"/);
  assert.match(source, /onClick=\{onRetryCatalog\}/);
  assert.match(source, /errors\.requestFailed/);
  assert.match(source, /catalogReady && activeCatalogMasters\.length === 0/);
});
