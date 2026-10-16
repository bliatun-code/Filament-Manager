import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nContext } from "../lib/i18n";
import { DashboardStockOverview } from "./dashboard_stock_overview";
import { ActivityTimeline } from "./dashboard_widgets";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("low stock preview retains physical spool identity, actual color and measured grams", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={{ locale: "en", setLocale: () => {}, t: (_key, fallback) => fallback ?? _key }}>
      <DashboardStockOverview items={[
        { spoolId: "spool-a", vendor: "Maker", material: "PLA", filamentName: "Basic", colorName: "Vivid green", hexColor: "#00B140", remainingG: 74, locationLabel: null },
        { spoolId: "spool-b", vendor: "Maker", material: "PLA", filamentName: "Basic", colorName: "Vivid green", hexColor: "#00B140", remainingG: 91, locationLabel: null },
      ]} />
    </I18nContext.Provider>,
  );
  assert.equal((html.match(/<li /g) ?? []).length, 2);
  assert.match(html, /74 g/);
  assert.match(html, /91 g/);
  assert.match(html, /#00B140/);
  assert.match(html, /Vivid Green/);
  assert.match(html, /at or below/);
  assert.doesNotMatch(html, /wishlist|ON_ORDER/i);
});

test("recent activity previews three entries and preserves older entries in a native disclosure", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `Event ${index + 1}`, detail: `Detail ${index + 1}` }));
  const html = renderToStaticMarkup(<I18nContext.Provider value={{ locale: "en", setLocale: () => {}, t: (_key, fallback) => fallback ?? _key }}><ActivityTimeline items={items} /></I18nContext.Provider>);
  const disclosure = html.indexOf("<details");
  assert.ok(disclosure > html.indexOf("Event 3"));
  assert.ok(disclosure < html.indexOf("Event 4"));
  assert.match(html, /Show older activity/);
  assert.match(html, /Event 5/);
  assert.doesNotMatch(html, /<details[^>]*open=/);
});
