import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsBambuLiveDiagnosticTrayCard,
  buildSettingsBambuLiveDiagnosticMetricCards,
  buildSettingsBambuLiveDiagnosticGroups,
  buildSettingsBambuLiveFallbackSummaryParts,
  buildSettingsBambuLiveDiagnosticsModel,
  buildSettingsBambuLiveInventoryCandidateCards,
  buildSettingsBambuLiveInventoryMatchDescription,
  buildSettingsBambuLiveInventoryMatchPresentation,
  buildSettingsBambuLiveObservedRfid,
  buildSettingsBambuLiveObservedSummaryParts,
  buildSettingsBambuLiveSignalQualityBuckets,
  buildSettingsBambuLiveTrayLabels,
  buildSettingsBambuLiveTrayReviewState,
  buildSettingsBambuLiveTrayDisplayText,
  createSettingsBambuLiveCaptureSession,
  resolveSettingsBambuLiveCapturedTraySnapshot,
} from "./settings_bambu_live_diagnostics_model";
import {
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
    "Exact tray identity match against inventory.",
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
    "Observed tray identity did not match anything in inventory.",
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
      key: "live-tray-2",
      mqttTrayLabel: "MQTT tray 2",
      observedRfidLabel: "Observed: ABC123",
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
      key: "live-tray-0",
      mqttTrayLabel: "MQTT tray 0",
      observedRfidLabel: null,
      slotLabel: "Slot 1",
    },
  );
});

test("Bambu live captured tray snapshot prefers exact index before legacy fallback", () => {
  const exactSnapshot = createDiagnosticTraySnapshot({ trayIndex: 1, trayUuid: "EXACT" });
  const fallbackSnapshot = createDiagnosticTraySnapshot({ trayIndex: 0, trayUuid: "FALLBACK" });
  const captureTrayByIndex = new Map([
    [0, fallbackSnapshot],
    [1, exactSnapshot],
  ]);

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByIndex,
      tray: createObservedTray({ tray_index: 1 }),
    }),
    exactSnapshot,
  );

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByIndex: new Map([[0, fallbackSnapshot]]),
      tray: createObservedTray({ tray_index: 1 }),
    }),
    fallbackSnapshot,
  );

  assert.equal(
    resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByIndex: new Map(),
      tray: createObservedTray({ tray_index: 0 }),
    }),
    null,
  );
});

test("Bambu live diagnostic tray card composes RFID match and metadata candidates", () => {
  const exactCard = buildSettingsBambuLiveDiagnosticTrayCard({
    amsReadInProgress: false,
    capturedTraySnapshot: createDiagnosticTraySnapshot({ colorHex: "#00AAFF", trayUuid: "ABC123" }),
    spoolRows: [createSpoolRow()],
    t,
    tray: createObservedTray({
      color_hex: null,
      match_note: "rfid_mismatch",
      match_status: "rfid_mismatch",
      tray_index: 1,
    }),
  });

  assert.equal(exactCard.key, "live-tray-1");
  assert.equal(exactCard.matchKind, "rfid_exact");
  assert.equal(exactCard.matchLabel, "PLA Basic · Orange");
  assert.equal(exactCard.matchSwatchColor, "#FFAA00");
  assert.equal(exactCard.observedRfidLabel, "Observed: ABC123");
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
