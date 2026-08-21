import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./wishlist_queue_panel.tsx", import.meta.url),
  "utf8",
);

test("WishlistQueuePanel shares action button chrome across stock, remove, and confirm actions", () => {
  assert.match(source, /wishlistQueueActionButtonClassName/);
  assert.match(source, /InventorySwatchChip/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /wishlistQueueActionButtonClassName\("stock"\)/);
  assert.match(source, /normalizeWishlistReceiptQuantity/);
  assert.match(source, /onClick=\{\(\) => openReceipt\(item\)\}/);
  const openReceiptStart = source.indexOf("const openReceipt");
  const closeReceiptStart = source.indexOf("const closeReceipt");
  assert.ok(openReceiptStart >= 0 && closeReceiptStart > openReceiptStart);
  assert.doesNotMatch(
    source.slice(openReceiptStart, closeReceiptStart),
    /setReceiptQuantities/,
  );
  assert.match(source, /<WishlistReceiptModal/);
  assert.match(source, /await onStockItem\([\s\S]*receiptQuantity[\s\S]*purchaseReceiptMetadataHasValues/);
  assert.match(source, /wishlistQueueActionButtonClassName\("remove"\)/);
  assert.match(source, /wishlistQueueActionButtonClassName\("danger"\)/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2/,
  );
  assert.doesNotMatch(
    source,
    /inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white\/80 px-3 py-2/,
  );
});

test("WishlistQueuePanel requests removal before invoking delete and offers inline cancellation", () => {
  assert.match(source, /onClick=\{\(\) => onRequestDeleteItem\(item\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => onDeleteItem\(item\.id\)\}/);
  assert.match(source, /onClick=\{onCancelDeleteItem\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /groupAriaLabel=\{t\("wishlist\.itemStatusGroup"/);
  assert.match(source, /onClick=\{onAddPurchase\}/);
  assert.match(source, /addPurchaseDisabled/);
  assert.doesNotMatch(source, /max-h-\[28rem\]/);
});
