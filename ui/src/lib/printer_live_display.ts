import type {
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
} from "./tauri_client";
import type { Locale } from "./i18n";
import type { ResolvedTheme } from "./theme_mode";

type TranslateFn = (key: string, fallback?: string) => string;

export function formatGrams(value?: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${Math.max(0, value)} g`;
}

function parseObservedTimestamp(raw?: string | null): number | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getTime();
}

export function formatDateTime(raw: string, locale: Locale): string {
  const parsedMs = parseObservedTimestamp(raw);
  if (parsedMs == null) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(parsedMs));
}

export function formatRelativeAge(raw: string | null | undefined, t: TranslateFn): string | null {
  const parsedMs = parseObservedTimestamp(raw);
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
  const parsedMs = parseObservedTimestamp(raw);
  if (parsedMs == null) {
    return true;
  }
  return Date.now() - parsedMs > minutes * 60_000;
}

export function compareObservedTimestamps(
  left?: string | null,
  right?: string | null,
): number | null {
  const leftValue = parseObservedTimestamp(left);
  const rightValue = parseObservedTimestamp(right);
  if (leftValue == null || rightValue == null) {
    return null;
  }
  return leftValue - rightValue;
}

export function toSwatchColor(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "#CBD5E1";
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return "#CBD5E1";
}

function hexToRgb(raw?: string | null): [number, number, number] | null {
  const normalized = toSwatchColor(raw).replace("#", "");
  if (normalized.length === 3) {
    const expanded = normalized
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  return null;
}

function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

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

function swatchTextColor(raw: string | null | undefined): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "#FFFFFF";
  }
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness >= 170 ? "#0F172A" : "#FFFFFF";
}

function blendSwatchColor(
  raw: string | null | undefined,
  target: [number, number, number],
  amount: number,
): string {
  const rgb = hexToRgb(raw) ?? [51, 65, 85];
  const mixed = rgb.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount),
  ) as [number, number, number];
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
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

export function commandErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
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

export function resolveLiveConnectionIndicator(
  liveConfig: BambuLiveIntegrationEntry["config"] | null,
  t: TranslateFn,
) {
  if (!liveConfig?.enabled) {
    return null;
  }

  const observedState = liveConfig.observed_state ?? null;
  const lastSeenAt = observedState?.last_seen_at ?? null;
  const stale = isOlderThanMinutes(lastSeenAt, 2);

  if (observedState?.mqtt_connected && !stale) {
    return {
      tone: "success" as const,
      label: t("printers.liveConnectionConnected", "Live connected"),
    };
  }

  if (lastSeenAt) {
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
  if ((slot.ams_id ?? "").endsWith("_ext")) {
    return null;
  }
  if (!slot.live_last_identity_seen_at && !slot.live_tray_uuid && !slot.live_match_status) {
    return null;
  }
  return {
    tray_index: slot.slot_index - 1,
    loaded: slot.live_loaded ?? !!slot.live_tray_uuid,
    filament_type: null,
    filament_name: null,
    color_hex: slot.live_color_hex ?? null,
    tray_weight_g: null,
    remaining_percent: null,
    remaining_grams: null,
    observed_rfid_tag: null,
    tray_uuid: slot.live_tray_uuid ?? null,
    chip_id: null,
    tray_info_idx: null,
    tray_id_name: null,
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
  if ((slot.ams_id ?? "").endsWith("_ext")) {
    return { liveConfig, tray: null };
  }
  const tray =
    liveConfig?.observed_state?.trays.find((candidate) => candidate.tray_index === slot.slot_index - 1) ??
    slotLiveTrayFallback(slot, clientReadOnly, clientPrinterSource);
  return { liveConfig, tray };
}
