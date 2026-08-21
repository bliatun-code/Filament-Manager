import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DashboardActionItem } from "../lib/dashboard_action_model";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { DashboardActionPanel } from "./dashboard_action_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

const items: DashboardActionItem[] = [
  {
    age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
    candidate: {
      colorName: "Gray",
      filamentName: "Basic",
      masterId: "master-gray",
      material: "PLA",
      productKey: "master:master-gray",
      vendor: "Bambu Lab",
    },
    duplicate: null,
    id: "low-stock:master-gray",
    kind: "LOW_STOCK",
    lowestRemainingG: 80,
    spoolCount: 2,
    spoolIds: ["spool-a", "spool-b"],
    thresholdG: 200,
  },
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

function renderPanel(overrides: {
  busyIds?: ReadonlySet<string>;
  error?: string | null;
  message?: string | null;
  items?: DashboardActionItem[];
} = {}) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <DashboardActionPanel
        busyIds={overrides.busyIds}
        error={overrides.error}
        items={overrides.items ?? items}
        message={overrides.message}
        onOpenBambuLiveSettings={() => {}}
        onOpenLoans={() => {}}
        onOpenLowStock={() => {}}
        onOpenPurchases={() => {}}
        onQueueLowStock={() => {}}
      />
    </I18nContext.Provider>,
  );
}

test("dashboard action panel presents all action types with reason, honest age basis, and direct controls", () => {
  const html = renderPanel();

  assert.match(html, /<section[^>]*aria-labelledby="dashboard-action-required-title"/);
  assert.match(html, /<section[^>]*aria-live="polite"/);
  assert.match(html, />Requires action</);
  assert.match(html, /data-action-kind="LOW_STOCK"/);
  assert.match(html, /data-action-kind="OVERDUE_LOAN"/);
  assert.match(html, /data-action-kind="ON_ORDER"/);
  assert.match(html, /data-action-kind="BAMBU_TRUST"/);
  assert.match(html, /2 spools at or below the threshold; lowest is 80 g of 200 g/);
  assert.match(html, /active loan to Ada is past its expected return date/);
  assert.match(html, /2 spools are on order and ready to receive/);
  assert.match(html, /Workshop X1C is no longer Live/);
  assert.match(html, /Start time unknown · detected in this snapshot/);
  assert.doesNotMatch(html, /condition started now|just now/i);
  assert.match(html, /Expected return: Aug 18, 2026 · Overdue 3 d/);
  assert.match(html, /Last updated:/);
  assert.match(html, />Add to wishlist \/ order</);
  assert.match(html, />Low stock</);
  assert.match(html, />Loans</);
  assert.match(html, />Wishlist &amp; orders</);
  assert.match(html, />Open Live settings</);
  assert.match(html, /grid-cols-1[^"\n]*lg:grid-cols-2/);
});

test("dashboard action panel exposes write progress and live feedback accessibly", () => {
  const html = renderPanel({
    busyIds: new Set(["low-stock:master-gray"]),
    error: "Host purchase failed.",
    message: "Existing order reused.",
  });

  assert.match(html, /role="alert"[^>]*>Host purchase failed/);
  assert.match(html, /role="status"[^>]*>Existing order reused/);
  assert.match(html, /disabled=""[^>]*>Loading\.\.\./);
});

test("dashboard action panel retains a clear empty state", () => {
  const html = renderPanel({ items: [] });

  assert.match(html, />0</);
  assert.match(html, />No alerts</);
  assert.doesNotMatch(html, /data-action-kind=/);
});
