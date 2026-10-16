import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "../lib/tauri_client";
import type { DashboardPrinterOverviewProps } from "./dashboard_printer_overview";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".svg")) return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
    return nextLoad(url, context);
  },
});
const { DashboardPrinterOverview } = await import("./dashboard_printer_overview");
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const i18n: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};
const printer: PrinterOverviewRow = {
  printer: { id: "bambu", name: "Atlas", model: "Bambu Lab P1S", created_at: "", updated_at: "" },
  usage: { total_jobs: 10, successful_jobs: 9, failed_jobs: 1, total_used_g: 500 },
  slots: [{ slot_id: "slot", ams_id: "ams", slot_index: 1, spool_id: "spool", spool_material: "PETG", spool_filament_name: "PETG HF", spool_color_name: "Deep Blue", spool_hex_color: "#2563EB" }],
};
const config: BambuLiveIntegrationSettings = {
  enabled: true,
  tls_trust_state: "TRUSTED",
  observed_state: { online: true, mqtt_connected: true, last_seen_at: new Date().toISOString(), gcode_state: "RUNNING", subtask_name: "Tool tray.3mf", progress_percent: 64, remaining_minutes: 18, nozzle_temp_c: 218, trays: [] },
};
function render(overrides: Partial<DashboardPrinterOverviewProps> = {}) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18n}>
      <DashboardPrinterOverview printers={[printer]} bambuLiveIntegrations={{ bambu: config }} resolvedTheme="light" onOpenPrinters={() => {}} {...overrides} />
    </I18nContext.Provider>,
  );
}

test("compact dashboard printer cards retain exact vivid brand accents and assigned filament colors", () => {
  const prusa = { ...printer, printer: { ...printer.printer, id: "prusa", name: "Nova", model: "Prusa MK4S with MMU3" }, slots: [{ ...printer.slots[0], spool_color_name: "Signal Orange", spool_hex_color: "#F97316" }] };
  const html = render({ printers: [printer, prusa] });
  assert.match(html, /border-left-color:#00B140/);
  assert.match(html, /border-left-color:#F97316/);
  assert.match(html, /rgba\(0, 177, 64,/);
  assert.match(html, /rgba\(249, 115, 22,/);
  assert.match(html, /background:#2563EB/);
  assert.match(html, /background:#F97316/);
  assert.match(html, /Deep Blue/);
  assert.match(html, /Signal Orange/);
  assert.match(html, />PETG</);
});

test("compact dashboard printer cards show accessible real print progress and remaining time", () => {
  const html = render();
  assert.match(html, /role="progressbar" aria-label="Atlas · Print progress" aria-valuenow="64" aria-valuemin="0" aria-valuemax="100"/);
  assert.match(html, /width:64%;background-color:#00B140/);
  assert.match(html, /Tool tray\.3mf/);
  assert.match(html, />64%</);
  assert.match(html, /18 min remaining/);
  assert.match(html, /Nozzle.*218°C/);
  assert.match(html, /<button type="button"[^>]*>Open printers/);
});

test("manual Prusa and disconnected host cards never show fabricated current print progress", () => {
  const prusa = { ...printer, printer: { ...printer.printer, model: "Prusa MK4S" } };
  const manual = render({ printers: [prusa] });
  assert.match(manual, /Manual setup/);
  assert.doesNotMatch(manual, /progressbar|Tool tray|64%|Nozzle|remaining/);
  const cached = render({ syncSource: "client-cached" });
  assert.match(cached, /Saved printer setup/);
  assert.doesNotMatch(cached, /progressbar|Tool tray|64%|Nozzle|remaining/);
  assert.match(cached, /background:#2563EB/);
});

test("dashboard printer cards distinguish no assigned filament and offer trust review only when relevant", () => {
  const html = render({ printers: [{ ...printer, slots: [] }], bambuLiveIntegrations: { bambu: { ...config, tls_trust_state: "CHANGED" } }, onOpenBambuLiveSettings: () => {} });
  assert.match(html, /No rolls assigned/);
  assert.match(html, /<button[^>]*>Review live connection/);
  assert.doesNotMatch(html, /progressbar|Tool tray|64%/);
});

test("dark dashboard printer cards retain brand accent and surface color", () => {
  const html = render({ resolvedTheme: "dark" });
  assert.match(html, /border-left-color:#00B140/);
  assert.match(html, /background-color:rgb\(10, 17, 31\)/);
  assert.match(html, /rgba\(0, 177, 64, 0\.14\)/);
});
