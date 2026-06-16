import { formatFilamentDisplayTitle, formatSpoolReference } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import {
  formatDateTime,
  swatchCssBackground,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import type { SlotRfidOverridePrompt } from "../lib/printer_slot_model";
import { AppModal } from "./app_modal";
import { ModalHeader } from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";

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

          <div className="surface-card space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatFilamentDisplayTitle(
                prompt.spool.master.material,
                prompt.spool.master.filament_name,
                prompt.spool.master.color_name,
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {`${prompt.spool.master.vendor} · ${formatSpoolReference(prompt.spool.spool.id)}`}
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidCurrentTag", "Saved RFID")}
                </dt>
                <dd className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">
                  {prompt.spool.spool.rfid_tag?.trim() || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidObservedTag", "Observed RFID")}
                </dt>
                <dd className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">
                  {prompt.liveTray.tray_uuid?.trim() || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
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
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidLastSeen", "Last seen")}
                </dt>
                <dd className="mt-1 text-slate-900 dark:text-slate-100">
                  {prompt.observedAt ? formatDateTime(prompt.observedAt, locale) : "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-100"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-500"
              onClick={onSave}
              disabled={!prompt.liveTray.tray_uuid?.trim() || busy}
            >
              {t("inventory.saveRfid", "Save RFID")}
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
