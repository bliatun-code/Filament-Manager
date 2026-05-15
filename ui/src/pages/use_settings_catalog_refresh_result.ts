import { useCallback, useState } from "react";
import type { CatalogRefreshResult } from "../lib/tauri_client";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

export function useSettingsCatalogRefreshResult() {
  const [catalogRefreshSummary, setCatalogRefreshSummary] =
    useState<CatalogRefreshResult | null>(null);
  const [catalogRefreshLog, setCatalogRefreshLog] = useState("");
  const [showCatalogRefreshLog, setShowCatalogRefreshLog] = useState(false);

  const clearCatalogRefreshSummary = useCallback(() => {
    setCatalogRefreshSummary(null);
  }, []);

  const beginCatalogRefreshResult = useCallback(() => {
    setCatalogRefreshSummary(null);
    setCatalogRefreshLog("");
    setShowCatalogRefreshLog(false);
  }, []);

  const completeCatalogRefreshResult = useCallback((summary: CatalogRefreshResult) => {
    setCatalogRefreshSummary(summary);
    setCatalogRefreshLog(summary.output ?? "");
  }, []);

  const failCatalogRefreshResult = useCallback((message: string) => {
    setCatalogRefreshLog(message);
    setShowCatalogRefreshLog(true);
  }, []);

  const toggleCatalogRefreshLog = useCallback(() => {
    setShowCatalogRefreshLog((current) => !current);
  }, []);

  useSettingsAutoClearValue(catalogRefreshSummary, clearCatalogRefreshSummary, 20_000);

  return {
    beginCatalogRefreshResult,
    catalogRefreshLog,
    catalogRefreshSummary,
    completeCatalogRefreshResult,
    failCatalogRefreshResult,
    showCatalogRefreshLog,
    toggleCatalogRefreshLog,
  };
}
