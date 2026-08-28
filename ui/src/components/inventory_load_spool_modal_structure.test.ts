import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./inventory_load_spool_modal.tsx", import.meta.url), "utf8");

test("InventoryLoadSpoolModal uses themed selected and neutral slot controls", () => {
  assert.match(source, /app-modal-selected-control/);
  assert.match(source, /app-soft-control/);
  assert.doesNotMatch(
    source,
    /app-soft-control[^`"\n]*(?:border-slate|bg-white|bg-slate|dark:bg-slate)/,
  );
});
