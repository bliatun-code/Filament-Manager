import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsBambuLiveAmsWeightLabel,
  buildSettingsBambuLiveDiagnosticTrayCard,
  buildSettingsBambuLiveDiagnosticTrayCards,
  buildSettingsBambuLiveDiagnosticMetricCards,
  buildSettingsBambuLiveDiagnosticGroups,
  buildSettingsBambuLiveFallbackSummaryParts,
  buildSettingsBambuLiveDiagnosticsModel,
  buildSettingsBambuLiveInventoryCandidateCards,
  buildSettingsBambuLiveInventoryMatchDescription,
  buildSettingsBambuLiveInventoryMatchPresentation,
  buildSettingsBambuLiveNozzleRangeLabel,
  buildSettingsBambuLiveObservedRfid,
  buildSettingsBambuLiveObservedSummaryParts,
  parseSettingsBambuLivePresetName,
  buildSettingsBambuLivePresetSignalLabel,
  buildSettingsBambuLiveSignalQualityBuckets,
  buildSettingsBambuLiveTrayLabels,
  buildSettingsBambuLiveTrayReviewState,
  buildSettingsBambuLiveTrayDisplayText,
  createSettingsBambuLiveCaptureSession,
  resolveSettingsBambuLiveCapturedTraySnapshot,
} from "./settings_bambu_live_diagnostics_model";
import {
  diagnosticTraySnapshotKey,
  updateDiagnosticCaptureSessionFromPayload,
  type DiagnosticCaptureField,
  type DiagnosticTraySnapshot,
} from "../lib/diagnostic_capture";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

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
      job_state_code: 4,
      ams_status_code: 769,
      ams_status_main: 3,
      ams_status_sub: 1,
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
                  tray_info_idx: "GFSA00_04",
                  tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
                  tray_color: "FFAA00FF",
                  tray_type: "PLA",
                  tray_weight: 1000,
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
              tray_info_idx: "GFSA00_04",
              tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
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

function createDiagnosticField(
  overrides: Partial<DiagnosticCaptureField>,
): DiagnosticCaptureField {
  return {
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
  };
}

function createDiagnosticTraySnapshot(
  overrides: Partial<DiagnosticTraySnapshot>,
): DiagnosticTraySnapshot {
  return {
    amsIndex: null,
    trayIndex: 1,
    loaded: true,
    ...overrides,
  };
}

