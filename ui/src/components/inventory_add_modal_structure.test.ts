import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./inventory_add_modal.tsx", import.meta.url), "utf8");

test("InventoryAddModal keeps the Bambu batch action in the header before the source panel", () => {
  const actionIndex = source.indexOf("bambuBatchHeaderAction");
  const stockPanelIndex = source.indexOf("<InventoryStockSourcePanel");

  assert.notEqual(actionIndex, -1);
  assert.notEqual(stockPanelIndex, -1);
  assert.ok(actionIndex < stockPanelIndex);
  assert.match(source, /openBambuBatchModal/);
  assert.match(source, /onCreateModeChange\("bambu"\)/);
  assert.match(source, /<ModalHeader/);
  assert.match(source, /<ModalHeaderActionButton/);
  assert.match(source, /<ModalBody/);
  assert.match(source, /ModalNotice/);
  assert.match(source, /aside=\{/);
  assert.match(source, /inventoryTwoColumnModalGridClassName/);
  assert.doesNotMatch(source, /FeedbackBanner/);
  assert.doesNotMatch(source, /inventoryAddModalHeaderActionButtonClassName/);
  assert.doesNotMatch(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(source, /sm:text-\[2rem\]/);
  assert.doesNotMatch(
    source,
    /inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200\/80 bg-white\/85 px-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200\/25 backdrop-blur-sm transition/,
  );
});

test("InventoryAddModal wires the separate Bambu batch modal from existing workflow state", () => {
  assert.match(source, /<InventoryBambuBatchModal/);
  assert.match(source, /batch=\{bambuCodeBatch\}/);
  assert.match(source, /createState=\{bambuBatchCreateState\}/);
  assert.doesNotMatch(source, /lookup=\{bambuCodeLookup\}/);
  assert.match(source, /onCreateBatch=\{onCreateBambuCodeBatch\}/);
  assert.match(source, /onInputChange=\{onBambuBatchInputChange\}/);
  assert.match(source, /onRowSelectionChange=\{onBambuBatchRowSelectionChange\}/);
  assert.match(source, /autoOpenBambuBatch/);
  assert.match(source, /autoFocusWishlistQueue/);
  assert.match(source, /openBambuBatchModal\(\)/);
});

test("InventoryAddModal can focus the wishlist queue for visual QA", () => {
  assert.match(source, /wishlistQueueRef/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /<WishlistQueuePanel/);
});

test("InventoryAddModal feeds current stock selection into the action panel preview", () => {
  assert.match(source, /buildInventoryCreateSelectionSummary/);
  assert.match(source, /selectedCatalogMasterId/);
  assert.match(source, /selectionSummary=\{selectionSummary\}/);
});
