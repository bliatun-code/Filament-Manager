import { useCallback, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import { buildFilamentLabelHtml } from "./filament_label_print";
import type { FilamentQrMode } from "./filament_qr_payload";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";
import type { RfidCaptureSummary } from "./inventory_rfid_capture";
import { updateInventorySpoolRfidTag } from "./spool_writes";
import type { SpoolQrArtifacts } from "./spool_qr_artifacts";
import { printLabelHtml, type BambuLiveIntegrationSettings } from "./tauri_client";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type InventorySpoolDetailUtilityActionsInput = {
  buildSelectedSpoolQrArtifacts: (
    spool: InventorySpool,
    qrMode?: FilamentQrMode,
  ) => Promise<SpoolQrArtifacts>;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  closeRfidCaptureModal: () => void;
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
  selectedSpoolQrMode: FilamentQrMode;
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
  buildSelectedSpoolQrArtifacts,
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  closeRfidCaptureModal,
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
  selectedSpoolQrMode,
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
  const handlePrintLabel = useCallback(async () => {
    if (!tauriAvailable || !selectedSpool) {
      return;
    }
    try {
      const { qrReference, qrPayload, qrDataUrl } = await buildSelectedSpoolQrArtifacts(
        selectedSpool,
        selectedSpoolQrMode,
      );
      const html = buildFilamentLabelHtml({
        vendor: selectedSpool.vendor,
        material: selectedSpool.material,
        filamentName: selectedSpool.filamentName,
        colorName: selectedSpool.colorName || null,
        homeLocation: selectedSpool.homeLocation ?? null,
        reference: qrReference,
        qrPayload,
        qrDataUrl,
        labels: {
          vendor: t("inventory.vendor", "Vendor"),
          material: t("inventory.material", "Material"),
          filament: t("inventory.filament", "Filament"),
          homeLocation: t("inventory.homeLocationLabel", "Home location"),
          reference: t("inventory.reference", "Reference"),
          qrPayload: t("inventory.qrPayload", "QR payload"),
        },
      });
      await printLabelHtml(html, null, 1);
    } catch (printError) {
      console.error(printError);
      setError(
        commandErrorText(printError, t("inventory.error.printLabel", "Failed to generate label.")),
      );
    }
  }, [
    buildSelectedSpoolQrArtifacts,
    selectedSpool,
    selectedSpoolQrMode,
    setError,
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

    setManageBusy(true);
    setError(null);
    try {
      const observedAt =
        rfidCaptureLastSeenAt ??
        selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at ??
        new Date().toISOString();
      if (clientReadOnly && !canUseClientHostWrite()) {
        return;
      }
      await updateInventorySpoolRfidTag(
        {
          spool_id: selectedSpool.id,
          rfid_tag: nextRfidTag,
          rfid_observed_at: observedAt,
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await reloadSpools();
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
    manageBusy,
    reloadSpoolDetail,
    reloadSpools,
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
