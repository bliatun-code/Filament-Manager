import { useCallback, useState } from "react";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

export function useSettingsFeedbackState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const clearInfo = useCallback(() => {
    setInfo(current => current === info ? null : current);
  }, [info]);
  useSettingsAutoClearValue(info, clearInfo, 20_000);

  return {
    busy,
    error,
    info,
    setBusy,
    setError,
    setInfo,
  };
}
