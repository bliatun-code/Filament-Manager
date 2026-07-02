import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { toSwatchColor } from "../lib/printer_live_display";
import type { IncomingWeightPrompt } from "../lib/printer_slot_model";
import { modalFormInputClassName } from "./form_control_class";
import { ModalFormField } from "./modal_chrome";
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
