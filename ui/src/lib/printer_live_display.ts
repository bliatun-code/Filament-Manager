import { blendSwatchColor, swatchRgba, swatchTextColor } from "./color_utils";
import { parseDateTimeMs } from "./date_time";
import type {
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
} from "./tauri_client";
import type { ResolvedTheme } from "./theme_mode";
export { formatDateTime } from "./date_time";
export { commandErrorText } from "./error_text";
export { formatGrams } from "./weight_display";

type TranslateFn = (key: string, fallback?: string) => string;
const BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX = 255;
const BAMBU_SECONDARY_EXTERNAL_TRAY_INDEX = 254;

export function formatRelativeAge(raw: string | null | undefined, t: TranslateFn): string | null {
  const parsedMs = parseDateTimeMs(raw);
  if (parsedMs == null) {
    return null;
  }
  const diffMs = Date.now() - parsedMs;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return t("common.justNow", "just now");
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} ${t("common.minutes", "min")}`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${t("common.hoursShort", "h")}`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} ${t("common.daysShort", "d")}`;
}

export function isOlderThanMinutes(raw?: string | null, minutes = 10): boolean {
  const parsedMs = parseDateTimeMs(raw);
  if (parsedMs == null) {
    return true;
  }
  return Date.now() - parsedMs > minutes * 60_000;
}

export function compareObservedTimestamps(
  left?: string | null,
  right?: string | null,
): number | null {
  const leftValue = parseDateTimeMs(left);
  const rightValue = parseDateTimeMs(right);
  if (leftValue == null || rightValue == null) {
    return null;
  }
  return leftValue - rightValue;
}

export { swatchCssBackground, toSwatchColor } from "./color_utils";

export function printerSwatchSurfaceStyle(
  raw: string | null | undefined,
  tone: "panel" | "inset",
  resolvedTheme: ResolvedTheme,
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "panel"
        ? {
            top: 0.32,
            mid: 0.16,
            bottom: 0.08,
            base: "rgb(10, 17, 31)",
            shadow: 0.38,
            border: 0.44,
            ambientShadow: "rgba(2, 6, 23, 0.5)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
        : {
            top: 0.28,
            mid: 0.14,
            bottom: 0.06,
            base: "rgb(13, 21, 39)",
            shadow: 0.34,
            border: 0.4,
            ambientShadow: "rgba(2, 6, 23, 0.44)",
            inset: "rgba(255, 255, 255, 0.028)",
          }
      : tone === "panel"
        ? {
            top: 0.12,
            mid: 0.055,
            bottom: 0.022,
            base: "rgba(252, 254, 255, 0.96)",
            shadow: 0.22,
            border: 0.18,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          }
        : {
            top: 0.105,
            mid: 0.045,
            bottom: 0.018,
            base: "rgba(253, 254, 255, 0.97)",
            shadow: 0.18,
            border: 0.16,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          };

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${darkTheme ? "24%" : "40%"}, ${swatchRgba(
      raw,
      strength.bottom,
    )} ${darkTheme ? "66%" : "74%"}, ${strength.base} 100%)`,
    borderColor: swatchRgba(raw, strength.border),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 16px 34px -30px ${swatchRgba(raw, strength.shadow)}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}

