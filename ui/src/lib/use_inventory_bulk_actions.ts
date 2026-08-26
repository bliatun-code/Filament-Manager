import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { InventoryBulkActionsCopy } from "../components/inventory_bulk_actions_panel";
import {
  buildInventoryBulkDataPlan,
  buildInventoryBulkMutationPlan,
  clearInventoryBulkSelection,
  confirmInventoryBulkMutation,
  createInventoryBulkSelection,
  deselectVisibleInventoryBulkSpools,
  inventoryBulkMutationReceiptMatchesPlan,
  inventoryBulkSelectAllState,
  reconcileInventoryBulkSelection,
  resolveInventoryBulkDataPlanRows,
  selectVisibleInventoryBulkSpools,
  toggleInventoryBulkSelection,
  type InventoryBulkDataPlan,
  type InventoryBulkLocationTarget,
  type InventoryBulkManualStatus,
  type InventoryBulkMutationAction,
  type InventoryBulkMutationPlan,
  type InventoryBulkPlanResult,
  type InventoryBulkSpoolSnapshot,
  type InventoryBulkValidationIssue,
} from "./inventory_bulk_actions_model";
import {
  InventoryBulkMutationRoutingError,
  executeInventoryBulkMutationForInventory,
} from "./inventory_bulk_actions_data_source";
import { downloadTextFile } from "./download_file";
import { toErrorMessage } from "./error_text";
import type { useI18n } from "./i18n";
import {
  formatInventoryStatusLabel,
  type InventorySpool,
} from "./inventory_list_model";
import type { InventoryLocationRow } from "./tauri_location_client";

type TranslateFn = ReturnType<typeof useI18n>["t"];

type UseInventoryBulkActionsInput = Readonly<{
  activeLoanSpoolIds: ReadonlySet<string>;
  busy: boolean;
  clientHostBaseUrl: string | null;
  clientHostWritePaired: boolean;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  filteredSpools: readonly InventorySpool[];
  loading: boolean;
  locations: readonly InventoryLocationRow[];
  openLabelSheet: (selectionPlan?: InventoryBulkDataPlan) => Promise<void>;
  printerSlotBySpoolId: ReadonlyMap<string, unknown>;
  reloadActiveLoans: () => Promise<void>;
  reloadPrinterOverview: () => Promise<void>;
  reloadSpools: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  spools: readonly InventorySpool[];
  tauriAvailable: boolean;
  t: TranslateFn;
}>;

function bulkActionLabel(t: TranslateFn, action: InventoryBulkMutationAction): string {
  return action === "MOVE"
    ? t("inventory.bulkMoveAction", "Move")
    : t("inventory.bulkStatusAction", "Change status");
}

