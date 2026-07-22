import { useCallback, useEffect, useRef, useState } from "react";

import type { AppUpdateCheckState } from "./app_update_check";
import { checkForAppUpdate } from "./tauri_maintenance_client";

export function useAppUpdateCheck() {
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<AppUpdateCheckState>({ status: "IDLE" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const check = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: "CHECKING" });
    try {
      const result = await checkForAppUpdate();
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({ result, status: "SUCCESS" });
      }
    } catch (error) {
      console.error(error);
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({ status: "ERROR" });
      }
    }
  }, []);

  return { check, state };
}
