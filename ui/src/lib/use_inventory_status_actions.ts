import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { commandErrorText, createAppError } from "./error_text";
import type { useI18n } from "./i18n";
import { normalizeStatus, type InventorySpool } from "./inventory_list_model";
import { canRefillSpoolStatus, nextLostToggleStatus } from "./inventory_spool_detail_actions_model";
import { executeInventoryBulkMutation, executeLibrarySyncHostInventoryBulkMutation,
  type InventoryRollStatusCommand } from "./tauri_inventory_client";
import type { InventoryReloadReporter } from "./use_inventory_page_data";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type Input = {
  selectedSpool: InventorySpool | null;
  assignedSlot: InventoryPrinterSlotOption | null;
  activeLoan: boolean;
  loanedOut: boolean;
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
  tauriAvailable: boolean;
  manageBusy: boolean;
  canUseClientHostWrite: () => boolean;
  ensureLocalWriteAllowed: () => boolean;
  cancelDangerZoneConfirmation: () => void;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadSpoolDetail: (id: string, report?: InventoryReloadReporter) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryStatusActions(input: Input) {
  const { selectedSpool, setManageBusy } = input;
  const viewKey = JSON.stringify([selectedSpool?.id, input.clientReadOnly,
    input.clientHostBaseUrl, input.clientLibraryId, input.clientTargetGeneration]);
  const snapshotKey = JSON.stringify([selectedSpool?.status, selectedSpool?.locationId,
    selectedSpool?.homeLocationId, selectedSpool?.remainingGrams,
    input.assignedSlot?.slotId, input.activeLoan, input.loanedOut]);
  const snapshot = useMemo(() => ({ key: snapshotKey }), [snapshotKey]);
  const view = useMemo(() => ({ key: viewKey }), [viewKey]);
  const currentScope = useRef<{ view: typeof view; busy: boolean; committedSnapshot: object | null } | null>(null);
  const currentSnapshot = useRef(snapshot);
  const [statusError, setStatusError] = useState<string | null>(null);
  useLayoutEffect(() => { currentSnapshot.current = snapshot; }, [snapshot]);
  useLayoutEffect(() => {
    const scope = { view, busy: false, committedSnapshot: null as object | null };
    currentScope.current = scope;
    setStatusError(null);
    return () => {
      currentScope.current = null;
      if (scope.busy) setManageBusy(false);
    };
  }, [view, setManageBusy]);
  useLayoutEffect(() => {
    if (input.manageBusy && !currentScope.current?.busy) setStatusError(null);
  }, [input.manageBusy]);

  async function changeStatus(refill: boolean) {
    const scope = currentScope.current;
    const isCurrent = () => currentScope.current === scope && scope?.view === view;
    if (!scope || !selectedSpool || !input.tauriAvailable || input.manageBusy || !isCurrent() || scope.busy ||
      currentSnapshot.current !== snapshot || scope.committedSnapshot === snapshot) return;
    if (input.clientReadOnly ? !input.canUseClientHostWrite() : !input.ensureLocalWriteAllowed()) return;
    const { t } = input;
    if (input.loanedOut) {
      setStatusError(t("errors.loanedSpoolEditBlocked", "Return the active outbound loan before changing status, location, or ownership for this roll."));
      return;
    }
    if (refill && !canRefillSpoolStatus(selectedSpool.status)) return;
    if (refill && (selectedSpool.remainingGrams ?? 0) <= 0) {
      setStatusError(t("inventory.error.refillRequiresWeight", "Set measured total weight above empty spool weight before reactivating."));
      return;
    }
    const targetStatus = refill ? "IN_STOCK" : nextLostToggleStatus(selectedSpool.status);
    const command: InventoryRollStatusCommand = {
      action: "ROLL_STATUS", target_status: targetStatus,
      expected_slot_id: input.assignedSlot?.slotId ?? null,
      spool: {
        spool_id: selectedSpool.id, expected_status: normalizeStatus(selectedSpool.status),
        expected_location_id: selectedSpool.locationId ?? null,
        expected_home_location_id: selectedSpool.homeLocationId ?? null,
        expected_active_loan: input.activeLoan, expected_assigned_to_printer: input.assignedSlot !== null,
      },
    };
    input.cancelDangerZoneConfirmation();
    scope.busy = true;
    setManageBusy(true);
    setStatusError(null);
    input.setError(null);
    input.setInfoMessage(null);
    try {
      try {
        if (input.clientReadOnly && (!input.clientHostBaseUrl || !input.clientLibraryId ||
          input.clientTargetGeneration === null)) throw createAppError("common.invalid_request");
        const receipt = input.clientReadOnly
          ? await executeLibrarySyncHostInventoryBulkMutation(input.clientHostBaseUrl!, input.clientLibraryId,
            command, input.clientTargetGeneration!)
          : await executeInventoryBulkMutation(command);
        if (!receipt.committed || ![0, 1].includes(receipt.affected_count) ||
          receipt.history_spool_count !== receipt.affected_count) throw createAppError("common.internal");
      } catch (error) {
        if (isCurrent()) setStatusError(commandErrorText(error, refill
          ? t("inventory.error.refill", "Failed to reactivate roll.")
          : t("inventory.error.toggleLost", "Failed to update lost status."), t));
        return;
      }
      if (!isCurrent()) return;
      scope.committedSnapshot = snapshot;
      input.setInfoMessage(refill ? t("inventory.refilled", "Roll reactivated and ready for use.")
        : targetStatus === "LOST" ? t("inventory.markedLost", "Roll marked as lost.")
        : t("inventory.markedFound", "Roll restored to in stock."));
      let failed = false;
      const report: InventoryReloadReporter = (_domain, resolution) => {
        if (resolution !== "LIVE" && resolution !== "SUPERSEDED") failed = true;
      };
      const results = await Promise.allSettled([input.reloadSpools(report),
        input.reloadPrinterOverview(report), input.reloadSpoolDetail(selectedSpool.id, report)]);
      if (isCurrent() && (failed || results.some(result => result.status === "rejected"))) {
        setStatusError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
    } finally {
      if (isCurrent()) { scope.busy = false; setManageBusy(false); }
    }
  }
  return {
    handleToggleLostStatus: () => changeStatus(false),
    handleRefillSpool: () => changeStatus(true),
    statusError,
    clearStatusError: () => setStatusError(null),
  };
}
