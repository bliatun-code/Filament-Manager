import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("inventory form controls share the inventory input chrome", () => {
  const formControls = readComponentSource("form_control_class.ts");
  const createActions = readComponentSource("inventory_create_actions_panel.tsx");
  const stockSource = readComponentSource("inventory_stock_source_panel.tsx");
  const rawInventoryInputClass =
    /w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800/;

  assert.match(formControls, /inventoryFormControlClassName/);
  assert.match(formControls, /appFormControlClassName/);
  assert.match(formControls, /appControlFocusClassName/);
  assert.match(formControls, /joinClassNames/);
  assert.match(createActions, /inventoryFormControlClassName/);
  assert.match(createActions, /selectionSummary/);
  assert.match(createActions, /SwatchSelectionPreviewHeader/);
  assert.match(createActions, /<ModalFactCard\s+padding="none"\s+surface="plain"/);
  assert.match(createActions, /selectionPreview/);
  assert.match(createActions, /ModalFormField/);
  assert.match(createActions, /inventory\.initialWeight/);
  assert.match(createActions, /inventory\.homeLocationOptional/);
  assert.match(createActions, /min=\{1\}/);
  assert.match(createActions, /step=\{1\}/);
  assert.match(createActions, /aria-invalid=\{initialWeightInvalid\}/);
  assert.match(createActions, /inventory\.error\.invalidWeight/);
  assert.match(stockSource, /inventoryFormControlClassName/);
  assert.match(stockSource, /ModalFormField/);
  for (const key of [
    "wishlist.vendorPlaceholder",
    "wishlist.materialPlaceholder",
    "wishlist.filamentName",
    "wishlist.colorName",
    "wishlist.hexOptional",
  ]) {
    assert.match(stockSource, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(createActions, rawInventoryInputClass);
  assert.doesNotMatch(
    createActions,
    /rounded-xl border border-slate-200\/80 bg-white\/65 p-3/,
  );
  assert.doesNotMatch(stockSource, rawInventoryInputClass);
});
