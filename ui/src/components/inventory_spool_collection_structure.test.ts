import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_spool_collection.tsx", import.meta.url),
  "utf8",
);

test("InventorySpoolCollection shares focus treatment for roll buttons", () => {
  assert.match(source, /inventorySpoolRollButtonClassName/);
  assert.match(source, /inventorySpoolListButtonClassName/);
  assert.match(source, /inventorySpoolRollButtonClassName\("single"\)/);
  assert.match(source, /inventorySpoolRollButtonClassName\("compact"\)/);
  assert.match(source, /inventorySpoolListButtonClassName\(listButtonState\)/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.doesNotMatch(
    source,
    /rounded-xl border px-3\.5 py-3 text-left transition hover:-translate-y-\[1px\]/,
  );
  assert.doesNotMatch(
    source,
    /flex w-full items-start justify-between gap-3 rounded-xl border px-3\.5 py-3 text-left transition hover:-translate-y-\[1px\]/,
  );
  assert.doesNotMatch(
    source,
    /w-full rounded-xl border px-4 py-3 text-left shadow-sm transition hover:-translate-y-\[1px\]/,
  );
});
