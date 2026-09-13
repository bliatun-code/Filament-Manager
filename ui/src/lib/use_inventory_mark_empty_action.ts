import { useLayoutEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { commandErrorText, createAppError } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";
import { normalizeStatus } from "./inventory_list_model";
import {
  executeInventoryBulkMutation,
  executeLibrarySyncHostInventoryBulkMutation,
  type InventoryMarkEmptyCommand,
} from "./tauri_inventory_client";
import type { InventoryReloadReporter } from "./use_inventory_page_data";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type Input = {
  selectedSpool: InventorySpool | null;
  assignedSlot: InventoryPrinterSlotOption | null;
  loanedOut: boolean;
  activeLoan: boolean;
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
  tauriAvailable: boolean;
  manageBusy: boolean;
  canUseClientHostWrite: () => boolean;
  ensureLocalWriteAllowed: () => boolean;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadSpoolDetail: (id: string, report?: InventoryReloadReporter) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryMarkEmptyAction(input: Input) {
  const { selectedSpool, setManageBusy } = input;
  const key = JSON.stringify([
    selectedSpool?.id, selectedSpool?.status, input.clientReadOnly, input.clientHostBaseUrl,
    input.clientLibraryId, input.clientTargetGeneration,
  ]);
  const scopeRef = useRef<{ key: string; busy: boolean; committed: boolean } | null>(null);
  useLayoutEffect(() => {
    const scope = { key, busy: false, committed: false };
    scopeRef.current = scope;
    return () => {
      scopeRef.current = null;
      if (scope.busy) setManageBusy(false);
    };
  }, [key, setManageBusy]);

  return async function handleMarkEmpty() {
    const scope = scopeRef.current;
    if (!selectedSpool || !input.tauriAvailable || input.manageBusy ||
      !scope || scope.key !== key || scope.busy || scope.committed) return;
    if (input.clientReadOnly ? !input.canUseClientHostWrite() : !input.ensureLocalWriteAllowed()) return;
    const isCurrent = () => scopeRef.current === scope;
    const { t, setError, setInfoMessage } = input;
    if (input.loanedOut) {
      setError(t("errors.loanedSpoolEditBlocked", "Return the active outbound loan before changing status, location, or ownership for this roll."));
      return;
    }
    const command: InventoryMarkEmptyCommand = {
      action: "MARK_EMPTY",
      spool: {
        spool_id: selectedSpool.id,
        expected_status: normalizeStatus(selectedSpool.status),
        expected_location_id: selectedSpool.locationId ?? null,
        expected_home_location_id: selectedSpool.homeLocationId ?? null,
        // Inbound loans remain active when the borrowed roll is depleted.
        expected_active_loan: input.activeLoan,
        expected_assigned_to_printer: input.assignedSlot !== null,
      },
      expected_slot_id: input.assignedSlot?.slotId ?? null,
    };
    scope.busy = true;
    setManageBusy(true);
    setError(null);
    setInfoMessage(null);
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
        if (isCurrent()) setError(commandErrorText(error,
          t("inventory.error.markEmpty", "Failed to mark roll as empty."), t));
        return;
      }
      if (!isCurrent()) return;
      scope.committed = true;
      setInfoMessage(t("inventory.allChangesSaved", "All changes are saved."));
      try {
        let failed = false;
        const report: InventoryReloadReporter = (_domain, resolution) => {
          if (resolution !== "LIVE" && resolution !== "SUPERSEDED") failed = true;
        };
        await Promise.all([
          input.reloadSpools(report), input.reloadPrinterOverview(report),
          input.reloadSpoolDetail(selectedSpool.id, report),
        ]);
        if (failed) throw new Error(t("inventory.error.loadInventory", "Failed to load inventory."));
      } catch (error) {
        if (isCurrent()) setError(commandErrorText(error,
          t("inventory.error.loadInventory", "Failed to load inventory."), t));
      }
    } finally {
      if (isCurrent()) {
        scope.busy = false;
        setManageBusy(false);
      }
    }
  };
}
