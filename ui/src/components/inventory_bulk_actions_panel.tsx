import type { ChangeEvent } from "react";

import {
  INVENTORY_BULK_MANUAL_STATUSES,
  type InventoryBulkDataPlan,
  type InventoryBulkLocationTarget,
  type InventoryBulkManualStatus,
  type InventoryBulkMutationAction,
  type InventoryBulkMutationPlan,
  type InventoryBulkSelectAllState,
} from "../lib/inventory_bulk_actions_model";
import { modalActionButtonClassName } from "./modal_action_button_class";

const inventoryBulkMoveActionId = "inventory-bulk-move-action";
const inventoryBulkReviewTitleId = "inventory-bulk-review-title";
const inventoryBulkSelectionModeTriggerId = "inventory-bulk-selection-mode-trigger";
const inventoryBulkSelectVisibleId = "inventory-bulk-select-visible";
const inventoryBulkStatusActionId = "inventory-bulk-status-action";

function focusInventoryBulkElementAfterRender(elementId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => document.getElementById(elementId)?.focus());
}

export type InventoryBulkActionsCopy = Readonly<{
  archivedLocation: (name: string) => string;
  atomicWarning: (affectedCount: number) => string;
  cancel: string;
  clearSelection: string;
  chooseLocation: string;
  confirm: (action: InventoryBulkMutationAction, affectedCount: number) => string;
  createLabels: (selectedCount: number) => string;
  exportSelectedCsv: (selectedCount: number) => string;
  exportSelectedJson: (selectedCount: number) => string;
  locationLabel: string;
  moveAction: string;
  moveTitle: string;
  noSelection: string;
  reviewAffected: (affectedCount: number) => string;
  reviewAffectedTerm: string;
  reviewChanged: string;
  reviewMove: string;
  reviewSelection: (selectedCount: number) => string;
  reviewSelectionTerm: string;
  reviewStatus: string;
  reviewTarget: (action: InventoryBulkMutationAction, targetLabel: string) => string;
  reviewTargetTerm: string;
  reviewTitle: (action: InventoryBulkMutationAction) => string;
  reviewUnchanged: (unchangedCount: number) => string;
  reviewUnchangedTerm: string;
  selectVisible: (visibleCount: number) => string;
  selectionHint: string;
  selected: (selectedCount: number) => string;
  selectedAcrossFilters: (selectedCount: number, visibleSelectedCount: number) => string;
  statusAction: string;
  statusLabel: string;
  statusName: (status: InventoryBulkManualStatus) => string;
  statusTitle: string;
  title: string;
}>;

export type InventoryBulkActionsPanelViewProps = Readonly<{
  active: boolean;
  activeMutationAction: InventoryBulkMutationAction | null;
  copy: InventoryBulkActionsCopy;
  disabled: boolean;
  exportPlan: InventoryBulkDataPlan | null;
  labelsPlan: InventoryBulkDataPlan | null;
  locationTargets: readonly InventoryBulkLocationTarget[];
  moveTargetLocationId: string;
  onActiveMutationActionChange: (action: InventoryBulkMutationAction | null) => void;
  onCancelReview: () => void;
  onConfirmReview: (plan: InventoryBulkMutationPlan) => void;
  onCreateLabels: (plan: InventoryBulkDataPlan) => void;
  onClearSelection: () => void;
  onExportCsv: (plan: InventoryBulkDataPlan) => void;
  onExportJson: (plan: InventoryBulkDataPlan) => void;
  onMoveTargetLocationIdChange: (locationId: string) => void;
  onRequestMoveReview: (target: InventoryBulkLocationTarget) => void;
  onRequestStatusReview: (status: InventoryBulkManualStatus) => void;
  onSelectVisibleChange: (selected: boolean) => void;
  onStatusTargetChange: (status: InventoryBulkManualStatus) => void;
  review: InventoryBulkMutationPlan | null;
  reviewCurrent: boolean;
  selectedCount: number;
  statusTarget: InventoryBulkManualStatus;
  visibleCount: number;
  visibleSelectedCount: number;
  visibleSelectionState: InventoryBulkSelectAllState;
}>;

export function InventoryBulkSelectVisibleCheckbox({
  disabled,
  inputId,
  label,
  onCheckedChange,
  state,
}: Readonly<{
  disabled: boolean;
  inputId?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  state: InventoryBulkSelectAllState;
}>) {
  const checked = state === "ALL";
  const mixed = state === "SOME";
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        aria-checked={mixed ? "mixed" : checked}
        disabled={disabled}
        ref={(node) => {
          if (node) {
            node.indeterminate = mixed;
          }
        }}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900"
      />
      <span>{label}</span>
    </label>
  );
}

