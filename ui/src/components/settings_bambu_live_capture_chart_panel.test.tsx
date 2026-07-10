import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, lookup, type I18nContextValue } from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import { SettingsBambuLiveCaptureChartPanel } from "./settings_bambu_live_capture_chart_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (key, fallback = "") => lookup(enDictionary, key) ?? fallback,
};

function renderChartPanel(options: {
  chartFields?: Array<{ label: string; path: string }>;
  selectedFieldPath?: string | null;
} = {}): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <SettingsBambuLiveCaptureChartPanel
        chartFields={options.chartFields ?? []}
        chartPoints={
          options.selectedFieldPath
            ? [{ observedAt: "2026-07-10T10:00:00Z", value: 42, valueText: "42" }]
            : []
        }
        onSelectedFieldChange={() => {}}
        selectedFieldPath={options.selectedFieldPath ?? null}
      />
    </I18nContext.Provider>,
  );
}

test("SettingsBambuLiveCaptureChartPanel renders one compact empty state without a disabled selector", () => {
  const html = renderChartPanel();

  assert.equal((html.match(/No chart-ready numeric fields yet/g) ?? []).length, 1);
  assert.match(html, /surface-subtle border-dashed px-3 py-2/);
  assert.doesNotMatch(html, /<select/);
  assert.doesNotMatch(html, /disabled/);
});

test("SettingsBambuLiveCaptureChartPanel gives the populated field selector an explicit label", () => {
  const html = renderChartPanel({
    chartFields: [{ label: "Nozzle temperature", path: "print.nozzle_temp" }],
    selectedFieldPath: "print.nozzle_temp",
  });

  const labelFor = html.match(/<label[^>]*for="([^"]+)"[^>]*>Chart field<\/label>/)?.[1];
  const selectId = html.match(/<select[^>]*id="([^"]+)"/)?.[1];

  assert.ok(labelFor);
  assert.equal(labelFor, selectId);
  assert.match(labelFor, /^bambu-live-chart-field-/);
  assert.doesNotMatch(labelFor, /:/);
  assert.match(html, /<option value="print\.nozzle_temp" selected="">Nozzle temperature<\/option>/);
  assert.doesNotMatch(html, /No chart-ready numeric fields yet/);
  assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="print\.nozzle_temp"/);
});

test("SettingsBambuLiveCaptureChartPanel keeps selector ids unique across printer cards", () => {
  const panel = (
    <SettingsBambuLiveCaptureChartPanel
      chartFields={[{ label: "Nozzle temperature", path: "print.nozzle_temp" }]}
      chartPoints={[]}
      onSelectedFieldChange={() => {}}
      selectedFieldPath="print.nozzle_temp"
    />
  );
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      {panel}
      {panel}
    </I18nContext.Provider>,
  );
  const labelIds = [...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>Chart field<\/label>/g)].map(
    (match) => match[1],
  );
  const selectIds = [...html.matchAll(/<select[^>]*id="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labelIds, selectIds);
  assert.equal(new Set(selectIds).size, 2);
});
