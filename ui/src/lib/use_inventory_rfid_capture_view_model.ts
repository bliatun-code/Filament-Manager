import { useMemo } from "react";
import { formatPrinterSlotLabelForModel } from "./printer_profiles";
import type { useI18n } from "./i18n";
import {
  assessRfidCaptureMatch,
  buildRfidCaptureSlotSummaries,
  buildSelectedRfidCaptureSnapshot,
  filterRfidCaptureSlots,
  getIdentityFreshness,
  identityFreshnessCopy,
  latestRfidCaptureSeenAt,
  mergeRfidCaptureFields,
  rfidCaptureMatchMeta,
  resolveRfidCaptureLiveIntegration,
  selectRfidCaptureSlot,
  summarizeRfidCapture,
  supportsRfidCapture,
  type RfidCaptureField,
} from "./inventory_rfid_capture";
import type { InventorySpool } from "./inventory_list_model";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";
import type { BambuLiveIntegrationSettings } from "./tauri_client";

type InventoryRfidCaptureViewModelInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationSettings>;
  clientReadOnly: boolean;
  printerSlotOptions: InventoryPrinterSlotOption[];
  rfidCaptureFieldsBySlotId: Record<string, RfidCaptureField[]>;
  selectedRfidCaptureSlotId: string | null;
  selectedSpool: InventorySpool | null;
  selectedSpoolAssignedSlot: InventoryPrinterSlotOption | null;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryRfidCaptureViewModel({
  bambuLiveIntegrations,
  clientReadOnly,
  printerSlotOptions,
  rfidCaptureFieldsBySlotId,
  selectedRfidCaptureSlotId,
  selectedSpool,
  selectedSpoolAssignedSlot,
  tauriAvailable,
  t,
}: InventoryRfidCaptureViewModelInput) {
  const selectedSpoolRfidCaptureSlots = useMemo(
    () =>
      filterRfidCaptureSlots(printerSlotOptions, {
        assignedSlot: selectedSpoolAssignedSlot,
        clientReadOnly,
        liveIntegrations: bambuLiveIntegrations,
      }),
    [bambuLiveIntegrations, clientReadOnly, printerSlotOptions, selectedSpoolAssignedSlot],
  );

  const selectedRfidCaptureSlot = useMemo(
    () =>
      selectRfidCaptureSlot(selectedSpoolRfidCaptureSlots, {
        selectedSlotId: selectedRfidCaptureSlotId,
        assignedSlot: selectedSpoolAssignedSlot,
      }),
    [selectedRfidCaptureSlotId, selectedSpoolAssignedSlot, selectedSpoolRfidCaptureSlots],
  );

  const selectedRfidCaptureLiveIntegration = useMemo(
    () =>
      resolveRfidCaptureLiveIntegration(
        selectedRfidCaptureSlot,
        clientReadOnly,
        bambuLiveIntegrations,
      ),
    [bambuLiveIntegrations, clientReadOnly, selectedRfidCaptureSlot],
  );

  const selectedSpoolIdentityFreshness = useMemo(
    () => getIdentityFreshness(selectedSpool?.rfidTag, selectedSpool?.rfidObservedAt),
    [selectedSpool],
  );

  const selectedSpoolIdentityFreshnessMeta = useMemo(
    () => identityFreshnessCopy(selectedSpoolIdentityFreshness, t),
    [selectedSpoolIdentityFreshness, t],
  );

  const selectedSpoolSupportsRfidCapture = useMemo(
    () =>
      supportsRfidCapture({
        tauriAvailable,
        captureSlotCount: selectedSpoolRfidCaptureSlots.length,
        clientReadOnly,
        selectedSlot: selectedRfidCaptureSlot,
        liveIntegration: selectedRfidCaptureLiveIntegration,
      }),
    [
      clientReadOnly,
      selectedRfidCaptureLiveIntegration,
      selectedRfidCaptureSlot,
      selectedSpoolRfidCaptureSlots.length,
      tauriAvailable,
    ],
  );

  const selectedSpoolRfidSlotLabel = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? formatPrinterSlotLabelForModel(t, selectedRfidCaptureSlot.printerModel, {
            ams_id: selectedRfidCaptureSlot.amsId,
            slot_index: selectedRfidCaptureSlot.slotIndex,
          })
        : null,
    [selectedRfidCaptureSlot, t],
  );

  const rfidCaptureFields = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? rfidCaptureFieldsBySlotId[selectedRfidCaptureSlot.slotId] ?? []
        : [],
    [rfidCaptureFieldsBySlotId, selectedRfidCaptureSlot],
  );

  const observedTrayCaptureSnapshot = useMemo(
    () =>
      buildSelectedRfidCaptureSnapshot(selectedRfidCaptureSlot, {
        clientReadOnly,
        liveIntegration: selectedRfidCaptureLiveIntegration,
      }),
    [clientReadOnly, selectedRfidCaptureLiveIntegration, selectedRfidCaptureSlot],
  );

  const effectiveRfidCaptureFields = useMemo(
    () => mergeRfidCaptureFields(observedTrayCaptureSnapshot?.fields ?? [], rfidCaptureFields),
    [observedTrayCaptureSnapshot, rfidCaptureFields],
  );

  const rfidCaptureLastSeenAt = useMemo(
    () =>
      latestRfidCaptureSeenAt(effectiveRfidCaptureFields) ??
      observedTrayCaptureSnapshot?.observedAt ??
      null,
    [effectiveRfidCaptureFields, observedTrayCaptureSnapshot],
  );

  const rfidCaptureSummary = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? summarizeRfidCapture(effectiveRfidCaptureFields, selectedRfidCaptureSlot.slotIndex)
        : {},
    [effectiveRfidCaptureFields, selectedRfidCaptureSlot],
  );

  const rfidCaptureSlotSummaries = useMemo(
    () =>
      buildRfidCaptureSlotSummaries(selectedSpoolRfidCaptureSlots, {
        clientReadOnly,
        fieldsBySlotId: rfidCaptureFieldsBySlotId,
        liveIntegrations: bambuLiveIntegrations,
      }),
    [bambuLiveIntegrations, clientReadOnly, rfidCaptureFieldsBySlotId, selectedSpoolRfidCaptureSlots],
  );

  const rfidCaptureMatchConfidence = useMemo(
    () => assessRfidCaptureMatch(selectedSpool, rfidCaptureSummary),
    [rfidCaptureSummary, selectedSpool],
  );

  const rfidCaptureMatchMetaForSelected = useMemo(
    () => rfidCaptureMatchMeta(rfidCaptureMatchConfidence, t),
    [rfidCaptureMatchConfidence, t],
  );

  return {
    effectiveRfidCaptureFields,
    observedTrayCaptureSnapshot,
    rfidCaptureFields,
    rfidCaptureLastSeenAt,
    rfidCaptureMatchMetaForSelected,
    rfidCaptureSlotSummaries,
    rfidCaptureSummary,
    selectedRfidCaptureLiveIntegration,
    selectedRfidCaptureSlot,
    selectedSpoolIdentityFreshnessMeta,
    selectedSpoolRfidCaptureSlots,
    selectedSpoolRfidSlotLabel,
    selectedSpoolSupportsRfidCapture,
  };
}
