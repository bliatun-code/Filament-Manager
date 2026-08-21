import { useCallback, useEffect } from "react";

export type InventoryNavigationGuard = () => boolean;

export function requestInventoryDetailDiscard(input: {
  confirmDiscard: (message: string) => boolean;
  hasUnsavedChanges: boolean;
  message: string;
  onDiscard: () => void;
}): boolean {
  if (input.hasUnsavedChanges && !input.confirmDiscard(input.message)) {
    return false;
  }
  input.onDiscard();
  return true;
}

type UseInventoryUnsavedChangesGuardInput = {
  active: boolean;
  hasUnsavedChanges: boolean;
  message: string;
  onDiscard: () => void;
  onNavigationGuardChange?: (guard: InventoryNavigationGuard | null) => void;
};

export function useInventoryUnsavedChangesGuard({
  active,
  hasUnsavedChanges,
  message,
  onDiscard,
  onNavigationGuardChange,
}: UseInventoryUnsavedChangesGuardInput) {
  const requestDiscard = useCallback(
    () =>
      requestInventoryDetailDiscard({
        confirmDiscard: (prompt) => window.confirm(prompt),
        hasUnsavedChanges,
        message,
        onDiscard,
      }),
    [hasUnsavedChanges, message, onDiscard],
  );

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
    onNavigationGuardChange(requestDiscard);
    return () => onNavigationGuardChange(null);
  }, [active, onNavigationGuardChange, requestDiscard]);

  return requestDiscard;
}
