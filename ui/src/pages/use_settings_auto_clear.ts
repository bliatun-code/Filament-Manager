import { useEffect } from "react";

export function useSettingsAutoClearValue<T>(
  value: T,
  clearValue: () => void,
  timeoutMs: number,
) {
  useEffect(() => {
    if (!value) {
      return;
    }
    const timer = window.setTimeout(clearValue, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [clearValue, timeoutMs, value]);
}
