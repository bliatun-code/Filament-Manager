import {
  buildEmptySlotWeightPrompt,
  buildIncomingWeightPrompt,
  buildMeasuredTotalWeightDraft,
  resolveSpoolTareWeightForRow,
  type IncomingWeightPrompt,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
import type {
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

type ResolveSpoolTareWeightById = (
  spoolId: string | null | undefined,
) => number;

export type PreparedSlotWeightDialog = {
  prompt: IncomingWeightPrompt;
  incomingWeightValue: string;
  outgoingWeightValue: string;
};

export type ClosedSlotWeightDialog = {
  discardSlotId: string | null;
  prompt: null;
  incomingWeightValue: string;
  outgoingWeightValue: string;
};

export function buildClosedSlotWeightDialog(
  prompt: IncomingWeightPrompt | null,
): ClosedSlotWeightDialog {
  return {
    discardSlotId: prompt?.slotId ?? null,
    prompt: null,
    incomingWeightValue: "",
    outgoingWeightValue: "",
  };
}

export function discardIncomingWeightSlotDraft(
  current: Record<string, SlotSwapDraft>,
  slotId: string | null | undefined,
): Record<string, SlotSwapDraft> {
  if (!slotId || !(slotId in current)) {
    return current;
  }
  const next = { ...current };
  delete next[slotId];
  return next;
}

export function prepareIncomingWeightDialog(
  printerId: string,
  slot: PrinterAmsSlotRow,
  row: SpoolWithMasterRow,
  resolveSpoolTareWeightById: ResolveSpoolTareWeightById,
  liveTray?: BambuLiveObservedTray | null,
  nowMs = Date.now(),
): PreparedSlotWeightDialog {
  const prompt = buildIncomingWeightPrompt(printerId, slot, row, liveTray, nowMs);
  return {
    prompt,
    incomingWeightValue: buildMeasuredTotalWeightDraft(
      row.spool.remaining_g,
      resolveSpoolTareWeightForRow(row),
    ),
    outgoingWeightValue:
      prompt.requiresOutgoingWeight && slot.spool_remaining_g != null
        ? buildMeasuredTotalWeightDraft(
            slot.spool_remaining_g,
            resolveSpoolTareWeightById(slot.spool_id ?? null),
          )
        : "",
  };
}

export function prepareEmptySlotWeightDialog(
  printerId: string,
  slot: PrinterAmsSlotRow,
  resolveSpoolTareWeightById: ResolveSpoolTareWeightById,
): PreparedSlotWeightDialog {
  return {
    prompt: buildEmptySlotWeightPrompt(printerId, slot),
    incomingWeightValue: "",
    outgoingWeightValue:
      slot.spool_remaining_g != null
        ? buildMeasuredTotalWeightDraft(
            slot.spool_remaining_g,
            resolveSpoolTareWeightById(slot.spool_id ?? null),
          )
        : "",
  };
}
