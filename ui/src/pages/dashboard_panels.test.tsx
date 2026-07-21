import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InventoryHealthPanel } from "./dashboard_panels";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (_key: string, fallback: string) => fallback;

test("empty inventory health shows an honest score state and direct add action", () => {
  const html = renderToStaticMarkup(
    <InventoryHealthPanel
      health={{
        score: null,
        headline: "Not enough data",
        detail: "Add rolls to start health tracking.",
        metrics: [],
      }}
      onAddFirstSpool={() => {}}
      t={t}
    />,
  );

  assert.match(html, /aria-label="Not enough data"/);
  assert.match(html, />—</);
  assert.match(html, /<button[^>]*>Add spool<\/button>/);
  assert.doesNotMatch(html, /100%|Stable supply/);
});

test("inventory health keeps the percentage and hides onboarding after data exists", () => {
  const html = renderToStaticMarkup(
    <InventoryHealthPanel
      health={{
        score: 100,
        headline: "Stable supply",
        detail: "Watch stock.",
        metrics: [],
      }}
      onAddFirstSpool={() => {}}
      t={t}
    />,
  );

  assert.match(html, /aria-label="100%"/);
  assert.match(html, />100%<\/span>/);
  assert.doesNotMatch(html, />Add spool<\/button>/);
});
