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
  assert.match(formControls, /focus-visible:border-sky-300/);
  assert.match(formControls, /focus-visible:ring-2/);
  assert.match(createActions, /inventoryFormControlClassName/);
  assert.match(stockSource, /inventoryFormControlClassName/);
  assert.doesNotMatch(createActions, rawInventoryInputClass);
  assert.doesNotMatch(stockSource, rawInventoryInputClass);
});
