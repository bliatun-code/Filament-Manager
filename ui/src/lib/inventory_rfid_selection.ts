import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "./tauri_client";
import {
  buildObservedTrayCaptureSnapshot,
  buildObservedTrayCaptureSnapshotFromHostSlot,
  hasHostRfidCaptureData,
} from "./inventory_rfid_sources";
import { summarizeRfidCapture } from "./inventory_rfid_payload";
import type {
  RfidCaptureField,
  RfidCapturePrinterSlotLike,
  RfidCaptureSummary,
  RfidObservedTraySnapshot,
} from "./inventory_rfid_capture";

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
