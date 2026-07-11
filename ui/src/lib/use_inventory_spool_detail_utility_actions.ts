import { useCallback, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";
import type { RfidCaptureSummary } from "./inventory_rfid_capture";
import { updateInventorySpoolRfidTag } from "./spool_writes";
import type { FilamentLabelProfileId } from "./filament_label_profiles";
import { exportLabelPng, type BambuLiveIntegrationSettings } from "./tauri_client";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type InventorySpoolDetailUtilityActionsInput = {
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  closeRfidCaptureModal: () => void;
  ensureLocalWriteAllowed: () => boolean;
  manageBusy: boolean;
  openRfidCaptureModal: () => void;
  reloadPrinterOverview: () => Promise<void>;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  reloadSpools: () => Promise<void>;
  rfidCaptureLastSeenAt: string | null;
  rfidCaptureSummary: RfidCaptureSummary;
  selectedRfidCaptureLiveIntegration: BambuLiveIntegrationSettings | null;
  selectedSpool: InventorySpool | null;
  selectedSpoolAssignedSlot: InventoryPrinterSlotOption | null;
  selectedSpoolRfidCaptureSlots: InventoryPrinterSlotOption[];
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  setRfidCaptureError: Dispatch<SetStateAction<string | null>>;
  setSelectedRfidCaptureSlotId: Dispatch<SetStateAction<string | null>>;
  setShowRfidCapturedFields: Dispatch<SetStateAction<boolean>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventorySpoolDetailUtilityActions({
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  closeRfidCaptureModal,
  ensureLocalWriteAllowed,
  manageBusy,
  openRfidCaptureModal,
  reloadPrinterOverview,
  reloadSpoolDetail,
  reloadSpools,
  rfidCaptureLastSeenAt,
  rfidCaptureSummary,
  selectedRfidCaptureLiveIntegration,
  selectedSpool,
  selectedSpoolAssignedSlot,
  selectedSpoolRfidCaptureSlots,
  setError,
  setInfoMessage,
  setManageBusy,
  setRfidCaptureError,
  setSelectedRfidCaptureSlotId,
  setShowRfidCapturedFields,
  tauriAvailable,
  t,
}: InventorySpoolDetailUtilityActionsInput) {
  const handlePrintLabel = useCallback(async (
    profileId: FilamentLabelProfileId,
    pngDataUrl: string,
  ) => {
    if (!tauriAvailable || !selectedSpool) {
      return;
    }
    try {
      const reference = selectedSpool.id.replace(/^spool_/, "").slice(-6) || "spool";
      const exportedPath = await exportLabelPng(
        pngDataUrl,
        `filament-label-${reference}-${profileId}`,
      );
      setInfoMessage(
        t("inventory.labelSaved", "Label PNG saved to Downloads.").replace(
          "{path}",
          exportedPath,
        ),
      );
    } catch (printError) {
      console.error(printError);
      setError(
        commandErrorText(
          printError,
          t("inventory.error.printLabel", "Failed to generate label."),
          t,
        ),
      );
    }
  }, [
    selectedSpool,
    setError,
    setInfoMessage,
    t,
    tauriAvailable,
  ]);

  const handleStartRfidCapture = useCallback(() => {
    setSelectedRfidCaptureSlotId(
      selectedSpoolAssignedSlot?.slotId ?? selectedSpoolRfidCaptureSlots[0]?.slotId ?? null,
    );
    setRfidCaptureError(null);
    setShowRfidCapturedFields(false);
    void reloadPrinterOverview();
    openRfidCaptureModal();
  }, [
    openRfidCaptureModal,
    reloadPrinterOverview,
    selectedSpoolAssignedSlot,
    selectedSpoolRfidCaptureSlots,
    setRfidCaptureError,
    setSelectedRfidCaptureSlotId,
    setShowRfidCapturedFields,
  ]);

  const handleSaveCapturedRfid = useCallback(async () => {
    if (!selectedSpool || !tauriAvailable || manageBusy) {
      return;
    }
    const nextRfidTag = rfidCaptureSummary.rfidTag?.trim() ?? "";
    if (!nextRfidTag) {
      setRfidCaptureError(
        t(
          "inventory.rfidCaptureNothingToSave",
          "No non-empty RFID tag has been observed for this slot yet.",
        ),
      );
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    setManageBusy(true);
    setError(null);
    try {
      const observedAt =
        rfidCaptureLastSeenAt ??
        selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at ??
        new Date().toISOString();
      await updateInventorySpoolRfidTag(
        {
          spool_id: selectedSpool.id,
          rfid_tag: nextRfidTag,
          rfid_observed_at: observedAt,
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.rfidSaved", "RFID tag saved on the selected roll."));
      closeRfidCaptureModal();
    } catch (saveError) {
      console.error(saveError);
      setRfidCaptureError(
        commandErrorText(saveError, t("inventory.error.saveRfid", "Failed to save RFID tag.")),
      );
    } finally {
      setManageBusy(false);
    }
  }, [
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    closeRfidCaptureModal,
    ensureLocalWriteAllowed,
    manageBusy,
    reloadSpoolDetail,
    reloadSpools,
    reloadPrinterOverview,
    rfidCaptureLastSeenAt,
    rfidCaptureSummary.rfidTag,
    selectedRfidCaptureLiveIntegration,
    selectedSpool,
    setError,
    setInfoMessage,
    setManageBusy,
    setRfidCaptureError,
    t,
    tauriAvailable,
  ]);

  return {
    handlePrintLabel,
    handleSaveCapturedRfid,
    handleStartRfidCapture,
  };
}