export function printerSwatchInteractiveInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
  emphasis: "default" | "selected" = "default",
) {
  const base = printerSwatchSurfaceStyle(raw, "inset", resolvedTheme);
  if (emphasis === "selected") {
    return {
      ...base,
      borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.56 : 0.34),
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(226, 232, 240, 0.1)"
          : "rgba(15, 23, 42, 0.08)"
      }, 0 16px 30px -24px ${swatchRgba(raw, resolvedTheme === "dark" ? 0.44 : 0.28)}`,
    } as const;
  }
  return base;
}

export function printerSwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return {
    background:
      resolvedTheme === "dark"
        ? `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.04)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.44,
          )} 100%)`
        : `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.08)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.22,
          )} 100%)`,
    borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.62 : 0.46),
    color: swatchTextColor(raw),
    boxShadow:
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${swatchRgba(raw, 0.72)}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`
        : `0 18px 36px -24px ${swatchRgba(raw, 0.54)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
  } as const;
}

export function formatPrinterSpoolStatusLabel(
  status: string | null | undefined,
  t: TranslateFn,
): string {
  switch ((status ?? "").trim().toUpperCase()) {
    case "IN_STOCK":
      return t("inventory.statusInStock", "In stock");
    case "ASSIGNED":
    case "IN_USE":
      return t("inventory.statusAssigned", "Assigned");
    case "BORROWED":
      return t("inventory.statusBorrowed", "Loaned out");
    case "EMPTY":
      return t("inventory.statusEmpty", "Empty");
    case "LOST":
      return t("inventory.statusLost", "Lost");
    default:
      return status?.trim() || t("common.unknown", "Unknown");
  }
}

export function formatPrinterSpoolStatusTone(status?: string | null) {
  switch ((status ?? "").trim().toUpperCase()) {
    case "ASSIGNED":
    case "IN_USE":
      return "success";
    case "IN_STOCK":
      return "info";
    case "BORROWED":
      return "warning";
    case "EMPTY":
      return "neutral";
    case "LOST":
      return "danger";
    default:
      return "neutral";
  }
}

export function isUnknownLiveRfid(tray?: BambuLiveObservedTray | null): boolean {
  return Boolean(tray?.tray_uuid && tray.match_status === "unknown_rfid");
}

export function liveUnknownMatchesSlotOverride(
  slot: PrinterAmsSlotRow,
  tray?: BambuLiveObservedTray | null,
): boolean {
  const observedTrayUuid = (tray?.tray_uuid ?? "").trim();
  const observedColorHex = (tray?.color_hex ?? "").trim();
  const overrideTrayUuid = (slot.rfid_override_tray_uuid ?? "").trim();
  const overrideColorHex = (slot.rfid_override_color_hex ?? "").trim();
  return Boolean(
    observedTrayUuid &&
      observedColorHex &&
      overrideTrayUuid &&
      overrideColorHex &&
      observedTrayUuid.localeCompare(overrideTrayUuid, undefined, { sensitivity: "accent" }) ===
        0 &&
      observedColorHex.localeCompare(overrideColorHex, undefined, { sensitivity: "accent" }) ===
        0,
  );
}

function isExternalSlot(slot: PrinterAmsSlotRow): boolean {
  return (slot.ams_id ?? "").trim().toLowerCase().endsWith("_ext");
}

function parseInternalAmsUnitIndex(amsId: string | null | undefined): number | null {
  const match = (amsId ?? "").trim().toLowerCase().match(/_ams_(\d+)$/);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function supportsFlatBambuLiveTray(slot: PrinterAmsSlotRow): boolean {
  return !isExternalSlot(slot) && (parseInternalAmsUnitIndex(slot.ams_id) ?? 1) === 1;
}

export function isBambuExternalTrayIndex(trayIndex: number | null | undefined): boolean {
  return (
    trayIndex === BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX ||
    trayIndex === BAMBU_SECONDARY_EXTERNAL_TRAY_INDEX
  );
}

export function liveActiveTrayMatchesSlot(
  slot: PrinterAmsSlotRow,
  activeTrayIndex: number | null | undefined,
): boolean {
  if (isExternalSlot(slot)) {
    return isBambuExternalTrayIndex(activeTrayIndex);
  }
  return supportsFlatBambuLiveTray(slot) && activeTrayIndex === slot.slot_index - 1;
}

export function liveTrayMatchesSlot(
  slot: PrinterAmsSlotRow | { ams_id?: string; amsId?: string; slot_index?: number; slotIndex?: number },
  tray: Pick<BambuLiveObservedTray, "ams_index" | "tray_index">,
): boolean {
  const amsId = "ams_id" in slot ? slot.ams_id : slot.amsId;
  const slotIndex = "slot_index" in slot ? slot.slot_index : slot.slotIndex;
  if (slotIndex == null) {
    return false;
  }
  if ((amsId ?? "").trim().toLowerCase().endsWith("_ext")) {
    return isBambuExternalTrayIndex(tray.tray_index);
  }
  if (typeof tray.ams_index === "number") {
    return parseInternalAmsUnitIndex(amsId) === tray.ams_index + 1 && slotIndex === tray.tray_index + 1;
  }
  return (parseInternalAmsUnitIndex(amsId) ?? 1) === 1 && slotIndex === tray.tray_index + 1;
}

function findBambuExternalLiveTray(
  trays: BambuLiveObservedTray[] | null | undefined,
): BambuLiveObservedTray | null {
  return (
    trays?.find((candidate) => candidate.tray_index === BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX) ??
    trays?.find((candidate) => candidate.tray_index === BAMBU_SECONDARY_EXTERNAL_TRAY_INDEX) ??
    null
  );
}

export function resolveLiveConnectionIndicator(
  liveConfig: BambuLiveIntegrationEntry["config"] | null,
  slots: PrinterAmsSlotRow[],
  t: TranslateFn,
) {
  if (!liveConfig?.enabled) {
    return null;
  }

  const observedState = liveConfig.observed_state ?? null;
  const lastSeenAt = observedState?.last_seen_at ?? null;
  const stale = isOlderThanMinutes(lastSeenAt, 2);
  let slotLastSeenAt: string | null = null;
  let slotMqttConnected = false;

  for (const slot of slots) {
    if (slot.live_mqtt_connected === true) {
      slotMqttConnected = true;
    }
    const candidateLastSeenAt = slot.live_printer_last_seen_at ?? null;
    if (!candidateLastSeenAt) {
      continue;
    }
    if (
      slotLastSeenAt == null ||
      (compareObservedTimestamps(candidateLastSeenAt, slotLastSeenAt) ?? 0) > 0
    ) {
      slotLastSeenAt = candidateLastSeenAt;
    }
  }

  const slotStale = isOlderThanMinutes(slotLastSeenAt, 2);
  const connectedViaSlotSnapshot = slotMqttConnected && !slotStale;

  if ((observedState?.mqtt_connected && !stale) || connectedViaSlotSnapshot) {
    return {
      tone: "success" as const,
      label: t("printers.liveConnectionConnected", "Live connected"),
    };
  }

  if (lastSeenAt || slotLastSeenAt) {
    return {
      tone: "warning" as const,
      label: t("printers.liveConnectionIdle", "Live idle"),
    };
  }

  return {
    tone: "neutral" as const,
    label: t("printers.liveConnectionWaiting", "Live waiting"),
  };
}

function slotLiveTrayFallback(
  slot: PrinterAmsSlotRow,
  clientReadOnly: boolean,
  clientPrinterSource: "LIVE" | "CACHED" | "OFFLINE",
): BambuLiveObservedTray | null {
  if (!clientReadOnly || clientPrinterSource !== "LIVE") {
    return null;
  }
  if (!slot.live_last_identity_seen_at && !slot.live_tray_uuid && !slot.live_match_status) {
    return null;
  }
  const trayIndex = isExternalSlot(slot)
    ? BAMBU_PRIMARY_EXTERNAL_TRAY_INDEX
    : slot.slot_index - 1;
  return {
    ams_index: isExternalSlot(slot) ? null : (parseInternalAmsUnitIndex(slot.ams_id) ?? 1) - 1,
    tray_index: trayIndex,
    loaded: slot.live_loaded ?? !!slot.live_tray_uuid,
    filament_type: slot.live_filament_type ?? null,
    filament_name: slot.live_filament_name ?? null,
    color_hex: slot.live_color_hex ?? null,
    tray_weight_g: slot.live_tray_weight_g ?? null,
    remaining_percent: slot.live_remaining_percent ?? null,
    remaining_grams: null,
    observed_rfid_tag: slot.live_observed_rfid_tag ?? null,
    tray_uuid: slot.live_tray_uuid ?? null,
    chip_id: slot.live_chip_id ?? null,
    tray_info_idx: slot.live_tray_info_idx ?? null,
    tray_id_name: slot.live_tray_id_name ?? null,
    last_identity_seen_at: slot.live_last_identity_seen_at ?? null,
    last_empty_seen_at: null,
    empty_observation_count: null,
    matched_inventory_spool_id: slot.live_matched_inventory_spool_id ?? null,
    matched_inventory_mode: slot.live_matched_inventory_mode ?? null,
    match_status: slot.live_match_status ?? null,
    match_note: slot.live_match_note ?? null,
  };
}

export function findLiveTrayForSlot(
  printerId: string,
  slot: PrinterAmsSlotRow,
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>,
  clientReadOnly: boolean,
  clientPrinterSource: "LIVE" | "CACHED" | "OFFLINE",
): {
  liveConfig: BambuLiveIntegrationEntry["config"] | null;
  tray: BambuLiveObservedTray | null;
} {
  const liveConfig = bambuLiveIntegrations[printerId] ?? null;
  const tray = isExternalSlot(slot)
    ? findBambuExternalLiveTray(liveConfig?.observed_state?.trays) ??
      slotLiveTrayFallback(slot, clientReadOnly, clientPrinterSource)
    : liveConfig?.observed_state?.trays.find((candidate) => liveTrayMatchesSlot(slot, candidate)) ??
      slotLiveTrayFallback(slot, clientReadOnly, clientPrinterSource);
  return { liveConfig, tray };
}
