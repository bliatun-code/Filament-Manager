import { useCallback, useEffect, useState } from "react";
import type { I18nContextValue } from "../lib/i18n";
import { loadStatisticsPageData } from "../lib/statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LoanUsageByPersonRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import type { NormalizedLoanDetailsRow } from "../lib/statistics_data_source";

type Translate = I18nContextValue["t"];

export function useStatisticsPageData({
  tauri,
  t,
}: {
  tauri: boolean;
  t: Translate;
}) {
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<SpoolWithMasterRow[]>([]);
  const [overviewConsumptionRows, setOverviewConsumptionRows] = useState<FilamentConsumptionRow[]>(
    [],
  );
  const [loanUsage, setLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [inboundLoanUsage, setInboundLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [loanDetails, setLoanDetails] = useState<NormalizedLoanDetailsRow[]>([]);
  const [loading, setLoading] = useState(tauri);
  const [error, setError] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientStatsSource, setClientStatsSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "OFFLINE",
  );
  const [clientStatisticsUpdatedAt, setClientStatisticsUpdatedAt] = useState<string | null>(null);

  const loadStatistics = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!tauri) {
        return;
      }
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await loadStatisticsPageData();
        const { syncState } = result;

        setClientReadOnly(syncState.clientReadOnly);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);

        setOverview(result.overview ? { ...result.overview } : null);
        setPrinters(result.printers);
        setSpoolRows([...result.spoolRows]);
        setOverviewConsumptionRows([...result.consumptionRows]);
        setLoanDetails(result.loanDetails);
        setLoanUsage(result.loanUsage);
        setInboundLoanUsage(result.inboundLoanUsage);
        setClientStatisticsUpdatedAt(result.updatedAt);
        setClientStatsSource(result.source);
      } catch (loadError) {
        console.error(loadError);
        setError(t("statistics.error.load", "Failed to load statistics."));
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [t, tauri],
  );

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  return {
    clientHostBaseUrl,
    clientHostDeviceName,
    clientLibraryId,
    clientReadOnly,
    clientStatisticsUpdatedAt,
    clientStatsSource,
    error,
    inboundLoanUsage,
    loading,
    loanDetails,
    loanUsage,
    overview,
    overviewConsumptionRows,
    printers,
    spoolRows,
  };
}
