import { useId } from "react";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import {
  bambuBatchCodeFieldClassName,
  bambuBatchCreateStateMessage,
  bambuBatchPanelClassName,
  bambuBatchRowPreview,
  bambuBatchRowStatusLabel,
  bambuBatchSelectionOptionLabel,
} from "./inventory_bambu_batch_modal_model";
import { ModalActionButton } from "./modal_action_button";
import { ModalBody, ModalFooter } from "./modal_chrome";

type InventoryBambuBatchReviewPanelProps = {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  onRowSelectionChange: (rowKey: string, masterId: string | null) => void;
  tauriAvailable: boolean;
};

const bambuBatchRowSelectClassName =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
const bambuBatchReviewPanelClassName = `flex min-h-0 flex-col ${bambuBatchPanelClassName}`;

export function InventoryBambuBatchReviewPanel({
  batch,
  createState,
  disabledCreate,
  input,
  onCreateBatch,
  onInputChange,
  onRowSelectionChange,
  tauriAvailable,
}: InventoryBambuBatchReviewPanelProps) {
  const { t } = useI18n();
  const batchInputId = useId();
  const visibleRows = batch.rows.slice(0, 30);
  const hiddenCount = Math.max(0, batch.rows.length - visibleRows.length);
  const createMessage = bambuBatchCreateStateMessage(createState, t);

  return (
    <aside className={bambuBatchReviewPanelClassName}>
      <div className="shrink-0 border-b border-slate-200/80 p-3 dark:border-slate-800/70">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {t("inventory.bambuBatchTitle", "Batch Filament Codes")}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                "inventory.bambuBatchHelp",
                "Paste one or more five digit codes. Ready matches use the stock details from Add filament.",
              )}
            </div>
          </div>
          {batch.rows.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold tabular-nums">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                {batch.creatableRows.length}{" "}
                {t("inventory.bambuBatchReadyShort", "ready")}
              </span>
              {batch.blockedRows.length > 0 ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                  {batch.blockedRows.length}{" "}
                  {t("inventory.bambuBatchNeedsReview", "review")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {createMessage ? (
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {createMessage}
          </div>
        ) : null}
      </div>

      <ModalBody overscrollContain className="p-3">
        <label
          htmlFor={batchInputId}
          className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          {t("inventory.bambuBatchInputLabel", "Codes in this batch")}
        </label>
        <textarea
          id={batchInputId}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={t("inventory.bambuBatchPlaceholder", "53400\n53600\n65103")}
          rows={3}
          className={`w-full resize-y ${bambuBatchCodeFieldClassName}`}
          disabled={!tauriAvailable}
        />

        {batch.rows.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {visibleRows.map((row) => {
              const ready = Boolean(row.master);
              const selectable = row.selectionMatches.length > 1;
              return (
                <div
                  key={row.key}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/55"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                      {row.code ?? row.sourceText}
                    </div>
                    <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {bambuBatchRowPreview(row)}
                    </div>
                    {selectable ? (
                      <label className="mt-2 block">
                        <span className="sr-only">
                          {t(
                            "inventory.bambuBatchChooseMatch",
                            "Choose catalog row",
                          )}
                        </span>
                        <select
                          value={row.master?.id ?? ""}
                          onChange={(event) =>
                            onRowSelectionChange(row.key, event.currentTarget.value || null)
                          }
                          className={bambuBatchRowSelectClassName}
                          disabled={!tauriAvailable}
                        >
                          <option value="">
                            {t(
                              "inventory.bambuBatchChooseMatch",
                              "Choose catalog row",
                            )}
                          </option>
                          {row.selectionMatches.map((master) => (
                            <option key={master.id} value={master.id}>
                              {bambuBatchSelectionOptionLabel(master, t)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                      ready
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                    }`}
                  >
                    {bambuBatchRowStatusLabel(row, t)}
                  </span>
                </div>
              );
            })}
            {hiddenCount > 0 ? (
              <div className="px-1 text-xs text-slate-500 dark:text-slate-400">
                +{hiddenCount} {t("inventory.bambuBatchMoreRows", "more")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t(
              "inventory.bambuBatchNoRowsYet",
              "Scanned and typed codes will appear here.",
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter className="p-3">
        <ModalActionButton
          type="button"
          fullWidth
          variant="solid"
          size="roomy"
          onClick={onCreateBatch}
          disabled={disabledCreate}
        >
          {t("inventory.bambuBatchAddReady", "Add ready matches")} ·{" "}
          {batch.creatableRows.length}
        </ModalActionButton>
      </ModalFooter>
    </aside>
  );
}