export function inventoryBulkActionsCopy(t: TranslateFn): InventoryBulkActionsCopy {
  return {
    archivedLocation: (name) =>
      `${name} (${t("common.archived", "Archived")})`,
    atomicWarning: (affectedCount) =>
      t(
        "inventory.bulkAtomicWarning",
        "All {count} changes and their history are committed together, or none are written.",
        { count: affectedCount },
      ),
    cancel: t("common.cancel", "Cancel"),
    clearSelection: t("inventory.bulkClearSelection", "Clear selection"),
    chooseLocation: t("inventory.locationChoose", "Choose location"),
    confirm: (action, affectedCount) =>
      t(
        "inventory.bulkConfirmAction",
        "Confirm {action} for {count}",
        { action: bulkActionLabel(t, action), count: affectedCount },
      ),
    createLabels: (selectedCount) =>
      t(
        "inventory.bulkCreateLabels",
        "{count, plural, one {Create label sheet for # selected roll} other {Create label sheet for # selected rolls}}",
        { count: selectedCount },
      ),
    exportSelectedCsv: () => t("common.exportCsv", "Export CSV"),
    exportSelectedJson: () => t("common.exportJson", "Export JSON"),
    locationLabel: t("inventory.location", "Location"),
    moveAction: t("inventory.bulkMoveAction", "Move"),
    moveTitle: t("inventory.bulkMoveTitle", "Move selected rolls"),
    noSelection: t("inventory.bulkNoSelection", "No rolls selected"),
    reviewAffected: (affectedCount) =>
      t("inventory.bulkAffectedCount", "{count} affected", {
        count: affectedCount,
      }),
    reviewAffectedTerm: t("inventory.bulkAffected", "Affected"),
    reviewChanged: t(
      "inventory.bulkReviewChanged",
      "The selection or roll data changed. Review the action again.",
    ),
    reviewMove: t("inventory.bulkReviewMove", "Review move"),
    reviewSelection: (selectedCount) =>
      t("inventory.bulkReviewSelected", "{count} selected", {
        count: selectedCount,
      }),
    reviewSelectionTerm: t("common.selected", "Selected"),
    reviewStatus: t("inventory.bulkReviewStatus", "Review status change"),
    reviewTarget: (action, targetLabel) =>
      t("inventory.bulkReviewTarget", "{action} target: {target}", {
        action: bulkActionLabel(t, action),
        target: targetLabel,
      }),
    reviewTargetTerm: t("inventory.bulkTarget", "Target"),
    reviewTitle: (action) =>
      t("inventory.bulkReviewTitle", "Review {action}", {
        action: bulkActionLabel(t, action),
      }),
    reviewUnchanged: (unchangedCount) =>
      t("inventory.bulkUnchangedCount", "{count} unchanged", {
        count: unchangedCount,
      }),
    reviewUnchangedTerm: t("inventory.bulkUnchanged", "Unchanged"),
    selectVisible: (visibleCount) =>
      t(
        "inventory.bulkSelectVisible",
        "{count, plural, one {Select # visible roll} other {Select # visible rolls}}",
        { count: visibleCount },
      ),
    selectionHint: t(
      "inventory.bulkSelectionHint",
      "Select rolls to move, change status, create labels or export.",
    ),
    selected: (selectedCount) =>
      t(
        "inventory.bulkSelectedCount",
        "{count, plural, one {# roll selected} other {# rolls selected}}",
        { count: selectedCount },
      ),
    selectedAcrossFilters: (selectedCount, visibleSelectedCount) =>
      t(
        "inventory.bulkSelectedAcrossFilters",
        "{selected} selected total · {visible} in this view",
        { selected: selectedCount, visible: visibleSelectedCount },
      ),
    statusAction: t("inventory.bulkStatusAction", "Change status"),
    statusLabel: t("inventory.status", "Status"),
    statusName: (status) => formatInventoryStatusLabel(t, status),
    statusTitle: t("inventory.bulkStatusTitle", "Change selected status"),
    title: t("inventory.bulkActionsTitle", "Bulk actions"),
  };
}

function validationErrorMessage(
  issues: readonly InventoryBulkValidationIssue[],
  t: TranslateFn,
): string {
  const issue = issues[0];
  const count = issue?.spoolIds.length ?? 0;
  switch (issue?.code) {
    case "ACTIVE_LOAN":
      return t(
        "inventory.bulkActiveLoanBlocked",
        "{count, plural, one {# affected roll has} other {# affected rolls have}} an active loan. Return it before changing placement or status.",
        { count },
      );
    case "PRINTER_SLOT_CONTROLLED":
      return t(
        "inventory.bulkPrinterSlotBlocked",
        "{count, plural, one {# affected roll is} other {# affected rolls are}} loaded in a printer. Use printer-slot actions instead.",
        { count },
      );
    case "REMOVED_SPOOL":
      return t(
        "inventory.bulkRemovedBlocked",
        "{count, plural, one {# affected roll is removed} other {# affected rolls are removed}}. Restore them before using bulk actions.",
        { count },
      );
    case "NO_CHANGES":
      return t(
        "inventory.bulkNoChanges",
        "Every selected roll already has the requested value.",
      );
    case "UNSUPPORTED_STATUS_TARGET":
      return t(
        "inventory.bulkInvalidStatus",
        "Bulk status can only be set to in stock, empty, or lost.",
      );
    case "ARCHIVED_LOCATION":
    case "BLANK_LOCATION_ID":
      return t(
        "inventory.bulkInvalidLocation",
        "Choose an active storage location before reviewing the move.",
      );
    case "EMPTY_SELECTION":
      return t("inventory.bulkNoSelection", "No rolls selected");
    default:
      return t(
        "inventory.bulkStaleSelection",
        "The selection changed or contains stale roll data. Select the rolls again.",
      );
  }
}

function routingErrorMessage(error: unknown, t: TranslateFn): string | null {
  if (error instanceof InventoryBulkMutationRoutingError) {
    if (error.code === "PAIRING_REQUIRED") {
      return t(
        "inventory.clientWriteRequiresPairing",
        "Pair this desktop client with the host before running protected sync actions.",
      );
    }
    return t(
      "inventory.clientHostUnavailable",
      "Host connection details are missing for this client device.",
    );
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("does not support atomic inventory bulk changes")) {
    return t(
      "inventory.bulkLegacyHostUnsupported",
      "The Host does not support atomic bulk changes. Upgrade the Host first.",
    );
  }
  return null;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function focusInventoryBulkSelectionModeTriggerAfterRender(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() =>
    document.getElementById("inventory-bulk-selection-mode-trigger")?.focus(),
  );
}

