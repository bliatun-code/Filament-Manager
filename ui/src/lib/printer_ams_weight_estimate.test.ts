import assert from "node:assert/strict";
import test from "node:test";

import {
  AMS_WEIGHT_ESTIMATE_MAX_AGE_MS,
  AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS,
  AMS_WEIGHT_ESTIMATE_MAX_BASIS_G,
  buildAcceptableAmsWeightEstimate,
  canOfferAmsWeightEstimateFromSource,
  isCurrentAmsWeightEstimate,
  sameAmsWeightEstimate,
} from "./printer_ams_weight_estimate";
import type {
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "./tauri_client";

const observedAt = "2026-08-12T08:00:00Z";
const nowMs = Date.parse(observedAt) + 60_000;

function liveConfig(
  overrides: {
    enabled?: boolean;
    online?: boolean;
    mqttConnected?: boolean;
    amsReadingBits?: string | null;
  } = {},
) {
  return {
    enabled: overrides.enabled ?? true,
    observed_state: {
      online: overrides.online ?? true,
      mqtt_connected: overrides.mqttConnected ?? true,
      ams_reading_bits: overrides.amsReadingBits ?? null,
      trays: [],
    },
  };
}

function row(): SpoolWithMasterRow {
  return {
    spool: {
      id: "spool-1",
      master_id: "master-1",
      status: "ASSIGNED",
      remaining_g: 1000,
      spool_tare_weight_g: 250,
    },
    master: {
      id: "master-1",
      vendor: "Bambu Lab",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Black",
      default_weight: 1000,
    },
  };
}

function slot(overrides: Partial<PrinterAmsSlotRow> = {}): PrinterAmsSlotRow {
  return {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    spool_id: "spool-1",
    spool_remaining_g: 1000,
    live_loaded: true,
    live_tray_weight_g: 1000,
    live_remaining_percent: 28,
    live_remaining_grams: 280,
    live_weight_seen_at: observedAt,
    live_last_identity_seen_at: observedAt,
    live_match_status: "clear_match",
    live_matched_inventory_mode: "exact_rfid",
    live_matched_inventory_spool_id: "spool-1",
    ...overrides,
  };
}

function tray(overrides: Partial<BambuLiveObservedTray> = {}): BambuLiveObservedTray {
  return {
    tray_index: 0,
    loaded: true,
    tray_weight_g: 1000,
    remaining_percent: 28,
    remaining_grams: 280,
    match_status: "clear_match",
    matched_inventory_mode: "exact_rfid",
    matched_inventory_spool_id: "spool-1",
    ...overrides,
  };
}

test("exact fresh RFID match exposes a net AMS estimate and calculated total", () => {
  assert.deepEqual(buildAcceptableAmsWeightEstimate(slot(), row(), tray(), nowMs), {
    spoolId: "spool-1",
    remainingGrams: 280,
    remainingPercent: 28,
    trayWeightG: 1000,
    tareWeightG: 250,
    calculatedTotalWeightG: 530,
    weightSeenAt: observedAt,
    expectedCurrentGrams: 1000,
  });
});

test("AMS acceptance is offered only from an explicitly live snapshot", () => {
  assert.equal(canOfferAmsWeightEstimateFromSource("LIVE", liveConfig()), true);
  assert.equal(canOfferAmsWeightEstimateFromSource("CACHED", liveConfig()), false);
  assert.equal(canOfferAmsWeightEstimateFromSource("OFFLINE", liveConfig()), false);
  assert.equal(canOfferAmsWeightEstimateFromSource("LIVE", null), false);
  assert.equal(
    canOfferAmsWeightEstimateFromSource("LIVE", liveConfig({ enabled: false })),
    false,
  );
  assert.equal(
    canOfferAmsWeightEstimateFromSource("LIVE", liveConfig({ online: false })),
    false,
  );
  assert.equal(
    canOfferAmsWeightEstimateFromSource(
      "LIVE",
      liveConfig({ mqttConnected: false }),
    ),
    false,
  );
  assert.equal(
    canOfferAmsWeightEstimateFromSource(
      "LIVE",
      liveConfig({ amsReadingBits: "1" }),
    ),
    false,
  );
  assert.equal(
    canOfferAmsWeightEstimateFromSource(
      "LIVE",
      liveConfig({ amsReadingBits: "0" }),
    ),
    true,
  );
});

test("AMS estimate requires the same assigned exact RFID roll and coherent weight fields", () => {
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot({ spool_id: "spool-2" }), row(), tray(), nowMs),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot(), row(), tray({ loaded: false }), nowMs),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot(),
      row(),
      tray({ matched_inventory_mode: "configured_metadata" }),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot(), row(), tray({ match_status: "ambiguous" }), nowMs),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot(), row(), tray({ remaining_grams: 281 }), nowMs),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot({ live_remaining_grams: 300 }), row(), tray(), nowMs),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({
        live_tray_weight_g: AMS_WEIGHT_ESTIMATE_MAX_BASIS_G + 1,
        live_remaining_grams: AMS_WEIGHT_ESTIMATE_MAX_BASIS_G + 1,
        live_remaining_percent: 100,
      }),
      row(),
      tray({
        tray_weight_g: AMS_WEIGHT_ESTIMATE_MAX_BASIS_G + 1,
        remaining_grams: AMS_WEIGHT_ESTIMATE_MAX_BASIS_G + 1,
        remaining_percent: 100,
      }),
      nowMs,
    ),
    null,
  );
});