function InventoryBulkMutationReview({
  copy,
  disabled,
  onCancelReview,
  onConfirmReview,
  review,
  reviewCurrent,
}: Pick<
  InventoryBulkActionsPanelViewProps,
  | "copy"
  | "disabled"
  | "onCancelReview"
  | "onConfirmReview"
  | "reviewCurrent"
> &
  Readonly<{ review: InventoryBulkMutationPlan }>) {
  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100"
      role="alert"
      aria-labelledby={inventoryBulkReviewTitleId}
    >
      <h3
        id={inventoryBulkReviewTitleId}
        className="text-sm font-semibold"
        tabIndex={-1}
      >
        {copy.reviewTitle(review.action)}
      </h3>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="sr-only">{copy.reviewSelectionTerm}</dt>
          <dd className="tabular-nums">{copy.reviewSelection(review.selectedCount)}</dd>
        </div>
        <div>
          <dt className="sr-only">{copy.reviewAffectedTerm}</dt>
          <dd className="font-semibold tabular-nums">
            {copy.reviewAffected(review.affectedCount)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{copy.reviewUnchangedTerm}</dt>
          <dd className="tabular-nums">{copy.reviewUnchanged(review.unchangedCount)}</dd>
        </div>
        <div>
          <dt className="sr-only">{copy.reviewTargetTerm}</dt>
          <dd>{copy.reviewTarget(review.action, review.targetLabel)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5">
        {copy.atomicWarning(review.affectedCount)}
      </p>
      {!reviewCurrent ? (
        <p className="mt-2 text-xs font-semibold" role="status">
          {copy.reviewChanged}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={modalActionButtonClassName("primary")}
          disabled={disabled || !reviewCurrent}
          onClick={() => onConfirmReview(review)}
        >
          {copy.confirm(review.action, review.affectedCount)}
        </button>
        <button
          type="button"
          className={modalActionButtonClassName("secondary")}
          disabled={disabled}
          onClick={() => {
            onCancelReview();
            focusInventoryBulkElementAfterRender(
              review.action === "MOVE"
                ? inventoryBulkMoveActionId
                : inventoryBulkStatusActionId,
            );
          }}
        >
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}

export function InventoryBulkActionsPanelView({
  active,
  activeMutationAction,
  copy,
  disabled,
  exportPlan,
  labelsPlan,
  locationTargets,
  moveTargetLocationId,
  onActiveMutationActionChange,
  onCancelReview,
  onConfirmReview,
  onCreateLabels,
  onClearSelection,
  onExportCsv,
  onExportJson,
  onMoveTargetLocationIdChange,
  onRequestMoveReview,
  onRequestStatusReview,
  onSelectVisibleChange,
  onStatusTargetChange,
  review,
  reviewCurrent,
  selectedCount,
  statusTarget,
  visibleCount,
  visibleSelectedCount,
  visibleSelectionState,
}: InventoryBulkActionsPanelViewProps) {
  if (!active) {
    return null;
  }

  const selectedLocation = locationTargets.find(
    (location) => location.id === moveTargetLocationId && !location.archived,
  );
  const actionsDisabled = disabled || selectedCount === 0;
  const labelsReady =
    !actionsDisabled &&
    labelsPlan?.action === "LABELS" &&
    labelsPlan.selectedCount === selectedCount;
  const exportReady =
    !actionsDisabled &&
    exportPlan?.action === "EXPORT" &&
    exportPlan.selectedCount === selectedCount;
  const selectionSummary =
    selectedCount > 0 && visibleSelectedCount !== selectedCount
      ? copy.selectedAcrossFilters(selectedCount, visibleSelectedCount)
      : selectedCount > 0
        ? copy.selected(selectedCount)
        : copy.noSelection;

  return (
    <section
      id="inventory-bulk-actions"
      className="surface-subtle space-y-3 p-3"
      aria-labelledby="inventory-bulk-actions-title"
    >
      <div className="min-w-0">
        <h2 id="inventory-bulk-actions-title" className="text-sm font-semibold">
          {copy.title}
        </h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
          {selectionSummary}
        </p>
      </div>

      {review ? (
        <InventoryBulkMutationReview
          copy={copy}
          disabled={disabled}
          onCancelReview={onCancelReview}
          onConfirmReview={onConfirmReview}
          review={review}
          reviewCurrent={reviewCurrent}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <InventoryBulkSelectVisibleCheckbox
              disabled={disabled || visibleCount === 0}
              inputId={inventoryBulkSelectVisibleId}
              label={copy.selectVisible(visibleCount)}
              onCheckedChange={onSelectVisibleChange}
              state={visibleSelectionState}
            />
            {selectedCount > 0 ? (
              <>
                <button
                  id={inventoryBulkMoveActionId}
                  type="button"
                  aria-controls="inventory-bulk-move-editor"
                  aria-expanded={activeMutationAction === "MOVE"}
                  className={modalActionButtonClassName(
                    activeMutationAction === "MOVE" ? "primary" : "secondary",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    onActiveMutationActionChange(
                      activeMutationAction === "MOVE" ? null : "MOVE",
                    )
                  }
                >
                  {copy.moveAction}
                </button>
                <button
                  id={inventoryBulkStatusActionId}
                  type="button"
                  aria-controls="inventory-bulk-status-editor"
                  aria-expanded={activeMutationAction === "STATUS"}
                  className={modalActionButtonClassName(
                    activeMutationAction === "STATUS" ? "primary" : "secondary",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    onActiveMutationActionChange(
                      activeMutationAction === "STATUS" ? null : "STATUS",
                    )
                  }
                >
                  {copy.statusAction}
                </button>
                <button
                  type="button"
                  className={modalActionButtonClassName("secondary")}
                  disabled={!labelsReady}
                  onClick={() => {
                    if (labelsReady && labelsPlan) {
                      onCreateLabels(labelsPlan);
                    }
                  }}
                >
                  {copy.createLabels(selectedCount)}
                </button>
                <button
                  type="button"
                  className={modalActionButtonClassName("secondary")}
                  disabled={!exportReady}
                  onClick={() => {
                    if (exportReady && exportPlan) {
                      onExportCsv(exportPlan);
                    }
                  }}
                >
                  {copy.exportSelectedCsv(selectedCount)}
                </button>
                <button
                  type="button"
                  className={modalActionButtonClassName("secondary")}
                  disabled={!exportReady}
                  onClick={() => {
                    if (exportReady && exportPlan) {
                      onExportJson(exportPlan);
                    }
                  }}
                >
                  {copy.exportSelectedJson(selectedCount)}
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {copy.selectionHint}
              </p>
            )}
            {selectedCount > 0 ? (
              <button
                type="button"
                className="min-h-11 text-xs font-semibold text-slate-600 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300"
                disabled={disabled}
                onClick={() => {
                  onClearSelection();
                  focusInventoryBulkElementAfterRender(
                    visibleCount > 0
                      ? inventoryBulkSelectVisibleId
                      : inventoryBulkSelectionModeTriggerId,
                  );
                }}
              >
                {copy.clearSelection}
              </button>
            ) : null}
          </div>

          {activeMutationAction === "MOVE" && selectedCount > 0 ? (
            <fieldset
              id="inventory-bulk-move-editor"
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {copy.moveTitle}
              </legend>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>{copy.locationLabel}</span>
                  <select
                    value={moveTargetLocationId}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      onMoveTargetLocationIdChange(event.currentTarget.value)
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950"
                  >
                    <option value="">{copy.chooseLocation}</option>
                    {locationTargets.map((location) => (
                      <option
                        key={location.id}
                        value={location.id}
                        disabled={location.archived}
                      >
                        {location.archived
                          ? copy.archivedLocation(location.name)
                          : location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={modalActionButtonClassName("primary")}
                  disabled={actionsDisabled || !selectedLocation}
                  onClick={() => {
                    if (selectedLocation) {
                      onRequestMoveReview(selectedLocation);
                      focusInventoryBulkElementAfterRender(inventoryBulkReviewTitleId);
                    }
                  }}
                >
                  {copy.reviewMove}
                </button>
              </div>
            </fieldset>
          ) : null}

          {activeMutationAction === "STATUS" && selectedCount > 0 ? (
            <fieldset
              id="inventory-bulk-status-editor"
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {copy.statusTitle}
              </legend>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>{copy.statusLabel}</span>
                  <select
                    value={statusTarget}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      const value = event.currentTarget.value as InventoryBulkManualStatus;
                      if (INVENTORY_BULK_MANUAL_STATUSES.includes(value)) {
                        onStatusTargetChange(value);
                      }
                    }}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950"
                  >
                    {INVENTORY_BULK_MANUAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {copy.statusName(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={modalActionButtonClassName("primary")}
                  disabled={actionsDisabled}
                  onClick={() => {
                    onRequestStatusReview(statusTarget);
                    focusInventoryBulkElementAfterRender(inventoryBulkReviewTitleId);
                  }}
                >
                  {copy.reviewStatus}
                </button>
              </div>
            </fieldset>
          ) : null}
        </>
      )}
    </section>
  );
}
