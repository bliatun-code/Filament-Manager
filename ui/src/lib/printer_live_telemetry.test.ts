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