function createObservedTray(overrides: Partial<BambuLiveObservedTray>): BambuLiveObservedTray {
  return {
    tray_index: 1,
    loaded: true,
    filament_type: "PLA",
    filament_name: "PLA Basic",
    color_hex: "#FFAA00",
    remaining_percent: 77,
    match_status: null,
    match_note: null,
    ...overrides,
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
  assert.equal(model.diagnosticTrayCards[0].observedRfidLabel, "Observed RFID/AMS identity: ABC123");
  assert.equal(
    model.diagnosticTrayCards[0].amsWeightLabel,
    "AMS estimate: 760 g / 1000 g · 76%",
  );
  assert.deepEqual(model.observedSummaryParts, [
    "42%",
    "18 min",
    "Tray 1",
    "AMS humidity 3",
    "Job state 4",
    "AMS status 3/1",
  ]);
  assert.deepEqual(model.fallbackSummaryParts, [
    "43%",
    "17 min",
    "Tray 1",
    "AMS humidity 3",
    "Job state 4",
    "AMS status 3/1",
  ]);
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
  assert.equal(
    model.diagnosticMetricCards.find((metric) => metric.key === "identitySignals")?.value,
    "1",
  );
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
    ["42%", "18 min", "Tray 1", "AMS humidity 3", "Job state 4", "AMS status 3/1"],
  );
  assert.deepEqual(buildSettingsBambuLiveObservedSummaryParts(null, t), []);

  const indexedLiveConfig = createLiveConfig();
  if (indexedLiveConfig.observed_state) {
    indexedLiveConfig.observed_state.active_ams_index = 1;
    indexedLiveConfig.observed_state.active_tray_index = 0;
  }
  assert.deepEqual(
    buildSettingsBambuLiveObservedSummaryParts(indexedLiveConfig.observed_state ?? null, t),
    ["42%", "18 min", "AMS 2 · Slot 1", "AMS humidity 3", "Job state 4", "AMS status 3/1"],
  );

  const diagnosticSession = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: { humidity: "2" },
      _bfm_ams_status: {
        ams_status_code: 769,
        ams_status_main: 3,
        ams_status_sub: 1,
      },
      job: {
        job_state: 4,
      },
      mc_percent: 55,
    },
    observedAt: "2026-05-15T10:03:00Z",
  });

  assert.deepEqual(
    buildSettingsBambuLiveFallbackSummaryParts(diagnosticSession?.fields ?? [], t),
    ["55%", "Job state 4", "AMS status 3/1"],
  );

  const rawStatusSession = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        ams_status: 769,
      },
      job_state: 2,
    },
    observedAt: "2026-05-15T10:03:10Z",
  });
  assert.deepEqual(
    buildSettingsBambuLiveFallbackSummaryParts(rawStatusSession?.fields ?? [], t),
    ["Job state 2", "AMS status 3/1"],
  );

  const indexedTraySession = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        tray_now: 4,
      },
    },
    observedAt: "2026-05-15T10:03:30Z",
  });
  assert.deepEqual(
    buildSettingsBambuLiveFallbackSummaryParts(indexedTraySession?.fields ?? [], t),
    ["AMS 2 · Slot 1"],
  );

  const externalLiveConfig = createLiveConfig();
  if (externalLiveConfig.observed_state) {
    externalLiveConfig.observed_state.active_tray_index = 255;
  }
  assert.deepEqual(
    buildSettingsBambuLiveObservedSummaryParts(externalLiveConfig.observed_state ?? null, t),
    ["42%", "18 min", "External tray", "AMS humidity 3", "Job state 4", "AMS status 3/1"],
  );

  const externalTraySession = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      tray_now: 254,
    },
    observedAt: "2026-05-15T10:04:00Z",
  });
  assert.deepEqual(
    buildSettingsBambuLiveFallbackSummaryParts(externalTraySession?.fields ?? [], t),
    ["Secondary external tray"],
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
  const buckets = buildSettingsBambuLiveSignalQualityBuckets(
    [
      createDiagnosticField({ path: "ams.ams[0].tray[0].tray_uuid" }),
      createDiagnosticField({ path: "ams.ams[0].tray[0].nozzle_temp_max", valueText: "240" }),
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
    ["Stable AMS metadata", "Event-driven AMS signals", "Continuous telemetry"],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.description),
    [
      "RFID, filament settings, material and tray metadata observed from AMS.",
      "AMS read and sync status fields that tend to appear around events.",
      "Fields that look like normal status/telemetry updates during operation.",
    ],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.fields.length),
    [2, 1, 1],
  );
});

test("Bambu live diagnostic groups apply filters, sorting and labels together", () => {
  const { diagnosticGroups, sortedDiagnosticFields } = buildSettingsBambuLiveDiagnosticGroups({
    diagnosticFields: [
      createDiagnosticField({
        changeCount: 3,
        lastSeenAt: "2026-05-15T10:03:00Z",
        path: "mc_percent",
        valueText: "44",
      }),
      createDiagnosticField({
        changeCount: 1,
        lastSeenAt: "2026-05-15T10:01:00Z",
        path: "ams.ams[0].humidity",
        valueText: "3",
      }),
      createDiagnosticField({
        changeCount: 2,
        lastSeenAt: "2026-05-15T10:02:00Z",
        path: "ams.ams[0].tray[0].tray_uuid",
        valueText: "ABC123",
      }),
    ],
    diagnosticFilter: "changed",
    diagnosticSort: "last_seen_desc",
    t,
  });

  assert.deepEqual(
    sortedDiagnosticFields.map((field) => field.path),
    ["mc_percent", "ams.ams[0].tray[0].tray_uuid"],
  );
  assert.deepEqual(
    diagnosticGroups.map((group) => group.label),
    ["Print & status", "Tray & chip"],
  );
});