export function useInventoryBulkActions({
  activeLoanSpoolIds,
  busy,
  clientHostBaseUrl,
  clientHostWritePaired,
  clientLibraryId,
  clientReadOnly,
  filteredSpools,
  loading,
  locations,
  openLabelSheet,
  printerSlotBySpoolId,
  reloadActiveLoans,
  reloadPrinterOverview,
  reloadSpools,
  setBusy,
  setError,
  setInfoMessage,
  spools,
  tauriAvailable,
  t,
}: UseInventoryBulkActionsInput) {
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [selection, setSelection] = useState(() => createInventoryBulkSelection());
  const [activeMutationAction, setActiveMutationAction] =
    useState<InventoryBulkMutationAction | null>(null);
  const [moveTargetLocationId, setMoveTargetLocationId] = useState("");
  const [statusTarget, setStatusTarget] =
    useState<InventoryBulkManualStatus>("IN_STOCK");
  const [review, setReview] = useState<InventoryBulkMutationPlan | null>(null);

  const snapshots = useMemo<InventoryBulkSpoolSnapshot[]>(
    () =>
      spools.map((spool) => ({
        activeLoan: activeLoanSpoolIds.has(spool.id),
        assignedToPrinter: printerSlotBySpoolId.has(spool.id),
        homeLocationId: spool.homeLocationId ?? null,
        locationId: spool.locationId ?? null,
        spoolId: spool.id,
        status: spool.status,
      })),
    [activeLoanSpoolIds, printerSlotBySpoolId, spools],
  );
  const locationTargets = useMemo<InventoryBulkLocationTarget[]>(
    () =>
      locations
        .filter((location) => location.location_type === "GENERIC")
        .map((location) => ({
          archived: Boolean(location.archived_at),
          id: location.id,
          name: location.name,
        })),
    [locations],
  );
  const visibleSpoolIds = useMemo(
    () => filteredSpools.map((spool) => spool.id),
    [filteredSpools],
  );

  useEffect(() => {
    setSelection((current) => {
      const reconciled = reconcileInventoryBulkSelection(
        current,
        spools.map((spool) => spool.id),
      ).selection;
      return sameIds(current.spoolIds, reconciled.spoolIds) ? current : reconciled;
    });
  }, [spools]);

  useEffect(() => {
    if (selection.spoolIds.length === 0) {
      setActiveMutationAction(null);
      setReview(null);
    }
  }, [selection.spoolIds.length]);

  const labelsPlan = useMemo(() => {
    const result = buildInventoryBulkDataPlan({
      action: "LABELS",
      selectedSpoolIds: selection.spoolIds,
      snapshots,
    });
    return result.ok ? result.plan : null;
  }, [selection.spoolIds, snapshots]);
  const exportPlan = useMemo(() => {
    const result = buildInventoryBulkDataPlan({
      action: "EXPORT",
      selectedSpoolIds: selection.spoolIds,
      snapshots,
    });
    return result.ok ? result.plan : null;
  }, [selection.spoolIds, snapshots]);

  const buildLatestReview = useCallback(
    (reviewedPlan: InventoryBulkMutationPlan): InventoryBulkPlanResult<InventoryBulkMutationPlan> => {
      if (reviewedPlan.action === "STATUS") {
        return buildInventoryBulkMutationPlan({
          action: "STATUS",
          selectedSpoolIds: selection.spoolIds,
          snapshots,
          targetStatus: reviewedPlan.command.target_status,
        });
      }
      const target = locationTargets.find(
        (location) => location.id === reviewedPlan.command.target_location_id,
      ) ?? {
        archived: true,
        id: reviewedPlan.command.target_location_id,
        name: reviewedPlan.targetLabel,
      };
      return buildInventoryBulkMutationPlan({
        action: "MOVE",
        selectedSpoolIds: selection.spoolIds,
        snapshots,
        targetLocation: target,
      });
    },
    [locationTargets, selection.spoolIds, snapshots],
  );

  const latestReview = useMemo(
    () => (review ? buildLatestReview(review) : null),
    [buildLatestReview, review],
  );
  const reviewCurrent = Boolean(
    review &&
      latestReview?.ok &&
      latestReview.plan.confirmationKey === review.confirmationKey,
  );

  const reportPlanError = useCallback(
    (result: InventoryBulkPlanResult<InventoryBulkMutationPlan>) => {
      if (!result.ok) {
        setError(validationErrorMessage(result.issues, t));
      }
    },
    [setError, t],
  );

  const requestMoveReview = useCallback(
    (targetLocation: InventoryBulkLocationTarget) => {
      const result = buildInventoryBulkMutationPlan({
        action: "MOVE",
        selectedSpoolIds: selection.spoolIds,
        snapshots,
        targetLocation,
      });
      setError(null);
      setInfoMessage(null);
      if (!result.ok) {
        reportPlanError(result);
        return;
      }
      setMoveTargetLocationId(targetLocation.id);
      setReview(result.plan);
    },
    [reportPlanError, selection.spoolIds, setError, setInfoMessage, snapshots],
  );

  const requestStatusReview = useCallback(
    (targetStatus: InventoryBulkManualStatus) => {
      const result = buildInventoryBulkMutationPlan({
        action: "STATUS",
        selectedSpoolIds: selection.spoolIds,
        snapshots,
        targetStatus,
      });
      setError(null);
      setInfoMessage(null);
      if (!result.ok) {
        reportPlanError(result);
        return;
      }
      setStatusTarget(targetStatus);
      setReview(result.plan);
    },
    [reportPlanError, selection.spoolIds, setError, setInfoMessage, snapshots],
  );

  const confirmReview = useCallback(
    async (reviewedPlan: InventoryBulkMutationPlan) => {
      if (!tauriAvailable || busy) {
        return;
      }
      const currentPlan = buildLatestReview(reviewedPlan);
      const confirmation = confirmInventoryBulkMutation(reviewedPlan, currentPlan);
      if (!confirmation.ok) {
        setError(
          t(
            "inventory.bulkReviewChanged",
            "The selection or roll data changed. Review the action again.",
          ),
        );
        return;
      }

      setBusy(true);
      setError(null);
      setInfoMessage(null);
      try {
        const receipt = await executeInventoryBulkMutationForInventory(
          {
            clientHostBaseUrl,
            clientHostWritePaired,
            clientLibraryId,
            clientReadOnly,
          },
          confirmation.command,
        );
        if (!inventoryBulkMutationReceiptMatchesPlan(reviewedPlan, receipt)) {
          throw new Error("INVENTORY_BULK_RECEIPT_MISMATCH");
        }
        await Promise.all([
          reloadSpools(),
          reloadActiveLoans(),
          reloadPrinterOverview(),
        ]);
        setSelection(clearInventoryBulkSelection());
        setSelectionModeActive(false);
        setActiveMutationAction(null);
        setReview(null);
        focusInventoryBulkSelectionModeTriggerAfterRender();
        setInfoMessage(
          t(
            "inventory.bulkMutationDone",
            "{count, plural, one {# roll was} other {# rolls were}} updated atomically.",
            { count: receipt.affected_count },
          ),
        );
      } catch (mutationError) {
        const routed = routingErrorMessage(mutationError, t);
        setError(
          routed ??
            (mutationError instanceof Error &&
            mutationError.message === "INVENTORY_BULK_RECEIPT_MISMATCH"
              ? t(
                  "inventory.bulkReceiptMismatch",
                  "The bulk result could not prove complete history coverage. Refresh and review the inventory.",
                )
              : toErrorMessage(
                  mutationError,
                  t(
                    "inventory.bulkMutationFailed",
                    "The bulk action failed before a complete result could be confirmed.",
                  ),
                  t,
                )),
        );
      } finally {
        setBusy(false);
      }
    },
    [
      buildLatestReview,
      busy,
      clientHostBaseUrl,
      clientHostWritePaired,
      clientLibraryId,
      clientReadOnly,
      reloadActiveLoans,
      reloadPrinterOverview,
      reloadSpools,
      setBusy,
      setError,
      setInfoMessage,
      t,
      tauriAvailable,
    ],
  );

  const resolveDataRows = useCallback(
    (plan: InventoryBulkDataPlan): readonly InventorySpool[] | null => {
      const resolved = resolveInventoryBulkDataPlanRows(plan, spools);
      if (resolved.ok) {
        return resolved.rows;
      }
      setError(
        t(
          "inventory.bulkStaleSelection",
          "The selection changed or contains stale roll data. Select the rolls again.",
        ),
      );
      return null;
    },
    [setError, spools, t],
  );

  const exportSelected = useCallback(
    async (plan: InventoryBulkDataPlan, format: "CSV" | "JSON") => {
      const rows = resolveDataRows(plan);
      if (!rows) {
        return;
      }
      setError(null);
      setInfoMessage(null);
      try {
        const {
          buildInventorySpoolExportCsv,
          buildInventorySpoolExportJson,
        } = await import("./inventory_export");
        const timestamp = Date.now();
        if (format === "CSV") {
          downloadTextFile(
            buildInventorySpoolExportCsv(rows),
            `filament-manager-selected-inventory-${timestamp}.csv`,
            "text/csv;charset=utf-8",
          );
        } else {
          downloadTextFile(
            buildInventorySpoolExportJson(rows),
            `filament-manager-selected-inventory-${timestamp}.json`,
            "application/json;charset=utf-8",
          );
        }
        setInfoMessage(
          t(
            "inventory.bulkExportDone",
            "Exported {count} selected rolls as {format}.",
            { count: rows.length, format },
          ),
        );
      } catch (exportError) {
        setError(
          toErrorMessage(
            exportError,
            t(
              "inventory.bulkExportFailed",
              "The selected inventory could not be exported.",
            ),
            t,
          ),
        );
      }
    },
    [resolveDataRows, setError, setInfoMessage, t],
  );

  const updateSelection = useCallback(
    (spoolId: string, selected: boolean) => {
      setSelection((current) =>
        toggleInventoryBulkSelection(current, spoolId, selected),
      );
      setReview(null);
    },
    [],
  );

  const selectVisible = useCallback(
    (selected: boolean) => {
      setSelection((current) =>
        selected
          ? selectVisibleInventoryBulkSpools(current, visibleSpoolIds)
          : deselectVisibleInventoryBulkSpools(current, visibleSpoolIds),
      );
      setReview(null);
    },
    [visibleSpoolIds],
  );

  const clearSelection = useCallback(() => {
    setSelection(clearInventoryBulkSelection());
    setActiveMutationAction(null);
    setReview(null);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionModeActive(false);
    setSelection(clearInventoryBulkSelection());
    setActiveMutationAction(null);
    setReview(null);
  }, []);

  const selectedBulkSpoolIds = useMemo(
    () => new Set(selection.spoolIds),
    [selection.spoolIds],
  );
  const panelDisabled = !tauriAvailable || loading || busy;
  const visibleSpoolIdSet = useMemo(
    () => new Set(visibleSpoolIds),
    [visibleSpoolIds],
  );
  const visibleSelectedCount = useMemo(
    () => selection.spoolIds.filter((spoolId) => visibleSpoolIdSet.has(spoolId)).length,
    [selection.spoolIds, visibleSpoolIdSet],
  );

  return {
    collectionProps: {
      bulkSelectionActive: selectionModeActive,
      bulkSelectionDisabled: panelDisabled,
      onBulkSelectionChange: updateSelection,
      selectedBulkSpoolIds,
    },
    panelProps: {
      active: selectionModeActive,
      activeMutationAction,
      copy: inventoryBulkActionsCopy(t),
      disabled: panelDisabled,
      exportPlan,
      labelsPlan,
      locationTargets,
      moveTargetLocationId,
      onActiveMutationActionChange: setActiveMutationAction,
      onCancelReview: () => setReview(null),
      onClearSelection: clearSelection,
      onConfirmReview: (plan: InventoryBulkMutationPlan) => void confirmReview(plan),
      onCreateLabels: (plan: InventoryBulkDataPlan) => void openLabelSheet(plan),
      onExportCsv: (plan: InventoryBulkDataPlan) => void exportSelected(plan, "CSV"),
      onExportJson: (plan: InventoryBulkDataPlan) => void exportSelected(plan, "JSON"),
      onMoveTargetLocationIdChange: setMoveTargetLocationId,
      onRequestMoveReview: requestMoveReview,
      onRequestStatusReview: requestStatusReview,
      onSelectVisibleChange: selectVisible,
      onStatusTargetChange: setStatusTarget,
      review,
      reviewCurrent,
      selectedCount: selection.spoolIds.length,
      statusTarget,
      visibleCount: visibleSpoolIds.length,
      visibleSelectedCount,
      visibleSelectionState: inventoryBulkSelectAllState(
        selection,
        visibleSpoolIds,
      ),
    },
    selectionModeTriggerProps: {
      active: selectionModeActive,
      disabled: panelDisabled || (!selectionModeActive && visibleSpoolIds.length === 0),
      onActiveChange: (active: boolean) => {
        if (active) {
          setSelectionModeActive(true);
        } else {
          exitSelectionMode();
        }
      },
    },
  };
}
