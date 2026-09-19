import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

/** One synchronous write at a time, owned by the mounted library view. */
export function useSettingsMutationScope(key: string, onBusyChange?: (busy: boolean) => void) {
  const view = useMemo(() => ({ key }), [key]);
  const current = useRef<{ view: typeof view; operation: object | null } | null>(null);
  const [activeView, setActiveView] = useState<typeof view | null>(null);
  useLayoutEffect(() => {
    const scope = { view, operation: null as object | null };
    current.current = scope;
    setActiveView(null);
    return () => {
      if (current.current === scope) current.current = null;
      if (scope.operation) onBusyChange?.(false);
    };
  }, [view, onBusyChange]);
  const isActive = useCallback(() => current.current?.view === view, [view]);
  const isBusy = useCallback(() => current.current?.view === view && current.current.operation !== null, [view]);
  const begin = useCallback(() => {
    const scope = current.current;
    if (!scope || scope.view !== view || scope.operation) return null;
    const operation = {};
    scope.operation = operation;
    setActiveView(view);
    onBusyChange?.(true);
    const isCurrent = () => current.current === scope && scope.operation === operation;
    return {
      isCurrent,
      finish: () => {
        if (!isCurrent()) return;
        scope.operation = null;
        setActiveView(null);
        onBusyChange?.(false);
      },
    };
  }, [view, onBusyChange]);
  return { begin, isActive, isBusy, busy: activeView === view };
}
