import assert from "node:assert/strict";
import test from "node:test";
import { emptyWishlistReceiptDraft, wishlistReceiptDraftReducer } from "./wishlist_receipt_draft";

function enteredDraft() {
  let draft = wishlistReceiptDraftReducer(emptyWishlistReceiptDraft(), { type: "open", itemId: "wish-a" });
  draft = wishlistReceiptDraftReducer(draft, { type: "homeLocation", value: "QA Dry box" });
  return wishlistReceiptDraftReducer(draft, {
    type: "metadata", value: { ...draft.metadata, batchCode: "LOT-A" },
  });
}

test("another receipt starts without the previous item's location or purchase metadata", () => {
  const next = wishlistReceiptDraftReducer(enteredDraft(), { type: "open", itemId: "wish-b" });
  assert.deepEqual(next, { ...emptyWishlistReceiptDraft(), itemId: "wish-b" });
});

test("cancel or successful close clears the entire receipt draft, including reopening the same item", () => {
  const closed = wishlistReceiptDraftReducer(enteredDraft(), { type: "close" });
  assert.deepEqual(closed, emptyWishlistReceiptDraft());
  const reopened = wishlistReceiptDraftReducer(closed, { type: "open", itemId: "wish-a" });
  assert.equal(reopened.homeLocation, "");
  assert.equal(reopened.metadata.batchCode, "");
});

test("validation errors and retries retain the item's location and metadata", () => {
  const draft = enteredDraft();
  const invalid = wishlistReceiptDraftReducer(draft, { type: "errors", value: { currency: "currency-required" } });
  assert.equal(invalid.homeLocation, "QA Dry box");
  assert.equal(invalid.metadata.batchCode, "LOT-A");
  assert.deepEqual(wishlistReceiptDraftReducer(invalid, { type: "errors", value: {} }), draft);
});