test("AMS estimate rejects missing, future, and older-than-ten-minute observations", () => {
  assert.equal(
    buildAcceptableAmsWeightEstimate(slot({ live_weight_seen_at: null }), row(), tray(), nowMs),
    null,
  );
  assert.deepEqual(
    buildAcceptableAmsWeightEstimate(
      slot({
        live_weight_seen_at: new Date(
          nowMs + AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS,
        ).toISOString(),
      }),
      row(),
      tray({
        remaining_grams: 280,
        remaining_percent: 28,
        tray_weight_g: 1000,
      }),
      nowMs,
    ),
    {
      spoolId: "spool-1",
      remainingGrams: 280,
      remainingPercent: 28,
      trayWeightG: 1000,
      tareWeightG: 250,
      calculatedTotalWeightG: 530,
      weightSeenAt: new Date(nowMs + AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS).toISOString(),
      expectedCurrentGrams: 1000,
    },
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({
        live_weight_seen_at: new Date(
          nowMs + AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS + 1,
        ).toISOString(),
      }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot(),
      row(),
      tray(),
      Date.parse(observedAt) + AMS_WEIGHT_ESTIMATE_MAX_AGE_MS + 1,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({ live_last_identity_seen_at: null }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({
        live_last_identity_seen_at: new Date(
          nowMs + AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS + 1,
        ).toISOString(),
      }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({ live_last_identity_seen_at: "2026-08-12T07:49:59Z" }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
});

test("AMS estimate requires identity and weight observations strictly after cache clearing", () => {
  assert.ok(
    buildAcceptableAmsWeightEstimate(
      slot({ live_cache_cleared_at: "2026-08-12T07:59:59Z" }),
      row(),
      tray(),
      nowMs,
    ),
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({ live_cache_cleared_at: observedAt }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({
        live_cache_cleared_at: "2026-08-12T07:59:30Z",
        live_last_identity_seen_at: "2026-08-12T07:59:00Z",
      }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
  assert.equal(
    buildAcceptableAmsWeightEstimate(
      slot({ live_cache_cleared_at: "not-a-timestamp" }),
      row(),
      tray(),
      nowMs,
    ),
    null,
  );
});

test("AMS estimate permits a same-roll identity heartbeat newer than the fresh weight", () => {
  assert.ok(
    buildAcceptableAmsWeightEstimate(
      slot({ live_last_identity_seen_at: "2026-08-12T08:00:01Z" }),
      row(),
      tray(),
      nowMs,
    ),
  );
});

test("accept revalidation detects a changed estimate snapshot", () => {
  const expected = buildAcceptableAmsWeightEstimate(slot(), row(), tray(), nowMs);
  assert.ok(expected);
  assert.equal(sameAmsWeightEstimate(expected, { ...expected, remainingGrams: 270 }), false);
  assert.equal(sameAmsWeightEstimate(expected, { ...expected }), true);
  assert.equal(sameAmsWeightEstimate(expected, null), false);
});

test("an open AMS action remains visible only while the current live snapshot still matches", () => {
  const expected = buildAcceptableAmsWeightEstimate(slot(), row(), tray(), nowMs);
  assert.ok(expected);
  assert.equal(
    isCurrentAmsWeightEstimate(
      expected,
      "LIVE",
      liveConfig(),
      slot(),
      row(),
      tray(),
      nowMs,
    ),
    true,
  );
  assert.equal(
    isCurrentAmsWeightEstimate(
      expected,
      "LIVE",
      liveConfig(),
      slot({ live_remaining_grams: 270, live_remaining_percent: 27 }),
      row(),
      tray({ remaining_grams: 270, remaining_percent: 27 }),
      nowMs,
    ),
    false,
  );
  assert.equal(
    isCurrentAmsWeightEstimate(
      expected,
      "CACHED",
      liveConfig(),
      slot(),
      row(),
      tray(),
      nowMs,
    ),
    false,
  );
  assert.equal(
    isCurrentAmsWeightEstimate(
      expected,
      "LIVE",
      liveConfig(),
      slot(),
      row(),
      tray(),
      Date.parse(observedAt) + AMS_WEIGHT_ESTIMATE_MAX_AGE_MS + 1,
    ),
    false,
  );
});
