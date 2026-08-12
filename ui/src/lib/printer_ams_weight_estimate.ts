import {
  deriveAmsRemainingGrams,
  saneAmsRemainingGrams,
  saneAmsRemainingPercent,
  saneAmsSpoolWeight,
} from "./ams_weight_estimate";
import { parseDateTimeMs } from "./date_time";
import { resolveSpoolTareWeight } from "./spool_weight";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "./tauri_client";

export const AMS_WEIGHT_ESTIMATE_MAX_AGE_MS = 10 * 60 * 1000;
export const AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS = 5_000;
export const AMS_WEIGHT_ESTIMATE_MAX_BASIS_G = 100_000;

export type AcceptableAmsWeightEstimate = {
  spoolId: string;
  remainingGrams: number;
  remainingPercent: number;
  trayWeightG: number;
  tareWeightG: number;
  calculatedTotalWeightG: number;
  weightSeenAt: string;
  expectedCurrentGrams: number | null;
};

export function canOfferAmsWeightEstimateFromSource(
  source: "LIVE" | "CACHED" | "OFFLINE",
  liveConfig: BambuLiveIntegrationSettings | null | undefined,
): boolean {
  const amsReadingBits = liveConfig?.observed_state?.ams_reading_bits?.trim() ?? "";
  return Boolean(
    source === "LIVE" &&
      liveConfig?.enabled === true &&
      liveConfig.observed_state?.online === true &&
      liveConfig.observed_state.mqtt_connected === true &&
      (!amsReadingBits || amsReadingBits === "0"),
  );
}

export function buildAcceptableAmsWeightEstimate(
  slot: PrinterAmsSlotRow,
  row: SpoolWithMasterRow,
  tray: BambuLiveObservedTray | null | undefined,
  nowMs = Date.now(),
): AcceptableAmsWeightEstimate | null {
  const assignedSpoolId = slot.spool_id?.trim() ?? "";
  const targetSpoolId = row.spool.id.trim();
  if (
    !assignedSpoolId ||
    assignedSpoolId !== targetSpoolId ||
    slot.live_loaded !== true ||
    !tray?.loaded
  ) {
    return null;
  }
  if (
    slot.live_match_status !== "clear_match" ||
    slot.live_matched_inventory_mode !== "exact_rfid" ||
    slot.live_matched_inventory_spool_id?.trim() !== targetSpoolId ||
    tray.match_status !== "clear_match" ||
    tray.matched_inventory_mode !== "exact_rfid" ||
    tray.matched_inventory_spool_id?.trim() !== targetSpoolId
  ) {
    return null;
  }

  const remainingGrams = saneAmsRemainingGrams(slot.live_remaining_grams);
  const remainingPercent = saneAmsRemainingPercent(slot.live_remaining_percent);
  const trayWeightG = saneAmsSpoolWeight(slot.live_tray_weight_g);
  const weightSeenAt = slot.live_weight_seen_at?.trim() ?? "";
  const weightSeenAtMs = parseDateTimeMs(weightSeenAt);
  const identitySeenAt = slot.live_last_identity_seen_at?.trim() ?? "";
  const identitySeenAtMs = parseDateTimeMs(identitySeenAt);
  const cacheClearedAt = slot.live_cache_cleared_at?.trim() ?? "";
  const cacheClearedAtMs = cacheClearedAt ? parseDateTimeMs(cacheClearedAt) : null;
  const ageMs = weightSeenAtMs == null ? -1 : nowMs - weightSeenAtMs;
  const identityAgeMs = identitySeenAtMs == null ? -1 : nowMs - identitySeenAtMs;
  if (
    remainingGrams == null ||
    remainingPercent == null ||
    trayWeightG == null ||
    trayWeightG > AMS_WEIGHT_ESTIMATE_MAX_BASIS_G ||
    !weightSeenAt ||
    ageMs < -AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS ||
    ageMs > AMS_WEIGHT_ESTIMATE_MAX_AGE_MS ||
    !identitySeenAt ||
    identityAgeMs < -AMS_WEIGHT_ESTIMATE_FUTURE_SKEW_MS ||
    identityAgeMs > AMS_WEIGHT_ESTIMATE_MAX_AGE_MS ||
    (cacheClearedAt &&
      (cacheClearedAtMs == null ||
        weightSeenAtMs == null ||
        identitySeenAtMs == null ||
        weightSeenAtMs <= cacheClearedAtMs ||
        identitySeenAtMs <= cacheClearedAtMs))
  ) {
    return null;
  }

  const derivedRemainingGrams = deriveAmsRemainingGrams(remainingPercent, trayWeightG);
  if (derivedRemainingGrams !== remainingGrams) {
    return null;
  }
  if (
    saneAmsRemainingGrams(tray.remaining_grams) !== remainingGrams ||
    saneAmsRemainingPercent(tray.remaining_percent) !== remainingPercent ||
    saneAmsSpoolWeight(tray.tray_weight_g) !== trayWeightG
  ) {
    return null;
  }

  const tareWeightG = resolveSpoolTareWeight(
    row.spool.spool_tare_weight_g,
    row.master.vendor,
  );
  return {
    spoolId: targetSpoolId,
    remainingGrams,
    remainingPercent,
    trayWeightG,
    tareWeightG,
    calculatedTotalWeightG: remainingGrams + tareWeightG,
    weightSeenAt,
    expectedCurrentGrams: saneAmsRemainingGrams(slot.spool_remaining_g),
  };
}

export function isCurrentAmsWeightEstimate(
  expected: AcceptableAmsWeightEstimate | null | undefined,
  source: "LIVE" | "CACHED" | "OFFLINE",
  liveConfig: BambuLiveIntegrationSettings | null | undefined,
  slot: PrinterAmsSlotRow | null | undefined,
  row: SpoolWithMasterRow | null | undefined,
  tray: BambuLiveObservedTray | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (
    !expected ||
    !slot ||
    !row ||
    !canOfferAmsWeightEstimateFromSource(source, liveConfig)
  ) {
    return false;
  }
  return sameAmsWeightEstimate(
    expected,
    buildAcceptableAmsWeightEstimate(slot, row, tray, nowMs),
  );
}

export function sameAmsWeightEstimate(
  expected: AcceptableAmsWeightEstimate,
  current: AcceptableAmsWeightEstimate | null,
): boolean {
  return Boolean(
    current &&
      current.spoolId === expected.spoolId &&
      current.remainingGrams === expected.remainingGrams &&
      current.remainingPercent === expected.remainingPercent &&
      current.trayWeightG === expected.trayWeightG &&
      current.tareWeightG === expected.tareWeightG &&
      current.expectedCurrentGrams === expected.expectedCurrentGrams &&
      current.weightSeenAt === expected.weightSeenAt,
  );
}
