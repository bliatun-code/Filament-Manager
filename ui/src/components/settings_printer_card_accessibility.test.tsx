import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";
import { buildSettingsBambuLiveDiagnosticsModel } from "../pages/settings_bambu_live_diagnostics_model";
import {
  settingsBambuLiveCaptureHintId,
  settingsBambuLiveCaptureStatusId,
  settingsBambuLiveObservedPanelId,
} from "./settings_bambu_live_dom_ids";
import { SettingsBambuLiveObservedDetailsPanel } from "./settings_bambu_live_observed_details_panel";
import { SettingsPrinterObservedDetailsToggle } from "./settings_printer_observed_details_toggle";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (_key: string, fallback = "") => fallback;
const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t,
};

const printerId = "printer/42";

function liveConfig(): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    host: "192.168.1.42",
    printer_serial: "SERIAL-42",
    observed_state: {
      last_seen_at: "2026-07-10T10:00:00Z",
      mqtt_connected: true,
      online: true,
      progress_percent: 62,
      raw_payload_json: { mc_percent: 62 },
      trays: [],
    },
  };
}

function renderObservedDetails(captureActive = false): string {
  const config = liveConfig();
  const model = buildSettingsBambuLiveDiagnosticsModel({
    diagnosticFilter: "all",
    diagnosticSession: null,
    diagnosticSort: "path",
    formatDateTime: (value) => value,
    liveConfig: config,
    spoolRows: [],
    t,
  });

  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <SettingsBambuLiveObservedDetailsPanel
        captureActive={captureActive}
        diagnosticFilter="all"
        diagnosticSession={null}
        diagnosticSort="path"
        downloadName="workshop-live-capture.csv"
        liveConfig={config}
        model={model}
        onCopyError={() => {}}
        onCopySuccess={() => {}}
        onDiagnosticFilterChange={() => {}}
        onDiagnosticSortChange={() => {}}
        onSelectedChartFieldChange={() => {}}
        onToggleCapture={() => {}}
        printerId={printerId}
      />
    </I18nContext.Provider>,
  );
}

test("observed-details trigger controls a stable panel that remains present while collapsed", () => {
  const panelId = settingsBambuLiveObservedPanelId(printerId);
  const html = renderToStaticMarkup(
    <SettingsPrinterObservedDetailsToggle
      controlsId={panelId}
      disabled={false}
      expanded={false}
      hideLabel="Hide observed details"
      onToggle={() => {}}
      showLabel="Show observed details & capture"
    />,
  );
  const cardSource = readFileSync(
    new URL("./settings_printer_card.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(panelId, "settings-printer-printer_x2f_42-observed-details");
  assert.notEqual(
    settingsBambuLiveObservedPanelId("printer/a"),
    settingsBambuLiveObservedPanelId("printer?a"),
  );
  assert.match(
    html,
    new RegExp(
      `<button[^>]*aria-controls="${panelId}"[^>]*aria-expanded="false"[^>]*>Show observed details &amp; capture</button>`,
    ),
  );
  assert.match(cardSource, /<div id=\{observedDetailsId\} hidden=\{!expanded\}>/);
  assert.match(cardSource, /const observedDetailsId = settingsBambuLiveObservedPanelId\(printer\.id\)/);
});

test("capture control describes paused status and hint through stable live-region ids", () => {
  const html = renderObservedDetails();
  const statusId = settingsBambuLiveCaptureStatusId(printerId);
  const hintId = settingsBambuLiveCaptureHintId(printerId);

  assert.match(
    html,
    new RegExp(
      `<span id="${statusId}" role="status" aria-live="polite"[^>]*>Capture is paused</span>`,
    ),
  );
  assert.match(html, new RegExp(`<span id="${hintId}"[^>]*>The current session is frozen`));
  assert.match(
    html,
    new RegExp(
      `<button[^>]*aria-describedby="${statusId} ${hintId}"[^>]*>Start capture</button>`,
    ),
  );
});

test("capture live region reports the running state without changing its relationships", () => {
  const html = renderObservedDetails(true);
  const statusId = settingsBambuLiveCaptureStatusId(printerId);
  const hintId = settingsBambuLiveCaptureHintId(printerId);

  assert.match(
    html,
    new RegExp(
      `<span id="${statusId}" role="status" aria-live="polite"[^>]*>Capture is running</span>`,
    ),
  );
  assert.match(html, new RegExp(`<span id="${hintId}"[^>]*>Incoming live bursts`));
  assert.match(
    html,
    new RegExp(
      `<button[^>]*aria-describedby="${statusId} ${hintId}"[^>]*>Stop capture</button>`,
    ),
  );
});
