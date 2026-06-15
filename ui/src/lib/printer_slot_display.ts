import type {
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "./tauri_client";
import type { Locale } from "./i18n";
import {
  compareObservedTimestamps,
  formatDateTime,
  formatRelativeAge,
  isOlderThanMinutes,
  isUnknownLiveRfid,
  liveActiveTrayMatchesSlot,
  liveUnknownMatchesSlotOverride,
} from "./printer_live_display";

type TranslateFn = (key: string, fallback?: string) => string;

export type PrinterSlotDisplayState = {
  effectiveLiveTray: BambuLiveObservedTray | null;
  liveMatchedSpool: SpoolWithMasterRow | null;
  lastLiveIdentityAt: string | null;
  liveIdentityFresh: boolean;
  liveSignalEnabled: boolean;
  liveSlotInUse: boolean;
  liveIdentityLabel: string | null;
  unknownLiveRfid: boolean;
  rfidOverridden: boolean;
  showManualLabel: boolean;
  liveObservedAge: string | null;
  liveObservedAtLabel: string | null;
  slotSwatchHex: string | null;
};

export function derivePrinterSlotDisplayState(options: {
  slot: PrinterAmsSlotRow;
  liveConfig: BambuLiveIntegrationEntry["config"] | null;
  liveTray: BambuLiveObservedTray | null;
  selectedTargetSpool: SpoolWithMasterRow | null;
  clientReadOnly: boolean;
  clientPrinterSource: "LIVE" | "CACHED" | "OFFLINE";
  locale: Locale;
  t: TranslateFn;
  findSpoolById: (spoolId?: string | null) => SpoolWithMasterRow | null;
}): PrinterSlotDisplayState {
  const {
    slot,
    liveConfig,
    liveTray,
    selectedTargetSpool,
    clientReadOnly,
    clientPrinterSource,
    locale,
    t,
    findSpoolById,
  } = options;
  const isExtSlot = (slot.ams_id ?? "").endsWith("_ext");
  const liveCacheSuppressedByManualClear =
    !isExtSlot &&
    !!slot.live_cache_cleared_at &&
    (
      compareObservedTimestamps(
        liveTray?.last_identity_seen_at ?? liveConfig?.observed_state?.last_seen_at ?? null,
        slot.live_cache_cleared_at,
      ) ?? -1
    ) <= 0;
  const effectiveLiveTray = liveCacheSuppressedByManualClear ? null : liveTray;
  const liveMatchedSpool = findSpoolById(effectiveLiveTray?.matched_inventory_spool_id);
  const lastLiveIdentityAt =
    effectiveLiveTray?.last_identity_seen_at ??
    (isExtSlot ? liveConfig?.observed_state?.last_seen_at ?? null : null);
  const liveIdentityFresh = !isOlderThanMinutes(lastLiveIdentityAt, 10);
  const liveSignalEnabled =
    Boolean(liveConfig?.enabled) ||
    (clientReadOnly && clientPrinterSource === "LIVE" && !!effectiveLiveTray);
  const liveSlotInUse =
    liveSignalEnabled &&
    liveIdentityFresh &&
    ((liveConfig?.enabled &&
      liveActiveTrayMatchesSlot(slot, liveConfig.observed_state?.active_tray_index) &&
      (liveConfig.observed_state?.progress_percent != null ||
        liveConfig.observed_state?.remaining_minutes != null)) ||
      slot.live_is_active === true);
  const liveIdentityLabel =
    liveIdentityFresh && effectiveLiveTray?.matched_inventory_mode === "exact_rfid"
      ? t("printers.liveRfid", "Live RFID")
      : null;
  const unknownLiveRfid =
    liveIdentityFresh && liveSignalEnabled && isUnknownLiveRfid(effectiveLiveTray);
  const rfidOverridden = unknownLiveRfid && liveUnknownMatchesSlotOverride(slot, effectiveLiveTray);
  const showManualLabel =
    !!slot.spool_id &&
    !liveIdentityLabel &&
    !rfidOverridden &&
    liveSignalEnabled &&
    isOlderThanMinutes(lastLiveIdentityAt, 10);
  const liveObservedAge = formatRelativeAge(lastLiveIdentityAt, t);
  const liveObservedAtLabel = lastLiveIdentityAt ? formatDateTime(lastLiveIdentityAt, locale) : null;
  const slotSwatchHex =
    (liveIdentityFresh ? liveMatchedSpool?.master.hex_color : null) ??
    selectedTargetSpool?.master.hex_color ??
    slot.spool_hex_color ??
    null;

  return {
    effectiveLiveTray,
    liveMatchedSpool,
    lastLiveIdentityAt,
    liveIdentityFresh,
    liveSignalEnabled,
    liveSlotInUse,
    liveIdentityLabel,
    unknownLiveRfid,
    rfidOverridden,
    showManualLabel,
    liveObservedAge,
    liveObservedAtLabel,
    slotSwatchHex,
  };
}
