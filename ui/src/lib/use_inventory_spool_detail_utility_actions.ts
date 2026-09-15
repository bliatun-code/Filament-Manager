import { useCallback, useLayoutEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";
import type { RfidCaptureSummary } from "./inventory_rfid_capture";
import { updateInventorySpoolRfidTag } from "./spool_writes";
import {
  filamentLabelSizeFilenameSuffix,
  type FilamentLabelSize,
} from "./filament_label_profiles";
import { exportLabelPng, type BambuLiveIntegrationSettings } from "./tauri_client";
import type { InventoryReloadReporter } from "./use_inventory_page_data";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type InventorySpoolDetailUtilityActionsInput = {
  active: boolean;
  ready: boolean;
  captureOpen: boolean;
  selectedRfidCaptureSlotId: string | null;
  clientTargetGeneration: number | null;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  closeRfidCaptureModal: () => void;
  ensureLocalWriteAllowed: () => boolean;
  manageBusy: boolean;
  openRfidCaptureModal: () => void;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
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
  active, ready, captureOpen, selectedRfidCaptureSlotId, clientTargetGeneration,
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
  const scopeKey = JSON.stringify([active, ready, selectedSpool?.id, clientReadOnly,
    clientHostBaseUrl, clientLibraryId, clientTargetGeneration]);
  const scope = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const captureKey = JSON.stringify([captureOpen, selectedRfidCaptureSlotId,
    rfidCaptureSummary.rfidTag, rfidCaptureLastSeenAt,
    selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at]);
  const capture = useMemo(() => ({ key: captureKey }), [captureKey]);
  const captureStart = useRef<object | null>(null);
  useLayoutEffect(() => { if (!captureOpen) captureStart.current = null; }, [captureOpen]);
  const consumedCaptures = useRef(new WeakSet<object>());
  const current = useRef<{ scope: object; busy: boolean } | null>(null);
  const latest = useRef({ capture, manageBusy, tauriAvailable, ensureLocalWriteAllowed, canUseClientHostWrite });
  useLayoutEffect(() => { latest.current = { capture, manageBusy, tauriAvailable, ensureLocalWriteAllowed, canUseClientHostWrite }; }, [capture, manageBusy, tauriAvailable, ensureLocalWriteAllowed, canUseClientHostWrite]);
  useLayoutEffect(() => {
    const operation = { scope, busy: false };
    current.current = operation;
    captureStart.current = null;
    return () => { current.current = null; if (operation.busy) setManageBusy(false); };
  }, [scope, setManageBusy]);
  const available = useCallback(() => active && ready && selectedSpool && tauriAvailable && !manageBusy &&
    current.current?.scope === scope && !current.current.busy && !latest.current.manageBusy && latest.current.tauriAvailable,
    [active, ready, selectedSpool, tauriAvailable, manageBusy, scope]);

  const handlePrintLabel = useCallback(async (
    labelSize: FilamentLabelSize,
    pngDataUrl: string,
  ) => {
    if (!available() || !selectedSpool) {
      return;
    }
    const operation = current.current!;
    operation.busy = true;
    setManageBusy(true);
    setError(null);
    setInfoMessage(null);
    try {
      const reference = selectedSpool.id.replace(/^spool_/, "").slice(-6) || "spool";
      const exportedPath = await exportLabelPng(
        pngDataUrl,
        `filament-label-${reference}-${filamentLabelSizeFilenameSuffix(labelSize)}`,
      );
      if (current.current !== operation) return;
      setInfoMessage(
        t("inventory.labelSaved", "Label PNG saved to Downloads.").replace(
          "{path}",
          exportedPath,
        ),
      );
    } catch (printError) {
      if (current.current !== operation) return;
      setError(
        commandErrorText(
          printError,
          t("inventory.error.printLabel", "Failed to generate label."),
          t,
        ),
      );
    } finally {
      if (current.current === operation) { operation.busy = false; setManageBusy(false); }
    }
  }, [
    available, setManageBusy,
    selectedSpool,
    setError,
    setInfoMessage,
    t,
  ]);

  const handleStartRfidCapture = useCallback(() => {
    if (!available() || captureOpen || captureStart.current) return;
    const request = {};
    captureStart.current = request;
    setSelectedRfidCaptureSlotId(
      selectedSpoolAssignedSlot?.slotId ?? selectedSpoolRfidCaptureSlots[0]?.slotId ?? null,
    );
    setRfidCaptureError(null);
    setShowRfidCapturedFields(false);
    const operation = current.current;
    void Promise.resolve().then(() => reloadPrinterOverview()).catch(() => {
      if (current.current === operation && captureStart.current === request) {
        setRfidCaptureError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
    }).finally(() => { if (captureStart.current === request) captureStart.current = null; });
    openRfidCaptureModal();
  }, [
    available, captureOpen, t,
    openRfidCaptureModal,
    reloadPrinterOverview,
    selectedSpoolAssignedSlot,
    selectedSpoolRfidCaptureSlots,
    setRfidCaptureError,
    setSelectedRfidCaptureSlotId,
    setShowRfidCapturedFields,
  ]);

  const handleSaveCapturedRfid = useCallback(async () => {
    if (!available() || !selectedSpool || !captureOpen || latest.current.capture !== capture || consumedCaptures.current.has(capture)) {
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
    if (!clientReadOnly && !latest.current.ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !latest.current.canUseClientHostWrite()) {
      return;
    }

    if (clientReadOnly && (!Number.isSafeInteger(clientTargetGeneration) || clientTargetGeneration! < 0)) return;
    const operation = current.current!;
    const isCurrent = () => current.current === operation;
    operation.busy = true;
    setManageBusy(true);
    setError(null);
    setRfidCaptureError(null);
    setInfoMessage(null);
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
        { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration },
      );
      if (!isCurrent()) return;
      consumedCaptures.current.add(capture);
      setInfoMessage(t("inventory.rfidSaved", "RFID tag saved on the selected roll."));
      let refreshFailed = false;
      const report: InventoryReloadReporter = (_domain, resolution) => {
        if (resolution !== "LIVE" && resolution !== "SUPERSEDED") refreshFailed = true;
      };
      const results = await Promise.allSettled([
        () => reloadSpools(report), () => reloadPrinterOverview(report), () => reloadSpoolDetail(selectedSpool.id),
      ].map(reload => Promise.resolve().then(reload)));
      if (!isCurrent()) return;
      if (refreshFailed || results.some(result => result.status === "rejected")) {
        setError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
      if (latest.current.capture === capture) closeRfidCaptureModal();
    } catch (saveError) {
      if (!isCurrent() || latest.current.capture !== capture) return;
      setRfidCaptureError(
        commandErrorText(saveError, t("inventory.error.saveRfid", "Failed to save RFID tag.")),
      );
    } finally {
      if (isCurrent()) { operation.busy = false; setManageBusy(false); }
    }
  }, [
    available, captureOpen, capture, clientTargetGeneration,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    closeRfidCaptureModal,
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
  ]);

  return {
    handlePrintLabel,
    handleSaveCapturedRfid,
    handleStartRfidCapture,
  };
}
