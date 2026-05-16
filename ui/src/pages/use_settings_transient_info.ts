import { useCallback, useEffect, useRef } from "react";

export function useSettingsTransientInfo(
  setInfo: (updater: string | null | ((currentInfo: string | null) => string | null)) => void,
) {
  const transientInfoTimeoutRef = useRef<number | null>(null);

  const clearTransientInfoTimeout = useCallback(() => {
    if (transientInfoTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(transientInfoTimeoutRef.current);
    transientInfoTimeoutRef.current = null;
  }, []);

  const showTransientInfo = useCallback(
    (message: string, timeoutMs = 3500) => {
      clearTransientInfoTimeout();
      setInfo(message);
      transientInfoTimeoutRef.current = window.setTimeout(() => {
        setInfo((currentInfo) => (currentInfo === message ? null : currentInfo));
        transientInfoTimeoutRef.current = null;
      }, timeoutMs);
    },
    [clearTransientInfoTimeout, setInfo],
  );

  useEffect(() => clearTransientInfoTimeout, [clearTransientInfoTimeout]);

  return { clearTransientInfoTimeout, showTransientInfo };
}
