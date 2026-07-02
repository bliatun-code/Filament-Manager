import { formatFilamentDisplayTitle, formatSpoolReference } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import {
  formatDateTime,
  liveTrayIdentity,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import type { SlotRfidOverridePrompt } from "../lib/printer_slot_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import { AppModal } from "./app_modal";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalDetailGrid,
  ModalDetailItem,
  ModalHeader,
  ModalNotice,
} from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useResolvedTheme } from "../lib/theme_mode";
import { InventorySwatchChip } from "./inventory_swatch_chip";

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
          <ModalNotice tone="warning">
            {t(
              "printers.rfidOverrideDialogHint",
              "This slot is manually assigned while AMS still reports the same unregistered RFID identity. Save it on the selected roll when you are ready.",
            )}
          </ModalNotice>

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
            <ModalDetailGrid className="gap-3">
              <ModalDetailItem
                label={t("inventory.rfidCurrentTag", "Saved RFID")}
                valueClassName="break-all font-mono"
              >
                {prompt.spool.spool.rfid_tag?.trim() || "-"}
              </ModalDetailItem>
              <ModalDetailItem
                label={t("inventory.rfidObservedTag", "Observed RFID")}
                valueClassName="break-all font-mono"
              >
                {observedRfid || "-"}
              </ModalDetailItem>
              <ModalDetailItem
                label={t("inventory.rfidObservedColor", "Observed color")}
                valueClassName="flex items-center gap-2 text-slate-900 dark:text-slate-100"
              >
                <InventorySwatchChip
                  className="h-5 w-5 rounded"
                  swatchColor={prompt.liveTray.color_hex}
                  tone="tiny"
                />
                <span className="font-mono">{prompt.liveTray.color_hex?.trim() || "-"}</span>
              </ModalDetailItem>
              <ModalDetailItem label={t("inventory.rfidLastSeen", "Last seen")}>
                {prompt.observedAt ? formatDateTime(prompt.observedAt, locale) : "-"}
              </ModalDetailItem>
            </ModalDetailGrid>
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