test("Bambu live inventory match descriptions stay explicit for each match state", () => {
  assert.equal(
    buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: "rfid_exact",
      observedRfid: "ABC123",
      t,
    }),
    "Exact RFID/AMS identity match against inventory.",
  );
  assert.equal(
    buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: "metadata_single",
      observedRfid: null,
      t,
    }),
    "Single likely inventory match from material/name/color.",
  );
  assert.equal(
    buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: "metadata_multiple",
      observedRfid: null,
      t,
    }),
    "Multiple inventory rolls could match this filament.",
  );
  assert.equal(
    buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: "none",
      observedRfid: "ABC123",
      t,
    }),
    "Observed RFID/AMS identity did not match anything in inventory.",
  );
  assert.equal(
    buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: "none",
      observedRfid: null,
      t,
    }),
    "No clear inventory match yet.",
  );
});

test("Bambu live inventory candidate cards format at most three candidates", () => {
  const candidates = buildSettingsBambuLiveInventoryCandidateCards({
    candidates: [
      createSpoolRow(),
      createSpoolRow({
        master: {
          id: "master-2",
          material: "PLA",
          filament_name: "PLA Matte",
          color_name: "Black",
          hex_color: "#111111",
          default_weight: 1000,
          vendor: "Bambu",
        },
        spool: {
          id: "spool-2",
          master_id: "master-2",
          rfid_tag: "",
          status: "IN_STOCK",
        },
      }),
      createSpoolRow({
        master: {
          id: "master-3",
          material: "PETG",
          filament_name: "PETG Basic",
          color_name: "Blue",
          hex_color: "#0066FF",
          default_weight: 1000,
          vendor: "eSUN",
        },
        spool: {
          id: "spool-3",
          master_id: "master-3",
          rfid_tag: "XYZ789",
          status: "IN_STOCK",
        },
      }),
      createSpoolRow({
        master: {
          id: "master-4",
          material: "ABS",
          filament_name: "ABS Basic",
          color_name: "Grey",
          hex_color: "#777777",
          default_weight: 1000,
          vendor: "Bambu",
        },
        spool: {
          id: "spool-4",
          master_id: "master-4",
          rfid_tag: "IGNORED",
          status: "IN_STOCK",
        },
      }),
    ],
    t,
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.key),
    ["spool-1", "spool-2", "spool-3"],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.title),
    ["PLA Basic · Orange", "PLA Matte · Black", "PETG Basic · Blue"],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.subtitle),
    ["RFID saved · spool-1", "No RFID saved · spool-2", "RFID saved · spool-3"],
  );
  assert.ok(candidates.every((candidate) => candidate.swatchColor));
});

test("Bambu live observed RFID trims valid values and suppresses empty or zero-only values", () => {
  assert.equal(
    buildSettingsBambuLiveObservedRfid(
      createDiagnosticTraySnapshot({ trayUuid: "CAPTURE123" }),
      createObservedTray({ tray_uuid: " LIVE123 " }),
    ),
    "LIVE123",
  );
  assert.equal(
    buildSettingsBambuLiveObservedRfid(
      createDiagnosticTraySnapshot({ trayUuid: "CAPTURE123" }),
      createObservedTray({ tray_uuid: "000000" }),
    ),
    "CAPTURE123",
  );
  assert.equal(
    buildSettingsBambuLiveObservedRfid(createDiagnosticTraySnapshot({ trayUuid: " ABC123 " })),
    "ABC123",
  );
  assert.equal(
    buildSettingsBambuLiveObservedRfid(createDiagnosticTraySnapshot({ trayUuid: "000000" })),
    null,
  );
  assert.equal(
    buildSettingsBambuLiveObservedRfid(createDiagnosticTraySnapshot({ trayUuid: "   " })),
    null,
  );
  assert.equal(buildSettingsBambuLiveObservedRfid(null), null);
});

