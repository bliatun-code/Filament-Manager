import { useCallback } from "react";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

export type SettingsResetConfirmAction = "APP" | "CATALOG";

type UseSettingsResetConfirmInput = {
  confirmResetAction: SettingsResetConfirmAction | null;
  setConfirmResetAction: (action: SettingsResetConfirmAction | null) => void;
};

export function useSettingsResetConfirm({
  confirmResetAction,
  setConfirmResetAction,
}: UseSettingsResetConfirmInput) {
  const clearConfirmResetAction = useCallback(() => {
    setConfirmResetAction(null);
  }, [setConfirmResetAction]);

  useSettingsAutoClearValue(confirmResetAction, clearConfirmResetAction, 7000);

  return { clearConfirmResetAction };
}
