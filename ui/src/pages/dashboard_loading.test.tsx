import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardPage from "./dashboard";
import { I18nContext } from "../lib/i18n";
import { clearDashboardPageSnapshot, writeDashboardPageSnapshot, type DashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderNativeDashboard() {
  return renderToStaticMarkup(<I18nContext.Provider value={{ locale: "en", setLocale: () => {}, t: (_key, fallback) => fallback ?? _key }}><DashboardPage /></I18nContext.Provider>);
}

test("first native load shows a status instead of a fabricated empty local library", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { __TAURI_INTERNALS__: {}, location: { search: "" } } });
  clearDashboardPageSnapshot();
  try {
    const pending = renderNativeDashboard();
    assert.match(pending, /role="status"[^>]*>Loading/);
    assert.match(pending, /aria-busy="true"/);
    assert.doesNotMatch(pending, /Synced from local DB|Add rolls|Total Spools|Update the host/);

    const snapshot: DashboardPageSnapshot = {
      activity: [], actionItems: [], clientHostCompanionTone: "live", clientHostDisplayName: "Workshop Host",
      clientHostNeedsRepair: false, clientHostPaired: true, companionStatus: null, dashboardSyncMode: "CLIENT",
      goalMetrics: { totalSpools: 10, configuredPrinters: 2, activeSpools: 10, placedActiveSpools: 4, totalJobs: 1, totalSlots: 8, loadedSlots: 4 },
      health: { score: 80, headline: "Ready", detail: "Host inventory", metrics: [] },
      lastSyncLabel: "Live host snapshot", libraryId: "host-library", locale: "en",
      ownershipLowStock: { borrowedIn: 0, owned: 0 }, ownershipOnHand: { total: 10, owned: 10, borrowedIn: 0, inUse: 4 },
      revisionSource: null, setupDataAvailable: true,
      stats: [{ id: "total", accent: "sky", title: "Total Spools", value: "10", subtitle: "Host library", trend: "—" }],
      usageAvailable: true, usageMonths: [], usageTotal12m: 0,
    };
    writeDashboardPageSnapshot(snapshot);
    const ready = renderNativeDashboard();
    assert.match(ready, /Live host snapshot/);
    assert.match(ready, /Total Spools/);
    assert.doesNotMatch(ready, /Synced from local DB|aria-busy="true"/);
  } finally {
    clearDashboardPageSnapshot();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
