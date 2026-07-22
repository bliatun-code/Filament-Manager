import { useMemo } from "react";
import { formatPrinterSlotLabelForModel } from "./printer_profiles";
import type { useI18n } from "./i18n";
import {
  assessRfidCaptureMatch,
  buildRfidCaptureSlotSummaries,
  buildSelectedRfidCaptureSnapshot,
  filterRfidCaptureSlots,
  getRfidBindingState,
  latestRfidCaptureSeenAt,
  mergeRfidCaptureFields,
  rfidBindingCopy,
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
  useObservedSlotFixture?: boolean;
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
  useObservedSlotFixture = false,
}: InventoryRfidCaptureViewModelInput) {
  const useObservedSlotSource = clientReadOnly || useObservedSlotFixture;
  const selectedSpoolRfidCaptureSlots = useMemo(
    () =>
      filterRfidCaptureSlots(printerSlotOptions, {
        assignedSlot: selectedSpoolAssignedSlot,
        clientReadOnly: useObservedSlotSource,
        liveIntegrations: bambuLiveIntegrations,
      }),
    [
      bambuLiveIntegrations,
      printerSlotOptions,
      selectedSpoolAssignedSlot,
      useObservedSlotSource,
    ],
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
        useObservedSlotSource,
        bambuLiveIntegrations,
      ),
    [bambuLiveIntegrations, selectedRfidCaptureSlot, useObservedSlotSource],
  );

  const selectedSpoolRfidBindingState = useMemo(
    () =>
      getRfidBindingState(
        selectedSpool?.rfidTag,
        selectedSpool?.rfidObservedAt,
        selectedSpool?.vendor,
      ),
    [selectedSpool],
  );

  const selectedSpoolRfidBindingMeta = useMemo(
    () => rfidBindingCopy(selectedSpoolRfidBindingState, t),
    [selectedSpoolRfidBindingState, t],
  );

  const selectedSpoolSupportsRfidCapture = useMemo(
    () =>
      supportsRfidCapture({
        tauriAvailable,
        captureSlotCount: selectedSpoolRfidCaptureSlots.length,
        clientReadOnly: useObservedSlotSource,
        selectedSlot: selectedRfidCaptureSlot,
        liveIntegration: selectedRfidCaptureLiveIntegration,
      }),
    [
      selectedRfidCaptureLiveIntegration,
      selectedRfidCaptureSlot,
      selectedSpoolRfidCaptureSlots.length,
      tauriAvailable,
      useObservedSlotSource,
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
        clientReadOnly: useObservedSlotSource,
        liveIntegration: selectedRfidCaptureLiveIntegration,
      }),
    [selectedRfidCaptureLiveIntegration, selectedRfidCaptureSlot, useObservedSlotSource],
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
        clientReadOnly: useObservedSlotSource,
        fieldsBySlotId: rfidCaptureFieldsBySlotId,
        liveIntegrations: bambuLiveIntegrations,
      }),
    [
      bambuLiveIntegrations,
      rfidCaptureFieldsBySlotId,
      selectedSpoolRfidCaptureSlots,
      useObservedSlotSource,
    ],
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
    selectedSpoolRfidBindingMeta,
    selectedSpoolRfidCaptureSlots,
    selectedSpoolRfidSlotLabel,
    selectedSpoolSupportsRfidCapture,
  };
}