test("Bambu live preset signal label prefers live state and falls back to capture snapshot", () => {
  assert.deepEqual(
    parseSettingsBambuLivePresetName("Bambu PLA Basic @BBL P1S 0.4 nozzle"),
    {
      filamentProfile: "Bambu PLA Basic",
      nozzleDiameterMm: "0.4",
      printerProfile: "P1S",
      rawName: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
    },
  );
  assert.deepEqual(parseSettingsBambuLivePresetName("Custom preset"), {
    filamentProfile: "Custom preset",
    nozzleDiameterMm: null,
    printerProfile: null,
    rawName: "Custom preset",
  });
  assert.deepEqual(parseSettingsBambuLivePresetName("Generic PLA @0.2 nozzle"), {
    filamentProfile: "Generic PLA",
    nozzleDiameterMm: "0.2",
    printerProfile: null,
    rawName: "Generic PLA @0.2 nozzle",
  });

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        trayIdName: "Capture preset",
        trayInfoIdx: "CAPTURE_PRESET",
      }),
      t,
      tray: createObservedTray({
        tray_id_name: "Live preset",
        tray_info_idx: "LIVE_PRESET",
      }),
    }),
    "Filament settings preset: LIVE_PRESET · Live preset",
  );

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({
        tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
        tray_info_idx: "GFSA00_04",
      }),
    }),
    "Filament settings preset: GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle",
  );

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({
        tray_id_name: "Generic PLA @0.2 nozzle",
        tray_info_idx: "GENERIC_PLA_02",
      }),
    }),
    "Filament settings preset: GENERIC_PLA_02 · Generic PLA · 0.2 mm nozzle",
  );

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({
        tray_id_name: "Bambu Support For PLA/PETG @BBL X2D 0.4 nozzle",
        tray_info_idx: "GFSPETG_04",
      }),
    }),
    "Filament settings preset: GFSPETG_04 · Bambu Support For PLA/PETG · X2D · 0.4 mm nozzle",
  );

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        trayIdName: "Capture preset",
        trayInfoIdx: "CAPTURE_PRESET",
      }),
      t,
      tray: createObservedTray({ tray_id_name: null, tray_info_idx: null }),
    }),
    "Filament settings preset: CAPTURE_PRESET · Capture preset",
  );

  assert.equal(
    buildSettingsBambuLivePresetSignalLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({ tray_id_name: null, tray_info_idx: null }),
    }),
    null,
  );
});

test("Bambu live nozzle range label formats captured filament settings", () => {
  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        nozzleTempMaxC: 240,
        nozzleTempMinC: 190,
      }),
      t,
    }),
    "Nozzle range: 190-240 C",
  );

  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({
        nozzle_temp_max_c: 245,
        nozzle_temp_min_c: 200,
      }),
    }),
    "Nozzle range: 200-245 C",
  );

  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        nozzleTempMaxC: 240,
        nozzleTempMinC: 190,
      }),
      t,
      tray: createObservedTray({
        nozzle_temp_max_c: 245,
        nozzle_temp_min_c: 200,
      }),
    }),
    "Nozzle range: 200-245 C",
  );

  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({ nozzleTempMinC: 215.5 }),
      t,
    }),
    "Nozzle range: min 215.5 C",
  );

  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({ nozzleTempMaxC: 230 }),
      t,
    }),
    "Nozzle range: max 230 C",
  );

  assert.equal(
    buildSettingsBambuLiveNozzleRangeLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({}),
      t,
    }),
    null,
  );
});

test("Bambu live tray display text prefers names, material, and empty fallbacks", () => {
  assert.deepEqual(
    buildSettingsBambuLiveTrayDisplayText({
      t,
      tray: createObservedTray({ filament_name: "PLA Basic", filament_type: "PLA", remaining_percent: 77 }),
    }),
    { detailText: "PLA · 77%", statusText: "PLA Basic" },
  );
  assert.deepEqual(
    buildSettingsBambuLiveTrayDisplayText({
      t,
      tray: createObservedTray({ filament_name: null, filament_type: "PETG", remaining_percent: null }),
    }),
    { detailText: "PETG", statusText: "PETG" },
  );
  assert.deepEqual(
    buildSettingsBambuLiveTrayDisplayText({
      t,
      tray: createObservedTray({ filament_name: null, filament_type: null, remaining_percent: null }),
    }),
    { detailText: "—", statusText: "Loaded" },
  );
  assert.deepEqual(
    buildSettingsBambuLiveTrayDisplayText({
      t,
      tray: createObservedTray({ loaded: false, filament_name: "PLA Basic" }),
    }),
    { detailText: "PLA · 77%", statusText: "Empty / unknown" },
  );
});

