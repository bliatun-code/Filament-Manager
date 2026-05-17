import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { toSwatchColor } from "../lib/printer_live_display";
import type { IncomingWeightPrompt } from "../lib/printer_slot_model";
import { modalFormInputClassName } from "./form_control_class";
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
              className={modalFormInputClassName}
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
              className={modalFormInputClassName}
              autoFocus
            />
          </div>
        ) : null}
      </div>
    </SaveOnlyModal>
  );
}
