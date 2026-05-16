import type { PrinterOverviewRow, SpoolWithMasterRow } from "./tauri_client";
import {
  filterAllowedSpoolsForSlot,
  resolveSpoolTareWeightForRow,
} from "./printer_slot_model";
import { summarizeEffectivePrinterSlots } from "./printer_profiles";

export type PrinterPageSummary = {
  printerCount: number;
  loadedSlots: number;
  totalSlots: number;
};

export function buildSpoolsById(spools: SpoolWithMasterRow[]): Map<string, SpoolWithMasterRow> {
  const map = new Map<string, SpoolWithMasterRow>();
  for (const row of spools) {
    map.set(row.spool.id, row);
  }
  return map;
}

export function resolveSpoolTareWeightById(
  spoolsById: Map<string, SpoolWithMasterRow>,
  spoolId: string | null | undefined,
): number {
  const id = (spoolId ?? "").trim();
  if (!id) {
    return 0;
  }
  const row = spoolsById.get(id) ?? null;
  return resolveSpoolTareWeightForRow(row);
}

export function buildPrinterPageSummary(printers: PrinterOverviewRow[]): PrinterPageSummary {
  let loadedSlots = 0;
  let totalSlots = 0;
  for (const printer of printers) {
    const summary = summarizeEffectivePrinterSlots(printer.slots);
    totalSlots += summary.totalSlots;
    loadedSlots += summary.loadedSlots;
  }
  return {
    printerCount: printers.length,
    loadedSlots,
    totalSlots,
  };
}

export function buildAllowedSpoolOptionsBySlotSpoolId(
  printers: PrinterOverviewRow[],
  sortedSpools: SpoolWithMasterRow[],
): Map<string, SpoolWithMasterRow[]> {
  const map = new Map<string, SpoolWithMasterRow[]>();
  map.set("", filterAllowedSpoolsForSlot(sortedSpools));
  const activeSlotSpoolIds = new Set<string>();
  for (const printer of printers) {
    for (const slot of printer.slots) {
      const spoolId = slot.spool_id?.trim();
      if (spoolId) {
        activeSlotSpoolIds.add(spoolId);
      }
    }
  }
  for (const spoolId of activeSlotSpoolIds) {
    map.set(spoolId, filterAllowedSpoolsForSlot(sortedSpools, spoolId));
  }
  return map;
}

export function buildAllowedSpoolOptionMapsBySlotSpoolId(
  allowedSpoolOptionsBySlotSpoolId: Map<string, SpoolWithMasterRow[]>,
): Map<string, Map<string, SpoolWithMasterRow>> {
  const map = new Map<string, Map<string, SpoolWithMasterRow>>();
  for (const [slotSpoolId, options] of allowedSpoolOptionsBySlotSpoolId) {
    map.set(
      slotSpoolId,
      new Map(options.map((option) => [option.spool.id, option])),
    );
  }
  return map;
}
