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
  liveTray?: BambuLiveObservedTray | null,
  nowMs = Date.now(),
): PreparedSlotWeightDialog {
  const prompt = buildIncomingWeightPrompt(printerId, slot, row, liveTray, nowMs);
  return {
    prompt,
    incomingWeightValue: prompt.requiresIncomingWeight ? buildMeasuredTotalWeightDraft(
      row.spool.remaining_g,
      resolveSpoolTareWeightForRow(row),
    ) : "",
    // The stored weight is a baseline, not a fresh measurement of an unloaded roll.
    outgoingWeightValue: "",
  };
}

export function prepareEmptySlotWeightDialog(
  printerId: string,
  slot: PrinterAmsSlotRow,
): PreparedSlotWeightDialog {
  return {
    prompt: buildEmptySlotWeightPrompt(printerId, slot),
    incomingWeightValue: "",
    outgoingWeightValue: "",
  };
}
