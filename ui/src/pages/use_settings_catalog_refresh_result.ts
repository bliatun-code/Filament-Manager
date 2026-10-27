import { useCallback, useEffect, useState } from "react";
import type {
  CatalogRefreshResult,
  CatalogSourceAuditResult,
} from "../lib/tauri_client";

export const CATALOG_RESULT_NOTICE_DURATION_MS = 10_000;

export function useSettingsCatalogRefreshResult() {
  const [catalogRefreshSummary, setCatalogRefreshSummary] =
    useState<CatalogRefreshResult | null>(null);
  const [catalogSourceAuditSummary, setCatalogSourceAuditSummary] =
    useState<CatalogSourceAuditResult | null>(null);
  const [catalogRefreshLog, setCatalogRefreshLog] = useState("");
  const [showCatalogRefreshLog, setShowCatalogRefreshLog] = useState(false);

  useEffect(() => {
    if (!catalogRefreshSummary && !catalogSourceAuditSummary) return;
    const timer = window.setTimeout(() => {
      // An older result must never dismiss a later completion.
      setCatalogRefreshSummary(current => current === catalogRefreshSummary ? null : current);
      setCatalogSourceAuditSummary(current => current === catalogSourceAuditSummary ? null : current);
    }, CATALOG_RESULT_NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [catalogRefreshSummary, catalogSourceAuditSummary]);

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
    setCatalogRefreshSummary(null);
    setCatalogSourceAuditSummary(null);
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
