import { useCallback, useEffect, useRef, useState } from "react";

import type { AppUpdateCheckState } from "./app_update_check";
import {
  checkForAppUpdate,
  type AppUpdateCheckResult,
} from "./tauri_maintenance_client";

export type AppUpdateCheckOptions = {
  silent?: boolean;
};

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

  const check = useCallback(
    async ({
      silent = false,
    }: AppUpdateCheckOptions = {}): Promise<AppUpdateCheckResult | null> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!silent) {
        setState({ status: "CHECKING" });
      }
      try {
        const result = await checkForAppUpdate();
        if (
          mountedRef.current &&
          requestIdRef.current === requestId &&
          (!silent || result.status === "UPDATE_AVAILABLE")
        ) {
          setState({ result, status: "SUCCESS" });
        }
        return result;
      } catch (error) {
        console.error(error);
        if (!silent && mountedRef.current && requestIdRef.current === requestId) {
          setState({ status: "ERROR" });
        }
        return null;
      }
    },
    [],
  );

  return { check, state };
}
