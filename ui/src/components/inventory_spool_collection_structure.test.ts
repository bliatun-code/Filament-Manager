import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_spool_collection.tsx", import.meta.url),
  "utf8",
);

test("empty spools render an actually empty remaining meter", () => {
  assert.match(source, /rollFillRatio <= 0 \? 0 : Math\.max\(4/);
  assert.doesNotMatch(source, /width: `\$\{Math\.max\(4, Math\.round\(rollFillRatio \* 100\)\)\}%`/);
});

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

test("InventorySpoolCollection lets grouped cards reveal every roll", () => {
  assert.match(source, /const groupExpanded = expandedGroupKeys\.has\(group\.key\)/);
  assert.match(
    source,
    /const visibleRolls = groupExpanded \? sortedRolls : sortedRolls\.slice\(0, 3\)/,
  );
  assert.match(source, /aria-expanded=\{groupExpanded\}/);
  assert.match(source, /aria-controls=\{rollListId\}/);
  assert.match(source, /id=\{rollListId\}/);
  assert.match(source, /toggleGroupExpanded\(group\.key\)/);
  assert.match(source, /inventory\.showAllRolls/);
  assert.match(source, /inventory\.showFewerRolls/);
  assert.doesNotMatch(
    source,
    /<div className="surface-subtle border-dashed[^>]*>\s*\+ \{group\.rolls\.length - 3\}/,
  );
});
