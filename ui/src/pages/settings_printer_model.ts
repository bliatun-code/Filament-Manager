import type { PrinterOverviewRow } from "../lib/tauri_client";
import { isExternalSlotId, resolvePrinterModelProfile } from "../lib/printer_profiles";

export type PrinterMultiMaterialConfig = {
  units: number;
  slotsPerUnit: number;
};

export function derivePrinterMultiConfig(input: {
  printerId: string;
  model: string;
  printerOverview: PrinterOverviewRow[];
}): PrinterMultiMaterialConfig {
  const slots =
    input.printerOverview.find((item) => item.printer.id === input.printerId)?.slots ?? [];
  const profile = resolvePrinterModelProfile(input.model);
  const slotCountByUnit = new Map<string, number>();
  for (const slot of slots) {
    if (isExternalSlotId(slot.ams_id)) {
      continue;
    }
    slotCountByUnit.set(slot.ams_id, (slotCountByUnit.get(slot.ams_id) ?? 0) + 1);
  }
  const units = slotCountByUnit.size;
  const slotsPerUnit =
    units > 0
      ? Math.max(...Array.from(slotCountByUnit.values()))
      : profile.defaultSlotsPerUnit;
  return { units, slotsPerUnit };
}

export function isBambuLabPrinter(model: string): boolean {
  return model.trim().toLowerCase().startsWith("bambu lab");
}
