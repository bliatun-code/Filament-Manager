import { neutralChipClass, semanticChipClass } from "./chip_styles";
import { formatBambuSettingsProfileNameParts } from "./bambu_settings_profiles";
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
  decodeTrayExistBitsSlotPresence,
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
  trayExistBits?: string | null;
  trayPresentInAms?: boolean | null;
  trayReadDoneBits?: string | null;
  trayIsBblBits?: string | null;
  amsRfidStatus?: string | null;
};

export type RfidObservedTraySnapshot = {
  observedAt: string | null;
  fields: RfidCaptureField[];
};

export type RfidBindingState =
  | "LINKED_SEEN"
  | "LINKED_UNSEEN"
  | "BAMBU_UNREGISTERED"
  | "UNSUPPORTED_VENDOR";

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
  liveAmsExistBits?: string | null;
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

export function getRfidBindingState(
  rfidTag: string | null | undefined,
  observedAt: string | null | undefined,
  vendor: string | null | undefined,
): RfidBindingState {
  if (rfidTag?.trim()) {
    return observedAt?.trim() ? "LINKED_SEEN" : "LINKED_UNSEEN";
  }
  return isBambuRfidVendor(vendor) ? "BAMBU_UNREGISTERED" : "UNSUPPORTED_VENDOR";
}

export function isBambuRfidVendor(vendor: string | null | undefined): boolean {
  return vendor?.trim().toLowerCase().includes("bambu") ?? false;
}

export function formatRfidCapturePresetName(
  presetName: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string | null {
  const normalized = presetName?.trim();
  if (!normalized) {
    return null;
  }
  return formatBambuSettingsProfileNameParts(normalized, {
    nozzleSuffix: t("settings.bambuLivePresetNozzleSuffix", "mm nozzle"),
  }).join(" · ");
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

export function rfidBindingCopy(
  state: RfidBindingState,
  t: (key: string, fallback: string) => string,
): { label: string; hint: string; className: string } {
  switch (state) {
    case "LINKED_SEEN":
      return {
        label: t("inventory.rfidRegistered", "RFID registered"),
        hint: t(
          "inventory.rfidRegisteredHint",
          "This RFID stays tied to the Bambu roll until the roll is used up or the saved RFID is overwritten. The AMS sighting only shows when the printer last reported this identity.",
        ),
        className: semanticChipClass("success"),
      };
    case "LINKED_UNSEEN":
      return {
        label: t("inventory.rfidRegistered", "RFID registered"),
        hint: t(
          "inventory.rfidRegisteredUnseenHint",
          "An RFID is saved on this roll, but AMS has not reported a sighting timestamp for it yet.",
        ),
        className: semanticChipClass("success"),
      };
    case "BAMBU_UNREGISTERED":
      return {
        label: t("inventory.rfidBambuUnregistered", "RFID not registered yet"),
        hint: t(
          "inventory.rfidBambuUnregisteredHint",
          "Bambu rolls can be linked automatically by loading the roll in AMS and saving the observed RFID identity.",
        ),
        className: semanticChipClass("warning"),
      };
    default:
      return {
        label: t("inventory.rfidUnsupportedVendor", "AMS RFID not available"),
        hint: t(
          "inventory.rfidUnsupportedVendorHint",
          "AMS RFID identity is currently only exposed for Bambu rolls. Track this roll with QR, weight, location and printer assignment instead.",
        ),
        className: neutralChipClass(false),
      };
  }
}
