import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrinterLiveTelemetry,
  formatAmsHumidityLetter,
  normalizeAmsHumidityIndex,
} from "./printer_live_telemetry";
import type { BambuLiveIntegrationSettings } from "./tauri_client";

const t = (_key: string, fallback = "") => fallback;

function liveConfig(
  overrides: Partial<NonNullable<BambuLiveIntegrationSettings["observed_state"]>> = {},
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      trays: [],
      ...overrides,
    },
  };
}

test("AMS humidity indexes map to Bambu Studio A-E levels", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((value) => formatAmsHumidityLetter(value)),
    ["E", "D", "C", "B", "A"],
  );
  assert.equal(normalizeAmsHumidityIndex(0), null);
  assert.equal(normalizeAmsHumidityIndex(6), null);
});

test("printer live telemetry formats active print state and machine temperatures", () => {
  const telemetry = buildPrinterLiveTelemetry(
    liveConfig({
      gcode_state: "RUNNING",
      progress_percent: 14,
      remaining_minutes: 107,
      nozzle_temp_c: 220.3,
      bed_temp_c: 54.9,
      ams_humidity_index: 4,
      ams_temperature_c: 38.1,
    }),
    t,
  );

  assert.equal(telemetry?.state, "printing");
  assert.equal(telemetry?.stateLabel, "Printing");
  assert.equal(telemetry?.progressLabel, "14%");
  assert.equal(telemetry?.remainingLabel, "1 h 47 min");
  assert.equal(telemetry?.nozzleTempLabel, "220°C");
  assert.equal(telemetry?.bedTempLabel, "55°C");
  assert.equal(telemetry?.humidity?.letter, "B");
  assert.equal(telemetry?.humidity?.toneLabel, "Dry");
  assert.equal(telemetry?.amsTempLabel, "38°C");

  const norwegianTelemetry = buildPrinterLiveTelemetry(
    liveConfig({
      gcode_state: "RUNNING",
      progress_percent: 14,
      nozzle_temp_c: 220.3,
    }),
    t,
    "nb",
  );
  assert.equal(norwegianTelemetry?.progressLabel, "14\u00a0%");
  assert.equal(norwegianTelemetry?.nozzleTempLabel, "220 °C");
});

test("printer live telemetry hides impossible AMS air temperatures", () => {
  const telemetry = buildPrinterLiveTelemetry(
    liveConfig({
      gcode_state: "RUNNING",
      nozzle_temp_c: 220.3,
      bed_temp_c: 54.9,
      ams_humidity_index: 4,
      ams_temperature_c: 134.7,
    }),
    t,
  );

  assert.equal(telemetry?.humidity?.letter, "B");
  assert.equal(telemetry?.amsTempLabel, null);
});

test("printer live telemetry ignores carried timing after a failed print", () => {
  const telemetry = buildPrinterLiveTelemetry(
    liveConfig({
      gcode_state: "FAILED",
      print_type: "idle",
      progress_percent: 0,
      remaining_minutes: 24,
      nozzle_temp_c: 40.4,
      bed_temp_c: 41.5,
    }),
    t,
  );

  assert.equal(telemetry?.state, "idle");
  assert.equal(telemetry?.stateLabel, "Idle");
  assert.equal(telemetry?.progressLabel, null);
  assert.equal(telemetry?.remainingLabel, null);
  assert.equal(telemetry?.nozzleTempLabel, "40°C");
  assert.equal(telemetry?.bedTempLabel, "42°C");
});

test("explicit pause and preparation states take priority over a hot nozzle and progress", () => {
  for (const [gcodeState, expectedState, expectedLabel] of [
    ["PAUSE", "paused", "Paused"],
    [" paused ", "paused", "Paused"],
    ["PREPARE", "preparing", "Preparing"],
    [" slicing ", "preparing", "Preparing"],
  ] as const) {
    const telemetry = buildPrinterLiveTelemetry(
      liveConfig({
        gcode_state: gcodeState,
        progress_percent: 43,
        remaining_minutes: 21,
        nozzle_temp_c: 220,
      }),
      t,
    );

    assert.equal(telemetry?.state, expectedState, gcodeState);
    assert.equal(telemetry?.stateLabel, expectedLabel, gcodeState);
    assert.equal(telemetry?.progressLabel, "43%", gcodeState);
    assert.equal(telemetry?.remainingLabel, "21 min", gcodeState);
    assert.equal(telemetry?.nozzleTempLabel, "220°C", gcodeState);
  }
});

test("terminal printer states keep carried hot-nozzle progress hidden", () => {
  for (const gcodeState of ["FINISH", "FINISHED", "IDLE", "FAILED", "STOP", "STOPPED", "CANCELLED"]) {
    const telemetry = buildPrinterLiveTelemetry(
      liveConfig({
        gcode_state: gcodeState,
        progress_percent: 100,
        remaining_minutes: 0,
        nozzle_temp_c: 220,
      }),
      t,
    );

    assert.equal(telemetry?.state, "idle", gcodeState);
    assert.equal(telemetry?.progressLabel, null, gcodeState);
    assert.equal(telemetry?.remainingLabel, null, gcodeState);
  }
});

test("running and unknown printer states retain existing telemetry fallbacks", () => {
  const cases = [
    { observed: { gcode_state: "RUNNING", nozzle_temp_c: 40 }, state: "printing" },
    { observed: { gcode_state: "UNKNOWN", nozzle_temp_c: 220, progress_percent: 43 }, state: "printing" },
    { observed: { gcode_state: null, nozzle_temp_c: 200, remaining_minutes: 0 }, state: "printing" },
    { observed: { gcode_state: "UNKNOWN", nozzle_temp_c: 199, progress_percent: 43 }, state: "active" },
    { observed: { gcode_state: "UNKNOWN", nozzle_temp_c: 220 }, state: "idle" },
    { observed: { gcode_state: "UNKNOWN", print_type: "idle", nozzle_temp_c: 40, progress_percent: 43 }, state: "idle" },
  ] as const;

  for (const { observed, state } of cases) {
    assert.equal(buildPrinterLiveTelemetry(liveConfig(observed), t)?.state, state);
  }
});

test("printer live telemetry hides stale MQTT snapshots", () => {
  assert.equal(
    buildPrinterLiveTelemetry(
      liveConfig({
        last_seen_at: "2000-01-01T00:00:00Z",
        gcode_state: "RUNNING",
        nozzle_temp_c: 220,
      }),
      t,
    ),
    null,
  );
});
