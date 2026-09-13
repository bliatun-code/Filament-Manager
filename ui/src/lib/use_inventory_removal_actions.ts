import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { commandErrorText, createAppError } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";
import { deleteInventorySpool, purgeInventorySpool } from "./spool_writes";
import type { InventoryReloadReporter } from "./use_inventory_page_data";

type RemovalKind = "DELETE" | "PURGE";
type Confirmation = { key: string; kind: RemovalKind; token: object };
type Input = {
  selectedSpool: InventorySpool | null;
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
  onRemoved: () => void;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadActiveLoans: (report?: InventoryReloadReporter) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryRemovalActions(input: Input) {
  const { selectedSpool, setManageBusy } = input;
  const selectedId = selectedSpool?.id;
  const targetKey = JSON.stringify([input.clientReadOnly, input.clientHostBaseUrl,
    input.clientLibraryId, input.clientTargetGeneration]);
  const key = JSON.stringify([selectedId, targetKey]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const scopeRef = useRef<{ key: string; busy: boolean; committed: boolean; token: object | null } | null>(null);
  const receiptRef = useRef<{ targetKey: string } | null>(null);
  useLayoutEffect(() => () => { receiptRef.current = null; }, []);
  useLayoutEffect(() => {
    // Keep refresh feedback through the close caused by our own accepted write.
    // Any new roll, reopened dialog or Host authority invalidates it.
    if (selectedId || receiptRef.current?.targetKey !== targetKey) receiptRef.current = null;
    const scope = { key, busy: false, committed: false, token: null as object | null };
    scopeRef.current = scope;
    setConfirmation(null);
    setRemovalError(null);
    return () => {
      scopeRef.current = null;
      if (scope.busy) setManageBusy(false);
    };
  }, [key, selectedId, targetKey, setManageBusy]);

  const cancelConfirmation = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope || scope.key !== key || scope.busy) return;
    scope.token = null;
    setConfirmation(null);
    setRemovalError(null);
  }, [key]);

  async function remove(kind: RemovalKind) {
    const scope = scopeRef.current;
    if (!selectedSpool || !input.tauriAvailable || input.manageBusy ||
      !scope || scope.key !== key || scope.busy || scope.committed) return;
    if (input.clientReadOnly ? !input.canUseClientHostWrite() : !input.ensureLocalWriteAllowed()) return;
    const { t, setError, setInfoMessage } = input;
    if (input.activeLoan) {
      setRemovalError(t("errors.spoolActiveLoan", "Return the active loan before removing this roll."));
      return;
    }
    if (!confirmation || confirmation.key !== key || confirmation.kind !== kind) {
      const token = {};
      scope.token = token;
      setConfirmation({ key, kind, token });
      setRemovalError(null);
      return;
    }
    if (confirmation.token !== scope.token) return;
    const isCurrent = () => scopeRef.current === scope;
    scope.busy = true;
    setManageBusy(true);
    setError(null);
    setInfoMessage(null);
    setRemovalError(null);
    try {
      try {
        if (input.clientReadOnly && (!input.clientHostBaseUrl || !input.clientLibraryId ||
          input.clientTargetGeneration === null)) throw createAppError("common.invalid_request");
        const target = {
          clientReadOnly: input.clientReadOnly, clientHostBaseUrl: input.clientHostBaseUrl,
          clientLibraryId: input.clientLibraryId, clientTargetGeneration: input.clientTargetGeneration,
        };
        if (kind === "DELETE") {
          await deleteInventorySpool({ spool_id: selectedSpool.id, reason: "manual removal" }, target);
        } else {
          await purgeInventorySpool({ spool_id: selectedSpool.id, reason: "manual purge" }, target);
        }
      } catch (error) {
        if (isCurrent()) setRemovalError(commandErrorText(error, kind === "DELETE"
          ? t("inventory.error.deleteRoll", "Failed to delete roll.")
          : t("inventory.error.purgeRoll", "Failed to purge roll."), t));
        return;
      }
      if (!isCurrent()) return;
      scope.committed = true;
      scope.token = null;
      setConfirmation(null);
      setInfoMessage(t("inventory.allChangesSaved", "All changes are saved."));
      const receipt = { targetKey };
      receiptRef.current = receipt;
      input.onRemoved();
      let refreshFailed = false;
      const report: InventoryReloadReporter = (_domain, resolution) => {
        if (resolution !== "LIVE" && resolution !== "SUPERSEDED") refreshFailed = true;
      };
      const results = await Promise.allSettled([
        input.reloadSpools(report), input.reloadPrinterOverview(report), input.reloadActiveLoans(report),
      ]);
      if (receiptRef.current !== receipt) return;
      if (refreshFailed || results.some(result => result.status === "rejected")) {
        setError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
    } finally {
      if (isCurrent()) {
        scope.busy = false;
        setManageBusy(false);
      }
    }
  }

  return {
    cancelConfirmation,
    confirmDelete: confirmation?.key === key && confirmation.kind === "DELETE",
    confirmPurge: confirmation?.key === key && confirmation.kind === "PURGE",
    handleDeleteSelected: () => remove("DELETE"),
    handlePurgeSelected: () => remove("PURGE"),
    removalError,
  };
}
