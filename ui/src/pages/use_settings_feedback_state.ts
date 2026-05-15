import { useState } from "react";

export function useSettingsFeedbackState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  return {
    busy,
    error,
    info,
    setBusy,
    setError,
    setInfo,
  };
}
