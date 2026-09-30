import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { RollUsageChart } from "./roll_usage_chart";
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const i18n: I18nContextValue = { locale: "en", setLocale: () => {}, t: (_key, fallback = "") => fallback };
function render(points: { captured_at: string; grams: number; source: string }[]) {
  return renderToStaticMarkup(<I18nContext.Provider value={i18n}><RollUsageChart points={points} initialWeight={1000} /></I18nContext.Provider>);
}
test("weight chart shows its dated window and spaces irregular samples by elapsed time", () => {
  const html = render([1, 2, 11].map((day, index) => ({ captured_at: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, grams: 1000 - index * 250, source: "MANUAL" })));
  const coordinates = html.match(/<polyline points="([^"]+)"/)![1].split(" ").map(point => point.split(",").map(Number));
  assert.ok(Math.abs((coordinates[1][0] - coordinates[0][0]) / (coordinates[2][0] - coordinates[0][0]) - 0.1) < 1e-9);
  assert.match(html, /<time dateTime="2026-09-01T00:00:00Z"/);
  assert.match(html, /<time[^>]*dateTime="2026-09-11T00:00:00Z"/);
  assert.match(html, /1,000 g/);
});
test("a single weight sample is drawn at its actual weight, not the vertical midpoint", () => {
  const html = render([{ captured_at: "2026-09-01T00:00:00Z", grams: 1000, source: "MANUAL" }]);
  const y = Number(html.match(/<circle[^>]*cy="([^"]+)"/)![1]);
  assert.equal(y, 14);
});
