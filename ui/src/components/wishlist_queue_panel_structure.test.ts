import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./wishlist_queue_panel.tsx", import.meta.url),
  "utf8",
);

test("WishlistQueuePanel shares action button chrome across stock and remove actions", () => {
  assert.match(source, /wishlistQueueActionButtonClassName/);
  assert.match(source, /InventorySwatchChip/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /wishlistQueueActionButtonClassName\("stock"\)/);
  assert.match(source, /wishlistQueueActionButtonClassName\("remove"\)/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2/,
  );
  assert.doesNotMatch(
    source,
    /inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white\/80 px-3 py-2/,
  );
});
