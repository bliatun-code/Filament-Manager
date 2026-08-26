export type InventorySpoolDetailFooterFocusTarget = "cancel" | "keep-editing" | null;

export function inventorySpoolDetailFooterFocusTarget(input: {
  discardConfirmationOpen: boolean;
  manageBusy: boolean;
  wasDiscardConfirmationOpen: boolean;
}): InventorySpoolDetailFooterFocusTarget {
  if (input.manageBusy) {
    return null;
  }
  if (input.discardConfirmationOpen) {
    return "keep-editing";
  }
  return input.wasDiscardConfirmationOpen ? "cancel" : null;
}
