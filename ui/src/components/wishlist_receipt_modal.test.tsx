import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { emptyPurchaseReceiptMetadataDraft } from "../lib/purchase_receipt_metadata";
import { WishlistReceiptModal } from "./wishlist_receipt_modal";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof WishlistReceiptModal>> = {},
): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <WishlistReceiptModal
        busy={false}
        errors={{}}
        itemTitle="PLA · Basic · Black"
        maxQuantity={5}
        metadataDraft={emptyPurchaseReceiptMetadataDraft()}
        onCancel={() => {}}
        onConfirm={() => {}}
        onMetadataDraftChange={() => {}}
        onQuantityChange={() => {}}
        quantity={3}
        quantityValue="3"
        {...overrides}
      />
    </I18nContext.Provider>,
  );
}

test("receipt dialog confirms quantity and optional per-roll purchase metadata", () => {
  const html = renderModal();

  assert.match(html, /role="dialog"/);
  assert.match(html, />Receive purchase</);
  assert.match(html, /PLA · Basic · Black/);
  assert.match(html, /name="purchase_price"/);
  assert.match(html, /name="purchase_currency"/);
  assert.match(html, /name="purchase_date"/);
  assert.match(html, /name="batch_code"/);
  assert.match(html, /name="supplier_reference"/);
  assert.match(html, /saved to each of the 3 received rolls/);
  assert.match(html, />Receive 3 rolls<\/button>/);
});

test("receipt dialog disables every write control while submitting", () => {
  const html = renderModal({ busy: true });

  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /<input[^>]*type="number"[^>]*disabled=""/);
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
});
