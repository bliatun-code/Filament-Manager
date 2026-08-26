import { isSpoolStatusAssigned, isSpoolStatusUnavailableForSlot } from "./inventory_domain";
import type { InventorySpool } from "./inventory_list_model";
import type { AssignPrinterSlotInput } from "./tauri_client";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

export type InventoryLoadSpoolBlockReason =
  | "already-assigned"
  | "loaned-spool"
  | "occupied-slot"
  | "stale-slot"
  | "unavailable-spool";

export type InventoryLoadSpoolPreparation =
  | { ok: true; input: AssignPrinterSlotInput }
  | { ok: false; reason: InventoryLoadSpoolBlockReason };

export function availableInventoryLoadSlots(
  slots: InventoryPrinterSlotOption[],
): InventoryPrinterSlotOption[] {
  return slots.filter((slot) => !slot.spoolId);
}

export function prepareInventoryLoadSpoolAssignment(input: {
  assignedSlot: InventoryPrinterSlotOption | null;
  availableSlots: InventoryPrinterSlotOption[];
  loanedOut: boolean;
  selectedSlotId: string;
  spool: InventorySpool;
}): InventoryLoadSpoolPreparation {
  if (input.loanedOut) {
    return { ok: false, reason: "loaned-spool" };
  }
  if (input.assignedSlot || isSpoolStatusAssigned(input.spool.status)) {
    return { ok: false, reason: "already-assigned" };
  }
  if (isSpoolStatusUnavailableForSlot(input.spool.status)) {
    return { ok: false, reason: "unavailable-spool" };
  }
  const slot = input.availableSlots.find((candidate) => candidate.slotId === input.selectedSlotId);
  if (!slot) {
    return { ok: false, reason: "stale-slot" };
  }
  if (slot.spoolId) {
    return { ok: false, reason: "occupied-slot" };
  }
  return {
    ok: true,
    input: {
      printer_id: slot.printerId,
      slot_id: slot.slotId,
      spool_id: input.spool.id,
    },
  };
}
