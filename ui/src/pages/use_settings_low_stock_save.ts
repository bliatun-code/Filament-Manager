import { useLayoutEffect, useRef } from "react";
import { useSettingsMutationScope } from "../lib/use_settings_mutation_scope";
import { saveLibrarySyncSettings, type LibrarySyncSettings, type LowStockPolicy } from "../lib/tauri_client";

type Input = {
  scopeKey: string;
  settings: LibrarySyncSettings | null;
  tauri: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSaved: (settings: LibrarySyncSettings) => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  clearFeedback: () => void;
};

export function useSettingsLowStockSave(input: Input) {
  const { begin } = useSettingsMutationScope(input.scopeKey, input.setBusy);
  const settingsRef = useRef(input.settings);
  useLayoutEffect(() => { settingsRef.current = input.settings; }, [input.settings]);
  return async (policy: LowStockPolicy) => {
    const settings = input.settings;
    if (!input.tauri || input.busy || !settings || settings.mode === "CLIENT" || settingsRef.current !== settings) return;
    const operation = begin();
    if (!operation) return;
    input.clearFeedback();
    try {
      const saved = await saveLibrarySyncSettings({ ...settings, low_stock_policy: policy });
      if (!operation.isCurrent()) return;
      settingsRef.current = saved;
      input.onSaved(saved);
      input.onSuccess();
    } catch (error) {
      if (operation.isCurrent()) input.onError(error);
    } finally { operation.finish(); }
  };
}
