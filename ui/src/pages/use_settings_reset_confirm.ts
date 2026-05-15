import { useCallback, useState } from "react";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

export type SettingsResetConfirmAction = "APP" | "CATALOG";

export function useSettingsResetConfirm() {
  const [confirmResetAction, setConfirmResetAction] =
    useState<SettingsResetConfirmAction | null>(null);

  const clearConfirmResetAction = useCallback(() => {
    setConfirmResetAction(null);
  }, [setConfirmResetAction]);

  useSettingsAutoClearValue(confirmResetAction, clearConfirmResetAction, 7000);

  return {
    clearConfirmResetAction,
    confirmResetAction,
    setConfirmResetAction,
  };
}
