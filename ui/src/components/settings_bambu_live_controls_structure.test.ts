import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("Bambu live diagnostic controls use shared settings action buttons", () => {
  const captureChart = readComponentSource("settings_bambu_live_capture_chart_panel.tsx");
  const observedDetails = readComponentSource("settings_bambu_live_observed_details_panel.tsx");
  const capturedFields = readComponentSource("settings_bambu_live_captured_fields_panel.tsx");
  const diagnosticsSummary = readComponentSource("settings_bambu_live_diagnostics_summary.tsx");
  const rawPayload = readComponentSource("settings_bambu_live_raw_payload_panel.tsx");
  const trayCards = readComponentSource("settings_bambu_live_tray_cards.tsx");

  assert.match(captureChart, /settingsCompactSelectClass/);
  assert.match(captureChart, /settingsSectionLabelClass/);
  assert.match(observedDetails, /settingsActionButtonClass\(\s*captureActive \? "warningQuiet" : "accent",\s*"compact",\s*\)/);
  assert.match(observedDetails, /SettingsNotice/);
  assert.match(observedDetails, /settingsSectionLabelClass/);
  assert.match(capturedFields, /settingsActionButtonClass\("neutral", "compact"\)/);
  assert.match(capturedFields, /settingsCompactSelectClass/);
  assert.match(capturedFields, /settingsSectionLabelClass/);
  assert.match(diagnosticsSummary, /settingsTinyLabelClass/);
  assert.match(rawPayload, /settingsActionButtonClass\("neutral", "compact"\)/);
  assert.match(trayCards, /settingsTinyLabelClass/);
  assert.doesNotMatch(captureChart, /rounded border border-slate-300 bg-white px-2 py-1 text-\[11px\]/);
  assert.doesNotMatch(observedDetails, /rounded border px-2 py-1 text-\[11px\] font-semibold/);
  assert.doesNotMatch(observedDetails, /rounded border border-amber-200 bg-amber-50 px-2 py-1/);
  assert.doesNotMatch(observedDetails, /rounded border border-sky-200 bg-sky-50 px-2 py-1/);
  assert.doesNotMatch(capturedFields, /rounded border border-slate-300 bg-white px-2 py-1 text-\[11px\]/);
  assert.doesNotMatch(capturedFields, /rounded border border-slate-300 px-2 py-1 text-\[11px\] font-semibold/);
  assert.doesNotMatch(capturedFields, /text-\[11px\] font-semibold uppercase tracking-\[0\.16em\]/);
  assert.doesNotMatch(diagnosticsSummary, /text-\[10px\] font-semibold uppercase tracking-\[0\.16em\]/);
  assert.doesNotMatch(rawPayload, /rounded border border-slate-300 px-2 py-1 text-\[11px\] font-semibold/);
  assert.doesNotMatch(trayCards, /text-\[10px\] uppercase tracking-\[0\.14em\]/);
});