test("Bambu live AMS weight label formats live and captured estimates", () => {
  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        remainingPercent: 77,
        trayWeightG: 1000,
      }),
      t,
      tray: createObservedTray({ remaining_percent: null }),
    }),
    "AMS estimate: 770 g / 1000 g · 77%",
  );

  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        remainingPercent: 77,
        trayWeightG: 1000,
      }),
      t,
      tray: createObservedTray({
        remaining_grams: 735,
        remaining_percent: 74,
        tray_weight_g: 1000,
      }),
    }),
    "AMS estimate: 735 g / 1000 g · 74%",
  );

  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({ trayWeightG: 1000 }),
      t,
      tray: createObservedTray({ remaining_percent: null }),
    }),
    "AMS spool basis: 1000 g",
  );

  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({ remaining_percent: null }),
    }),
    null,
  );
});

test("Bambu live AMS weight label ignores implausible live estimates", () => {
  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: createDiagnosticTraySnapshot({
        remainingPercent: 77,
        trayWeightG: 1000,
      }),
      t,
      tray: createObservedTray({
        remaining_grams: -20,
        remaining_percent: 105,
        tray_weight_g: -1000,
      }),
    }),
    "AMS estimate: 770 g / 1000 g · 77%",
  );

  assert.equal(
    buildSettingsBambuLiveAmsWeightLabel({
      capturedTraySnapshot: null,
      t,
      tray: createObservedTray({
        remaining_grams: -20,
        remaining_percent: 105,
        tray_weight_g: -1000,
      }),
    }),
    null,
  );
});

