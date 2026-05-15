import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsBambuLiveDiagnosticsModel,
  createSettingsBambuLiveCaptureSession,
} from "./settings_bambu_live_diagnostics_model";
import { updateDiagnosticCaptureSessionFromPayload } from "../lib/diagnostic_capture";
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";

const t = (_key: string, fallback: string) => fallback;
const formatDateTime = (value: string) => `formatted:${value}`;

function createLiveConfig(): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    host: "192.168.1.41",
    printer_serial: "SERIAL-123",
    observed_state: {
      mqtt_connected: true,
      online: true,
      last_seen_at: "2026-05-15T10:00:00Z",
      progress_percent: 42,
      remaining_minutes: 18,
      active_tray_index: 1,
      ams_humidity_index: 3,
      trays: [
        {
          tray_index: 1,
          loaded: true,
          filament_type: "PLA",
          filament_name: "PLA Basic",
          color_hex: "#FFAA00",
          remaining_percent: 77,
          match_status: "rfid_mismatch",
          match_note: "rfid_mismatch",
        },
      ],
      raw_payload_json: {
        mc_percent: 42,
        mc_remaining_time: 18,
        ams: {
          humidity: "3",
          ams: [
            {
              tray: [
                {
                  id: "1",
                  tray_uuid: "ABC123",
                  tray_color: "FFAA00FF",
                  tray_type: "PLA",
                  remain: 77,
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function createUpdatedPayload() {
  return {
    mc_percent: 43,
    mc_remaining_time: 17,
    ams: {
      humidity: "3",
      ams: [
        {
          tray: [
            {
              id: "1",
              tray_uuid: "ABC123",
              tray_color: "FFAA00FF",
              tray_type: "PLA",
              remain: 76,
            },
          ],
        },
      ],
    },
  };
}

test("buildSettingsBambuLiveDiagnosticsModel centralizes chart, tray and summary state", () => {
  const liveConfig = createLiveConfig();
  const diagnosticSession = updateDiagnosticCaptureSessionFromPayload({
    session: createSettingsBambuLiveCaptureSession(liveConfig),
    rawPayload: createUpdatedPayload(),
    observedAt: "2026-05-15T10:01:00Z",
  });
  const model = buildSettingsBambuLiveDiagnosticsModel({
    diagnosticFilter: "all",
    diagnosticSession,
    diagnosticSort: "path",
    formatDateTime,
    liveConfig,
    selectedChartFieldPath: "mc_percent",
    t,
  });

  assert.equal(model.observedState?.mqtt_connected, true);
  assert.equal(model.selectedDiagnosticChartField, "mc_percent");
  assert.ok(model.diagnosticChartFields.some((field) => field.path === "mc_percent"));
  assert.ok(model.diagnosticChartPoints.length > 0);
  assert.equal(model.displayTrays.length, 1);
  assert.equal(model.captureTrayByIndex.get(0)?.trayUuid, "ABC123");
  assert.deepEqual(model.observedSummaryParts, ["42%", "18 min", "Tray 1", "AMS humidity 3"]);
  assert.deepEqual(model.fallbackSummaryParts, ["43%", "17 min"]);
  assert.deepEqual(
    model.diagnosticMetricCards.map((metric) => metric.label),
    [
      "Capture started",
      "Last captured",
      "Seeded from live state",
      "Changed fields",
      "Identity signals",
    ],
  );
  assert.match(model.diagnosticMetricCards[0].value, /^formatted:/);
  assert.equal(model.reviewTrayCount, 1);
  assert.ok(model.diagnosticGroups.some((group) => group.key === "ams"));
  assert.ok(model.signalQualityBuckets.every((bucket) => bucket.label && bucket.description));
});

test("buildSettingsBambuLiveDiagnosticsModel falls back to first chart field and empty state safely", () => {
  const emptyModel = buildSettingsBambuLiveDiagnosticsModel({
    diagnosticFilter: "changed",
    diagnosticSession: null,
    diagnosticSort: "change_count",
    formatDateTime,
    liveConfig: null,
    selectedChartFieldPath: "missing",
    t,
  });

  assert.equal(emptyModel.observedState, null);
  assert.equal(emptyModel.selectedDiagnosticChartField, null);
  assert.deepEqual(emptyModel.observedSummaryParts, []);
  assert.deepEqual(emptyModel.fallbackSummaryParts, []);
  assert.equal(emptyModel.diagnosticMetricCards.length, 5);
  assert.equal(emptyModel.diagnosticMetricCards[0].value, "—");
  assert.equal(emptyModel.diagnosticMetricCards[3].value, "0");
  assert.equal(emptyModel.reviewTrayCount, 0);
  assert.deepEqual(emptyModel.diagnosticGroups, []);

  const liveConfig = createLiveConfig();
  const diagnosticSession = updateDiagnosticCaptureSessionFromPayload({
    session: createSettingsBambuLiveCaptureSession(liveConfig),
    rawPayload: {
      mc_percent: 44,
      mc_remaining_time: 16,
    },
    observedAt: "2026-05-15T10:02:00Z",
  });
  const populatedModel = buildSettingsBambuLiveDiagnosticsModel({
    diagnosticFilter: "all",
    diagnosticSession,
    diagnosticSort: "path",
    formatDateTime,
    liveConfig,
    selectedChartFieldPath: "missing",
    t,
  });

  assert.equal(populatedModel.selectedDiagnosticChartField, populatedModel.diagnosticChartFields[0].path);
});
