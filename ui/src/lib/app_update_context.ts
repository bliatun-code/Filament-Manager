import { createContext, useContext } from "react";

import type { AppUpdateCheckState } from "./app_update_check";
import type { AppUpdateCheckResult } from "./tauri_maintenance_client";

export type AppUpdateContextValue = {
  automaticChecksEnabled: boolean;
  checkManually: () => Promise<AppUpdateCheckResult | null>;
  dismissAvailableUpdate: () => void;
  setAutomaticChecksEnabled: (enabled: boolean) => void;
  showUpdateNotification: boolean;
  state: AppUpdateCheckState;
};

export const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdateContext(): AppUpdateContextValue {
  const context = useContext(AppUpdateContext);
  if (!context) {
    throw new Error("useAppUpdateContext must be used inside AppUpdateProvider.");
  }
  return context;
}
