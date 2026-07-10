import { useI18n } from "../lib/i18n";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import type { PrinterAmsSlotRow, SpoolWithMasterRow } from "../lib/tauri_client";
import { InventorySwatchChip } from "./inventory_swatch_chip";

type PrinterSlotSummaryStripProps = {
  model: string;
  slots: PrinterAmsSlotRow[];
  findSpoolById: (spoolId?: string | null) => SpoolWithMasterRow | null;
};

export function PrinterSlotSummaryStrip({
  model,
  slots,
  findSpoolById,
}: PrinterSlotSummaryStripProps) {
  const { t } = useI18n();
  const assignedSlots = slots.flatMap((slot) => {
    if (!slot.spool_id) {
      return [];
    }
    const spool = findSpoolById(slot.spool_id);
    const material = slot.spool_material?.trim() || spool?.master.material.trim() || "—";
    const filamentName =
      slot.spool_filament_name?.trim() || spool?.master.filament_name.trim() || material;
    const colorName = slot.spool_color_name?.trim() || spool?.master.color_name.trim() || "";
    const swatchColor = slot.spool_hex_color || spool?.master.hex_color || null;
    const slotLabel = formatPrinterSlotLabelForModel(t, model, slot);
    const title = [slotLabel, filamentName, colorName].filter(Boolean).join(" · ");
    return [{ slot, colorName, material, slotLabel, swatchColor, title }];
  });

  if (assignedSlots.length === 0) {
    return null;
  }

  return (
    <ul
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
      aria-label={t("printers.loadedSlots", "Loaded slots")}
    >
      {assignedSlots.map(({ slot, colorName, material, slotLabel, swatchColor, title }) => (
        <li
          key={slot.slot_id}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/55 px-1.5 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-950/30 dark:shadow-none"
          title={title}
        >
          <InventorySwatchChip
            className="h-7 w-5 rounded-md"
            swatchColor={swatchColor}
            title={colorName || material}
            tone="current"
          />
          <span className="min-w-0 pr-0.5 leading-none">
            <span className="block max-w-28 truncate text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {slotLabel}
            </span>
            <span className="mt-1 block max-w-28 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              {material}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
