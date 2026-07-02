import { formatFilamentDisplayTitle, formatSpoolReference } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import {
  formatDateTime,
  liveTrayIdentity,
  swatchCssBackground,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import type { SlotRfidOverridePrompt } from "../lib/printer_slot_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import { AppModal } from "./app_modal";
import { ModalActionButton } from "./modal_action_button";
import {
  modalDetailLabelClassName,
  modalDetailValueClassName,
  ModalHeader,
} from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useResolvedTheme } from "../lib/theme_mode";

type RfidOverrideModalProps = {
  busy: boolean;
  locale: Locale;
  prompt: SlotRfidOverridePrompt;
  onClose: () => void;
  onSave: () => void;
};

export function RfidOverrideModal({
  busy,
  locale,
  prompt,
  onClose,
  onSave,
}: RfidOverrideModalProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const observedRfid = liveTrayIdentity(prompt.liveTray);

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      panelClassName={modalPanelClassName("md", "p-0")}
    >
      <div>
        <ModalHeader
          eyebrow={t("inventory.rfidCaptureTitle", "RFID capture")}
          title={t("printers.rfidOverridden", "RFID overridden")}
          subtitle={`${prompt.printerName} · ${formatPrinterSlotLabelForModel(t, prompt.printerModel, {
            ams_id: prompt.slot.ams_id,
            slot_index: prompt.slot.slot_index,
          })}`}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-5"
        />

        <div className="space-y-4 px-6 py-6">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100">
            {t(
              "printers.rfidOverrideDialogHint",
              "This slot is manually assigned while AMS still reports the same unregistered RFID identity. Save it on the selected roll when you are ready.",
            )}
          </div>

          <div
            className="surface-card space-y-3"
            style={inventorySwatchPanelStyle(prompt.spool.master.hex_color, resolvedTheme)}
          >
            <SwatchSelectionPreviewHeader
              eyebrow={t("inventory.selectionPreview", "Selection preview")}
              size="large"
              swatchColor={prompt.spool.master.hex_color}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {formatFilamentDisplayTitle(
                  prompt.spool.master.material,
                  prompt.spool.master.filament_name,
                  prompt.spool.master.color_name,
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {`${prompt.spool.master.vendor} · ${formatSpoolReference(prompt.spool.spool.id)}`}
              </div>
            </SwatchSelectionPreviewHeader>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className={modalDetailLabelClassName}>
                  {t("inventory.rfidCurrentTag", "Saved RFID")}
                </dt>
                <dd className={`${modalDetailValueClassName} break-all font-mono`}>
                  {prompt.spool.spool.rfid_tag?.trim() || "-"}
                </dd>
              </div>
              <div>
                <dt className={modalDetailLabelClassName}>
                  {t("inventory.rfidObservedTag", "Observed RFID")}
                </dt>
                <dd className={`${modalDetailValueClassName} break-all font-mono`}>
                  {observedRfid || "-"}
                </dd>
              </div>
              <div>
                <dt className={modalDetailLabelClassName}>
                  {t("inventory.rfidObservedColor", "Observed color")}
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <span
                    className="h-5 w-5 rounded border border-slate-200 dark:border-slate-700"
                    style={{ background: swatchCssBackground(prompt.liveTray.color_hex) }}
                  />
                  <span className="font-mono">{prompt.liveTray.color_hex?.trim() || "-"}</span>
                </dd>
              </div>
              <div>
                <dt className={modalDetailLabelClassName}>
                  {t("inventory.rfidLastSeen", "Last seen")}
                </dt>
                <dd className={modalDetailValueClassName}>
                  {prompt.observedAt ? formatDateTime(prompt.observedAt, locale) : "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <ModalActionButton
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel", "Cancel")}
            </ModalActionButton>
            <ModalActionButton
              type="button"
              variant="primary"
              swatchColor={prompt.spool.master.hex_color}
              resolvedTheme={resolvedTheme}
              onClick={onSave}
              disabled={!observedRfid || busy}
            >
              {t("inventory.saveRfid", "Save RFID")}
            </ModalActionButton>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
