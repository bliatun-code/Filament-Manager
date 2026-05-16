import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { toSwatchColor } from "../lib/printer_live_display";
import type { IncomingWeightPrompt } from "../lib/printer_slot_model";
import { SaveOnlyModal } from "./save_only_modal";

type IncomingWeightModalProps = {
  busy: boolean;
  prompt: IncomingWeightPrompt;
  incomingWeightValue: string;
  outgoingWeightValue: string;
  onIncomingWeightChange: (value: string) => void;
  onOutgoingWeightChange: (value: string) => void;
  onSave: () => void;
};

export function IncomingWeightModal({
  busy,
  prompt,
  incomingWeightValue,
  outgoingWeightValue,
  onIncomingWeightChange,
  onOutgoingWeightChange,
  onSave,
}: IncomingWeightModalProps) {
  const { t } = useI18n();

  return (
    <SaveOnlyModal
      title={
        prompt.requiresIncomingWeight
          ? t("printers.incomingWeightPromptTitle", "Set incoming roll weight")
          : t("printers.outgoingWeightPromptTitle", "Set outgoing roll weight")
      }
      subtitle={formatFilamentDisplayTitle(
        prompt.targetMaterial,
        prompt.targetFilamentName,
        prompt.targetColorName,
      )}
      swatchColor={toSwatchColor(prompt.targetHexColor)}
      saveDisabled={busy}
      onSave={onSave}
    >
      <div className="space-y-3">
        {prompt.requiresOutgoingWeight ? (
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("printers.outgoingWeight", "Outgoing weight (g)")}
            </label>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {formatFilamentDisplayTitle(
                prompt.currentMaterial,
                prompt.currentFilamentName,
                prompt.currentColorName,
              )}
            </div>
            <input
              type="number"
              min={0}
              value={outgoingWeightValue}
              onChange={(event) => onOutgoingWeightChange(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
              autoFocus={!prompt.requiresIncomingWeight}
            />
          </div>
        ) : null}
        {prompt.requiresIncomingWeight ? (
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("printers.incomingWeightPromptLabel", "Measured weight (g)")}
            </label>
            <input
              type="number"
              min={0}
              value={incomingWeightValue}
              onChange={(event) => onIncomingWeightChange(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
              autoFocus
            />
          </div>
        ) : null}
      </div>
    </SaveOnlyModal>
  );
}