test("Bambu live inventory match presentation prefers inventory label and swatch", () => {
  assert.deepEqual(
    buildSettingsBambuLiveInventoryMatchPresentation({
      capturedTraySnapshot: createDiagnosticTraySnapshot({ colorHex: "#00AAFF" }),
      primaryInventoryMatch: createSpoolRow(),
      t,
      tray: createObservedTray({ color_hex: "#111111" }),
    }),
    {
      matchLabel: "PLA Basic · Orange",
      matchSwatchColor: "#FFAA00",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveInventoryMatchPresentation({
      capturedTraySnapshot: createDiagnosticTraySnapshot({ colorHex: "#00AAFF" }),
      primaryInventoryMatch: null,
      t,
      tray: createObservedTray({ color_hex: null }),
    }),
    {
      matchLabel: "No clear inventory match",
      matchSwatchColor: "#00AAFF",
    },
  );
});

test("Bambu live tray review state suppresses review while reading AMS", () => {
  assert.deepEqual(
    buildSettingsBambuLiveTrayReviewState({
      amsReadInProgress: false,
      t,
      tray: createObservedTray({
        match_note: "rfid_mismatch",
        match_status: "rfid_mismatch",
      }),
    }),
    {
      hasReview: true,
      matchNote: "rfid_mismatch",
      reviewTitle: "rfid_mismatch",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayReviewState({
      amsReadInProgress: true,
      t,
      tray: createObservedTray({
        match_note: "rfid_mismatch",
        match_status: "rfid_mismatch",
      }),
    }),
    {
      hasReview: false,
      matchNote: null,
      reviewTitle: "rfid_mismatch",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayReviewState({
      amsReadInProgress: false,
      t,
      tray: createObservedTray({
        match_note: "exact",
        match_status: "clear_match",
      }),
    }),
    {
      hasReview: false,
      matchNote: "exact",
      reviewTitle: "exact",
    },
  );
});

test("Bambu live tray labels keep stable ids and optional RFID text", () => {
  assert.deepEqual(
    buildSettingsBambuLiveTrayLabels({
      observedRfid: "ABC123",
      t,
      tray: createObservedTray({ tray_index: 2 }),
    }),
    {
      key: "live-tray-legacy-2",
      mqttTrayLabel: "MQTT tray 2",
      observedRfidLabel: "Observed RFID/AMS identity: ABC123",
      slotLabel: "Slot 3",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayLabels({
      observedRfid: null,
      t,
      tray: createObservedTray({ tray_index: 0 }),
    }),
    {
      key: "live-tray-legacy-0",
      mqttTrayLabel: "MQTT tray 0",
      observedRfidLabel: null,
      slotLabel: "Slot 1",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayLabels({
      observedRfid: null,
      t,
      tray: createObservedTray({ tray_index: 255 }),
    }),
    {
      key: "live-tray-legacy-255",
      mqttTrayLabel: "MQTT external tray",
      observedRfidLabel: null,
      slotLabel: "External slot",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayLabels({
      observedRfid: null,
      t,
      tray: createObservedTray({ tray_index: 254 }),
    }),
    {
      key: "live-tray-legacy-254",
      mqttTrayLabel: "MQTT secondary external tray",
      observedRfidLabel: null,
      slotLabel: "Secondary external slot",
    },
  );

  assert.deepEqual(
    buildSettingsBambuLiveTrayLabels({
      observedRfid: null,
      t,
      tray: createObservedTray({ ams_index: 1, tray_index: 0 }),
    }),
    {
      key: "live-tray-ams-1-0",
      mqttTrayLabel: "MQTT tray 0",
      observedRfidLabel: null,
      slotLabel: "AMS 2 · Slot 1",
    },
  );
});

test("Bambu live captured tray snapshot prefers exact index before legacy fallback", () => {
  const exactSnapshot = createDiagnosticTraySnapshot({ trayIndex: 1, trayUuid: "EXACT" });
  const fallbackSnapshot = createDiagnosticTraySnapshot({ trayIndex: 0, trayUuid: "FALLBACK" });
  const captureTrayByKey = new Map([
    [diagnosticTraySnapshotKey(null, 0), fallbackSnapshot],
    [diagnosticTraySnapshotKey(null, 1), exactSnapshot],
  ]);

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey,
      tray: createObservedTray({ tray_index: 1 }),
    }),
    exactSnapshot,
  );

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey: new Map([[diagnosticTraySnapshotKey(null, 0), fallbackSnapshot]]),
      tray: createObservedTray({ tray_index: 1 }),
    }),
    fallbackSnapshot,
  );

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey: new Map(),
      tray: createObservedTray({ tray_index: 0 }),
    }),
    null,
  );
});

test("Bambu live captured tray snapshot prefers exact AMS coordinates over same tray legacy data", () => {
  const legacySnapshot = createDiagnosticTraySnapshot({
    amsIndex: null,
    trayIndex: 0,
    trayUuid: "LEGACY-SLOT1",
  });
  const ams1Snapshot = createDiagnosticTraySnapshot({
    amsIndex: 0,
    trayIndex: 0,
    trayUuid: "AMS1-SLOT1",
  });
  const ams2Snapshot = createDiagnosticTraySnapshot({
    amsIndex: 1,
    trayIndex: 0,
    trayUuid: "AMS2-SLOT1",
  });

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey: new Map([
        [diagnosticTraySnapshotKey(null, 0), legacySnapshot],
        [diagnosticTraySnapshotKey(0, 0), ams1Snapshot],
        [diagnosticTraySnapshotKey(1, 0), ams2Snapshot],
      ]),
      tray: createObservedTray({ ams_index: 1, tray_index: 0 }),
    }),
    ams2Snapshot,
  );

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey: new Map([
        [diagnosticTraySnapshotKey(null, 0), legacySnapshot],
        [diagnosticTraySnapshotKey(0, 0), ams1Snapshot],
      ]),
      tray: createObservedTray({ ams_index: 1, tray_index: 0 }),
    }),
    legacySnapshot,
  );
});

