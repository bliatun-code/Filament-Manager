import { neutralChipClass, semanticChipClass } from "./chip_styles";
import type { Locale } from "./i18n";
export {
  assessRfidCaptureMatch,
  rfidCaptureMatchMeta,
  type RfidCaptureMatchConfidence,
} from "./inventory_rfid_match";
export {
  buildObservedTrayCaptureSnapshot,
  buildObservedTrayCaptureSnapshotFromHostSlot,
  hasHostRfidCaptureData,
} from "./inventory_rfid_sources";
export {
  buildBaselineCaptureFieldsBySlotId,
  buildRfidCaptureSlotSummaries,
  buildSelectedRfidCaptureSnapshot,
  filterRfidCaptureSlots,
  latestRfidCaptureSeenAt,
  mergeRfidCaptureFields,
  resolveRfidCaptureLiveIntegration,
  selectRfidCaptureSlot,
  supportsRfidCapture,
} from "./inventory_rfid_selection";
export {
  extractRfidCaptureFields,
  flattenCaptureFields,
  normalizeCapturedHexColor,
  normalizeCapturedRfidTag,
  summarizeRfidCapture,
} from "./inventory_rfid_payload";

export type RfidCaptureField = {
  path: string;
  label: string;
  valueText: string;
  lastSeenAt: string;
  receiveCount: number;
  changeCount: number;
};

export type RfidCaptureSummary = {
  rfidTag?: string | null;
  tagUid?: string | null;
  trayUuid?: string | null;
  chipId?: string | null;
  trayInfoIdx?: string | null;
  trayIdName?: string | null;
  material?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
  trayWeightG?: string | null;
  trayColorRaw?: string | null;
  trayReadDoneBits?: string | null;
  trayIsBblBits?: string | null;
  amsRfidStatus?: string | null;
};

export type RfidObservedTraySnapshot = {
  observedAt: string | null;
  fields: RfidCaptureField[];
};

export type IdentityFreshness = "FRESH" | "AGED" | "MISSING";

export type RfidCaptureHostSlotLike = {
  amsId: string;
  slotId: string;
  slotIndex: number;
  liveLoaded?: boolean | null;
  liveObservedRfidTag?: string | null;
  liveTrayUuid?: string | null;
  liveChipId?: string | null;
  liveTrayInfoIdx?: string | null;
  liveTrayIdName?: string | null;
  liveFilamentType?: string | null;
  liveFilamentName?: string | null;
  liveColorHex?: string | null;
  liveTrayWeightG?: number | null;
  liveRemainingPercent?: number | null;
  liveLastIdentitySeenAt?: string | null;
  livePrinterLastSeenAt?: string | null;
  liveAmsReadDoneBits?: string | null;
  liveAmsBambuBits?: string | null;
};

export type RfidCapturePrinterSlotLike = RfidCaptureHostSlotLike & {
  printerId: string;
};

export function formatCaptureTimestamp(raw: string, locale: Locale): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export function getIdentityFreshness(
  rfidTag: string | null | undefined,
  observedAt: string | null | undefined,
): IdentityFreshness {
  if (!(rfidTag?.trim()) || !(observedAt?.trim())) {
    return "MISSING";
  }
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "AGED";
  }
  const ageMs = Date.now() - parsed.getTime();
  return ageMs <= 1000 * 60 * 60 * 24 * 7 ? "FRESH" : "AGED";
}

export function formatObservedAge(raw: string | null | undefined, locale: Locale): string {
  if (!(raw?.trim())) {
    return "—";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 60_000) {
    return locale === "nb" ? "nå nettopp" : "just now";
  }
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return locale === "nb" ? `${diffMinutes} min siden` : `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return locale === "nb" ? `${diffHours} t siden` : `${diffHours} h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return locale === "nb" ? `${diffDays} dager siden` : `${diffDays} days ago`;
}

export function identityFreshnessCopy(
  freshness: IdentityFreshness,
  t: (key: string, fallback: string) => string,
): { label: string; className: string } {
  switch (freshness) {
    case "FRESH":
      return {
        label: t("inventory.rfidFresh", "Fresh"),
        className: semanticChipClass("success"),
      };
    case "AGED":
      return {
        label: t("inventory.rfidAged", "Aged"),
        className: semanticChipClass("warning"),
      };
    default:
      return {
        label: t("inventory.rfidMissing", "Missing"),
        className: neutralChipClass(false),
      };
  }
}
