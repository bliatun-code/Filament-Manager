import { useEffect, useRef } from "react";
import type { BambuBatchRegistrationSnapshot } from "../lib/bambu_batch_registration";
import { useI18n } from "../lib/i18n";
import { ModalActionButton } from "./modal_action_button";
import { ModalFooter, ModalNotice } from "./modal_chrome";

export function InventoryBambuBatchOutcomePanel({
  registration,
  busy,
  error,
  onRetry,
  onNewBatch,
  onOpenSpool,
}: {
  registration: BambuBatchRegistrationSnapshot;
  busy: boolean;
  error?: string | null;
  onRetry: () => void;
  onNewBatch: () => void;
  onOpenSpool: (spoolId: string) => void;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const saving = busy || registration.status === "SAVING";
  const complete = registration.status === "COMPLETE";
  const statusMessage = complete
    ? t("inventory.bambuBatchComplete", "Registered {count, plural, one {# roll} other {# rolls}}.", { count: registration.spoolIds.length })
    : registration.status === "REJECTED"
      ? t("inventory.bambuBatchRejected", "This batch was not saved. Review the error, then edit the batch.")
      : registration.status === "UNCERTAIN"
        ? t("inventory.bambuBatchUncertain", "We could not confirm whether this batch was saved. Continue the same batch to check or finish it without creating duplicates.")
        : t("inventory.bambuBatchSaving", "Saving {count, plural, one {# roll} other {# rolls}}...", { count: registration.rows.length });

  useEffect(() => {
    const target = saving ? panel.current : panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (target ?? panel.current)?.focus();
  }, [registration.batchId, registration.status, saving]);

  return (
    <div ref={panel} tabIndex={-1} className="flex h-full min-h-0 flex-col gap-3 outline-none">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
        <ModalNotice tone={complete ? "success" : registration.status === "REJECTED" ? "danger" : "neutral"}
          role="status" aria-live="polite">
          {statusMessage}
        </ModalNotice>
        {registration.error ? <ModalNotice tone="danger">{registration.error}</ModalNotice> : null}
        {error && error !== registration.error ? <ModalNotice tone="danger">{error}</ModalNotice> : null}
        <ol className="space-y-2">
          {registration.rows.map((row, index) => {
            const spoolId = complete ? registration.spoolIds[index] : null;
            return (
              <li key={`${registration.batchId}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold">{index + 1}. {row.label}</div>
                  {row.code ? <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{row.code}</div> : null}
                </div>
                {spoolId ? (
                  <ModalActionButton disabled={saving} onClick={() => onOpenSpool(spoolId)}
                    aria-label={`${t("inventory.openCreatedRoll", "Open roll")}: ${index + 1}. ${row.label}`}>
                    {t("inventory.openCreatedRoll", "Open roll")}
                  </ModalActionButton>
                ) : null}
              </li>
            );
          })}
        </ol>
        {complete && registration.remainingCount > 0 ? (
          <ModalNotice tone="neutral">
            {t("inventory.bambuBatchRemaining", "{count, plural, one {# row still needs review and has been kept for the next batch.} other {# rows still need review and have been kept for the next batch.}}", { count: registration.remainingCount })}
          </ModalNotice>
        ) : null}
      </div>
      {registration.status !== "SAVING" ? (
        <ModalFooter className="p-0 pt-3">
          <ModalActionButton disabled={saving} variant="solid" size="roomy" fullWidth
            onClick={registration.status === "UNCERTAIN" ? onRetry : onNewBatch}>
            {registration.status === "UNCERTAIN"
              ? t("inventory.bambuBatchContinue", "Continue same batch")
              : complete
                ? t("inventory.bambuBatchNew", "Start new batch")
                : t("inventory.bambuBatchEdit", "Edit batch")}
          </ModalActionButton>
        </ModalFooter>
      ) : null}
    </div>
  );
}
