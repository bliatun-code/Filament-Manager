import { neutralChipClass, semanticChipClass } from "./chip_styles";
import type { Locale } from "./i18n";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "./tauri_client";
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
  extractRfidCaptureFields,
  flattenCaptureFields,
  normalizeCapturedHexColor,
  normalizeCapturedRfidTag,
  summarizeRfidCapture,
} from "./inventory_rfid_payload";
import {
  buildObservedTrayCaptureSnapshot,
  buildObservedTrayCaptureSnapshotFromHostSlot,
  hasHostRfidCaptureData,
} from "./inventory_rfid_sources";
import { summarizeRfidCapture } from "./inventory_rfid_payload";

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

export function filterRfidCaptureSlots<T extends RfidCapturePrinterSlotLike>(
  slots: readonly T[],
  options: {
    assignedSlot?: Pick<T, "printerId"> | null;
    clientReadOnly: boolean;
    liveIntegrations: Record<string, BambuLiveIntegrationSettings>;
  },
): T[] {
  const allEligible = options.clientReadOnly
    ? slots.filter((slot) => hasHostRfidCaptureData(slot))
    : slots.filter(
        (slot) =>
          Boolean(options.liveIntegrations[slot.printerId]?.enabled) &&
          !slot.amsId.endsWith("_ext"),
      );

  if (options.assignedSlot) {
    const samePrinter = allEligible.filter(
      (slot) => slot.printerId === options.assignedSlot?.printerId,
    );
    if (samePrinter.length > 0) {
      return samePrinter;
    }
  }
  return allEligible;
}

export function selectRfidCaptureSlot<T extends RfidCapturePrinterSlotLike>(
  slots: readonly T[],
  options: {
    selectedSlotId?: string | null;
    assignedSlot?: Pick<T, "slotId"> | null;
  },
): T | null {
  if (slots.length === 0) {
    return null;
  }
  if (options.selectedSlotId) {
    return slots.find((slot) => slot.slotId === options.selectedSlotId) ?? null;
  }
  if (options.assignedSlot) {
    return (
      slots.find((slot) => slot.slotId === options.assignedSlot?.slotId) ??
      slots[0] ??
      null
    );
  }
  return slots[0] ?? null;
}

export function resolveRfidCaptureLiveIntegration(
  slot: RfidCapturePrinterSlotLike | null | undefined,
  clientReadOnly: boolean,
  liveIntegrations: Record<string, BambuLiveIntegrationSettings>,
): BambuLiveIntegrationSettings | null {
  if (!slot || clientReadOnly) {
    return null;
  }
  return liveIntegrations[slot.printerId] ?? null;
}

export function supportsRfidCapture(options: {
  tauriAvailable: boolean;
  captureSlotCount: number;
  clientReadOnly: boolean;
  selectedSlot?: RfidCapturePrinterSlotLike | null;
  liveIntegration?: BambuLiveIntegrationSettings | null;
}): boolean {
  if (!options.tauriAvailable || options.captureSlotCount === 0) {
    return false;
  }
  if (options.clientReadOnly) {
    return hasHostRfidCaptureData(options.selectedSlot);
  }
  return Boolean(options.liveIntegration?.enabled);
}

export function buildSelectedRfidCaptureSnapshot(
  slot: RfidCapturePrinterSlotLike | null | undefined,
  options: {
    clientReadOnly: boolean;
    liveIntegration?: BambuLiveIntegrationSettings | null;
  },
): RfidObservedTraySnapshot | null {
  if (!slot) {
    return null;
  }
  return options.clientReadOnly
    ? buildObservedTrayCaptureSnapshotFromHostSlot(slot)
    : buildObservedTrayCaptureSnapshot(options.liveIntegration ?? null, slot.slotIndex);
}

export function buildRfidCaptureSlotSummaries<T extends RfidCapturePrinterSlotLike>(
  slots: readonly T[],
  options: {
    clientReadOnly: boolean;
    fieldsBySlotId: Record<string, RfidCaptureField[]>;
    liveIntegrations: Record<string, BambuLiveIntegrationSettings>;
  },
): Record<string, RfidCaptureSummary> {
  const summaries: Record<string, RfidCaptureSummary> = {};
  for (const slot of slots) {
    const snapshot = options.clientReadOnly
      ? buildObservedTrayCaptureSnapshotFromHostSlot(slot)
      : buildObservedTrayCaptureSnapshot(
          options.liveIntegrations[slot.printerId] ?? null,
          slot.slotIndex,
        );
    const cachedFields = options.fieldsBySlotId[slot.slotId] ?? [];
    const mergedFields = mergeRfidCaptureFields(snapshot?.fields ?? [], cachedFields);
    summaries[slot.slotId] = summarizeRfidCapture(mergedFields, slot.slotIndex);
  }
  return summaries;
}

export function mergeRfidCaptureFields(
  baselineFields: RfidCaptureField[],
  capturedFields: RfidCaptureField[],
): RfidCaptureField[] {
  const merged = new Map<string, RfidCaptureField>();
  for (const field of baselineFields) {
    merged.set(field.path, field);
  }
  for (const field of capturedFields) {
    const existing = merged.get(field.path);
    if (!existing) {
      merged.set(field.path, field);
      continue;
    }
    const existingStamp = Date.parse(existing.lastSeenAt);
    const nextStamp = Date.parse(field.lastSeenAt);
    merged.set(
      field.path,
      Number.isNaN(nextStamp) || (!Number.isNaN(existingStamp) && existingStamp > nextStamp)
        ? existing
        : field,
    );
  }
  return Array.from(merged.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function buildBaselineCaptureFieldsBySlotId(
  printers: PrinterOverviewRow[],
  integrations: Record<string, BambuLiveIntegrationSettings>,
): Record<string, RfidCaptureField[]> {
  const next: Record<string, RfidCaptureField[]> = {};
  for (const printer of printers) {
    const integration = integrations[printer.printer.id];
    if (!integration?.enabled) {
      continue;
    }
    for (const slot of printer.slots) {
      if (slot.ams_id.endsWith("_ext")) {
        continue;
      }
      const snapshot = buildObservedTrayCaptureSnapshot(integration, slot.slot_index);
      if (snapshot?.fields.length) {
        next[slot.slot_id] = snapshot.fields;
      }
    }
  }
  return next;
}

export function latestRfidCaptureSeenAt(fields: RfidCaptureField[]): string | null {
  return [...fields].map((field) => field.lastSeenAt).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}
