import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { StatCard, UsageChart } from "./dashboard_widgets";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const nbI18n: I18nContextValue = {
  locale: "nb",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

test("clickable statistic cards render as dialog-opening buttons with a visible affordance", () => {
  const html = renderToStaticMarkup(
    <StatCard
      actionLabel="View details"
      onClick={() => {}}
      opensDialog
      subtitle="Across all printers"
      title="Total consumption"
      trend="All time"
      value="4.15 kg"
    />,
  );

  assert.match(html, /^<button[^>]*type="button"[^>]*aria-haspopup="dialog"/);
  assert.match(html, /focus-visible:ring-2/);
  assert.match(html, />View details<span aria-hidden="true">→/);
  assert.match(html, />All time</);
  assert.doesNotMatch(html, /role="button"|tabindex="0"|<div/);
});

test("non-clickable dashboard cards stay non-interactive and omit the action affordance", () => {
  const html = renderToStaticMarkup(
    <StatCard
      actionLabel="View details"
      subtitle="Across all locations"
      title="Total spools"
      value="56"
    />,
  );

  assert.match(html, /^<div/);
  assert.doesNotMatch(html, /<button|aria-haspopup|View details|focus-visible:ring-2/);
  assert.match(html, />Total spools</);
});

test("annual usage chart renders localized accessible month bars from a zero baseline", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={nbI18n}>
      <UsageChart
        caption="Forbruk fra printerknyttede jobber."
        months={[
          { month: "2025-09", usedGrams: 0 },
          { month: "2025-10", usedGrams: 80 },
          { month: "2025-11", usedGrams: 0 },
          { month: "2025-12", usedGrams: 0 },
          { month: "2026-01", usedGrams: 484 },
          { month: "2026-02", usedGrams: 0 },
          { month: "2026-03", usedGrams: 0 },
          { month: "2026-04", usedGrams: 0 },
          { month: "2026-05", usedGrams: 0 },
          { month: "2026-06", usedGrams: 590 },
          { month: "2026-07", usedGrams: 3_022 },
          { month: "2026-08", usedGrams: 0 },
        ]}
        onClick={() => {}}
        period="Siste 12 måneder"
        title="Filamentforbruk"
        value="4 176 g"
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /<button[^>]*aria-label="Filamentforbruk\. Siste 12 måneder: 4 176 g"/);
  assert.match(html, />Siste 12 måneder</);
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 12);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 12);
  assert.match(html, /aria-label="september 2025: 0 g"[^>]*title="september 2025: 0 g"/);
  assert.match(html, /aria-label="juli 2026: 3[^<]*022 g"/);
  assert.match(html, /group-focus:opacity-100/);
  assert.match(html, /style="height:2\.[0-9]+%;min-height:1px"/);
  assert.match(html, /style="height:100%;min-height:1px"/);
  assert.doesNotMatch(html, /<polyline/);
});

test("annual usage chart explains when an older host cannot provide history", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={nbI18n}>
      <UsageChart
        caption="Forbruk fra printerknyttede jobber."
        months={Array.from({ length: 12 }, (_, index) => ({
          month: `2025-${String(index + 1).padStart(2, "0")}`,
          usedGrams: 0,
        }))}
        period="Siste 12 måneder"
        title="Filamentforbruk"
        unavailableMessage="Oppdater verten for å vise 12-månedershistorikk."
        value="—"
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /Oppdater verten for å vise 12-månedershistorikk\./);
  assert.doesNotMatch(html, /Ingen forbrukstrend ennå/);
});
