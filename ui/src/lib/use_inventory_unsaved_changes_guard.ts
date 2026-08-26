import { useCallback, useEffect, useRef, useState } from "react";

export type InventoryNavigationGuard = (afterConfirmedDiscard: () => void) => boolean;
type InventoryDiscardRequest = (afterConfirmedDiscard?: () => void) => boolean;

export function requestInventoryDetailClose(
  requestDiscardThen: InventoryDiscardRequest,
): boolean {
  return requestDiscardThen();
}

export function requestInventoryDetailDiscard(input: {
  hasUnsavedChanges: boolean;
  onDiscard: () => void;
  onConfirmationRequired: () => void;
}): boolean {
  if (input.hasUnsavedChanges) {
    input.onConfirmationRequired();
    return false;
  }
  input.onDiscard();
  return true;
}

export function confirmInventoryDetailDiscard(input: {
  afterDiscard?: (() => void) | null;
  onDiscard: () => void;
}) {
  input.onDiscard();
  input.afterDiscard?.();
}

type UseInventoryUnsavedChangesGuardInput = {
  active: boolean;
  hasUnsavedChanges: boolean;
  onDiscard: () => void;
  onNavigationGuardChange?: (guard: InventoryNavigationGuard | null) => void;
};

export function useInventoryUnsavedChangesGuard({
  active,
  hasUnsavedChanges,
  onDiscard,
  onNavigationGuardChange,
}: UseInventoryUnsavedChangesGuardInput) {
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const afterConfirmedDiscardRef = useRef<(() => void) | null>(null);

  const requestDiscardThen = useCallback(
    (afterConfirmedDiscard?: () => void) =>
      requestInventoryDetailDiscard({
        hasUnsavedChanges,
        onDiscard,
        onConfirmationRequired: () => {
          afterConfirmedDiscardRef.current = afterConfirmedDiscard ?? null;
          setDiscardConfirmationOpen(true);
        },
      }),
    [hasUnsavedChanges, onDiscard],
  );

  const requestDiscard = useCallback(
    () => requestInventoryDetailClose(requestDiscardThen),
    [requestDiscardThen],
  );

  const cancelDiscardConfirmation = useCallback(() => {
    afterConfirmedDiscardRef.current = null;
    setDiscardConfirmationOpen(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    const afterDiscard = afterConfirmedDiscardRef.current;
    afterConfirmedDiscardRef.current = null;
    setDiscardConfirmationOpen(false);
    confirmInventoryDetailDiscard({ afterDiscard, onDiscard });
  }, [onDiscard]);

  useEffect(() => {
    if (active && hasUnsavedChanges) {
      return;
    }
    afterConfirmedDiscardRef.current = null;
    setDiscardConfirmationOpen(false);
  }, [active, hasUnsavedChanges]);

  useEffect(() => {
    if (!active || !hasUnsavedChanges) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active, hasUnsavedChanges]);

  useEffect(() => {
    if (!active || !onNavigationGuardChange) {
      return;
    }
    onNavigationGuardChange(requestDiscardThen);
    return () => onNavigationGuardChange(null);
  }, [active, onNavigationGuardChange, requestDiscardThen]);

  return {
    cancelDiscardConfirmation,
    confirmDiscard,
    discardConfirmationOpen,
    requestDiscard,
    requestDiscardThen,
  };
}
