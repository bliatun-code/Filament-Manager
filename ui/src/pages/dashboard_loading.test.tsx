import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    if ((url.endsWith(".svg") || url.endsWith(".png"))) return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
    return nextLoad(url, context);
  },
});
const { default: DashboardPage } = await import("./dashboard");
import { I18nContext } from "../lib/i18n";
import { clearDashboardPageSnapshot, writeDashboardPageSnapshot, type DashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderNativeDashboard() {
  return renderToStaticMarkup(<I18nContext.Provider value={{ locale: "en", setLocale: () => {}, t: (_key, fallback) => fallback ?? _key }}><DashboardPage /></I18nContext.Provider>);
}

function hostSnapshot(): DashboardPageSnapshot {
  return {
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

    const snapshot = hostSnapshot();
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


test("unavailable detail rows remain unknown and expose refresh instead of claiming an empty printer setup", () => {
  clearDashboardPageSnapshot();
  try {
    writeDashboardPageSnapshot({ ...hostSnapshot(), printerOverviewAvailable: false, lowStockPreviewAvailable: false });
    const unavailable = renderNativeDashboard();
    assert.match(unavailable, /Details are unavailable in this snapshot/);
    assert.match(unavailable, />Refresh</);
    assert.doesNotMatch(unavailable, /No printers configured/);

    writeDashboardPageSnapshot({ ...hostSnapshot(), printerOverview: [], printerOverviewAvailable: true, lowStockPreview: [], lowStockPreviewAvailable: true });
    const confirmedEmpty = renderNativeDashboard();
    assert.match(confirmedEmpty, /No printers configured/);
    assert.doesNotMatch(confirmedEmpty, /Details are unavailable in this snapshot/);

    writeDashboardPageSnapshot({ ...hostSnapshot(), setupDataAvailable: false, syncSource: "client-offline" });
    const unknownLibrary = renderNativeDashboard();
    const headline = unknownLibrary.slice(unknownLibrary.indexOf('data-testid="dashboard-headline-summary"'), unknownLibrary.indexOf("</button>", unknownLibrary.indexOf('data-testid="dashboard-headline-summary"')));
    assert.match(headline, />—</);
    assert.doesNotMatch(headline, />10</);
  } finally { clearDashboardPageSnapshot(); }
});

test("required setup and trust actions remain ahead of the balanced content", () => {
  clearDashboardPageSnapshot();
  try {
    const snapshot = hostSnapshot();
    writeDashboardPageSnapshot({ ...snapshot, actionItems: [{ kind: "BAMBU_TRUST", id: "trust", printerId: "printer-1", printerName: "Atlas", trustState: "CHANGED", age: { basis: "DETECTED_NOW", value: null, elapsedDays: null } }] });
    const html = renderNativeDashboard();
    const details = html.indexOf('data-testid="dashboard-balanced-primary"');
    assert.ok(details > 0);
    assert.doesNotMatch(html, /Setup and library details|Progress goals|Inventory Health/);
    assert.ok(html.indexOf("Follow up") < details);
    assert.ok(html.indexOf("Finish setup") < details);
    assert.ok(html.indexOf("Open Live settings") < details);
    assert.doesNotMatch(html.slice(0, html.indexOf("Printers</h2>")), /<details[^>]*open=""/);
  } finally { clearDashboardPageSnapshot(); }
});
