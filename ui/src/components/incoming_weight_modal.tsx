import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { formatDisplayPercent } from "../lib/number_display";
import { formatDateTime, formatGrams, toSwatchColor } from "../lib/printer_live_display";
import type { IncomingWeightPrompt } from "../lib/printer_slot_model";
import { modalFormInputClassName } from "./form_control_class";
import { ModalFormField } from "./modal_chrome";
import { SaveOnlyModal } from "./save_only_modal";

type IncomingWeightModalProps = {
  amsEstimateAvailable: boolean;
  busy: boolean;
  prompt: IncomingWeightPrompt;
  incomingWeightValue: string;
  outgoingWeightValue: string;
  onIncomingWeightChange: (value: string) => void;
  onOutgoingWeightChange: (value: string) => void;
  onCancel: () => void;
  onAcceptAmsEstimate: () => void;
  onSave: () => void;
};

export function IncomingWeightModal({
  amsEstimateAvailable,
  busy,
  prompt,
  incomingWeightValue,
  outgoingWeightValue,
  onIncomingWeightChange,
  onOutgoingWeightChange,
  onCancel,
  onAcceptAmsEstimate,
  onSave,
}: IncomingWeightModalProps) {
  const { locale, t } = useI18n();
  const amsEstimate = amsEstimateAvailable ? (prompt.amsWeightEstimate ?? null) : null;

  return (
    <SaveOnlyModal
      title={
        prompt.updatesCurrentRollWeight
          ? t("printers.updateWeight", "Update weight")
          : prompt.requiresIncomingWeight
          ? t("printers.incomingWeightPromptTitle", "Set incoming roll weight")
          : t("printers.outgoingWeightPromptTitle", "Set outgoing roll weight")
      }
      subtitle={formatFilamentDisplayTitle(
        prompt.targetMaterial,
        prompt.targetFilamentName,
        prompt.targetColorName,
      )}
      swatchColor={toSwatchColor(prompt.targetHexColor)}
      cancelDisabled={busy}
      onCancel={onCancel}
      saveDisabled={busy}
      onSave={onSave}
    >
      <div className="space-y-3">
        {amsEstimate ? (
          <div
            data-testid="printer-ams-weight-estimate"
            className="rounded-xl border border-sky-300/70 bg-sky-50/80 p-3 text-sm text-slate-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-slate-200"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-50">
                {t("settings.bambuLiveAmsWeightEstimate", "AMS estimate")}
              </span>
              <span className="font-semibold text-sky-700 dark:text-sky-200">
                {formatDisplayPercent(amsEstimate.remainingPercent, locale, 1)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {t(
                "printers.amsWeightEstimateHint",
                "AMS reports this estimate for the exact RFID-matched roll. It is an estimate, not a scale measurement.",
              )}
            </p>
            <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
              <dt>{t("inventory.remaining", "Remaining")}</dt>
              <dd className="font-medium">{formatGrams(amsEstimate.remainingGrams, "dash", locale)}</dd>
              <dt>{t("inventory.emptySpoolWeight", "Empty spool weight (g)")}</dt>
              <dd className="font-medium">{formatGrams(amsEstimate.tareWeightG, "dash", locale)}</dd>
              <dt>{t("settings.bambuLiveAmsWeightBasis", "AMS spool basis")}</dt>
              <dd className="font-medium">{formatGrams(amsEstimate.trayWeightG, "dash", locale)}</dd>
              <dt>{t("printers.amsCalculatedTotal", "Calculated total incl. spool")}</dt>
              <dd className="font-semibold">
                {formatGrams(amsEstimate.calculatedTotalWeightG, "dash", locale)}
              </dd>
              <dt>{t("printers.lastKnownLive", "Last live update")}</dt>
              <dd className="font-medium">{formatDateTime(amsEstimate.weightSeenAt, locale)}</dd>
            </dl>
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-sky-500/60 bg-sky-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-300/40 dark:bg-sky-800 dark:text-white dark:hover:bg-sky-700"
              disabled={busy}
              onClick={onAcceptAmsEstimate}
            >
              {t("printers.useAmsWeightEstimate", "Use AMS estimate")}
            </button>
          </div>
        ) : null}
        {prompt.requiresOutgoingWeight ? (
          <ModalFormField
            label={t("printers.outgoingWeight", "Outgoing weight (g)")}
            hint={formatFilamentDisplayTitle(
              prompt.currentMaterial,
              prompt.currentFilamentName,
              prompt.currentColorName,
            )}
          >
            <input
              type="number"
              min={0}
              value={outgoingWeightValue}
              onChange={(event) => onOutgoingWeightChange(event.target.value)}
              className={modalFormInputClassName}
              autoFocus={!prompt.requiresIncomingWeight}
            />
          </ModalFormField>
        ) : null}
        {prompt.requiresIncomingWeight ? (
          <ModalFormField label={t("printers.incomingWeightPromptLabel", "Measured weight (g)")}>
            <input
              type="number"
              min={0}
              value={incomingWeightValue}
              onChange={(event) => onIncomingWeightChange(event.target.value)}
              className={modalFormInputClassName}
              autoFocus
            />
          </ModalFormField>
        ) : null}
      </div>
    </SaveOnlyModal>
  );
}
