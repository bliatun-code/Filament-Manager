import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_VISUAL_QA_PRINTER_LIVE_READINESS_TOKEN,
  hasFreshPrinterLiveTelemetry,
} from "./desktop_visual_qa_readiness";
import type { BambuLiveIntegrationSettings } from "./tauri_client";

const t = (_key: string, fallback = "") => fallback;
const observedAfterMs = Date.UTC(2026, 6, 22, 10, 0, 0);

function liveConfig(
  overrides: Partial<BambuLiveIntegrationSettings> = {},
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2026-07-22T10:00:05Z",
      nozzle_temp_c: 26,
      bed_temp_c: 24,
      trays: [],
    },
    ...overrides,
  };
}

test("desktop printer readiness requires a fresh connected telemetry payload", () => {
  assert.equal(DESKTOP_VISUAL_QA_PRINTER_LIVE_READINESS_TOKEN, "printer-live-telemetry");
  assert.equal(
    hasFreshPrinterLiveTelemetry({ printer: liveConfig() }, observedAfterMs, t),
    true,
  );
  assert.equal(
    hasFreshPrinterLiveTelemetry(
      {
        printer: liveConfig({
          observed_state: {
            online: true,
            mqtt_connected: true,
            last_seen_at: "2026-07-22T10:00:00Z",
            nozzle_temp_c: 26,
            trays: [],
          },
        }),
      },
      observedAfterMs,
      t,
    ),
    false,
  );
  assert.equal(
    hasFreshPrinterLiveTelemetry(
      {
        printer: liveConfig({
          observed_state: {
            online: true,
            mqtt_connected: true,
            last_seen_at: "2026-07-22T09:59:59Z",
            nozzle_temp_c: 26,
            trays: [],
          },
        }),
      },
      observedAfterMs,
      t,
    ),
    false,
  );
});

test("desktop printer readiness rejects offline and visually empty observations", () => {
  assert.equal(
    hasFreshPrinterLiveTelemetry(
      {
        printer: liveConfig({
          observed_state: {
            online: false,
            mqtt_connected: false,
            last_seen_at: "2026-07-22T10:00:05Z",
            nozzle_temp_c: 26,
            trays: [],
          },
        }),
      },
      observedAfterMs,
      t,
    ),
    false,
  );
  assert.equal(
    hasFreshPrinterLiveTelemetry(
      {
        printer: liveConfig({
          observed_state: {
            online: true,
            mqtt_connected: true,
            last_seen_at: "2026-07-22T10:00:05Z",
            trays: [],
          },
        }),
      },
      observedAfterMs,
      t,
    ),
    false,
  );
});
