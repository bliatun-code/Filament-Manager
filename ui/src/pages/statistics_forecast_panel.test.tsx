import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ConsumptionForecast } from "../lib/statistics_forecast_model";
import { StatisticsForecastPanel } from "./statistics_forecast_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const forecast: ConsumptionForecast = {
  asOfDate: "2026-08-21",
  averageDailyUsageGrams: 100,
  basisDays: 30,
  daysOfSupply: 45,
  estimatedDepletionDate: "2026-10-05",
  hasUsageBasis: true,
  horizonDays: 30,
  ownedOnHandGrams: 4_500,
  ownedOnHandSpoolCount: 6,
  projectedRemainingGrams: 1_500,
  projectedUsageGrams: 3_000,
  usageBasisGrams: 3_000,
};

test("forecast exposes its data basis, assumptions and no ordering action", () => {
  const html = renderToStaticMarkup(
    <StatisticsForecastPanel
      forecast={forecast}
      locale="en"
      t={(_key, fallback = "", params = {}) =>
        fallback.replace("{count}", String(params.count ?? ""))
      }
    />,
  );

  assert.match(html, /Consumption forecast/);
  assert.match(html, /Recorded use · 30 days/);
  assert.match(html, /Owned stock included/);
  assert.match(html, /Data through/);
  assert.match(html, /Assumption: daily use stays equal/);
  assert.match(html, /never creates orders automatically/);
  assert.doesNotMatch(html, /<button|on order|add to wishlist/i);
});

test("forecast explains when no usage basis is available", () => {
  const html = renderToStaticMarkup(
    <StatisticsForecastPanel
      forecast={{
        ...forecast,
        averageDailyUsageGrams: 0,
        daysOfSupply: null,
        estimatedDepletionDate: null,
        hasUsageBasis: false,
        projectedUsageGrams: 0,
        usageBasisGrams: 0,
      }}
      locale="en"
      t={(_key, fallback = "", params = {}) =>
        fallback.replace("{count}", String(params.count ?? ""))
      }
    />,
  );

  assert.match(html, /Not enough usage data/);
  assert.match(html, /Record owned filament use/);
});
