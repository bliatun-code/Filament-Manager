import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { WishlistItemRow } from "../lib/tauri_client";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".svg")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(url)};`,
      };
    }
    return nextLoad(url, context);
  },
});

const { WishlistQueuePanel } = await import("./wishlist_queue_panel");

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function wishlistItem(overrides: Partial<WishlistItemRow> = {}): WishlistItemRow {
  return {
    id: "wish-ocean",
    master_id: null,
    material: "PETG+",
    filament_name: "Ocean",
    color_name: "Teal",
    vendor: "eSUN",
    status: "ON_ORDER",
    quantity: 3,
    note: "Arriving with the next supplier box.",
    created_at: "2026-07-01 10:00:00",
    updated_at: "2026-07-01 10:00:00",
    ...overrides,
  };
}

function renderPanel(options: {
  confirmId?: string | null;
  items?: WishlistItemRow[];
  query?: string;
  visibleItems?: WishlistItemRow[];
}) {
  const items = options.items ?? [wishlistItem()];
  const visibleItems = options.visibleItems ?? items;
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <WishlistQueuePanel
        busy={false}
        catalogMasterById={new Map()}
        confirmWishlistRemoveId={options.confirmId ?? null}
        items={items}
        loading={false}
        onCancelDeleteItem={() => {}}
        onDeleteItem={() => {}}
        onFilterChange={() => {}}
        onQueryChange={() => {}}
        onRequestDeleteItem={() => {}}
        onStatusChange={() => {}}
        onStockItem={() => {}}
        query={options.query ?? ""}
        resolvedTheme="dark"
        summary={{ all: items.length, wishlist: 0, onOrder: items.length, received: 0 }}
        tauriAvailable
        value="ON_ORDER"
        visibleItems={visibleItems}
      />
    </I18nContext.Provider>,
  );
}

test("wishlist queue renders local search, result count, and named status groups", () => {
  const ocean = wishlistItem();
  const html = renderPanel({
    items: [ocean, wishlistItem({ id: "wish-peach", color_name: "Peach Pink" })],
    query: "ocean",
    visibleItems: [ocean],
  });

  assert.match(html, /<input[^>]*type="search"[^>]*value="ocean"/);
  assert.match(html, />Search purchase queue</);
  assert.match(html, />1 item</);
  assert.match(html, /aria-label="Wishlist status filter"/);
  assert.match(html, /aria-label="Status for [^"]*Ocean[^"]*Teal"/);
  assert.match(html, /<input[^>]*type="number"[^>]*min="1"[^>]*max="3"/);
  assert.match(html, /aria-label="Qty"/);
  assert.match(html, />Stock roll now<\/button>/);
  assert.match(html, /aria-pressed="false" disabled=""[^>]*><span>Received<\/span>/);
});

test("wishlist queue hides receipt controls for fully received rows", () => {
  const item = wishlistItem({ status: "RECEIVED", quantity: 0 });
  const html = renderPanel({ items: [item] });

  assert.doesNotMatch(html, /type="number"/);
  assert.doesNotMatch(html, />Stock roll now<\/button>/);
});

test("wishlist removal confirmation stays inline with danger confirm and cancel", () => {
  const item = wishlistItem();
  const html = renderPanel({ confirmId: item.id, items: [item] });

  assert.match(html, /role="alert"/);
  assert.match(html, /Remove [^<]*Ocean[^<]* from the purchase queue\?/);
  assert.match(html, /Existing inventory rolls are not affected/);
  assert.match(html, /bg-rose-600/);
  assert.match(html, />Confirm remove<\/button>/);
  assert.match(html, />Cancel<\/button>/);
});

test("wishlist queue distinguishes search empty state from status empty state", () => {
  const html = renderPanel({
    items: [wishlistItem()],
    query: "missing",
    visibleItems: [],
  });

  assert.match(html, />0 items</);
  assert.match(html, /No wishlist items match this search/);
  assert.doesNotMatch(html, /No items match the selected status filter/);
});
