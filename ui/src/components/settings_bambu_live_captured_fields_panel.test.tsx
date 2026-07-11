import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DiagnosticCaptureField, DiagnosticCaptureSession } from "../lib/diagnostic_capture";
import { I18nContext, lookup, type I18nContextValue } from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import type { SettingsBambuLiveDiagnosticGroup } from "../pages/settings_bambu_live_diagnostics_model";
import { SettingsBambuLiveCapturedFieldsPanel } from "./settings_bambu_live_captured_fields_panel";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (key, fallback = "", params = {}) =>
    formatMessage(lookup(enDictionary, key) ?? fallback, params, "en"),
};

function capturedField(path: string, valueText: string): DiagnosticCaptureField {
  return {
    path,
    valueText,
    firstSeenAt: "2026-07-10T00:00:00Z",
    lastSeenAt: "2026-07-10T00:05:00Z",
    lastChangedAt: "2026-07-10T00:04:00Z",
    receiveCount: 5,
    changeCount: 2,
    avgReceiveIntervalMs: 750,
    avgChangeIntervalMs: 60_000,
    recentValues: [
      {
        valueText,
        seenAt: "2026-07-10T00:05:00Z",
        changed: true,
      },
    ],
  };
}

function renderCapturedFieldsPanel(options: {
  diagnosticGroups?: SettingsBambuLiveDiagnosticGroup[];
  diagnosticSession?: DiagnosticCaptureSession | null;
  sortedFieldCount?: number;
} = {}): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <SettingsBambuLiveCapturedFieldsPanel
        diagnosticFilter="all"
        diagnosticGroups={options.diagnosticGroups ?? []}
        diagnosticSession={options.diagnosticSession ?? null}
        diagnosticSort="path"
        downloadName="capture.csv"
        onDiagnosticFilterChange={() => {}}
        onDiagnosticSortChange={() => {}}
        sortedFieldCount={options.sortedFieldCount ?? 0}
      />
    </I18nContext.Provider>,
  );
}

test("SettingsBambuLiveCapturedFieldsPanel permanently labels controls and announces its empty count", () => {
  const html = renderCapturedFieldsPanel();
  const sortLabelFor = html.match(
    /<label[^>]*for="([^"]+)"[^>]*>Sort captured fields<\/label>/,
  )?.[1];
  const sortSelectId = html.match(/<select[^>]*id="([^"]+)"/)?.[1];
  const filterLabelFor = html.match(
    /<label[^>]*for="([^"]+)"[^>]*>Filter captured fields<\/label>/,
  )?.[1];
  const filterSelectId = html.match(/<select[^>]*id="([^"]+)"[^>]*><option value="all"/)?.[1];

  assert.ok(sortLabelFor);
  assert.equal(sortLabelFor, sortSelectId);
  assert.match(sortLabelFor, /^bambu-live-captured-fields-sort-/);
  assert.doesNotMatch(sortLabelFor, /:/);
  assert.ok(filterLabelFor);
  assert.equal(filterLabelFor, filterSelectId);
  assert.match(filterLabelFor, /^bambu-live-captured-fields-filter-/);
  assert.doesNotMatch(filterLabelFor, /:/);
  assert.notEqual(sortSelectId, filterSelectId);
  assert.match(
    html,
    /<span[^>]*role="status"[^>]*aria-atomic="true"[^>]*aria-live="polite"[^>]*>0 fields<\/span>/,
  );
  assert.match(html, /<button[^>]*disabled=""[^>]*>Export CSV<\/button>/);
  assert.doesNotMatch(html, /<table/);
});

test("SettingsBambuLiveCapturedFieldsPanel renders scoped, captioned, non-wrapping group tables", () => {
  const printField = capturedField("print.nozzle_temp", "220");
  const amsField = capturedField("ams.humidity", "3");
  const diagnosticGroups: SettingsBambuLiveDiagnosticGroup[] = [
    { key: "print", label: "Print & status", fields: [printField] },
    { key: "ams", label: "AMS", fields: [amsField] },
  ];
  const diagnosticSession: DiagnosticCaptureSession = {
    startedAt: "2026-07-10T00:00:00Z",
    seededFromObservedAt: null,
    lastCapturedAt: "2026-07-10T00:05:00Z",
    fields: [printField, amsField],
    samples: [],
  };

  const html = renderCapturedFieldsPanel({
    diagnosticGroups,
    diagnosticSession,
    sortedFieldCount: 2,
  });

  assert.match(
    html,
    /<span[^>]*role="status"[^>]*aria-atomic="true"[^>]*aria-live="polite"[^>]*>2 fields<\/span>/,
  );
  assert.match(
    html,
    /scroll-mt-28[^>]*data-desktop-visual-qa-target="bambu-live-captured-fields"/,
  );
  assert.equal((html.match(/<table/g) ?? []).length, 2);
  assert.equal((html.match(/<caption class="sr-only">Captured live fields: /g) ?? []).length, 2);
  assert.match(html, /<caption class="sr-only">Captured live fields: Print &amp; status<\/caption>/);
  assert.match(html, /<caption class="sr-only">Captured live fields: AMS<\/caption>/);
  assert.equal((html.match(/<th scope="col"/g) ?? []).length, 14);
  assert.equal((html.match(/min-w-\[960px\]/g) ?? []).length, 2);
  assert.match(
    html,
    /<div[^>]*role="region"[^>]*aria-label="Captured live fields"[^>]*tabindex="0"/,
  );
  assert.match(html, /max-h-80 overflow-auto[^"]*focus-visible:ring-2/);
  assert.ok((html.match(/whitespace-nowrap/g) ?? []).length >= 8);
  assert.match(html, /<button[^>]*>Export CSV<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Export CSV<\/button>/);
});

test("SettingsBambuLiveCapturedFieldsPanel keeps control ids unique across printer cards", () => {
  const panel = (
    <SettingsBambuLiveCapturedFieldsPanel
      diagnosticFilter="all"
      diagnosticGroups={[]}
      diagnosticSession={null}
      diagnosticSort="path"
      downloadName="capture.csv"
      onDiagnosticFilterChange={() => {}}
      onDiagnosticSortChange={() => {}}
      sortedFieldCount={0}
    />
  );
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      {panel}
      {panel}
    </I18nContext.Provider>,
  );
  const labelIds = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const selectIds = [...html.matchAll(/<select[^>]*id="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labelIds, selectIds);
  assert.equal(new Set(selectIds).size, 4);
});
