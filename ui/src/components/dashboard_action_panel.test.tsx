import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import type {
  DashboardActionItem,
  DashboardLowStockAction,
} from "../lib/dashboard_action_model";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { DashboardActionPanel } from "./dashboard_action_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) =>
    formatMessage(fallback, params, "en"),
};

type DashboardPriorityAction = Exclude<
  DashboardActionItem,
  DashboardLowStockAction
>;

const items: DashboardPriorityAction[] = [
  {
    age: { basis: "EXPECTED_RETURN_AT", elapsedDays: 3, value: "2026-08-18" },
    borrowerName: "Ada",
    colorName: "Black",
    filamentName: "Matte",
    id: "overdue-loan:loan-1",
    kind: "OVERDUE_LOAN",
    loanId: "loan-1",
    material: "PLA",
    spoolId: "spool-loan",
  },
  {
    age: { basis: "UPDATED_AT", elapsedDays: 1, value: "2026-08-20 12:00:00" },
    colorName: "Ocean",
    filamentName: "Basic",
    id: "on-order:wish-1",
    itemId: "wish-1",
    kind: "ON_ORDER",
    material: "PETG",
    quantity: 2,
    vendor: "eSUN",
  },
  {
    age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
    id: "bambu-trust:printer-1",
    kind: "BAMBU_TRUST",
    printerId: "printer-1",
    printerName: "Workshop X1C",
    trustState: "CHANGED",
  },
];

function renderPanel(
  overrides: { items?: DashboardPriorityAction[] } = {},
) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <DashboardActionPanel
        items={overrides.items ?? items}
        onOpenBambuLiveSettings={() => {}}
        onOpenLoans={() => {}}
        onOpenPurchases={() => {}}
      />
    </I18nContext.Provider>,
  );
}

test("dashboard action panel keeps mandatory actions compact and direct", () => {
  const html = renderPanel();

  assert.match(
    html,
    /<section[^>]*aria-labelledby="dashboard-action-required-title"/,
  );
  assert.doesNotMatch(html, /aria-live=/);
  assert.match(html, />Requires action</);
  assert.match(html, /data-action-kind="OVERDUE_LOAN"/);
  assert.match(html, /data-action-kind="ON_ORDER"/);
  assert.match(html, /data-action-kind="BAMBU_TRUST"/);
  assert.doesNotMatch(html, /data-action-kind="LOW_STOCK"/);
  assert.match(html, /active loan to Ada is past its expected return date/);
  assert.match(html, /2 spools are on order and ready to receive/);
  assert.match(html, /Workshop X1C is no longer Live/);
  assert.match(html, /Start time unknown · detected in this snapshot/);
  assert.doesNotMatch(html, /condition started now|just now/i);
  assert.match(html, /Expected return: Aug 18, 2026 · Overdue 3 d/);
  assert.match(html, /Last updated:/);
  assert.match(html, />Loans</);
  assert.match(html, />Wishlist &amp; orders</);
  assert.match(html, />Open Live settings</);
  assert.match(html, /divide-y/);
  assert.doesNotMatch(html, /lg:grid-cols-2/);
});

test("dashboard action panel disappears when no mandatory action needs attention", () => {
  assert.equal(renderPanel({ items: [] }), "");
});
