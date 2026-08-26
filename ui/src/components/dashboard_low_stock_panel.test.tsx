import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import type { DashboardLowStockAction } from "../lib/dashboard_action_model";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { DashboardLowStockPanel } from "./dashboard_low_stock_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) =>
    formatMessage(fallback, params, "en"),
};

function lowStockItem({
  colorName,
  id,
  lowestRemainingG,
  productKey,
}: {
  colorName: string;
  id: string;
  lowestRemainingG: number;
  productKey: string;
}): DashboardLowStockAction {
  return {
    age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
    candidate: {
      colorName,
      filamentName: "Basic",
      masterId: productKey.replace("master:", ""),
      material: "PLA",
      productKey,
      vendor: "Bambu Lab",
    },
    duplicate: null,
    id,
    kind: "LOW_STOCK",
    lowestRemainingG,
    spoolCount: 1,
    spoolIds: [`spool-${id}`],
    thresholdG: 200,
  };
}

const visibleItem = lowStockItem({
  colorName: "Jade White",
  id: "low-stock:visible",
  lowestRemainingG: 80,
  productKey: "master:visible",
});
const hiddenItem = lowStockItem({
  colorName: "Black",
  id: "low-stock:hidden",
  lowestRemainingG: 45,
  productKey: "master:hidden",
});

function renderPanel({
  defaultExpanded = false,
  error = null,
  hiddenProductKeys = new Set<string>(),
  items = [visibleItem, hiddenItem],
  message = null,
}: {
  defaultExpanded?: boolean;
  error?: string | null;
  hiddenProductKeys?: ReadonlySet<string>;
  items?: DashboardLowStockAction[];
  message?: string | null;
} = {}) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <DashboardLowStockPanel
        defaultExpanded={defaultExpanded}
        error={error}
        hiddenProductKeys={hiddenProductKeys}
        items={items}
        message={message}
        onHideLowStock={() => {}}
        onOpenLowStock={() => {}}
        onQueueLowStock={() => {}}
        onRestoreLowStock={() => {}}
      />
    </I18nContext.Provider>,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("low-stock suggestions use a neutral collapsed button disclosure by default", () => {
  const html = renderPanel();
  const disclosure = /<button[^>]*aria-controls="([^"]+)"[^>]*aria-expanded="false"/.exec(
    html,
  );

  assert.ok(disclosure);
  assert.match(html, />Low-stock suggestions</);
  assert.match(html, />Show suggestions</);
  assert.match(html, />2 suggestions</);
  assert.match(
    html,
    new RegExp(`id="${escapeRegExp(disclosure[1])}"[^>]*hidden=""`),
  );
  assert.doesNotMatch(html, /aria-live=/);
  assert.doesNotMatch(html, /amber/);
});

test("expanded suggestions separate visible and hidden products with specific controls", () => {
  const html = renderPanel({
    defaultExpanded: true,
    hiddenProductKeys: new Set([hiddenItem.candidate.productKey]),
  });
  const disclosure = /<button[^>]*aria-controls="([^"]+)"[^>]*aria-expanded="true"/.exec(
    html,
  );

  assert.ok(disclosure);
  assert.doesNotMatch(
    html,
    new RegExp(`id="${escapeRegExp(disclosure[1])}"[^>]*hidden=`),
  );
  assert.equal((html.match(/data-low-stock-state="visible"/g) ?? []).length, 1);
  assert.equal((html.match(/data-low-stock-state="hidden"/g) ?? []).length, 1);
  assert.match(html, />1 suggestion · 1 hidden</);
  assert.match(html, />Hidden suggestions</);
  assert.match(html, />Show again</);
  assert.match(
    html,
    /aria-label="Add PLA · Basic · Jade White to the wishlist or an order"/,
  );
  assert.match(
    html,
    /aria-label="Hide the suggestion for PLA · Basic · Jade White"/,
  );
  assert.match(
    html,
    /aria-label="Show the suggestion for PLA · Basic · Black again"/,
  );
  assert.match(html, />Add to wishlist \/ order</);
  assert.match(html, />Hide suggestion</);
  assert.match(html, />Open low-stock inventory</);
});

test("the compact panel keeps errors and updates in targeted announcement roles", () => {
  const html = renderPanel({
    defaultExpanded: true,
    error: "Could not update the suggestion.",
    message: "Wishlist updated.",
  });

  assert.match(
    html,
    /role="alert"[^>]*>Could not update the suggestion\.<\/div>/,
  );
  assert.match(html, /role="status"[^>]*>Wishlist updated\.<\/span>/);
  assert.doesNotMatch(html, /<section[^>]*aria-live=/);
});

test("hidden suggestions restore through the focus-preserving handler", () => {
  const source = readFileSync(
    new URL("./dashboard_low_stock_panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onClick=\{\(\) => handleRestore\(item\)\}/);
  assert.match(
    source,
    /lastHidden\?\.candidate\.productKey === item\.candidate\.productKey/,
  );
  assert.match(source, /disclosureButtonRef\.current\?\.focus\(\)/);
});
