import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { InventorySpool } from "../lib/inventory_list_model";
import type { InventoryPrinterSlotOption } from "../lib/use_inventory_printer_slots";
import { AppModal } from "./app_modal";
import { inventoryDetailSaveButtonClassName } from "./inventory_detail_panel_class";
import { inventoryModalOverlayClassName } from "./inventory_modal_chrome";
import { ModalFooter, ModalHeader, ModalNotice } from "./modal_chrome";
import { appSoftButtonClassName } from "./ui_class_names";

type InventoryLoadSpoolModalProps = {
  busy: boolean;
  onClose: () => void;
  onConfirm: (slotId: string) => void;
  open: boolean;
  slotLabelById: ReadonlyMap<string, string>;
  slots: InventoryPrinterSlotOption[];
  spool: InventorySpool | null;
};

export function InventoryLoadSpoolModal({
  busy,
  onClose,
  onConfirm,
  open,
  slotLabelById,
  slots,
  spool,
}: InventoryLoadSpoolModalProps) {
  const { t } = useI18n();
  const [selectedSlotId, setSelectedSlotId] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedSlotId(slots[0]?.slotId ?? "");
    }
  }, [open, slots]);

  if (!open || !spool) {
    return null;
  }

  return (
    <AppModal
      zIndex={70}
      closeOnBackdrop
      onBackdropClose={busy ? undefined : onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName="flex max-h-[calc(100dvh-3rem)] w-[min(92vw,34rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <ModalHeader
        eyebrow={t("inventory.placement", "Placement")}
        title={t("inventory.loadInPrinter", "Load in printer")}
        subtitle={`${spool.vendor} · ${spool.material} · ${spool.colorName}`}
        closeLabel={t("common.close", "Close")}
        disabled={busy}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <ModalNotice tone="info">
          {t(
            "inventory.loadInPrinterHint",
            "The selected roll is ready. Choose only the printer slot; no new roll search is needed.",
          )}
        </ModalNotice>
        {slots.length === 0 ? (
          <ModalNotice className="mt-4" tone="warning">
            {t("inventory.noAvailablePrinterSlots", "No empty printer slots are available.")}
          </ModalNotice>
        ) : (
          <fieldset className="mt-4 space-y-2 border-0 p-0">
            <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {t("inventory.slotAssignment", "Slot assignment")}
            </legend>
            {slots.map((slot) => {
              const selected = selectedSlotId === slot.slotId;
              return (
                <label
                  key={slot.slotId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    selected
                      ? "border-sky-500 bg-sky-50 text-slate-950 dark:bg-sky-950/40 dark:text-white"
                      : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="inventory-load-printer-slot"
                    value={slot.slotId}
                    checked={selected}
                    disabled={busy}
                    onChange={() => setSelectedSlotId(slot.slotId)}
                  />
                  <span className="font-semibold">
                    {slotLabelById.get(slot.slotId) ?? `${slot.printerName} · ${slot.slotId}`}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
      <ModalFooter className="flex items-center justify-end gap-3 px-5 py-4">
        <button
          type="button"
          className={`${appSoftButtonClassName} px-4 py-2 text-sm`}
          disabled={busy}
          onClick={onClose}
        >
          {t("common.cancel", "Cancel")}
        </button>
        <button
          type="button"
          className={inventoryDetailSaveButtonClassName}
          disabled={busy || !selectedSlotId}
          onClick={() => onConfirm(selectedSlotId)}
        >
          {busy
            ? t("inventory.updatingRoll", "Updating selected roll...")
            : t("inventory.loadInPrinter", "Load in printer")}
        </button>
      </ModalFooter>
    </AppModal>
  );
}
