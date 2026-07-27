import { useCallback, useEffect, useRef, useState } from "react";
import type { I18nContextValue } from "../lib/i18n";
import { usePageRefreshState } from "../lib/page_refresh_state";
import { loadStatisticsPageData } from "../lib/statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LoanUsageByPersonRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";
import type {
  NormalizedLoanDetailsRow,
  NormalizedSpoolWithMasterRow,
} from "../lib/statistics_data_source";

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
  const [spoolRows, setSpoolRows] = useState<NormalizedSpoolWithMasterRow[]>([]);
  const [overviewConsumptionRows, setOverviewConsumptionRows] = useState<FilamentConsumptionRow[]>(
    [],
  );
  const [loanUsage, setLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [inboundLoanUsage, setInboundLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [loanDetails, setLoanDetails] = useState<NormalizedLoanDetailsRow[]>([]);
  const {
    beginRefresh,
    completeRefresh,
    error,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri);
  const loadRequestRef = useRef(0);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientStatsSource, setClientStatsSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "OFFLINE",
  );
  const [clientStatisticsUpdatedAt, setClientStatisticsUpdatedAt] = useState<string | null>(null);

  const loadStatistics = useCallback(
    async () => {
      if (!tauri) {
        return;
      }
      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;
      beginRefresh();
      try {
        const result = await loadStatisticsPageData();
        if (requestId !== loadRequestRef.current) {
          return;
        }
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
        completeRefresh();
      } catch (loadError) {
        console.error(loadError);
        if (requestId === loadRequestRef.current) {
          failRefresh(t("statistics.error.load", "Failed to load statistics."));
        }
      }
    },
    [beginRefresh, completeRefresh, failRefresh, t, tauri],
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
    refreshing,
    reloadData: loadStatistics,
    spoolRows,
  };
}
