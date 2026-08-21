import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import {
  applyCustomStatisticsPeriod,
  createStatisticsPeriodPickerState,
  openCustomStatisticsPeriod,
  updateCustomStatisticsPeriod,
} from "../lib/statistics_period_model";
import { StatisticsPeriodPicker } from "./statistics_period_picker";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

function renderPicker(
  state = createStatisticsPeriodPickerState(new Date("2026-08-21T12:00:00Z")),
): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <StatisticsPeriodPicker
        locale="en"
        onApplyCustom={() => {}}
        onCustomDateChange={() => {}}
        onOpenCustom={() => {}}
        onSelectPreset={() => {}}
        state={state}
        t={i18nValue.t}
      />
    </I18nContext.Provider>,
  );
}

test("period picker exposes every required preset and the applied range", () => {
  const html = renderPicker();

  assert.match(html, /role="group" aria-label="Reporting period"/);
  assert.match(html, /aria-pressed="true"[^>]*>Last 30 days<\/button>/);
  assert.match(html, /aria-pressed="false"[^>]*>90 d<\/button>/);
  assert.match(html, /aria-pressed="false"[^>]*>Last 12 months<\/button>/);
  assert.match(html, /aria-expanded="false"[^>]*>Custom range<\/button>/);
  assert.match(html, /Selected:/);
  assert.doesNotMatch(html, /type="date"/);
});

test("custom editor keeps permanent date labels and inclusive ordering constraints", () => {
  const html = renderPicker(
    openCustomStatisticsPeriod(
      createStatisticsPeriodPickerState(new Date("2026-08-21T12:00:00Z")),
    ),
  );

  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Start date[\s\S]*type="date"[^>]*max="2026-08-21"/);
  assert.match(html, /End date[\s\S]*type="date"[^>]*min="2026-07-23"/);
  assert.match(html, /type="submit"[^>]*>Apply range<\/button>/);
});

test("invalid custom interval is announced without changing the applied preset", () => {
  let state = openCustomStatisticsPeriod(
    createStatisticsPeriodPickerState(new Date("2026-08-21T12:00:00Z")),
  );
  state = updateCustomStatisticsPeriod(state, "start", "2026-08-22");
  state = updateCustomStatisticsPeriod(state, "end", "2026-08-21");
  state = applyCustomStatisticsPeriod(state);
  const html = renderPicker(state);

  assert.equal(state.appliedPreset, "30_DAYS");
  assert.match(html, /role="alert"/);
  assert.match(html, /End date must be on or after start date\./);
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 2);
});
