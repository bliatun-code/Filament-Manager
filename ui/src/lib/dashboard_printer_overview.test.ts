import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardPrinterPresentation } from "./dashboard_printer_overview";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "./tauri_client";

const t = (_key: string, fallback = "") => fallback;
const printer: PrinterOverviewRow = {
  printer: { id: "bambu", name: "Workshop", model: "Bambu Lab P1S", created_at: "", updated_at: "" },
  usage: { total_jobs: 10, successful_jobs: 9, failed_jobs: 1, total_used_g: 500 },
  slots: [],
};

function liveConfig(
  observed: Partial<NonNullable<BambuLiveIntegrationSettings["observed_state"]>> = {},
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    tls_trust_state: "TRUSTED",
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: new Date().toISOString(),
      gcode_state: "RUNNING",
      subtask_name: "  Tool tray.3mf  ",
      progress_percent: 64,
      remaining_minutes: 18,
      nozzle_temp_c: 218,
      trays: [],
      ...observed,
    },
  };
}

test("dashboard printer presentation uses fresh trusted state, preserving explicit pauses", () => {
  const running = buildDashboardPrinterPresentation({ printer, liveConfig: liveConfig(), t });
  assert.equal(running.stateLabel, "Printing");
  assert.equal(running.progressPercent, 64);
  assert.equal(running.jobName, "Tool tray.3mf");
  const paused = buildDashboardPrinterPresentation({ printer, liveConfig: liveConfig({ gcode_state: "PAUSE" }), t });
  assert.equal(paused.stateLabel, "Paused");
  assert.equal(paused.tone, "warning");
  assert.equal(paused.progressPercent, 64);
});

test("dashboard printer presentation never treats saved or remote slot percentages as current print activity", () => {
  const remotePrinter = { ...printer, slots: [{ slot_id: "slot", ams_id: "ams", slot_index: 1, live_progress_percent: 92, live_mqtt_connected: true, live_printer_last_seen_at: new Date().toISOString() }] };
  for (const syncSource of ["client-live", "client-cached", "client-offline"] as const) {
    const result = buildDashboardPrinterPresentation({ printer: remotePrinter, liveConfig: liveConfig(), syncSource, t });
    assert.equal(result.telemetry, null);
    assert.equal(result.progressPercent, null);
    assert.equal(result.jobName, null);
    assert.equal(result.stateLabel, syncSource === "client-live" ? "Live status unavailable" : "Saved printer setup");
  }
});

test("dashboard printer presentation rejects stale, disconnected, disabled and untrusted telemetry", () => {
  for (const [config, expectedLabel] of [
    [liveConfig({ last_seen_at: "2000-01-01T00:00:00Z" }), "Live data is out of date"],
    [liveConfig({ last_seen_at: null }), "Live data is out of date"],
    [liveConfig({ online: false }), "Printer disconnected"],
    [liveConfig({ mqtt_connected: false }), "Printer disconnected"],
    [{ ...liveConfig(), enabled: false }, "Manual setup"],
    [{ ...liveConfig(), tls_trust_state: "CHANGED" }, "Review live connection"],
    [{ ...liveConfig(), tls_trust_state: undefined }, "Review live connection"],
    [{ enabled: true, tls_trust_state: "TRUSTED" }, "Live waiting"],
  ] satisfies Array<[BambuLiveIntegrationSettings, string]>) {
    const result = buildDashboardPrinterPresentation({ printer, liveConfig: config, t });
    assert.equal(result.stateLabel, expectedLabel);
    assert.equal(result.telemetry, null);
    assert.equal(result.progressPercent, null);
    assert.equal(result.jobName, null);
  }
});

test("Prusa and unknown printers use explicit manual setup even when supplied Bambu configuration", () => {
  for (const model of ["Prusa MK4S with MMU3", "Generic printer"]) {
    const result = buildDashboardPrinterPresentation({ printer: { ...printer, printer: { ...printer.printer, model } }, liveConfig: liveConfig(), t });
    assert.equal(result.stateLabel, "Manual setup");
    assert.equal(result.telemetry, null);
    assert.equal(result.progressPercent, null);
  }
});

test("finished jobs hide carried progress and job names; invalid percentages never create a progress bar", () => {
  const finished = buildDashboardPrinterPresentation({ printer, liveConfig: liveConfig({ gcode_state: "FINISH", progress_percent: 100 }), t });
  assert.equal(finished.progressPercent, null);
  assert.equal(finished.jobName, null);
  for (const progress_percent of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = buildDashboardPrinterPresentation({ printer, liveConfig: liveConfig({ progress_percent }), t });
    assert.equal(result.progressPercent, null);
  }
});
