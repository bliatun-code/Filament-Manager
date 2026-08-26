import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import {
  availableInventoryLoadSlots,
  prepareInventoryLoadSpoolAssignment,
} from "./inventory_load_spool_model";
import type { InventorySpool } from "./inventory_list_model";
import { writePrinterSlotAssignment } from "./printer_slot_writes";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type UseInventoryLoadSpoolActionInput = {
  assignedSlot: InventoryPrinterSlotOption | null;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  ensureLocalWriteAllowed: () => boolean;
  manageBusy: boolean;
  printerSlots: InventoryPrinterSlotOption[];
  reloadPrinterOverview: () => Promise<void>;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  reloadSpools: () => Promise<void>;
  selectedSpool: InventorySpool | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryLoadSpoolAction({
  assignedSlot,
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  ensureLocalWriteAllowed,
  manageBusy,
  printerSlots,
  reloadPrinterOverview,
  reloadSpoolDetail,
  reloadSpools,
  selectedSpool,
  setError,
  setInfoMessage,
  setManageBusy,
  tauriAvailable,
  t,
}: UseInventoryLoadSpoolActionInput) {
  const [open, setOpen] = useState(false);
  const availableSlots = useMemo(
    () => availableInventoryLoadSlots(printerSlots),
    [printerSlots],
  );
  const canLoadSelectedSpool = Boolean(
    selectedSpool &&
      prepareInventoryLoadSpoolAssignment({
        assignedSlot,
        availableSlots,
        selectedSlotId: availableSlots[0]?.slotId ?? "",
        spool: selectedSpool,
      }).ok,
  );

  const openLoadSpoolModal = useCallback(() => {
    if (!tauriAvailable || manageBusy || !selectedSpool) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!canLoadSelectedSpool) {
      setError(
        availableSlots.length === 0
          ? t("inventory.noAvailablePrinterSlots", "No empty printer slots are available.")
          : t("inventory.error.loadInPrinter", "This roll cannot be loaded in a printer slot."),
      );
      return;
    }
    setError(null);
    setOpen(true);
  }, [
    availableSlots.length,
    canLoadSelectedSpool,
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    manageBusy,
    selectedSpool,
    setError,
    t,
    tauriAvailable,
  ]);

  const closeLoadSpoolModal = useCallback(() => {
    if (!manageBusy) {
      setOpen(false);
    }
  }, [manageBusy]);

  const confirmLoadSpool = useCallback(async (slotId: string) => {
    if (!tauriAvailable || manageBusy || !selectedSpool) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const prepared = prepareInventoryLoadSpoolAssignment({
      assignedSlot,
      availableSlots,
      selectedSlotId: slotId,
      spool: selectedSpool,
    });
    if (!prepared.ok) {
      setError(
        t(
          "inventory.error.loadInPrinterStale",
          "The selected printer slot is no longer available. Refresh and choose another slot.",
        ),
      );
      return;
    }

    setManageBusy(true);
    setError(null);
    try {
      await writePrinterSlotAssignment(
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
        prepared.input,
      );
      await Promise.all([
        reloadSpools(),
        reloadPrinterOverview(),
        reloadSpoolDetail(selectedSpool.id),
      ]);
      setInfoMessage(t("inventory.loadedInPrinter", "Roll loaded in printer slot."));
      setOpen(false);
    } catch (loadError) {
      console.error(loadError);
      setError(
        commandErrorText(
          loadError,
          t("inventory.error.loadInPrinter", "This roll cannot be loaded in a printer slot."),
          t,
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }, [
    assignedSlot,
    availableSlots,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
    manageBusy,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    selectedSpool,
    setError,
    setInfoMessage,
    setManageBusy,
    t,
    tauriAvailable,
  ]);

  return {
    availableSlots,
    canLoadSelectedSpool,
    closeLoadSpoolModal,
    confirmLoadSpool,
    openLoadSpoolModal,
    showLoadSpoolModal: open,
  };
}
