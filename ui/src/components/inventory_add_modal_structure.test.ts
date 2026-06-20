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
});

test("InventoryAddModal wires the separate Bambu batch modal from existing workflow state", () => {
  assert.match(source, /<InventoryBambuBatchModal/);
  assert.match(source, /batch=\{bambuCodeBatch\}/);
  assert.match(source, /createState=\{bambuBatchCreateState\}/);
  assert.doesNotMatch(source, /lookup=\{bambuCodeLookup\}/);
  assert.match(source, /onCreateBatch=\{onCreateBambuCodeBatch\}/);
  assert.match(source, /onInputChange=\{onBambuBatchInputChange\}/);
});
