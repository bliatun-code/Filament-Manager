import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatCard } from "./dashboard_widgets";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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
