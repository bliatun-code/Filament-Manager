import { useCallback, useState } from "react";
import type {
  CatalogRefreshResult,
  CatalogSourceAuditResult,
} from "../lib/tauri_client";

export function useSettingsCatalogRefreshResult() {
  const [catalogRefreshSummary, setCatalogRefreshSummary] =
    useState<CatalogRefreshResult | null>(null);
  const [catalogSourceAuditSummary, setCatalogSourceAuditSummary] =
    useState<CatalogSourceAuditResult | null>(null);
  const [catalogRefreshLog, setCatalogRefreshLog] = useState("");
  const [showCatalogRefreshLog, setShowCatalogRefreshLog] = useState(false);

  const beginCatalogRefreshResult = useCallback(() => {
    setCatalogRefreshSummary(null);
    setCatalogSourceAuditSummary(null);
    setCatalogRefreshLog("");
    setShowCatalogRefreshLog(false);
  }, []);

  const completeCatalogRefreshResult = useCallback((summary: CatalogRefreshResult) => {
    setCatalogRefreshSummary(summary);
    setCatalogSourceAuditSummary(null);
    setCatalogRefreshLog(summary.output ?? "");
  }, []);

  const completeCatalogSourceAuditResult = useCallback(
    (summary: CatalogSourceAuditResult) => {
      setCatalogRefreshSummary(null);
      setCatalogSourceAuditSummary(summary);
      setCatalogRefreshLog(summary.output ?? "");
    },
    [],
  );

  const failCatalogRefreshResult = useCallback((message: string) => {
    setCatalogRefreshLog(message);
  }, []);

  const toggleCatalogRefreshLog = useCallback(() => {
    setShowCatalogRefreshLog((current) => !current);
  }, []);


  return {
    beginCatalogRefreshResult,
    catalogRefreshLog,
    catalogRefreshSummary,
    catalogSourceAuditSummary,
    completeCatalogRefreshResult,
    completeCatalogSourceAuditResult,
    failCatalogRefreshResult,
    showCatalogRefreshLog,
    toggleCatalogRefreshLog,
  };
}
