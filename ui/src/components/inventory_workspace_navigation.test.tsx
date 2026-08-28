import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { InventoryWorkspaceNavigation } from "./inventory_workspace_navigation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function renderNavigation(activeView: "STOCK" | "PURCHASES" | "LOCATIONS") {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryWorkspaceNavigation
        activeView={activeView}
        inventoryCount={18}
        locationCount={3}
        onViewChange={() => {}}
        purchaseCount={4}
      />
    </I18nContext.Provider>,
  );
}

test("inventory workspace exposes stock, locations and purchases as one-click views with counts", () => {
  const html = renderNavigation("STOCK");

  assert.match(html, /role="group"/);
  assert.match(html, /id="inventory-stock-tab"[^>]*aria-pressed="true"/);
  assert.match(html, /id="inventory-stock-tab"[^>]*app-selected-control/);
  assert.match(html, /id="inventory-purchases-tab"[^>]*aria-pressed="false"/);
  assert.match(html, /id="inventory-locations-tab"[^>]*aria-pressed="false"/);
  assert.match(html, />Inventory</);
  assert.match(html, />18</);
  assert.match(html, />Locations</);
  assert.match(html, />3</);
  assert.match(html, />Wishlist &amp; orders</);
  assert.match(html, />4</);
});

test("purchase view owns the pressed navigation state", () => {
  const html = renderNavigation("PURCHASES");

  assert.match(html, /id="inventory-stock-tab"[^>]*aria-pressed="false"/);
  assert.match(html, /id="inventory-purchases-tab"[^>]*aria-pressed="true"/);
});

test("location view owns the pressed navigation state", () => {
  const html = renderNavigation("LOCATIONS");

  assert.match(html, /id="inventory-stock-tab"[^>]*aria-pressed="false"/);
  assert.match(html, /id="inventory-locations-tab"[^>]*aria-pressed="true"/);
  assert.match(html, /id="inventory-purchases-tab"[^>]*aria-pressed="false"/);
});
