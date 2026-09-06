import assert from "node:assert/strict";
import test from "node:test";

import { buildLibrarySyncHostWishlistReceiptPayload } from "./tauri_wishlist_client";

test("wishlist receipt host payload omits untouched purchase metadata", () => {
  assert.deepEqual(
    buildLibrarySyncHostWishlistReceiptPayload("http://host", "library-1", {
      item_id: "wishlist-1",
      quantity: 2,
    }),
    {
      input: {
        base_url: "http://host",
        expected_library_id: "library-1",
        item_id: "wishlist-1",
        quantity: 2,
      },
    },
  );
});

test("wishlist receipt host payload preserves explicit metadata clearing", () => {
  const purchaseMetadata = {
    purchase_price: null,
    purchase_currency: null,
    purchase_date: null,
    batch_code: null,
    supplier_reference: null,
  };

  assert.deepEqual(
    buildLibrarySyncHostWishlistReceiptPayload("http://host", null, {
      item_id: "wishlist-1",
      quantity: 1,
      purchase_metadata: purchaseMetadata,
    }).input.purchase_metadata,
    purchaseMetadata,
  );
});

test("wishlist receipt host payload carries location atomically and preserves null", () => {
  for (const homeLocation of ["QA Dry box", null]) {
    const payload = buildLibrarySyncHostWishlistReceiptPayload("http://host", "library-1", {
      item_id: "wishlist-1",
      quantity: 2,
      home_location: homeLocation,
    });
    assert.equal(payload.input.home_location, homeLocation);
    assert.equal(payload.input.expected_library_id, "library-1");
    assert.equal(payload.input.quantity, 2);
  }
});