test("Bambu live diagnostic tray card composes RFID match and metadata candidates", () => {
  const exactCard = buildSettingsBambuLiveDiagnosticTrayCard({
    amsReadInProgress: false,
    capturedTraySnapshot: createDiagnosticTraySnapshot({
      colorHex: "#00AAFF",
      nozzleTempMaxC: 240,
      nozzleTempMinC: 190,
      trayWeightG: 1000,
      trayIdName: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
      trayInfoIdx: "GFSA00_04",
      trayUuid: "ABC123",
    }),
    spoolRows: [createSpoolRow()],
    t,
    tray: createObservedTray({
      color_hex: null,
      match_note: "rfid_mismatch",
      match_status: "rfid_mismatch",
      tray_index: 1,
    }),
  });

  assert.equal(exactCard.key, "live-tray-legacy-1");
  assert.equal(exactCard.matchKind, "rfid_exact");
  assert.equal(exactCard.matchLabel, "PLA Basic · Orange");
  assert.equal(exactCard.matchSwatchColor, "#FFAA00");
  assert.equal(exactCard.observedRfidLabel, "Observed RFID/AMS identity: ABC123");
  assert.equal(
    exactCard.presetSignalLabel,
    "Filament settings preset: GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle",
  );
  assert.equal(exactCard.amsWeightLabel, "AMS estimate: 770 g / 1000 g · 77%");
  assert.equal(exactCard.nozzleRangeLabel, "Nozzle range: 190-240 C");
  assert.equal(exactCard.hasReview, true);
  assert.equal(exactCard.matchNote, "rfid_mismatch");

  const metadataRows = [
    createSpoolRow({ spool: { id: "spool-1", master_id: "master-1", rfid_tag: null, status: "IN_STOCK" } }),
    createSpoolRow({ spool: { id: "spool-2", master_id: "master-1", rfid_tag: null, status: "IN_STOCK" } }),
    createSpoolRow({ spool: { id: "spool-3", master_id: "master-1", rfid_tag: null, status: "IN_STOCK" } }),
    createSpoolRow({ spool: { id: "spool-4", master_id: "master-1", rfid_tag: null, status: "IN_STOCK" } }),
  ];
  const metadataCard = buildSettingsBambuLiveDiagnosticTrayCard({
    amsReadInProgress: false,
    capturedTraySnapshot: null,
    spoolRows: metadataRows,
    t,
    tray: createObservedTray({ tray_index: 2 }),
  });

  assert.equal(metadataCard.matchKind, "metadata_multiple");
  assert.equal(metadataCard.candidateCountText, "4 candidates");
  assert.equal(metadataCard.hasMoreCandidates, true);
  assert.equal(metadataCard.candidates.length, 3);
  assert.deepEqual(
    metadataCard.candidates.map((candidate) => candidate.key),
    ["spool-1", "spool-2", "spool-3"],
  );
});

test("Bambu live diagnostic tray cards resolve snapshots per display tray", () => {
  const trayCards = buildSettingsBambuLiveDiagnosticTrayCards({
    amsReadInProgress: false,
    captureTrayByKey: new Map([
      [
        diagnosticTraySnapshotKey(null, 0),
        createDiagnosticTraySnapshot({ trayIndex: 0, trayUuid: "ABC123" }),
      ],
      [
        diagnosticTraySnapshotKey(null, 1),
        createDiagnosticTraySnapshot({ trayIndex: 1, trayUuid: "XYZ789" }),
      ],
    ]),
    displayTrays: [
      createObservedTray({ tray_index: 0 }),
      createObservedTray({ filament_name: "PETG Basic", tray_index: 1 }),
    ],
    spoolRows: [
      createSpoolRow(),
      createSpoolRow({
        master: {
          id: "master-2",
          material: "PETG",
          filament_name: "PETG Basic",
          color_name: "Blue",
          hex_color: "#0066FF",
          default_weight: 1000,
          vendor: "eSUN",
        },
        spool: {
          id: "spool-2",
          master_id: "master-2",
          rfid_tag: "XYZ789",
          status: "IN_STOCK",
        },
      }),
    ],
    t,
  });

  assert.deepEqual(
    trayCards.map((card) => card.observedRfidLabel),
    ["Observed RFID/AMS identity: ABC123", "Observed RFID/AMS identity: XYZ789"],
  );
  assert.deepEqual(
    trayCards.map((card) => card.matchLabel),
    ["PLA Basic · Orange", "PETG Basic · Blue"],
  );
});
