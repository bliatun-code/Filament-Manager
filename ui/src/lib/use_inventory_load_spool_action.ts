import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import {
  availableInventoryLoadSlots,
  prepareInventoryLoadSpoolAssignment,
} from "./inventory_load_spool_model";
import type { InventorySpool } from "./inventory_list_model";
import { writePrinterSlotAssignment } from "./printer_slot_writes";
import { formatPrinterSlotLabelForModel } from "./printer_profiles";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type RunInventoryLoadSpoolAssignmentInput = {
  isCurrent: () => boolean;
  onError: (error: unknown) => void;
  onSettled: () => void;
  onSuccess: (message: string) => void;
  reload: () => Promise<void>;
  slot: InventoryPrinterSlotOption;
  t: ReturnType<typeof useI18n>["t"];
  write: () => Promise<void>;
};

export async function runInventoryLoadSpoolAssignment({
  isCurrent,
  onError,
  onSettled,
  onSuccess,
  reload,
  slot,
  t,
  write,
}: RunInventoryLoadSpoolAssignmentInput): Promise<void> {
  if (!isCurrent()) {
    return;
  }
  const slotLabel = `${slot.printerName} · ${formatPrinterSlotLabelForModel(t, slot.printerModel, {
    ams_id: slot.amsId,
    slot_index: slot.slotIndex,
  })}`;
  const message = t("inventory.loadedInPrinter", "Roll loaded in {slot}.", { slot: slotLabel });
  try {
    await write();
    if (!isCurrent()) {
      return;
    }
    await reload();
    if (isCurrent()) {
      onSuccess(message);
    }
  } catch (error) {
    if (isCurrent()) {
      onError(error);
    }
  } finally {
    if (isCurrent()) {
      onSettled();
    }
  }
}

type UseInventoryLoadSpoolActionInput = {
  assignedSlot: InventoryPrinterSlotOption | null;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  clientTargetGeneration: number | null;
  ensureLocalWriteAllowed: () => boolean;
  loanedOut: boolean;
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
  clientTargetGeneration,
  ensureLocalWriteAllowed,
  loanedOut,
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
  const scopeKey = JSON.stringify([
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    selectedSpool?.id,
  ]);
  const actionScopeRef = useRef<{ key: string; busy: boolean } | null>(null);
  useLayoutEffect(() => {
    const actionScope = { key: scopeKey, busy: false };
    actionScopeRef.current = actionScope;
    return () => {
      actionScopeRef.current = null;
      if (actionScope.busy) {
        // Release this operation at the scope boundary, before a later action can own busy.
        actionScope.busy = false;
        setManageBusy(false);
      }
    };
  }, [scopeKey, setManageBusy]);
  const availableSlots = useMemo(
    () => availableInventoryLoadSlots(printerSlots),
    [printerSlots],
  );
  const canLoadSelectedSpool = Boolean(
    selectedSpool &&
      prepareInventoryLoadSpoolAssignment({
        assignedSlot,
        availableSlots,
        loanedOut,
        selectedSlotId: availableSlots[0]?.slotId ?? "",
        spool: selectedSpool,
      }).ok,
  );

  const openLoadSpoolModal = useCallback(() => {
    const actionScope = actionScopeRef.current;
    if (
      !tauriAvailable || manageBusy || !selectedSpool ||
      !actionScope || actionScope.key !== scopeKey || actionScope.busy
    ) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (loanedOut) {
      setError(
        t(
          "errors.loanedSpoolEditBlocked",
          "Return the active outbound loan before changing status, location, or ownership for this roll.",
        ),
      );
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
    loanedOut,
    manageBusy,
    selectedSpool,
    scopeKey,
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
    const actionScope = actionScopeRef.current;
    if (
      !tauriAvailable || manageBusy || !selectedSpool ||
      !actionScope || actionScope.key !== scopeKey || actionScope.busy
    ) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (loanedOut) {
      setError(
        t(
          "errors.loanedSpoolEditBlocked",
          "Return the active outbound loan before changing status, location, or ownership for this roll.",
        ),
      );
      return;
    }
    const prepared = prepareInventoryLoadSpoolAssignment({
      assignedSlot,
      availableSlots,
      loanedOut,
      selectedSlotId: slotId,
      spool: selectedSpool,
    });
    const selectedSlot = availableSlots.find((slot) => slot.slotId === slotId);
    if (!prepared.ok || !selectedSlot) {
      setError(
        t(
          "inventory.error.loadInPrinterStale",
          "The selected printer slot is no longer available. Refresh and choose another slot.",
        ),
      );
      return;
    }

    actionScope.busy = true;
    setManageBusy(true);
    setError(null);
    await runInventoryLoadSpoolAssignment({
      isCurrent: () => actionScopeRef.current === actionScope,
      slot: selectedSlot,
      t,
      write: () => writePrinterSlotAssignment(
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
        prepared.input,
      ),
      reload: async () => {
        await Promise.all([
          reloadSpools(),
          reloadPrinterOverview(),
          reloadSpoolDetail(selectedSpool.id),
        ]);
      },
      onSuccess: (message) => {
        setInfoMessage(message);
        setOpen(false);
      },
      onError: (loadError) => {
        console.error(loadError);
        setError(
          commandErrorText(
            loadError,
            t("inventory.error.loadInPrinter", "This roll cannot be loaded in a printer slot."),
            t,
          ),
        );
      },
      onSettled: () => {
        actionScope.busy = false;
        setManageBusy(false);
      },
    });
  }, [
    assignedSlot,
    availableSlots,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
    loanedOut,
    manageBusy,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    selectedSpool,
    scopeKey,
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
