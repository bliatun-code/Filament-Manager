import {
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
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
import { appErrorCode, toErrorMessage } from "./error_text";
import type { useI18n } from "./i18n";
import {
  formatInventoryStatusLabel,
  formatInventoryDisplayTitle,
  formatRollReference,
  type InventorySpool,
} from "./inventory_list_model";
import type { InventoryLocationRow } from "./tauri_location_client";
import { isUserManagedInventoryLocation } from "./inventory_location_model";

import type { InventoryReloadReporter } from "./use_inventory_page_data";

type TranslateFn = ReturnType<typeof useI18n>["t"];

type UseInventoryBulkActionsInput = Readonly<{
  active: boolean;
  ready: boolean;
  clientDataLive: boolean;
  clientTargetGeneration: number | null;
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
  reloadActiveLoans: (report?: InventoryReloadReporter) => Promise<void>;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
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
    atomicWarning: () =>
      t(
        "inventory.bulkAtomicWarning",
        "All selected changes are saved together. If any change fails, nothing is saved.",
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
    case "REACTIVATION_REQUIRES_WEIGHT":
      return t("inventory.error.refillRequiresWeight", "Set measured total weight above empty spool weight before reactivating.");
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
  if (appErrorCode(error) === "inventory.bulk.reactivation_requires_weight") {
    return t("inventory.error.refillRequiresWeight", "Set measured total weight above empty spool weight before reactivating.");
  }
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

export function useInventoryBulkActions({
  active, ready, clientDataLive, clientTargetGeneration,
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
  setError: clearPageError,
  setInfoMessage: clearPageInfo,
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
  const [reviewSnapshot, setReviewSnapshot] = useState<object | null>(null);
  const [bulkError, setError] = useState<string | null>(null);
  const [bulkInfo, setInfoMessage] = useState<string | null>(null);
  const authorityKey = JSON.stringify([clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, ready]);
  const view = useMemo(() => ({ authorityKey, active }), [authorityKey, active]);
  const eligibility = useMemo(() => ({ loading, clientDataLive, clientHostWritePaired, tauriAvailable }),
    [loading, clientDataLive, clientHostWritePaired, tauriAvailable]);
  const [intentRevision, setIntentRevision] = useState(0);
  const consumedReviews = useRef(new WeakSet<object>());
  const draftKey = JSON.stringify([intentRevision, selectionModeActive, selection.spoolIds, activeMutationAction,
    moveTargetLocationId, statusTarget, review]);
  const draft = useMemo(() => ({ key: draftKey }), [draftKey]);
  const current = useRef<{ view: object; busy: boolean } | null>(null);
  const latest = useRef({ draft, eligibility });
  const [focusView, setFocusView] = useState<object | null>(null);
  const invalidateDraft = useCallback(() => {
    latest.current = { ...latest.current, draft: { key: "revoked" } };
    setIntentRevision(value => value + 1);
  }, []);

  useLayoutEffect(() => { latest.current = { draft, eligibility }; }, [draft, eligibility]);
  useLayoutEffect(() => {
    const scope = { view, busy: false };
    current.current = scope;
    setSelection(clearInventoryBulkSelection());
    setSelectionModeActive(false);
    setActiveMutationAction(null);
    setMoveTargetLocationId("");
    setStatusTarget("IN_STOCK");
    setReview(null);
    setReviewSnapshot(null);
    setError(null);
    setInfoMessage(null);
    setFocusView(null);
    return () => { current.current = null; if (scope.busy) setBusy(false); };
  }, [view, setBusy]);
  useLayoutEffect(() => {
    if (focusView !== view || !active || busy) return;
    const frame = window.requestAnimationFrame(() => {
      if (current.current?.view === view) document.getElementById("inventory-bulk-selection-mode-trigger")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusView, view, active, busy]);
  useLayoutEffect(() => {
    if (busy && !current.current?.busy) { setError(null); setInfoMessage(null); }
  }, [busy]);
  const canUseSelection = useCallback(() => Boolean(active && ready && !loading && !busy && tauriAvailable &&
    current.current?.view === view && !current.current.busy && latest.current.draft === draft && latest.current.eligibility === eligibility),
    [active, ready, loading, busy, tauriAvailable, view, draft, eligibility]);


  const snapshots = useMemo<InventoryBulkSpoolSnapshot[]>(
    () =>
      spools.map((spool) => ({
        activeLoan: activeLoanSpoolIds.has(spool.id),
        assignedToPrinter: printerSlotBySpoolId.has(spool.id),
        homeLocationId: spool.homeLocationId ?? null,
        locationId: spool.locationId ?? null,
        spoolId: spool.id,
        status: spool.status,
        remainingGrams: spool.remainingGrams ?? null,
      })),
    [activeLoanSpoolIds, printerSlotBySpoolId, spools],
  );
  const locationTargets = useMemo<InventoryBulkLocationTarget[]>(
    () =>
      locations
        .filter(isUserManagedInventoryLocation)
        .map((location) => ({
          archived: Boolean(location.archived_at),
          id: location.id,
          name: location.name,
        })),
    [locations],
  );
  const selectedIds = new Set(selection.spoolIds);
  const snapshotKey = JSON.stringify([snapshots.filter(row => selectedIds.has(row.spoolId)), locationTargets]);
  const dataSnapshot = useMemo(() => ({ key: snapshotKey }), [snapshotKey]);
  const currentDataSnapshot = useRef(dataSnapshot);
  useLayoutEffect(() => { currentDataSnapshot.current = dataSnapshot; }, [dataSnapshot]);

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
      reviewSnapshot === dataSnapshot &&
      latestReview?.ok &&
      latestReview.plan.confirmationKey === review.confirmationKey,
  );

  const reportPlanError = useCallback(
    (result: InventoryBulkPlanResult<InventoryBulkMutationPlan>) => {
      if (!result.ok) {
        const ids = result.issues[0]?.spoolIds ?? [];
        const names = ids.slice(0, 3).map(id => {
          const spool = spools.find(row => row.id === id);
          return spool ? `${formatInventoryDisplayTitle(spool.material, spool.filamentName, spool.colorName)} (${formatRollReference(spool)})` : id;
        });
        const remainder = ids.length > names.length ? ` … (+${ids.length - names.length})` : "";
        const details = names.length ? ` ${names.join("; ")}${remainder}` : "";
        setError(`${validationErrorMessage(result.issues, t)}${details}`);
      }
    },
    [setError, spools, t],
  );

  const requestMoveReview = useCallback(
    (targetLocation: InventoryBulkLocationTarget) => {
      if (!canUseSelection()) return;
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
      invalidateDraft();
      setMoveTargetLocationId(targetLocation.id);
      setReview(result.plan);
      setReviewSnapshot(dataSnapshot);
    },
    [canUseSelection, invalidateDraft, dataSnapshot, reportPlanError, selection.spoolIds, setError, setInfoMessage, snapshots],
  );

  const requestStatusReview = useCallback(
    (targetStatus: InventoryBulkManualStatus) => {
      if (!canUseSelection()) return;
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
      invalidateDraft();
      setStatusTarget(targetStatus);
      setReview(result.plan);
      setReviewSnapshot(dataSnapshot);
    },
    [canUseSelection, invalidateDraft, dataSnapshot, reportPlanError, selection.spoolIds, setError, setInfoMessage, snapshots],
  );

  const confirmReview = useCallback(
    async (reviewedPlan: InventoryBulkMutationPlan) => {
      if (!canUseSelection() || consumedReviews.current.has(reviewedPlan) || !selectionModeActive || !clientDataLive || review !== reviewedPlan ||
        reviewSnapshot !== dataSnapshot || currentDataSnapshot.current !== dataSnapshot ||
        (clientReadOnly && (!clientHostWritePaired || !clientHostBaseUrl || !clientLibraryId ||
          !Number.isSafeInteger(clientTargetGeneration) || clientTargetGeneration! < 0))) {
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

      const scope = current.current!;
      const isCurrent = () => current.current === scope;
      scope.busy = true;
      setBusy(true);
      clearPageError(null);
      clearPageInfo(null);
      setError(null);
      setInfoMessage(null);
      try {
        const receipt = await executeInventoryBulkMutationForInventory(
          {
            clientHostBaseUrl,
            clientHostWritePaired,
            clientLibraryId,
            clientReadOnly,
            clientTargetGeneration,
          },
          confirmation.command,
        );
        if (!isCurrent()) return;
        consumedReviews.current.add(reviewedPlan);
        if (!inventoryBulkMutationReceiptMatchesPlan(reviewedPlan, receipt)) {
          if (latest.current.draft === draft) setReview(null);
          throw new Error("INVENTORY_BULK_RECEIPT_MISMATCH");
        }
        if (latest.current.draft === draft) {
          setSelection(clearInventoryBulkSelection());
          setSelectionModeActive(false);
          setActiveMutationAction(null);
          setReview(null);
          setFocusView(view);
        }
        setInfoMessage(
          t(
            "inventory.bulkMutationDone",
            "Updated rolls: {count}.",
            { count: receipt.affected_count },
          ),
        );
        let refreshFailed = false;
        const report: InventoryReloadReporter = (_domain, resolution) => {
          if (resolution !== "LIVE" && resolution !== "SUPERSEDED") refreshFailed = true;
        };
        const results = await Promise.allSettled([reloadSpools, reloadActiveLoans, reloadPrinterOverview]
          .map(reload => Promise.resolve().then(() => reload(report))));
        if (isCurrent() && (refreshFailed || results.some(result => result.status === "rejected"))) {
          setError(t("inventory.error.loadInventory", "Failed to load inventory."));
        }
      } catch (mutationError) {
        if (!isCurrent()) return;
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
        if (isCurrent()) { scope.busy = false; setBusy(false); }
      }
    },
    [
      buildLatestReview, canUseSelection, selectionModeActive, clientDataLive, review, reviewSnapshot,
      dataSnapshot, draft, view, clientTargetGeneration, clearPageError, clearPageInfo,
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
      if (!canUseSelection() || plan !== exportPlan) return;
      const scope = current.current;
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
        if (current.current !== scope || latest.current.draft !== draft) return;
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
        if (current.current !== scope || latest.current.draft !== draft) return;
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
    [canUseSelection, exportPlan, draft, resolveDataRows, setError, setInfoMessage, t],
  );

  const updateSelection = useCallback(
    (spoolId: string, selected: boolean) => {
      if (!canUseSelection()) return;
      invalidateDraft();
      setSelection((current) =>
        toggleInventoryBulkSelection(current, spoolId, selected),
      );
      setReview(null);
    },
    [canUseSelection, invalidateDraft],
  );

  const selectVisible = useCallback(
    (selected: boolean) => {
      if (!canUseSelection()) return;
      invalidateDraft();
      setSelection((current) =>
        selected
          ? selectVisibleInventoryBulkSpools(current, visibleSpoolIds)
          : deselectVisibleInventoryBulkSpools(current, visibleSpoolIds),
      );
      setReview(null);
    },
    [canUseSelection, invalidateDraft, visibleSpoolIds],
  );

  const clearSelection = useCallback(() => {
    if (!canUseSelection()) return;
    invalidateDraft();
    setSelection(clearInventoryBulkSelection());
    setActiveMutationAction(null);
    setReview(null);
  }, [canUseSelection, invalidateDraft]);

  const exitSelectionMode = useCallback(() => {
    if (!canUseSelection()) return;
    invalidateDraft();
    setSelectionModeActive(false);
    setSelection(clearInventoryBulkSelection());
    setActiveMutationAction(null);
    setReview(null);
  }, [canUseSelection, invalidateDraft]);

  const selectedBulkSpoolIds = useMemo(
    () => new Set(selection.spoolIds),
    [selection.spoolIds],
  );
  const panelDisabled = !active || !ready || !tauriAvailable || loading || busy;
  const visibleSpoolIdSet = useMemo(
    () => new Set(visibleSpoolIds),
    [visibleSpoolIds],
  );
  const visibleSelectedCount = useMemo(
    () => selection.spoolIds.filter((spoolId) => visibleSpoolIdSet.has(spoolId)).length,
    [selection.spoolIds, visibleSpoolIdSet],
  );

  return {
    bulkError, bulkInfo,
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
      onActiveMutationActionChange: (action: InventoryBulkMutationAction | null) => {
        if (canUseSelection()) { invalidateDraft(); setActiveMutationAction(action); setReview(null); }
      },
      onCancelReview: () => { if (canUseSelection()) { invalidateDraft(); setReview(null); } },
      onClearSelection: clearSelection,
      onConfirmReview: (plan: InventoryBulkMutationPlan) => void confirmReview(plan),
      onCreateLabels: (plan: InventoryBulkDataPlan) => {
        if (canUseSelection() && plan === labelsPlan) void openLabelSheet(plan);
      },
      onExportCsv: (plan: InventoryBulkDataPlan) => void exportSelected(plan, "CSV"),
      onExportJson: (plan: InventoryBulkDataPlan) => void exportSelected(plan, "JSON"),
      onMoveTargetLocationIdChange: (id: string) => { if (canUseSelection()) { invalidateDraft(); setMoveTargetLocationId(id); setReview(null); } },
      onRequestMoveReview: requestMoveReview,
      onRequestStatusReview: requestStatusReview,
      onSelectVisibleChange: selectVisible,
      onStatusTargetChange: (status: InventoryBulkManualStatus) => { if (canUseSelection()) { invalidateDraft(); setStatusTarget(status); setReview(null); } },
      review,
      reviewCurrent: reviewCurrent && clientDataLive && (!clientReadOnly || clientHostWritePaired),
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
        if (!canUseSelection()) return;
        if (active) {
          invalidateDraft();
          setSelectionModeActive(true);
        } else {
          exitSelectionMode();
        }
      },
    },
  };
}
