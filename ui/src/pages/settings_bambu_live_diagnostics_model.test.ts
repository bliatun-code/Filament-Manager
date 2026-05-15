import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsBambuLiveDiagnosticMetricCards,
  buildSettingsBambuLiveFallbackSummaryParts,
  buildSettingsBambuLiveDiagnosticsModel,
  buildSettingsBambuLiveObservedSummaryParts,
  buildSettingsBambuLiveSignalQualityBuckets,
  createSettingsBambuLiveCaptureSession,
} from "./settings_bambu_live_diagnostics_model";
import {
  updateDiagnosticCaptureSessionFromPayload,
  type DiagnosticCaptureField,
} from "../lib/diagnostic_capture";
import type { BambuLiveIntegrationSettings, SpoolWithMasterRow } from "../lib/tauri_client";

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

function createSpoolRow(overrides: Partial<SpoolWithMasterRow> = {}): SpoolWithMasterRow {
  return {
    spool: {
      id: "spool-1",
      master_id: "master-1",
      rfid_tag: "ABC123",
      status: "IN_STOCK",
      ...overrides.spool,
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Orange",
      hex_color: "#FFAA00",
      default_weight: 1000,
      vendor: "Bambu",
      ...overrides.master,
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
    spoolRows: [createSpoolRow()],
    t,
  });

  assert.equal(model.observedState?.mqtt_connected, true);
  assert.equal(model.selectedDiagnosticChartField, "mc_percent");
  assert.ok(model.diagnosticChartFields.some((field) => field.path === "mc_percent"));
  assert.ok(model.diagnosticChartPoints.length > 0);
  assert.equal(model.diagnosticTrayCards.length, 1);
  assert.equal(model.diagnosticTrayCards[0].slotLabel, "Slot 2");
  assert.equal(model.diagnosticTrayCards[0].matchKind, "rfid_exact");
  assert.equal(model.diagnosticTrayCards[0].matchLabel, "PLA Basic · Orange");
  assert.equal(model.diagnosticTrayCards[0].observedRfidLabel, "Observed: ABC123");
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
    spoolRows: [],
    t,
  });

  assert.equal(emptyModel.observedState, null);
  assert.equal(emptyModel.selectedDiagnosticChartField, null);
  assert.deepEqual(emptyModel.observedSummaryParts, []);
  assert.deepEqual(emptyModel.fallbackSummaryParts, []);
  assert.deepEqual(emptyModel.diagnosticTrayCards, []);
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
    spoolRows: [],
    t,
  });

  assert.equal(populatedModel.selectedDiagnosticChartField, populatedModel.diagnosticChartFields[0].path);
});

test("Bambu live summary builders keep display order and omit missing values", () => {
  const liveConfig = createLiveConfig();

  assert.deepEqual(
    buildSettingsBambuLiveObservedSummaryParts(liveConfig.observed_state ?? null, t),
    ["42%", "18 min", "Tray 1", "AMS humidity 3"],
  );
  assert.deepEqual(buildSettingsBambuLiveObservedSummaryParts(null, t), []);

  const diagnosticSession = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: { humidity: "2" },
      mc_percent: 55,
    },
    observedAt: "2026-05-15T10:03:00Z",
  });

  assert.deepEqual(
    buildSettingsBambuLiveFallbackSummaryParts(diagnosticSession?.fields ?? [], t),
    ["55%"],
  );
});

test("Bambu live diagnostic metric cards format dates and counters", () => {
  const metricCards = buildSettingsBambuLiveDiagnosticMetricCards({
    captureSessionLastSeenAt: "2026-05-15T10:02:00Z",
    captureSessionSeededAt: "2026-05-15T10:00:00Z",
    captureSessionStartedAt: "2026-05-15T09:59:00Z",
    changedFieldCount: 4,
    formatDateTime,
    identityFieldCount: 2,
    t,
  });

  assert.deepEqual(
    metricCards.map((metric) => metric.key),
    ["started", "lastSeen", "seededFrom", "changedFields", "identitySignals"],
  );
  assert.deepEqual(
    metricCards.map((metric) => metric.value),
    [
      "formatted:2026-05-15T09:59:00Z",
      "formatted:2026-05-15T10:02:00Z",
      "formatted:2026-05-15T10:00:00Z",
      "4",
      "2",
    ],
  );

  const emptyMetricCards = buildSettingsBambuLiveDiagnosticMetricCards({
    captureSessionLastSeenAt: null,
    captureSessionSeededAt: null,
    captureSessionStartedAt: null,
    changedFieldCount: 0,
    formatDateTime,
    identityFieldCount: 0,
    t,
  });

  assert.deepEqual(
    emptyMetricCards.map((metric) => metric.value),
    ["—", "—", "—", "0", "0"],
  );
});

test("Bambu live signal quality buckets keep localized labels and descriptions", () => {
  const createDiagnosticField = (
    overrides: Partial<DiagnosticCaptureField>,
  ): DiagnosticCaptureField => ({
    avgChangeIntervalMs: null,
    avgReceiveIntervalMs: null,
    changeCount: 1,
    firstSeenAt: "2026-05-15T10:00:00Z",
    lastChangedAt: "2026-05-15T10:00:00Z",
    lastSeenAt: "2026-05-15T10:00:00Z",
    path: "ams.ams[0].tray[0].tray_uuid",
    receiveCount: 1,
    recentValues: [],
    valueText: "ABC123",
    ...overrides,
  });
  const buckets = buildSettingsBambuLiveSignalQualityBuckets(
    [
      createDiagnosticField({ path: "ams.ams[0].tray[0].tray_uuid" }),
      createDiagnosticField({
        changeCount: 2,
        path: "ams.tray_reading_bits",
        valueText: "1000",
      }),
      createDiagnosticField({
        avgReceiveIntervalMs: 4000,
        changeCount: 3,
        path: "mc_percent",
        receiveCount: 3,
        valueText: "55",
      }),
    ],
    t,
  );

  assert.deepEqual(
    buckets.map((bucket) => bucket.label),
    ["Stable metadata", "Event-driven identity", "Continuous telemetry"],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.description),
    [
      "Identity and tray metadata that appears stable when observed.",
      "Fields that tend to appear or change around AMS read/sync events.",
      "Fields that look like normal status/telemetry updates during operation.",
    ],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.fields.length),
    [1, 1, 1],
  );
});
