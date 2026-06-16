import type { BambuLiveIntegrationSettings } from "./tauri_client";
import { buildObservedTrayCaptureSnapshot } from "./inventory_rfid_sources";
import {
  extractRfidCaptureFields,
  type RfidCaptureField,
  type RfidCapturePrinterSlotLike,
} from "./inventory_rfid_capture";

export type RfidCaptureRefreshSlot = Pick<
  RfidCapturePrinterSlotLike,
  "amsId" | "slotId" | "slotIndex"
>;

function toCaptureField(
  field: { path: string; label: string; valueText: string },
  observedAt: string,
): RfidCaptureField {
  return {
    path: field.path,
    label: field.label,
    valueText: field.valueText,
    lastSeenAt: observedAt,
    receiveCount: 1,
    changeCount: 1,
  };
}

export function buildRfidCaptureRefreshFieldsBySlot(
  slots: readonly RfidCaptureRefreshSlot[],
  liveIntegration: BambuLiveIntegrationSettings | null | undefined,
  observedAt = new Date().toISOString(),
): Array<{ slotId: string; captured: RfidCaptureField[] }> {
  const observedState = liveIntegration?.observed_state ?? null;
  const rawPayload = observedState?.raw_payload_json;
  return slots.map((slot) => {
    const rawFields = rawPayload
      ? extractRfidCaptureFields(rawPayload, slot.slotIndex).map((field) =>
          toCaptureField(field, observedAt),
        )
      : [];
    const rawPaths = new Set(rawFields.map((field) => field.path));
    const snapshotFields =
      buildObservedTrayCaptureSnapshot(liveIntegration, slot.slotIndex, slot.amsId)?.fields ?? [];
    const captured = [
      ...rawFields,
      ...snapshotFields.filter((field) => !rawPaths.has(field.path)),
    ].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    return {
      slotId: slot.slotId,
      captured,
    };
  });
}
